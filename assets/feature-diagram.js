// /assets/feature-diagram.js
export async function init({
  svgId = 'stationsSvg',
  chipsId = 'lineChips',
  dataUrl = '/data/stations.geojson',
  data
} = {}) {
  const LINE_COLORS = { PURPLE:"#7c3aed", GREEN:"#10b981", YELLOW:"#f59e0b" };
  const mq = window.matchMedia('(max-width: 640px)');

  injectCss(`
    #fold2 .card{background:#0e1726;border:1px solid #1e293b;border-radius:14px;padding:14px 14px 8px}
    #lineChips{display:flex;gap:8px;justify-content:center;margin:8px 0 10px;flex-wrap:wrap}
    #lineChips .chip{border:1px solid #1e293b;background:#0c1424;color:#cbd5e1;padding:8px 12px;border-radius:999px;cursor:pointer;font-weight:600;line-height:1;user-select:none}
    #lineChips .chip[aria-selected="true"]{box-shadow:0 0 0 2px rgba(255,255,255,.07) inset}
    #lineChips .chip[data-line="PURPLE"][aria-selected="true"]{background:rgba(124,58,237,.25);border-color:#6d28d9}
    #lineChips .chip[data-line="GREEN"][aria-selected="true"]{background:rgba(16,185,129,.25);border-color:#059669}
    #lineChips .chip[data-line="YELLOW"][aria-selected="true"]{background:rgba(245,158,11,.25);border-color:#d97706}
    #stationsSvg .lbl{fill:#cbd5e1;font-size:12px}
    #stationsSvg .lbl.small{font-size:11px;fill:#94a3b8}
    #stationsSvg .lbl.anchor{font-weight:700}
    @media (max-width:640px){ #fold2 .card{padding:10px 10px 6px} }
  `);

  // Load + normalize
  let STATIONS = data || null;
  if (!STATIONS) {
    const CANDS = [dataUrl,'/stations.geojson','data/stations.geojson','stations.geojson'];
    for (const u of CANDS) {
      try { const r = await fetch(u,{cache:'no-store'}); if(r.ok){ const j=await r.json(); if(j?.features?.length){ STATIONS=j; break; } } } catch {}
    }
  }
  if (!STATIONS){ console.warn('[diagram] stations not found'); return; }
  normalize(STATIONS);

  const svg = document.getElementById(svgId);
  const chips = document.getElementById(chipsId);
  if (!svg || !chips) return;

  let activeLine = (chips.querySelector('[aria-selected="true"]')?.dataset.line) || 'PURPLE';

  const render = () => {
    const isMobile = mq.matches;
    renderDiagram(svg, activeLine, STATIONS, LINE_COLORS, isMobile);
  };

  render();
  mq.addEventListener?.('change', render);
  window.addEventListener('resize', throttle(render, 120));

  chips.addEventListener('click', (e)=>{
    const b = e.target.closest('.chip'); if(!b) return;
    if (b.dataset.line === activeLine) return;
    chips.querySelectorAll('.chip').forEach(c=>c.setAttribute('aria-selected','false'));
    b.setAttribute('aria-selected','true');
    activeLine = b.dataset.line;
    render();
  });

  window.addEventListener('fold2:navigate', (ev)=>{
    const L = ev?.detail?.line?.toUpperCase(); if (!L || L===activeLine) return;
    const btn = chips.querySelector(`.chip[data-line="${L}"]`); if (btn) btn.click();
  });
}

/* ---------------- render core ---------------- */
function renderDiagram(svg, line, GJ, COLORS, isMobile){
  const W = svg.clientWidth || 1100;
  const seqF = `seq_${line.toLowerCase()}`;

  // STRICT: must have seq_<line> AND list <line> in lines[]
  const feats = GJ.features
    .filter(f => Array.isArray(f.properties?.lines)
              && f.properties.lines.includes(line)
              && Number.isFinite(+f.properties?.[seqF]))
    .sort((a,b)=> (+a.properties[seqF]) - (+b.properties[seqF]));

  if (!feats.length){ svg.innerHTML=''; return; }

  const LINE = COLORS[line];
  const anchor = pickAnchorStrict(line, feats);         // center anchor
  const aSeq = +anchor.properties[seqF];

  // Branches split at anchor
  const left  = feats.filter(f => +f.properties[seqF] < aSeq);   // one terminal
  const right = feats.filter(f => +f.properties[seqF] > aSeq);   // other terminal

  // For the dual-ring color, prefer the other line at this interchange
  const otherPref = (line==='PURPLE')?'GREEN':(line==='GREEN'?'PURPLE':'GREEN');
  const otherLine = anchor.properties.lines.find(LN=>LN!==line) || otherPref;
  const OTHER = COLORS[otherLine] || '#fff';

  if (!isMobile){
    // ===== Desktop: CENTER anchor, two parallel rows, equal half-widths =====
    const H=360, CX=W/2, topY=132, botY=228, pad=56;
    svg.setAttribute('viewBox',`0 0 ${W} ${H}`); svg.setAttribute('height',H); svg.innerHTML='';

    // available width on each side
    const half = W/2 - pad;
    const stepR = right.length ? half/right.length : half; // px between stations to the right
    const stepL = left.length  ? half/left.length  : half; // px between stations to the left

    // draw rails from center to each side
    lineSeg(svg, CX, topY,  CX + stepR*right.length, topY, LINE, 6);
    lineSeg(svg, CX - stepL*left.length, botY, CX, botY, LINE, 6);

    // top row (center -> right)
    let lastLabelX = -1e9;
    const minGapTop = 44; // px between labels
    right.forEach((f,i)=>{
      const x = CX + stepR*(i+1);
      dot(svg,x,topY,6,LINE,3,'#fff');
      // always label terminals; otherwise thin based on pixel gap
      const isTerminal = (i===right.length-1);
      if (isTerminal || x-lastLabelX >= minGapTop){
        slanted(svg, f.properties.name, x, topY-12, -26, 'lbl');
        lastLabelX = x;
      }
    });

    // bottom row (left <- center)
    lastLabelX = 1e9;
    const minGapBot = 60; // a bit more to keep bottom clean
    left.slice().reverse().forEach((f,i)=>{
      const x = CX - stepL*(i+1);
      dot(svg,x,botY,6,LINE,3,'#fff');
      const isTerminal = (i===left.length-1);
      if (isTerminal || lastLabelX - x >= minGapBot){
        slanted(svg, f.properties.name, x, botY+18, 26, 'lbl');
        lastLabelX = x;
      }
    });

    // center anchor (dual ring) + labels
    lineSeg(svg, CX, botY, CX, topY, LINE, 6);               // short connector
    dot(svg, CX, (topY+botY)/2, 8, LINE, 4, '#fff');
    dot(svg, CX, (topY+botY)/2, 5, OTHER, 4, '#fff');
    text(svg, anchor.properties.name, CX, (topY+botY)/2 - 18, 'middle', 'lbl anchor', OTHER);
    text(svg, 'Line change', CX, (topY+botY)/2 + 30, 'middle', 'lbl small');

  } else {
    // ===== Mobile: vertical, anchor at bottom, both branches above =====
    const count = left.length + right.length + 1;
    const step = 44;
    const H = Math.max(520, 80 + step*(count+1));
    const CX=W/2, baseY=H-40;
    svg.setAttribute('viewBox',`0 0 ${W} ${H}`); svg.setAttribute('height',H); svg.innerHTML='';

    // order above anchor: from near-anchor to far terminals (interleaved by branch for variety)
    const ordered = [...left.slice().reverse(), ...right]; // above; anchor at bottom

    // spine
    lineSeg(svg, CX, baseY - step*(ordered.length), CX, baseY, LINE, 6);

    ordered.forEach((f,i)=>{
      const y = baseY - step*(ordered.length - i);
      const leftSide = i % 2 === 0;
      const jitter = (i % 4 === 1) ? -6 : (i % 4 === 3 ? +6 : 0);
      dot(svg, CX, y, 6, LINE, 3, '#fff');
      text(svg, f.properties.name, CX + (leftSide?-12:12), y + (leftSide?-10:14)+jitter,
           leftSide?'end':'start', 'lbl');
    });

    // anchor at bottom
    dot(svg, CX, baseY, 6, LINE, 3, '#fff');
    dot(svg, CX, baseY, 4.2, OTHER, 4, '#fff');
    text(svg, anchor.properties.name, CX, baseY-12, 'middle', 'lbl anchor', OTHER);
    text(svg, 'Line change', CX, baseY + 18, 'middle', 'lbl small');
  }
}

/* ---------------- helpers ---------------- */
function normalize(gj){
  for (const f of gj.features){
    const p=f.properties||(f.properties={});
    // normalize lines[]
    p.lines = Array.isArray(p.lines)
      ? p.lines.map(s=>String(s).toUpperCase())
      : String(p.lines||'').split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
    // normalize booleans
    const v = p.interchange;
    p.interchange = (v===true || v===1 || v==='1' || String(v).toLowerCase()==='true');
  }
  return gj;
}

/* Prefer Majestic for Purple/Green; else strongest interchange near median */
function pickAnchorStrict(line, feats){
  const seqF = `seq_${line.toLowerCase()}`;
  const sorted = feats.slice().sort((a,b)=> (+a.properties[seqF]) - (+b.properties[seqF]));
  const medianSeq = +sorted[Math.floor(sorted.length/2)].properties[seqF];

  // hard preference for Majestic (Kempegowda) when present
  const MAJ = feats.find(f => f.properties.interchange
                           && f.properties.lines.includes(line)
                           && /majestic|kempegowda/i.test(f.properties.name||''));
  if (MAJ) return MAJ;

  // otherwise: any true interchange with another line, highest degree, closest to median
  const candidates = feats.filter(f => f.properties.interchange &&
                                       f.properties.lines.includes(line) &&
                                       f.properties.lines.some(LN=>LN!==line));
  let best=null;
  for (const s of candidates){
    const p=s.properties;
    const degree = p.lines.length;                 // more lines = more “anchor-y”
    const dist = Math.abs(+p[seqF] - medianSeq);
    if (!best || degree>best.degree || (degree===best.degree && dist<best.dist)){
      best = { s, degree, dist };
    }
  }
  return (best?.s) || sorted[Math.floor(sorted.length/2)];
}

function injectCss(css){ const s=document.createElement('style'); s.textContent=css; document.head.appendChild(s); }
function throttle(fn,gap){ let t=0; return (...a)=>{ const n=Date.now(); if(n-t>gap){ t=n; fn(...a);} }; }

function el(svg,name,attrs){ const n=document.createElementNS('http://www.w3.org/2000/svg',name); for (const [k,v] of Object.entries(attrs)) n.setAttribute(k,String(v)); svg.appendChild(n); return n; }
function lineSeg(svg,x1,y1,x2,y2,stroke,width){ el(svg,'line',{x1,y1,x2,y2, stroke, 'stroke-width':width, 'stroke-linecap':'round'}); }
function dot(svg,cx,cy,r, stroke, sw, fill='#fff'){ el(svg,'circle',{cx,cy,r, fill, stroke, 'stroke-width':sw}); }
function text(svg,content,x,y,anchor,cls,fill){ const t=el(svg,'text',{x,y,'text-anchor':anchor,class:cls}); if (fill) t.setAttribute('fill', fill); t.textContent=content; }
function slanted(svg,content,x,y,deg,cls){ const t=el(svg,'text',{x,y,class:cls,transform:`rotate(${deg} ${x} ${y})`}); t.textContent=content; }
