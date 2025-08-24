// /assets/feature-map.js
export async function init({ containerId = 'map', dataUrl = '/data/stations.geojson' } = {}) {
  // ---- Config kept local to this feature ----
  const LINE_COLORS = { PURPLE:"#7c3aed", GREEN:"#10b981", YELLOW:"#f59e0b" };
  const BLR = [12.9716, 77.5946];
  const isMobile = window.matchMedia('(max-width: 640px)').matches;
  const seqKey = (L) => `seq_${L.toLowerCase()}`;
  // After fitBounds: desktop zoom OUT 1 (wider), mobile zoom IN 1 (closer)
  const TUNING = { mobileZoomDelta: +1, desktopZoomDelta: -1 };

  // ---- Data loader (with path fallbacks) ----
  let STATIONS = null;
  const CANDIDATES = [dataUrl, '/stations.geojson', 'data/stations.geojson', 'stations.geojson'];
  for (const url of CANDIDATES) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (r.ok) {
        const gj = await r.json();
        if (Array.isArray(gj.features) && gj.features.length) {
          STATIONS = gj;
          console.log('[stations] loaded:', url, 'features =', gj.features.length);
          break;
        }
      }
    } catch {}
  }
  if (!STATIONS) {
    console.warn('stations.geojson not found or empty.');
    return;
  }

  // ---- Map init ----
  const map = L.map(containerId, { preferCanvas: true, zoomControl: true, attributionControl: false });
  map.setView(BLR, 11.8);
  map.zoomControl.setPosition('bottomright');

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, detectRetina: true
  }).addTo(map);

  window.addEventListener('load', () => map.invalidateSize());

  const lineLayers = { PURPLE: L.layerGroup().addTo(map),
                       GREEN:  L.layerGroup().addTo(map),
                       YELLOW: L.layerGroup().addTo(map) };
  const stationLayer = L.layerGroup().addTo(map);

  const byLine = { PURPLE:[], GREEN:[], YELLOW:[] };
  const bounds = [];
  const R  = isMobile ? 4.8 : 6.5;  // station outer radius
  const Ri = isMobile ? 2.6 : 3.4;  // inner ring for interchanges
  const W  = isMobile ? 2.0 : 2.5;  // stroke weight

  STATIONS.features.forEach(f => {
    const p = f.properties || {};
    const [lng, lat] = f.geometry.coordinates;
    const lines = Array.isArray(p.lines) ? p.lines : String(p.lines||'').split(',').map(x=>x.trim().toUpperCase()).filter(Boolean);
    const primary = lines[0];
    const isInter = !!p.interchange;

    // station marker (dual ring if interchange)
    L.circleMarker([lat, lng], {
      radius: R, color: LINE_COLORS[primary] || '#fff', weight: W, fillColor: '#fff', fillOpacity: 1
    }).addTo(stationLayer).bindTooltip(p.name || p.id || 'Station', { direction:'top', offset:[0,-10], opacity:.92 });

    if (isInter && lines[1]) {
      L.circleMarker([lat, lng], {
        radius: Ri, color: LINE_COLORS[lines[1]] || '#fff', weight: W+0.5, fillColor: '#fff', fillOpacity: 1
      }).addTo(stationLayer);
    }

    // collect for line polylines (ordered by seq_* per line)
    lines.forEach(LN => {
      const q = +p[seqKey(LN)];
      if (Number.isFinite(q)) byLine[LN]?.push({ seq: q, lat, lng });
    });
  });

  // draw polylines
  Object.entries(byLine).forEach(([LN, arr]) => {
    if (!arr.length) return;
    arr.sort((a,b)=>a.seq-b.seq);
    const latlngs = arr.map(pt => { const ll=[pt.lat,pt.lng]; bounds.push(ll); return ll; });
    L.polyline(latlngs, { color: LINE_COLORS[LN], weight: 5, opacity: .9, lineJoin: 'round' }).addTo(lineLayers[LN]);
  });

  if (bounds.length) {
    const pad = isMobile ? [8,8] : [24,24];
    map.fitBounds(L.latLngBounds(bounds), { padding: pad });

    const dz = isMobile ? TUNING.mobileZoomDelta : TUNING.desktopZoomDelta;
    if (dz) map.setZoom(map.getZoom() + dz);

    setTimeout(() => map.invalidateSize(), 0);
  }

  // expose a tiny hook if you later want Map→Fold2 scroll
  window.fold2Navigate = (line='PURPLE') => {
    const el = document.getElementById('fold2');
    if (el) el.scrollIntoView({ behavior:'smooth', block:'start' });
    window.dispatchEvent(new CustomEvent('fold2:navigate', { detail: { line } }));
  };
}
