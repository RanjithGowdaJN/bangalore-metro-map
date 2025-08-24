// /assets/feature-diagram.js
export async function init({
  svgId = 'stationsSvg',
  chipsId = 'lineChips',
  dataUrl = '/data/stations.geojson',
  data
} = {}) {
  // --- feature-local config ---
  const LINE_COLORS = { PURPLE:"#7c3aed", GREEN:"#10b981", YELLOW:"#f59e0b" };
  const isMobile = window.matchMedia('(max-width: 640px)').matches;
  const seqKey = (L) => `seq_${L.toLowerCase()}`;
  const isTrue = (v) => v===true || v===1 || v==='1' || String(v).toLowerCase()==='true';

  // Scoped CSS (chips/card/labels); keeps index.html simple
  injectCss(`
    #fold2 .card{background:#0e1726;border:1px solid #1e293b;border-radius:14px;padding:14px 14px 8px}
    #lineChips{display:flex;gap:8px;justify-content:center;margin:8px 0 10px;flex-wrap:wrap}
    #lineChips .chip{border:1px solid #1e293b;background:#0c1424;color:#cbd5e1;padding:8px 12px;border-radius:999px;cursor:pointer;font-weight:600;line-height:1;user-select:none}
    #lineChips .chip[aria-selected="true"]{box-shadow:0 0 0 2px rgba(255,255,255,.07) inset}
    #lineChips .chip[data-line="PURPLE"][aria-selected="true"]{background:rgba(124,58,237,.25);border-color:#6d28d9}
    #lineChips .chip[data-line="GREEN"][aria-selected="true"]{ background:rgba(16,185,129,.25); border-color:#059669}
    #lineChips .chip[data-line="YELLOW"][aria-selected="true"]{background:rgba(245,158,11,.25);border-color:#d97706}
    #stationsSvg .lbl{fill:#cbd5e1;font-size:12px}
    #stationsSvg .lbl.small{font-size:11px;fill:#94a3b8}
    #stationsSvg .lbl.anchor{font-weight:700}
    @media (max-width:640px){ #fold2 .card{padding:10px 10px 6px} }
  `);

  // ---- load data (or use injected data) ----
  let STATIONS = data || null;
  if (!STATIONS) {
    const CANDS = [dataUrl,'/stations.geojson','data/stations.geojson','stations.geojson'];
    for (const url of CANDS) {
      try {
        const r = await fetch(url,{cache:'no-store'});
        if (r.ok) {
          const gj = await r.json();
          if (Array.isArray(gj.features) && gj.features.length){ STATIONS = gj; break; }
        }
      } catch {}
    }
  }
  if (!STATIONS) { console.warn('[diagram] stations not found'); return; }

  // normalize: ensure lines[] and boolean interchange
  for (const f of STATIONS.features) {
    const p=f.properties||{};
    if (!Array.isArray(p.lines)) {
      p.lines = String(p.lines||'').split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);
    } else {
      p.lines = p.lines.map(x=>String(x).toUpperCase());
    }
    p.interchange = isTrue(p.interchange);
  }

  const svg = document.getElementById(svgId);
  const chips = document.getElementById(chipsId);
  if (!svg || !chips) return;

  let activeLine = (chips.querySelector('[aria-selected="true"]')?.dataset.line) || 'PURPLE';

  const render = ()=> renderDiagram(svg, activeLine, STATIONS, LINE_COLORS);
  render();

  // re-render on viewport changes (swap layouts)
  const mq = window.matchMedia('(max-width: 640px)');
  mq.addEventListener?.('change', render);
  window.addEventListener('resize', throttle(render, 120));

  // chips
  chips.addEventListener('click', (e)=>{
    const btn = e.target.closest('.chip'); if (!btn) return;
    if (btn.dataset.line === activeLine) return;
    chips.querySelectorAll('.chip').forEach(c=>c.setAttribute('aria-selected','false'));
    btn.setAttribute('aria-selected','true');
    activeLine = btn.dataset.line;
    render();
  });

  // deep-link from map (optional)
  window.addEventListener('fold2:navigate', (ev)=>{
    const L = ev?.detail?.line?.toUpperCase(); if (!L) return;
    if (L === activeLine) return;
    const btn = chips.querySelector(`.chip[data-line="${L}"]`);
    if (btn) btn.click();
  });

  // utils
  function injectCss(css){ const s=document.createElement('style'); s.textContent=css; document.head.appendChild(s); }
  function throttle(fn, gap){ let t=0; return (...a)=>{ const n=Date.now(); if(n-t>gap){ t=n; fn(...a);} }; }
}

/* ---------------- Core renderer ---------------- */
function renderDiagram(svg, line, GJ, LINE_COLORS){
  const isM = window.matchMedia('(max-width: 640px)').matches;
  const W = svg.clientWidth || 1100;

  const feats = lineStations(GJ, line);
  if (!feats.length){ svg.innerHTML=''; return; }

  const anchor = pickAnchor(line, feats);
  const seqF = `seq_${line.toLowerCase()}`;
  const aSeq = +anchor.properties[seqF];

  const left  = feats.filter(f => +f.properties[seqF] < aSeq); // one direction
  const right = feats.filter(f => +f.properties[seqF] > aSeq); // other direction

  const LINE = LINE_COLORS[line];
  const otherPref = (line==='PURPLE')?'GREEN':(line==='GREEN'?'PURPLE':'GREEN');
  const otherLine = anchor.properties.lines.find(LN=>LN!==line) || otherPref;
  const OTHER = LINE_COLORS[otherLine] || '#fff';

  if (!isM){
    // ===== DESKTOP: two parallel rows, same width, slanted labels, no S-shape =====
    const H = 380;
    const topY = 140, botY = 240, CX = W/2;
    const padX = 56;
    const maxCount = Math.max(left.length, right.length);
    const step = Math.max(36, Math.min(86, (W/2 - padX)/(maxCount+0.5)));

    // Clear + size
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('height', H); svg.innerHTML='';

    // horizontal segments (no elbows)
    lineSeg(svg, CX, topY,  CX + step*right.length, topY, LINE, 6);
    lineSeg(svg, CX - step*left.length, botY, CX, botY, LINE, 6);

    // stations right (top row)
    right.forEach((f,i)=>{
      const x = CX + step*(i+1);
      dot(svg,x,topY,6,LINE,3,'#fff');
      slantedLabel(svg, f.properties.name, x, topY - 12, -26, 'lbl'); // slant up-left
    });

    // stations left (bottom row)
    left.slice().reverse().forEach((f,i)=>{
      const x = CX - step*(i+1);
      dot(svg,x,botY,6,LINE,3,'#fff');
      slantedLabel(svg, f.properties.name, x, botY + 18, 26, 'lbl'); // slant down-right
    });

    // anchor (dual ring) + connector + labels
    lineSeg(svg, CX, botY, CX, topY, LINE, 6); // vertical connector
    dot(svg, CX, (topY+botY)/2, 8, LINE, 4, '#fff');
    dot(svg, CX, (topY+botY)/2, 5, OTHER, 4, '#fff');
    text(svg, anchor.properties.name, CX, (topY+botY)/2 - 18, 'middle', 'lbl anchor', OTHER);
    text(svg, 'Line change', CX, (topY+botY)/2 + 30, 'middle', 'lbl small');
  } else {
    // ===== MOBILE: vertical rail, dynamic height, alternating + staggered labels =====
    const n = feats.length;
    const baseStep = 44;                              // station spacing
    const H = Math.max(460, 80 + baseStep*(n+1));     // dynamic height so all stations fit
    const CX = W/2, baseY = H - 40;

    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('height', H); svg.innerHTML='';

    // order: anchor at bottom, then one whole branch, then the other
    const ordered = [anchor, ...left.slice().reverse(), ...right];

    // spine
    lineSeg(svg, CX, baseY - baseStep*(ordered.length-1), CX, baseY, LINE, 6);

    ordered.forEach((f,i)=>{
      const y = baseY - i*baseStep;
      const isAnchor = (f===anchor);

      dot(svg, CX, y, 6, LINE, 3, '#fff');
      if (isAnchor) dot(svg, CX, y, 4.2, OTHER, 4, '#fff');

      // alternate left/right; add slight vertical jitter to avoid same-row clashes
      const leftSide = i % 2 === 0;
      const jitter = (i % 4 === 1) ? -6 : (i % 4 === 3 ? +6 : 0); // stagger
      const tx = CX + (leftSide ? -12 : 12);
      const ty = y + (leftSide ? -10 : 14) + jitter;
      text(svg, f.properties.name, tx, ty, leftSide ? 'end' : 'start', 'lbl' + (isAnchor?' anchor':''), isAnchor?OTHER:undefined);
    });

    text(svg, 'Line change', CX, baseY + 18, 'middle', 'lbl small');
  }
}

/* ---------------- helpers ---------------- */
function lineStations(GJ, line){
  const seqF = `seq_${line.toLowerCase()}`;
  return GJ.features
    .filter(f => Number.isFinite(+f.properties?.[seqF]))
    .sort((a,b)=> (+a.properties[seqF]) - (+b.properties[seqF]));
}

function pickAnchor(line, feats){
  const seqF = `seq_${line.toLowerCase()}`;
  const sorted = feats.slice().sort((a,b)=> (+a.properties[seqF]) - (+b.properties[seqF]));
  const medianSeq = +sorted[Math.floor(sorted.length/2)].properties[seqF];
  const prefOther = (line==='PURPLE')?'GREEN':(line==='GREEN'?'PURPLE':'GREEN');

  // pick true interchanges; avoid CSV "FALSE" truthiness bug by normalizing earlier
  const cands = feats.filter(f => f.properties.interchange && f.properties.lines?.includes(line) && f.properties.lines.some(LN=>LN!==line));

  let best = null;
  for (const s of cands){
    const p=s.properties;
    const score = (p.lines.includes(prefOther)?2:0) + (p.lines.length-1);
    const seq = +p[seqF];
    const dist = Math.abs(seq - medianSeq);
    const key = { s, score, dist };
    if (!best || key.score>best.score || (key.score===best.score && key.dist<best.dist)) best = key;
  }
  return (best?.s) || sorted[Math.floor(sorted.length/2)];
}

function el(svg,name,attrs){ const n=document.createElementNS('http://www.w3.org/2000/svg',name); for (const [k,v] of Object.entries(attrs)) n.setAttribute(k,String(v)); svg.appendChild(n); return n; }
function lineSeg(svg,x1,y1,x2,y2,stroke,width){ el(svg,'line',{x1,y1,x2,y2,stroke,'stroke-width':width,'stroke-linecap':'round'}); }
function dot(svg,cx,cy,r,stroke,sw,fill='#fff'){ el(svg,'circle',{cx,cy,r,fill,stroke,'stroke-width':sw}); }
function text(svg,content,x,y,anchor,cls,fill){ const t=el(svg,'text',{x,y,'text-anchor':anchor,class:cls}); if (fill) t.setAttribute('fill', fill); t.textContent=content; }
function slantedLabel(svg,content,x,y,deg,cls){ const t=el(svg,'text',{x,y,class:cls,transform:`rotate(${deg} ${x} ${y})`}); t.textContent=content; }
