import { LINE_COLORS, BLR, isMobile, seqKey, TUNING } from './utils.js';

export function initMap(L, mapElId, stationsGeoJSON) {
  const map = L.map(mapElId, { preferCanvas:true, zoomControl:true, attributionControl:false });
  map.setView(BLR, 11.8);
  map.zoomControl.setPosition('bottomright');
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19, detectRetina:true }).addTo(map);
  window.addEventListener('load', ()=> map.invalidateSize());

  const lineLayers = { PURPLE:L.layerGroup().addTo(map),
                       GREEN: L.layerGroup().addTo(map),
                       YELLOW:L.layerGroup().addTo(map) };
  const stationLayer = L.layerGroup().addTo(map);

  const byLine = { PURPLE:[], GREEN:[], YELLOW:[] };
  const bounds = [];
  const R  = isMobile ? 4.8 : 6.5;
  const Ri = isMobile ? 2.6 : 3.4;
  const W  = isMobile ? 2.0 : 2.5;

  stationsGeoJSON.features.forEach(f=>{
    const p=f.properties||{};
    const [lng,lat]=f.geometry.coordinates;
    const lines = Array.isArray(p.lines) ? p.lines : String(p.lines||'').split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);
    const primary = lines[0], isInter=!!p.interchange;

    L.circleMarker([lat,lng], { radius:R, color:LINE_COLORS[primary]||'#fff', weight:W, fillColor:'#fff', fillOpacity:1 })
      .addTo(stationLayer).bindTooltip(p.name||p.id||'Station',{direction:'top',offset:[0,-10],opacity:.92});

    if (isInter && lines[1]) L.circleMarker([lat,lng], { radius:Ri, color:LINE_COLORS[lines[1]]||'#fff', weight:W+0.5, fillColor:'#fff', fillOpacity:1 }).addTo(stationLayer);

    lines.forEach(LN=>{ const q=+p[seqKey(LN)]; if (Number.isFinite(q)) byLine[LN]?.push({seq:q,lat,lng}); });
  });

  Object.entries(byLine).forEach(([LN,arr])=>{
    if (!arr.length) return;
    arr.sort((a,b)=>a.seq-b.seq);
    const latlngs = arr.map(pt=>{ const ll=[pt.lat,pt.lng]; bounds.push(ll); return ll; });
    L.polyline(latlngs,{ color:LINE_COLORS[LN], weight:5, opacity:.9, lineJoin:'round'}).addTo(lineLayers[LN]);
  });

  if (bounds.length){
    const pad = isMobile ? [8,8] : [24,24];
    map.fitBounds(L.latLngBounds(bounds), { padding: pad });

    const dz = isMobile ? TUNING.mobileZoomDelta : TUNING.desktopZoomDelta;
    if (dz) map.setZoom(map.getZoom()+dz);

    setTimeout(()=> map.invalidateSize(), 0);
  }

  return { map };
}
