// Wires hover tooltip + click popup. Locks the clicked station so hover doesn’t fight it.
export function wireStations(map, markers){
  let lockedId = null;

  markers.forEach(m => {
    const s = m.station;

    m.on("mouseover", () => {
      if (lockedId === s.id) return;
      m.bindTooltip(
        `<div style="min-width:180px; font-weight:700;">${s.name}</div>
         <div style="color:#4f46e5; font-weight:700; margin-top:4px;">Click to get more info</div>`,
        { direction:"top", offset:[0,-10], opacity:0.98, sticky:true, className:"station-tooltip" }
      ).openTooltip();
    });

    m.on("mouseout", () => {
      if (lockedId === s.id) return;
      m.unbindTooltip();
    });

    m.on("click", () => {
      lockedId = s.id;
      m.unbindTooltip();
      m.bindPopup(`
        <div style="min-width:240px">
          <div style="font-weight:700; margin-bottom:6px;">${s.name}</div>
          <div class="pill-row">
            <span class="pill">Time</span>
            <span class="pill">Price</span>
            <span class="pill">Station Info</span>
          </div>
        </div>
      `).openPopup();
    });
  });

  // clicking the map background clears the lock so hovers resume
  map.off("click").on("click", (e) => {
    if (e.originalEvent?.target?.closest(".leaflet-popup")) return;
    lockedId = null;
  });
}
