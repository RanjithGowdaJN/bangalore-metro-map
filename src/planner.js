// ---- Config: paths (reuse if you already have constants.js) ----
const DATA_VERSION = "2025-08-16-planner1";
const PATHS = {
  stations: `data/stations.geojson?v=${DATA_VERSION}`, // array of stations
  lines:    `data/lines.geojson?v=${DATA_VERSION}`,    // array of lines (ordered stops)
  timetable:`data/timetable.json?v=${DATA_VERSION}`,   // per-line schedules
  fare:     `data/fare.json?v=${DATA_VERSION}`         // slabs & discount
};

// ---- Utilities ----
const $ = sel => document.querySelector(sel);
const el = (tag, attrs={}, html="") => {
  const n = document.createElement(tag);
  Object.entries(attrs).forEach(([k,v])=> n.setAttribute(k,v));
  if (html) n.innerHTML = html;
  return n;
};
async function fetchJSON(u){ const r = await fetch(u,{cache:"no-store"}); if(!r.ok) throw new Error(u); return r.json(); }
const isWeekend = d => [0,6].includes(d.getDay());
const isSunday  = d => d.getDay() === 0;

function timeToMin(t){ const [h,m] = t.split(":").map(Number); return h*60+m; }
function minToTime(m){ m = (m+24*60)%(24*60); const h=Math.floor(m/60), mm=(m%60); return `${String(h).padStart(2,"0")}:${String(mm).padStart(2,"0")}`; }

function within(a, b, t){ // a<=t<b with wrap
  const A=timeToMin(a), B=timeToMin(b), T=timeToMin(t);
  if (A<=B) return (T>=A && T<B);
  return (T>=A || T<B);
}

// ---- Data holders ----
let STATIONS=[], LINES=[], STBID={}, TIMETABLE={}, FARE={};

// Build helpers
function stationsById(arr){ return Object.fromEntries(arr.map(s=>[s.id,s])); }
function linesByName(arr){ return Object.fromEntries(arr.map(l=>[l.name,l])); }

function linesForStation(stationId){
  const out=[];
  LINES.forEach(l=>{
    const idx = (l.stations||[]).indexOf(stationId);
    if (idx!==-1){
      const termA = STBID[l.stations[0]]?.name || l.stations[0];
      const termB = STBID[l.stations[l.stations.length-1]]?.name || l.stations[l.stations.length-1];
      out.push({ line:l.name, color:l.color, idx, termA, termB });
    }
  });
  return out;
}

function headwayNow(lineName, now=new Date()){
  const typ = isSunday(now) ? "sunday" : (isWeekend(now) ? "weekend" : "weekday");
  const cfg = TIMETABLE?.[typ]?.[lineName];
  if(!cfg) return null;
  const t = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
  const slot = (cfg.headway||[]).find(s=> within(s.from, s.to, t));
  return {first:cfg.first, last:cfg.last, headway: slot?.mins ?? null, dayType: typ};
}

function nextTrainMins(headway){
  if(!headway) return null;
  // crude: wait time uniformly distributed in [0, headway]
  return Math.max(1, Math.round(headway/2)); // friendly default
}

// ---- Fare / routing ----
function buildGraph(){
  // adjacency by neighbor stops on each line
  const adj = {};
  const add = (a,b)=>{ (adj[a]=adj[a]||new Set()).add(b); };
  LINES.forEach(l=>{
    for(let i=0;i<l.stations.length-1;i++){
      const a=l.stations[i], b=l.stations[i+1];
      add(a,b); add(b,a);
    }
  });
  return Object.fromEntries(Object.entries(adj).map(([k,v])=>[k,[...v]]));
}

function stopsBetween(fromId, toId){
  if(!fromId || !toId || fromId===toId) return 0;
  // BFS on unweighted graph
  const adj = buildGraph();
  const q=[fromId]; const dist={[fromId]:0};
  while(q.length){
    const u=q.shift();
    for(const v of (adj[u]||[])){
      if(dist[v]==null){
        dist[v]=dist[u]+1;
        if(v===toId) return dist[v];
        q.push(v);
      }
    }
  }
  return null; // disconnected
}

function fareForStops(n){
  if(n==null) return null;
  const slabs = (FARE.slabs||[]).sort((a,b)=>a.maxStops-b.maxStops);
  const slab = slabs.find(s=> n<=s.maxStops) || slabs[slabs.length-1];
  return slab?.price ?? null;
}

// ---- UI population ----
function fillStationSelects(){
  const opts = STATIONS
    .filter(s=>s.operational!==false)
    .sort((a,b)=> a.name.localeCompare(b.name))
    .map(s=> `<option value="${s.id}">${s.name}</option>`)
    .join("");

  $("#fromSelect").innerHTML = `<option value="">From station…</option>${opts}`;
  $("#toSelect").innerHTML   = `<option value="">To station…</option>${opts}`;
}

function renderDirectionChips(fromId){
  const row = $("#directionRow");
  row.innerHTML = "";
  if(!fromId){ row.innerHTML = `<span style="color:var(--muted);font-size:13px">Pick a “From” station to see directions.</span>`; return; }

  const dirs = linesForStation(fromId);
  if(!dirs.length){ row.textContent="No lines at this station."; return; }

  // default selection = first line, towards its nearer terminus from index
  dirs.forEach((d,i)=>{
    const towardsA = el("button",{class:"btn", "data-line":d.line, "data-dir":"A", style:`border-color:${d.color};`}, `Towards ${d.termA}`);
    const towardsB = el("button",{class:"btn", "data-line":d.line, "data-dir":"B", style:`border-color:${d.color};`}, `Towards ${d.termB}`);
    if(i===0) towardsA.classList.add("primary");
    row.append(towardsA, towardsB);
  });

  row.addEventListener("click", ev=>{
    if(ev.target.closest("button.btn")){
      [...row.querySelectorAll("button.btn")].forEach(b=> b.classList.remove("primary"));
      ev.target.classList.add("primary");
      updateTimings();
    }
  }, { once:true });

  updateTimings();
}

function chosenDirection(){
  const active = $("#directionRow .btn.primary");
  if(!active) return null;
  return { line: active.getAttribute("data-line"), dir: active.getAttribute("data-dir") };
}

function updateTimings(){
  const fromId = $("#fromSelect").value;
  const dir = chosenDirection();
  const timingSummary = $("#timingSummary");
  const tables = $("#timingTables");
  tables.innerHTML = "";

  if(!fromId || !dir){ timingSummary.textContent="Select a station and direction."; return; }

  const now = new Date();
  const H = headwayNow(dir.line, now);
  const nextIn = H?.headway ? nextTrainMins(H.headway) : null;

  const s = STBID[fromId];
  timingSummary.innerHTML = `
    From <b>${s.name}</b> on <b>${dir.line}</b> line, heading <b>${dir.dir==="A"?"towards first terminus":"towards last terminus"}</b>:
    ${ H ? `Headway <b>${H.headway} min</b> · Next train in <b>${nextIn} min</b> · First <b>${H.first}</b> · Last <b>${H.last}</b> (${H.dayType})`
          : `No schedule available.`}
  `;

  // Build 3 blocks: Weekdays, Sat/Holidays, Sundays
  const blocks = [
    { key:"weekday",    title:"Monday to Friday" },
    { key:"weekend",    title:"General Holidays & 2nd/4th Saturdays" },
    { key:"sunday",     title:"Sundays" }
  ];
  blocks.forEach(b=>{
    const cfg = TIMETABLE?.[b.key]?.[dir.line];
    const card = el("div",{class:"card"}, `
      <div style="font-weight:700;margin-bottom:6px">${b.title}</div>
      ${!cfg ? `<div style="color:var(--muted)">No data.</div>` :
        `<div style="display:grid;grid-template-columns:140px 1fr;gap:10px;align-items:center">
          <div style="color:var(--muted)">First train</div><div><b>${cfg.first}</b></div>
          <div style="color:var(--muted)">Last train</div><div><b>${cfg.last}</b></div>
          <div style="color:var(--muted)">Frequency</div>
          <div>${(cfg.headway||[]).map(s=> 
            `<span class="pill" style="margin:0 6px 6px 0">${s.from}–${s.to}: ${s.mins} min</span>`
          ).join("") || '<span style="color:var(--muted)">—</span>'}</div>
        </div>`
      }
    `);
    tables.appendChild(card);
  });

  updatePrice(); // may recompute ETA using headway
}

function updatePrice(){
  const fromId = $("#fromSelect").value || null;
  const toId   = $("#toSelect").value   || null;
  const priceSummary = $("#priceSummary");
  const routeBreakdown = $("#routeBreakdown");

  if(!fromId || !toId || fromId===toId){
    priceSummary.textContent = "Select both From and To to see fare.";
    routeBreakdown.innerHTML = "";
    return;
  }

  const stops = stopsBetween(fromId, toId);
  const base = fareForStops(stops);
  if(base==null){
    priceSummary.textContent = "No fare available for this pair.";
    routeBreakdown.innerHTML = "";
    return;
  }

  // crude ETA: 2.8 min/stop + one interchange buffer if path crosses lines
  const sameLine = LINES.some(l => l.stations.includes(fromId) && l.stations.includes(toId));
  const changes = sameLine ? 0 : 1; // naive but workable for BLR V1
  const etaMin = Math.round(stops*2.8 + changes*4);

  priceSummary.innerHTML = `Approx fare <b>₹${base}</b> · ${stops} stops · ${changes} change${changes? "":"s"} · ETA ~ <b>${etaMin} min</b>`;
  routeBreakdown.innerHTML = `<div style="margin-top:6px;color:var(--muted)">Fare slabs: ${FARE.slabs.map(s=>`${s.maxStops}→₹${s.price}`).join(", ")}</div>`;
}

// ---- Wiring ----
export async function initPlanner(){
  // Load data
  [STATIONS, LINES, TIMETABLE, FARE] = await Promise.all([
    fetchJSON(PATHS.stations),
    fetchJSON(PATHS.lines),
    fetchJSON(PATHS.timetable),
    fetchJSON(PATHS.fare)
  ]);
  STBID = stationsById(STATIONS);

  // Fill selects
  fillStationSelects();

  // Events
  $("#fromSelect").addEventListener("change", e=>{
    const fromId = e.target.value || null;
    renderDirectionChips(fromId);
  });
  $("#toSelect").addEventListener("change", updatePrice);
  $("#swapBtn").addEventListener("click", ()=>{
    const a = $("#fromSelect").value, b = $("#toSelect").value;
    $("#fromSelect").value = b; $("#toSelect").value = a;
    renderDirectionChips($("#fromSelect").value);
    updatePrice();
  });
}
