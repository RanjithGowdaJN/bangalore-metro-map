export const DATA_VERSION = "2025-08-16-5"; // bump to force fresh fetches

export const PATHS = {
  stations: `data/stations.geojson?v=${DATA_VERSION}`, // arrays, not FeatureCollection
  lines:    `data/lines.geojson?v=${DATA_VERSION}`,
};

export const MAP_DEFAULT = {
  center: [12.9716, 77.5946],
  zoom: 11,
};
