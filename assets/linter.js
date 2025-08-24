import { seqKey } from './utils.js';
export function lintStations(gj){
  try{
    const ids = new Set();
    gj.features.forEach(f=>{
      const p=f.properties||{};
      if (!p.id) console.warn('[lint] missing id:', f);
      if (ids.has(p.id)) console.warn('[lint] duplicate id:', p.id); else ids.add(p.id);
      ['PURPLE','GREEN','YELLOW'].forEach(L=>{
        if (p.lines?.includes(L) && !Number.isFinite(+p[seqKey(L)])) {
          console.warn(`[lint] ${p.id} is on ${L} but lacks ${seqKey(L)}`);
        }
      });
    });
  }catch(e){ console.warn('[lint] exception',e); }
}
