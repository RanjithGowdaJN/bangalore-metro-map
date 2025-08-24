// /assets/feature-diagram.js
export async function init({
  svgId = 'stationsSvg',
  chipsId = 'lineChips',
  dataUrl = '/data/stations.geojson',
  data
} = {}) {
  const LINE_COLORS = { PURPLE:"#7c3aed", GREEN:"#10b981", YELLOW:"#f59e0b" };
  const seqKey = (L) => `seq_${L.toLowerCase()}`;
  const mq = window.matchMedia('(max-width: 640px)');

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

  // Load data
  let STATIONS = data || null;
  if (!STATIONS) {
    const CANDS = [dataUrl,'/stations.geojson','data/stations.geojson','stations.geojson'];
    for (const url of CANDS) {
      try { const r = await fetch(url,{cache:'no-store'}); if (r.ok) { const gj=await r.json(); if (gj?.features?.length) { STATIONS=normalize(gj); break; } } }
      catch {}
    }
  } else {
    STATIONS = normalize(STATIONS);
  }
  if (!STATIONS) { console.warn('[diagram] stations not found'); return; }

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

  chips.addEventListener('click', e=>{
    const btn=e.target.closest('.chip'); if(!btn) return;
    if (btn.dataset.line===activeLine) return;
    chips.querySelectorAll('.chip').forEach(c=>c.setAttribute('aria-selected','false'));
    btn.setAttribute('aria-selected','true');
    activeLine=btn.dataset.line; render();
  });

  window.addEventListener('fold2:navigate', ev=>{
    const L = ev?.detail?.line?.toUpperCase(); if (!L || L===activeLine) return;
    const btn = chips.querySelector(`.chip[data-line="${L}"]`); if (btn) btn.click();
  });
}

/* ---------------- renderer ---------------- */
function renderDiagram(svg, line, GJ, COLORS, isMobile){
  const W = svg.clientWidth || 1100;
  const seqF = `seq_${line.toLowerCase()}`;
  const feats = GJ.features.filter(f => Number.isFinite(+f.properties?.[seqF]))
                           .sort((a,b)=> (+a.properties[seqF]) - (+b.properties[seqF]));
  if (!feats.length){ svg.innerHTML=''; return; }

  const LINE = COLORS[line];
  const anchor = pickAnchor(line, feats);
  const aSeq = +anchor.properties[seqF];

  const leftBranch  = feats.filter(f => +f.properties[seqF] < aSeq); // branch A
  const rightBranch = feats.filter(f => +f.properties[seqF] > aSeq); // branch B
  const otherPref = (line==='PURPLE')?'GREEN':(line==='GREEN'?'PURPLE':'GREEN');
  const otherLine = anchor.properties.lines.find(LN=>LN!==line) || otherPref;
  const OTHER = COLORS[otherLine] || '#fff';

  if (!isMobile){
    // ===== DESKTOP =====
    const H = 360, padL = 56, padR = 56;
    const yTop = 132, yBot = 228;
    const xStart = padL, xAnchor = W - padR;          // both rows end at the RIGHT edge
    const stepTop = (xAnchor - xStart) / Math.max(1, rightBranch.length);
    const stepBot = (xAnchor - xStart) / Math.max(1, leftBranch.length);

    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('height', H); svg.innerHTML='';

    // full-width rails
    lineSeg(svg, xStart, yTop, xAnchor, yTop, LINE, 6);
    lineSeg(svg, xStart, yBot, xAnchor, yBot, LINE, 6);

    // stations on top row (anchor to terminal on that side)
    rightBranch.forEach((f,i)=>{
      const x = xStart + stepTop*(i+1);
      dot(svg,x,yTop,6,LINE,3,'#fff');
      slanted(svg, f.properties.name, x, yTop-12, -26, 'lbl'); // slant up-left
    });

    // stations on bottom row (anchor to the other terminal)
    leftBranch.slice().reverse().forEach((f,i)=>{
      const x = xStart + stepBot*(i+1);
      dot(svg,x,yBot,6,LINE,3,'#fff');
      slanted(svg, f.properties.name, x, yBot+18, 26, 'lbl');  // slant down-right
    });

    // Draw anchor at the right edge for both rows + tiny connector
    const midY = (yTop + yBot)/2;
    lineSeg(svg, xAnchor, yTop, xAnchor, yBot, LINE, 6); // short vertical connector
    dot(svg, xAnchor, midY, 8, LINE, 4, '#fff');
    dot(svg, xAnchor, midY, 5, OTHER, 4, '#fff');
    text(svg, anchor.properties.name, xAnchor, midY-18, 'middle', 'lbl anchor', OTHER);
    text(svg, 'Line change', xAnchor, midY+30, 'middle', 'lbl small');

    // Add terminal dots at the left edge for visual closure
    if (rightBranch.length){
      dot(svg, xStart, yTop, 4.5, LINE, 0, LINE);
    }
    if (leftBranch.length){
      dot(svg, xStart, yBot, 4.5, LINE, 0, LINE);
    }
  } else {
    // ===== MOBILE (vertical) =====
    const count = leftBranch.length + rightBranch.length + 1; // + anchor
    const step = 44;                                         // spacing
    const H = Math.max(520, 80 + step*(count + 1));          // grow to show all
    const CX = W/2, baseY = H - 40;

    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('height', H); svg.innerHTML='';

    // Order: all stations above, anchor at the bottom
    const ordered = [...leftBranch, ...rightBranch].reverse().concat([anchor]);

    // vertical spine
    lineSeg(svg, CX, baseY - step*(ordered.length-1), CX, baseY, LINE, 6);

    ordered.forEach((f,i)=>{
      const y = baseY - i*step;
      const isAnchor = (f===anchor);
      dot(svg, CX, y, 6, LINE, 3, '#fff');
      if (isAnchor) dot(svg, CX, y, 4.2, OTHER, 4, '#fff');

      // Alternating labels with slight stagger so long names breathe
      const leftSide = i % 2 === 0;
      const jitter = (i % 4 === 1) ? -6 : (i % 4 === 3 ? +6 : 0);
      const tx = CX + (leftSide ? -12 : 12);
      const ty = y + (leftSide ? -10 : 14) + jitter;
      text(svg, f.properties.name, tx, ty, leftSide ? 'end' : 'start', 'lbl' + (isAnchor?' anchor':''), isAnchor?OTHER:undefined);
    });
    text(svg, 'Line change', CX, baseY + 18, 'middle', 'lbl small');
  }
}

/* ---------------- helpers ---------------- */
function normalize(gj){
  for (const f of gj.features){
    const p=f.properties||(f.properties={});
    p.lines = Array.isArray(p.lines) ? p.lines.map(s=>String(s).toUpperCase())
                                     : String(p.lines||'').split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
    const v = p.interchange;
    p.interchange = (v===true || v===1 || v==='1' || String(v).toLowerCase()==='true');
  }
  return gj;
}

function pickAnchor(line, feats){
  const seqF = `seq_${line.toLowerCase()}`;
  const sorted = feats.slice().sort((a,b)=> (+a.properties[seqF]) - (+b.properties[seqF]));
  const medianSeq = +sorted[Math.floor(sorted.length/2)].properties[seqF];
  const prefOther = (line==='PURPLE')?'GREEN':(line==='GREEN'?'PURPLE':'GREEN');

  const cands = feats.filter(f => f.properties.interchange &&
                                  f.properties.lines?.includes(line) &&
                                  f.properties.lines.some(LN=>LN!==line));
  let best=null;
  for (const s of cands){
    const p=s.properties;
    const score=(p.lines.includes(prefOther)?2:0)+(p.lines.length-1);
    const dist=Math.abs(+p[seqF]-medianSeq);
    if (!best || score>best.score || (score===best.score && dist<best.dist)) best={s,score,dist};
  }
  return (best?.s)||sorted[Math.floor(sorted.length/2)];
}

function injectCss(css){ const s=document.createElement('style'); s.textContent=css; document.head.appendChild(s); }
function throttle(fn,gap){ let t=0; return (...a)=>{ const n=Date.now(); if(n-t>gap){ t=n; fn(...a);} }; }

function el(svg,name,attrs){ const n=document.createElementNS('http://www.w3.org/2000/svg',name); for (const [k,v] of Object.entries(attrs)) n.setAttribute(k,String(v)); svg.appendChild(n); return n; }
function lineSeg(svg,x1,y1,x2,y2,stroke,width){ el(svg,'line',{x1,y1,x2,y2, stroke, 'stroke-width':width, 'stroke-linecap':'round'}); }
function dot(svg,cx,cy,r, stroke, sw, fill='#fff'){ el(svg,'circle',{cx,cy,r, fill, stroke, 'stroke-width':sw}); }
function text(svg,content,x,y,anchor,cls,fill){ const t=el(svg,'text',{x,y,'text-anchor':anchor,class:cls}); if (fill) t.setAttribute('fill', fill); t.textContent=content; }
function slanted(svg,content,x,y,deg,cls){ const t=el(svg,'text',{x,y,class:cls,transform:`rotate(${deg} ${x} ${y})`}); t.textContent=content; }
