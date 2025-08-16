import { PATHS } from "./constants.js";
import { loadData } from "./dataLoader.js";
import { initMap, renderNetwork } from "./mapLayers.js";
import { wireStations } from "./tooltipsPopups.js";
import { initRouter } from "./router.js";

export async function bootstrap(){
  const map = initMap("map");
  const { stations, lines, stationsById } = await loadData({
    stationsUrl: PATHS.stations,
    linesUrl: PATHS.lines
  });
  // make stationsById available for line rendering
  map._stationsById = stationsById;

  const markers = renderNetwork(map, stations, lines);
  wireStations(map, markers);

  // optional: future panels below map
  const featureTarget = document.getElementById("feature-target");
  if (featureTarget) initRouter(featureTarget);
}
