// src/planner.js
async function loadJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  return res.json();
}

function parseQuery() {
  const p = new URLSearchParams(location.search);
  return {
    from: p.get('from') || '',
    to: p.get('to') || '',
    time: p.get('time') || '', // optional future use
    day: p.get('day') || ''    // optional future use
  };
}

function pushQuery(q) {
  const p = new URLSearchParams(location.search);
  Object.entries(q).forEach(([k,v]) => {
    if (v) p.set(k, v); else p.delete(k);
  });
  history.pushState(null, '', `${location.pathname}?${p.toString()}#planner`);
}

function bfsRoute(graph, startId, endId) {
  // Simple unweighted BFS for now; graph: { [id]: [neighborIds...] }
  if (!startId || !endId || startId === endId) return [];
  const q = [startId];
  const seen = new Set([startId]);
  const prev = {};
  while (q.length) {
    const u = q.shift();
    for (const v of (graph[u] || [])) {
      if (seen.has(v)) continue;
      seen.add(v);
      prev[v] = u;
      if (v === endId) {
        // reconstruct
        const path = [v];
        let cur = v;
        while (prev[cur]) { cur = prev[cur]; path.push(cur); }
        return path.reverse();
      }
      q.push(v);
    }
  }
  return [];
}

function estimateTimeMinutes(path, runtime, headwayMin = 5) {
  if (!path || path.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i+1];
    const key = `${a}__${b}`;
    total += runtime[key] ?? 2; // default 2 min per hop if missing
  }
  // average wait = half headway
  total += Math.round(headwayMin / 2);
  return total;
}

function estimateFare(path, faresPerHop = [10, 15, 20, 25, 30]) {
  if (!path || path.length < 2) return 0;
  const hops = path.length - 1;
  // naive slab by hops; tune later with real fares
  if (hops <= 2) return faresPerHop[0];
  if (hops <= 4) return faresPerHop[1];
  if (hops <= 7) return faresPerHop[2];
  if (hops <= 10) return faresPerHop[3];
  return faresPerHop[4];
}

export async function initPlanner(opts) {
  const els = {
    fromSelect: document.querySelector(opts.fromSelect),
    toSelect: document.querySelector(opts.toSelect),
    towardsContainer: document.querySelector(opts.towardsContainer),
    results: document.querySelector(opts.results),
  };
  const dataRoot = opts.dataRoot || './data';

  const [stations, lines, fares, runtime] = await Promise.all([
    loadJSON(`${dataRoot}/stations.json`),
    loadJSON(`${dataRoot}/lines.json`),
    loadJSON(`${dataRoot}/fare.json`).catch(() => ({})),
    loadJSON(`${dataRoot}/runtime.json`).catch(() => ({})),
  ]);

  // Build lookups
  const byId = {};
  const graph = {};
  stations.forEach(s => {
    byId[s.id] = s;
    graph[s.id] = s.neighbors || [];
  });

  // Populate dropdowns
  const addOptions = (sel, list) => {
    sel.innerHTML = '<option value="">Select station</option>' +
      list.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  };
  addOptions(els.fromSelect, stations);
  addOptions(els.toSelect, stations);

  // Towards buttons for current "from"
  const renderTowards = (fromId) => {
    els.towardsContainer.innerHTML = '';
    if (!fromId) return;

    // Find lines this station belongs to
    const station = byId[fromId];
    const lineIds = station.lines || []; // station must contain ["Purple","Green"] etc.

    // Collect terminal directions from lines.json
    const buttons = [];
    lineIds.forEach(lineId => {
      const L = lines.find(l => l.id === lineId);
      if (!L) return;
      (L.terminals || []).forEach(term => {
        const btn = document.createElement('button');
        btn.className = 'towards-btn';
        btn.textContent = `Towards ${byId[term]?.name || term}`;
        btn.dataset.towards = term;
        btn.addEventListener('click', () => {
          // toggle active
          els.towardsContainer.querySelectorAll('.towards-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          plannerAPI.setTowards(term);
        });
        buttons.push(btn);
      });
    });
    buttons.forEach(b => els.towardsContainer.appendChild(b));
  };

  function renderResults({ path, minutes, fare }) {
    const stops = Math.max(0, (path?.length || 1) - 1);
    const transfers = 0; // keep 0 for v1; add transfer calc later
    const firstLast = { first: '05:00', last: '23:00' }; // placeholder until real data
    els.results.innerHTML = `
      <div class="row"><div>Stops</div><div>${stops}</div></div>
      <div class="row"><div>Estimated time</div><div>${minutes} min</div></div>
      <div class="row"><div>Transfers</div><div>${transfers}</div></div>
      <div class="row"><div>Estimated fare</div><div>₹${fare}</div></div>
      <div class="row"><div>First / Last train</div><div>${firstLast.first} / ${firstLast.last}</div></div>
    `;
  }

  function computeAndRender() {
    const fromId = els.fromSelect.value;
    const toId = els.toSelect.value;
    if (!fromId || !toId) return;

    const path = bfsRoute(graph, fromId, toId);
    const minutes = estimateTimeMinutes(path, runtime.edgeMinutes || {}, (runtime.headwayMin || 6));
    const fare = estimateFare(path, fares.perHop || [10, 15, 20, 25, 30]);
    renderResults({ path, minutes, fare });
    pushQuery({ from: fromId, to: toId });
  }

  // Wire controls
  els.fromSelect.addEventListener('change', () => {
    const id = els.fromSelect.value;
    renderTowards(id);
    pushQuery({ from: id });
    if (opts.scrollTarget && id) {
      document.querySelector(opts.scrollTarget).scrollIntoView({ behavior: 'smooth' });
    }
  });

  els.toSelect.addEventListener('change', computeAndRender);
  document.getElementById('planBtn').addEventListener('click', computeAndRender);

  // Prefill from URL
  const q = parseQuery();
  if (q.from) { els.fromSelect.value = q.from; renderTowards(q.from); }
  if (q.to) { els.toSelect.value = q.to; }
  if (q.from && q.to) computeAndRender();

  // Export minimal API for MAP → Planner handshake
  plannerAPI.setFrom = (stationId, { scroll = true } = {}) => {
    if (!byId[stationId]) return;
    els.fromSelect.value = stationId;
    renderTowards(stationId);
    pushQuery({ from: stationId });
    if (scroll && opts.scrollTarget) {
      document.querySelector(opts.scrollTarget).scrollIntoView({ behavior: 'smooth' });
    }
  };
  plannerAPI.setTo = (stationId) => {
    if (!byId[stationId]) return;
    els.toSelect.value = stationId;
    computeAndRender();
  };
  plannerAPI.setTowards = (terminalId) => {
    // v1: we don’t hard-filter the graph; we could later bias pathfinding towards this terminal.
    // For now we just store it in the URL for completeness.
    pushQuery({ towards: terminalId });
  };
}

export const plannerAPI = { setFrom: () => {}, setTo: () => {}, setTowards: () => {}, compute: () => {} };
