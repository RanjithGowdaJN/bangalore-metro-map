// Simple hash-router stub: renders a placeholder panel into a target element.
export function initRouter(targetEl){
  function render(){
    const hash = location.hash.slice(1);  // e.g., "time?station=MG_ROAD"
    if (!hash) { targetEl.innerHTML = ""; return; }
    targetEl.innerHTML = `
      <div class="card" style="margin-top:16px">
        <div style="font-weight:700; margin-bottom:6px;">Feature panel</div>
        <div style="color:#9fb0c5">Coming soon: ${hash}</div>
      </div>
    `;
  }
  window.addEventListener("hashchange", render);
  render();
}
