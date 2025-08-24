export const LINE_COLORS = { PURPLE:"#7c3aed", GREEN:"#10b981", YELLOW:"#f59e0b" };
export const BLR = [12.9716, 77.5946];
export const isMobile = window.matchMedia('(max-width: 640px)').matches;
export const seqKey = (L) => `seq_${L.toLowerCase()}`;

/* Zoom deltas after fitBounds:
   mobile: zoom IN 1 (closer), desktop: zoom OUT 1 (wider) */
export const TUNING = { mobileZoomDelta: +1, desktopZoomDelta: -1 };

export async function loadStations() {
  const CANDIDATES = ['/data/stations.geojson','/stations.geojson','data/stations.geojson','stations.geojson'];
  for (const url of CANDIDATES){
    try{
      const res = await fetch(url,{cache:'no-store'});
      if (res.ok){
        const gj = await res.json();
        if (Array.isArray(gj.features) && gj.features.length) {
          console.log('[stations] loaded:', url, 'features =', gj.features.length);
          return gj;
        }
      }
    }catch{}
  }
  throw new Error('stations.geojson not found or empty');
}
