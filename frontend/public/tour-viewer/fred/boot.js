import { main } from "/tour-viewer/index.js";
import { attachStockSession } from "/tour-viewer/stock-session.js";

async function loadSettings() {
  const response = await fetch("/tour-viewer/fred/settings.json");
  if (!response.ok) throw new Error("Settings unavailable");
  return response.json();
}

async function start() {
  const config = {
    poster: null,
    skyboxUrl: null,
    contentUrl: "/tour-viewer/fred/scene.sog",
    contentFilename: "scene.sog",
    contents: fetch("/tour-viewer/fred/scene.sog"),
    collisionUrl: "/tour-viewer/fred/scene.voxel.json",
    noui: false,
    noanim: true,
    nofx: false,
    renderer: "webgl",
    aa: false,
    lang: "en",
  };
  const settings = await loadSettings();
  window.sse = { config, settings };
  const canvas = document.getElementById("application-canvas");
  const viewer = await main(canvas, settings, config);
  window.__ssv = viewer;
  if (!viewer.inputController || !viewer.global.state.loaded) {
    await new Promise((resolve) => viewer.global.events.once("firstFrame", resolve));
  }
  if (!viewer.global.state.walkAllowed) {
    throw new Error("Collision unavailable");
  }
  // Phones have no Escape key: a pause button brings back the start screen, where the viewer's own buttons work.
  const pause = document.createElement("button");
  pause.type = "button";
  pause.id = "tour-pause";
  pause.hidden = true;
  pause.setAttribute("aria-label", "Pause the tour");
  pause.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/></svg>';
  document.body.appendChild(pause);
  const session = attachStockSession(viewer, canvas, {
    onActive: (active) => {
      pause.hidden = !(active && viewer.global.state.inputMode === "touch");
      document.body.classList.toggle("tour-paused", !active);
    },
  });
  document.body.classList.add("tour-paused");
  pause.addEventListener("click", () => session.close());
  const gate = document.getElementById("tenzo-stock-enter");
  const touch = window.matchMedia("(pointer: coarse)").matches;
  gate.setAttribute("aria-label", "Start the 3D tour");
  gate.innerHTML = `<span class="tour-start">
    <span class="tour-start-text">${touch ? "Tap to start" : "Click anywhere to start"}</span>
    <span class="tour-start-keys">${touch
      ? '<span><b>Drag</b> look around</span><span><b>Double-tap</b> walk there</span>'
      : '<span class="tour-start-move"><span class="tour-start-keyset"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><span><kbd aria-label="Up"><svg viewBox="0 0 24 24" width="13" height="13" style="transform:rotate(0deg)" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></kbd><kbd aria-label="Left"><svg viewBox="0 0 24 24" width="13" height="13" style="transform:rotate(-90deg)" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></kbd><kbd aria-label="Down"><svg viewBox="0 0 24 24" width="13" height="13" style="transform:rotate(180deg)" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></kbd><kbd aria-label="Right"><svg viewBox="0 0 24 24" width="13" height="13" style="transform:rotate(90deg)" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></kbd></span></span> move</span><span><b>Mouse</b> look around</span><span><kbd>Esc</kbd> stop</span>'}</span>
  </span>`;
}

start().catch((error) => {
  console.error("Fred viewer failed to load", error);
  document.getElementById("tenzo-stock-enter")?.remove();
  const message = document.createElement("div");
  message.id = "fred-error";
  message.setAttribute("role", "alert");
  message.textContent = "Could not load the 3D tour. Please reload the page.";
  document.body.appendChild(message);
});

