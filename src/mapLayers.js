import { MAP_DEFAULT } from "./constants.js";

export function initMap(containerId){
  const map = L.map(containerId, { zoomControl:true, attributionControl:false })
               .setView(MAP_DEFAULT.center, MAP_DEFAULT.zoom);

  // panes for correct z-ordering
  map.createPane("linesPane");    map.getPane("linesPane").style.zIndex = 400;
  map.createPane("stationsPane"); map.getPane("stationsPane").style.zIndex = 650;

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);

  map._groups = { lines: L.layerGroup().addTo(map), stations: L.layerGroup().addTo(map) };
  return map;
}

export function renderNetwork(map, stations, lines){
  const { lines: lineGroup, stations: stationGroup } = map._groups;
  lineGroup.clearLayers();
  stationGroup.clearLayers();

  // draw lines (operational only) using ordered station IDs
  lines.filter(l => l.operational === true).forEach(line => {
    const coords = [];
    (line.stations || []).forEach(id => {
      const s = map._stationsById?.[id];
      if (s && s.operational === true) coords.push([s.lat, s.lng]);
    });
    if (coords.length >= 2) {
      L.polyline(coords, { color: line.color || "#555", weight: 5, opacity: 0.95, pane: "linesPane" })
        .addTo(lineGroup);
    }
  });

  // draw stations (operational only), return markers so others can wire interactions
  const markers = [];
  stations.forEach(s => {
    if (s.operational !== true) return;
    const m = L.circleMarker([s.lat, s.lng], {
      radius: 6, color:"#0b0b0b", weight:1, fillColor:"#ffffff", fillOpacity:1, pane:"stationsPane"
    });
    m.station = s;
    m.addTo(stationGroup);
    markers.push(m);
  });

  return markers;
}
