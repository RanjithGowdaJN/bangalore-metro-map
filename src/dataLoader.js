async function fetchJSON(url){
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed ${url}: ${res.status}`);
  return res.json();
}

export async function loadData({ stationsUrl, linesUrl }){
  const [stations, lines] = await Promise.all([ fetchJSON(stationsUrl), fetchJSON(linesUrl) ]);
  if (!Array.isArray(stations) || !Array.isArray(lines)) {
    throw new Error("Expected arrays in stations.geojson & lines.geojson");
  }
  const stationsById = Object.fromEntries(stations.map(s => [s.id, s]));
  return { stations, lines, stationsById };
}
