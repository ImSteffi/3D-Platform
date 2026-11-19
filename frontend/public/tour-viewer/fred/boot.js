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
  attachStockSession(viewer, canvas);
  const gate = document.getElementById("tenzo-stock-enter");
  gate.textContent = "Click to explore · WASD / mouse";
  gate.setAttribute("aria-label", "Start 3D tour");
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

