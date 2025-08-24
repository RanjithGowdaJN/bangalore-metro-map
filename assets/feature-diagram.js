// /assets/feature-diagram.js
export async function init({ svgId = 'stationsSvg', chipsId = 'lineChips', dataUrl = '/data/stations.geojson', data } = {}) {
  // --- Local config (feature-scoped; no global pollution)
  const LINE_COLORS = { PURPLE:"#7c3aed", GREEN:"#10b981", YELLOW:"#f59e0b" };
  const isMobile = window.matchMedia('(max-width: 640px)').matches;
  const seqKey = (L) => `seq_${L.toLowerCase()}`;

  // Inject minimal scoped CSS for Fold-2 (chips/card/labels)
  injectCss(`
    #fold2 { margin:40px auto 26px; max-width:1100px; padding:0 12px; }
    #fold2 h2 { text-align:center; margin:0 0 10px; font-size: clamp(18px,4.8vw,26px); }
    #fold2 .card { background:#0e1726; border:1px solid #1e293b; border-radius:14px; padding:14px 14px 8px; }
    #lineChips { display:flex; gap:8px; justify-content:center; margin:8px 0 10px; flex-wrap:wrap; }
    #lineChips .chip { border:1px solid #1e293b; background:#0c1424; color:#cbd5e1; padding:8px 12px; border-radius:999px; cursor:pointer; font-weight:600; line-height:1; user-select:none; }
    #lineChips .chip[aria-selected="true"]{ box-shadow:0 0 0 2px rgba(255,255,255,.07) inset; }
    #lineChips .chip[data-line="PURPLE"][aria-selected="true"]{ background:rgba(124,58,237,.25); border-color:#6d28d9; }
    #lineChips .chip[data-line="GREEN"][aria-selected="true"]{  background:rgba(16,185,129,.25);  border-color:#059669; }
    #lineChips .chip[data-line="YELLOW"][aria-selected="true"]{ background:rgba(245,158,11,.25); border-color:#d97706; }
    #stationsSvg .lbl { fill:#cbd5e1; font-size:12px; }
    #stationsSvg .lbl.small { font-size:11px; fill:#94a3b8; }
    #stationsSvg .lbl.anchor { font-weight:700; }
    @media (max-width:640px){ #fold2 .card { padding:10px 10px 6px; } }
  `);

  // Load stations (reuse provided data or fetch)
  let STATIONS = data || null;
  if (!STATIONS) {
    const CANDIDATES = [dataUrl, '/stations.geojson', 'data/stations.geojson', 'stations.geojson'];
    for (const url of CANDIDATES) {
      try {
        const r = await fetch(url, { cache: 'no-store' });
        if (r.ok) {
          const gj = await r.json();
          if (Array.isArray(gj.features) && gj.features.length) { STATIONS = gj; break; }
        }
      } catch {}
    }
  }
  if (!STATIONS) { console.warn('[diagram] stations not found'); return; }

  const svg = document.getElementById(svgId);
  const chips = document.getElementById(chipsId);
  if (!svg || !chips) return;

  // Default active line based on selected chip
  let activeLine = (chips.querySelector('[aria-selected="true"]')?.dataset.line) || 'PURPLE';

  // Render now + on resize (to swap horizontal/vertical layouts)
  const render = () => renderDiagram(svg, activeLine, STATIONS, LINE_COLORS);
  render();
  const mq = window.matchMedia('(max-width: 640px)');
  mq.addEventListener?.('change', render);
  window.addEventListener('resize', throttle(render, 150));

  // Chip interactions
  chips.addEventListener('click', (e)=>{
    const btn = e.target.closest('.chip'); if (!btn) return;
    if (btn.dataset.line === activeLine) return;
    chips.querySelectorAll('.chip').forEach(c=>c.setAttribute('aria-selected','false'));
    btn.setAttribute('aria-selected','true');
    activeLine = btn.dataset.line;
    render();
    window.dispatchEvent(new CustomEvent('fold2:linechange', { detail: { line: activeLine }}));
  });

  // Allow deep-link navigation from map or URL later
  window.addEventListener('fold2:navigate', (ev)=>{
    const line = ev?.detail?.line?.toUpperCase();
    if (!line || line===activeLine) return;
    const btn = chips.querySelector(`.chip[data-line="${line}"]`);
    if (btn) btn.click();
  });

  // ---------- helpers ----------
  function injectCss(css){
    const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  }
  function throttle(fn, gap){ let t=0; return (...a)=>{ const n=Date.now(); if(n-t>gap){ t=n; fn(...a); } }; }
}

// ---------- core renderer ----------
function renderDiagram(svg, line, GJ, LINE_COLORS){
  const isM = window.matchMedia('(max-width: 640px)').matches;
  const W = svg.clientWidth || 1100;
  const H_desktop = 360, H_mobile = 520;

  const seqF = seqKey(line);
  const feats = GJ.features.filter(f => Number.isFinite(+f.properties[seqF]))
                           .sort((a,b)=> (+a.properties[seqF]) - (+b.properties[seqF]));
  if (!feats.length){ svg.innerHTML=''; return; }

  const anchor = pickAnchor(line, feats);
  const aSeq = +anchor.properties[seqF];
  const left  = feats.filter(f => +f.properties[seqF] < aSeq);
  const right = feats.filter(f => +f.properties[seqF] > aSeq);

  const LINE = LINE_COLORS[line];
  const otherPref = (line==='PURPLE') ? 'GREEN' : (line==='GREEN' ? 'PURPLE' : 'GREEN');
  const otherLine = anchor.properties.lines.find(LN => LN!==line) || otherPref;
  const OTHER = LINE_COLORS[otherLine] || '#fff';

  svg.setAttribute('viewBox', `0 0 ${W} ${(isM?H_mobile:H_desktop)}`);
  svg.setAttribute('height', (isM?H_mobile:H_desktop));
  svg.innerHTML = '';

  if (!isM){
    // ===== Desktop: two horizontal rows split at anchor =====
    const CX = W/2, topY=140, botY=240, joinY=(topY+botY)/2;
    const padX = 56;                 // keep labels closer, as you asked
    const stepTop = Math.max(36, Math.min(86, (W/2 - padX)/(right.length+1)));
    const stepBot = Math.max(36, Math.min(86, (W/2 - padX)/(left.length +1)));

    // spines up/down from anchor
    poly(svg, [[CX,joinY],[CX,topY]], LINE, 6);
    poly(svg, [[CX,joinY],[CX,botY]], LINE, 6);

    function row(arr, dir, y, labelAbove, step){
      const pts=[[CX,y]];
      arr.forEach((f,i)=>{
        const x = CX + (i+1)*step*dir;
        pts.push([x,y]);
        dot(svg,x,y,6,LINE,3,'#fff');
        text(svg, f.properties.name, x, y+(labelAbove?-12:18), 'middle', 'lbl');
      });
      poly(svg, pts, LINE, 6);
    }
    row(right,+1,topY,true, stepTop);
    row(left.slice().reverse(),-1,botY,false,stepBot);

    // anchor: dual ring + label in OTHER color + “Line change”
    dot(svg, CX, joinY, 8, LINE, 4, '#fff');
    dot(svg, CX, joinY, 5, OTHER, 4, '#fff');
    text(svg, anchor.properties.name, CX, joinY-16, 'middle', 'lbl anchor', OTHER);
    text(svg, 'Line change', CX, joinY+28, 'middle', 'lbl small');
  } else {
    // ===== Mobile: vertical rail, alternating labels; anchor at bottom =====
    const CX = W/2, baseY = H_mobile - 40;
    const step = Math.max(40, Math.min(62, (H_mobile - 100)/(feats.length+1)));

    lineSeg(svg, CX, baseY - step*(feats.length), CX, baseY, LINE, 6);
    const ordered = right.slice().reverse().concat([anchor]).concat(left.slice());

    ordered.forEach((f,i)=>{
      const y = baseY - i*step;
      dot(svg, CX, y, 6, LINE, 3, '#fff');
      const isAnchor = (f===anchor);
      if (isAnchor) dot(svg, CX, y, 4.2, OTHER, 4, '#fff');

      const leftSide = i % 2 === 0;
      const tx = CX + (leftSide ? -12 : 12);
      const ty = y + (leftSide ? -10 : 14);
      text(svg, f.properties.name, tx, ty, leftSide ? 'end' : 'start', 'lbl' + (isAnchor?' anchor':''), isAnchor ? OTHER : undefined);
    });
    text(svg, 'Line change', CX, baseY+18, 'middle', 'lbl small');
  }
}

// ---------- utilities for diagram ----------
function pickAnchor(line, feats){
  const seqF = seqKey(line);
  const sorted = feats.slice().sort((a,b)=> (+a.properties[seqF]) - (+b.properties[seqF]));
  const medianSeq = +sorted[Math.floor(sorted.length/2)].properties[seqF];
  const prefOther = (line==='PURPLE') ? 'GREEN' : (line==='GREEN' ? 'PURPLE' : 'GREEN');

  const cands = feats.filter(f => {
    const p = f.properties;
    return p.interchange && p.lines?.includes(line) && p.lines.some(LN=>LN!==line);
  });

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
function seqKey(L){ return `seq_${L.toLowerCase()}`; }

function el(svg,name,attrs){ const n=document.createElementNS('http://www.w3.org/2000/svg',name); for (const [k,v] of Object.entries(attrs)) n.setAttribute(k,String(v)); svg.appendChild(n); return n; }
function poly(svg,points,stroke,width){ el(svg,'polyline',{points:points.map(pt=>pt.join(',')).join(' '), fill:'none', stroke, 'stroke-width':width, 'stroke-linejoin':'round', 'stroke-linecap':'round'}); }
function lineSeg(svg,x1,y1,x2,y2,stroke,width){ el(svg,'line',{x1,y1,x2,y2, stroke, 'stroke-width':width, 'stroke-linecap':'round'}); }
function dot(svg,cx,cy,r, stroke, sw, fill='#fff'){ el(svg,'circle',{cx,cy,r, fill, stroke, 'stroke-width':sw}); }
function text(svg,content,x,y,anchor,cls,fill){ const t = el(svg,'text',{x,y,'text-anchor':anchor, class:cls}); if (fill) t.setAttribute('fill', fill); t.textContent=content; }
