import { main, swapScene } from "/tour-viewer/index.js";
import { attachStockSession } from "/tour-viewer/stock-session.js";
import { attachTeleports, portalEnds } from "/tour-viewer/teleports.js";

// Which tour: ?scene=<folder on this site> holding scene.sog, scene.voxel.json and settings.json,
// or ?tour=<public id> for a combined tour (its floors' scenes joined by teleports; &floor= and &at= say where).
// Only paths on this site are accepted. &edit=1 is the team's tour editor, driven by the page around it.
const params = new URLSearchParams(location.search);
const safeFolder = (value) => (/^\/(?!\/)[A-Za-z0-9_\-./]*$/.test(value || "") && !value.includes("..") ? value.replace(/\/$/, "") : null);
const tourId = params.get("tour");
const editing = params.get("edit") === "1" && window.parent !== window;
let folder = safeFolder(params.get("scene"));
/** The combined tour, its floor shown here, and where people arrive on it. */
let tour = null;
let floorId = Number(params.get("floor")) || null;
let arrival = null;
let continued = false;

async function loadTour() {
  if (!tourId) return;
  const response = await fetch(`/api/public/space-tours/${encodeURIComponent(tourId)}`);
  if (!response.ok) throw new Error("Tour unavailable");
  tour = await response.json();
  const floor = tour.floors.find((f) => f.areaId === floorId)
    ?? tour.floors.find((f) => f.areaId === tour.start?.areaId) ?? tour.floors[0];
  if (!floor) throw new Error("Tour has no floors");
  floorId = floor.areaId;
  folder = safeFolder(floor.scene);
  const at = params.get("at");
  // Arrived through a portal: at=<the end people went into>, so they land at its other end, on this floor.
  const via = at ? portalEnds(tour.teleports, null).find((end) => end.id === at && end.target.areaId === floorId) : null;
  continued = !!via;
  // Through a teleport: its landing spot. Opened directly: the floor's own start point, else the tour's.
  arrival = via ? via.target : tour.spawns?.[String(floorId)] ?? (tour.start?.areaId === floorId ? tour.start : null);
  // track.js counts the view: one per visit, not one per floor reached by teleport.
  window.__tenzoTour = { space: tour.spaceId, floor: floorId, continued };
  window.dispatchEvent(new CustomEvent("tenzo-tour", { detail: window.__tenzoTour }));
}

const floorName = (id) => tour?.floors.find((f) => f.areaId === id)?.name ?? "Teleport";

/** Rings, walking into them, and (in the editor) placing them. */
function attachTourLayer(viewer, canvas) {
  const toParent = (message) => window.parent.postMessage(message, location.origin);
  const layer = attachTeleports(viewer, canvas, {
    edit: editing,
    onTake: async (id) => {
      const end = tour && portalEnds(tour.teleports, floorId).find((e) => e.id === id);
      if (!end) return layer.reveal();
      if (end.target.areaId === floorId) {
        layer.setPose(end.target);
        layer.reveal();
        return;
      }
      const next = new URL(location.href);
      next.searchParams.set("floor", String(end.target.areaId));
      next.searchParams.set("at", end.id);
      const scene = safeFolder(tour.floors.find((f) => f.areaId === end.target.areaId)?.scene);
      try {
        // The other floor loads into this page, so the walk and the captured mouse go on without a click.
        if (!scene) throw new Error("No scene for that floor");
        await swapScene(viewer, `${scene}/scene.sog`, `${scene}/scene.voxel.json`);
      } catch (error) {
        // Else the floor opens as its own page (one click to go on).
        console.warn("Could not switch floors in place", error);
        location.replace(next);
        return;
      }
      floorId = end.target.areaId;
      folder = scene;
      history.replaceState(null, "", next);
      showMarkers();
      layer.setPose(end.target);
      layer.reveal();
    },
    onPick: (point, pose) => toParent({ type: "tour-edit-picked", point, pose }),
    onSelect: (id) => toParent({ type: "tour-edit-select", id }),
  });
  /** This floor's rings. */
  function showMarkers() {
    const ends = portalEnds(tour.teleports, floorId);
    layer.setMarkers(ends.map((end) => ({ id: end.id, position: end.position, radius: end.radius,
      label: end.label || floorName(end.target.areaId) })));
    return ends;
  }
  if (tour) {
    const ends = showMarkers();
    // The floors a ring here leads to start loading while people look around, so the jump is quick.
    setTimeout(() => {
      const targets = new Set(ends.map((end) => end.target.areaId).filter((id) => id !== floorId));
      for (const id of targets) {
        const scene = safeFolder(tour.floors.find((f) => f.areaId === id)?.scene);
        if (!scene) continue;
        for (const file of ["scene.sog", "scene.voxel.json", "scene.voxel.bin", "settings.json"]) {
          const link = document.createElement("link");
          link.rel = "prefetch";
          link.href = `${scene}/${file}`;
          document.head.appendChild(link);
        }
      }
    }, 4000);
  }
  if (editing) {
    window.addEventListener("message", (event) => {
      if (event.origin !== location.origin || event.source !== window.parent) return;
      const data = event.data || {};
      if (data.type === "tour-edit-markers") layer.setMarkers(data.markers);
      else if (data.type === "tour-edit-place") layer.setPlacing(!!data.on);
      else if (data.type === "tour-edit-look") layer.setLooking(!!data.on);
      else if (data.type === "tour-edit-pose") layer.setPose(data.pose);
      else if (data.type === "tour-edit-get-pose") {
        const pose = layer.getPose();
        // A spot a little behind where people arrive: where the way back goes.
        let back = null;
        if (pose) {
          const rad = (pose.yaw * Math.PI) / 180;
          const bx = pose.position[0] + Math.sin(rad) * 0.9;
          const bz = pose.position[2] + Math.cos(rad) * 0.9;
          back = layer.floorBelow(bx, pose.position[1], bz) ?? layer.floorBelow(pose.position[0], pose.position[1], pose.position[2]);
        }
        toParent({ type: "tour-edit-pose-now", request: data.request, pose, back });
      }
    });
    // After the viewer has settled into walking, so a pose the editor sends right away is not reset.
    setTimeout(() => toParent({ type: "tour-edit-ready" }), 300);
  }
  return layer;
}

async function loadSettings() {
  const response = await fetch(`${folder}/settings.json`);
  if (!response.ok) throw new Error("Settings unavailable");
  return response.json();
}

async function start() {
  await loadTour();
  if (!folder) throw new Error("No tour given");
  // A 3DGS can be shown before its voxels exist: then it opens in fly mode, without walking or teleports.
  // ?fly=1 leaves the voxels out on purpose: the camera then moves freely (a recorded flight through the 3DGS).
  const fly = params.get("fly") === "1";
  const hasVoxels = !fly && await fetch(`${folder}/scene.voxel.json`).then((response) => response.ok).catch(() => false);
  const config = {
    poster: null,
    skyboxUrl: null,
    contentUrl: `${folder}/scene.sog`,
    contentFilename: "scene.sog",
    contents: fetch(`${folder}/scene.sog`),
    collisionUrl: hasVoxels ? `${folder}/scene.voxel.json` : undefined,
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
  // Teleports stand on the floor and hide behind walls, so they need the voxels; without them the 3DGS is only flown through.
  const walkable = viewer.global.state.walkAllowed;
  if (hasVoxels && !walkable) console.warn("The voxels did not load: showing the 3DGS in fly mode.");
  const tourLayer = walkable && (tour || editing) ? attachTourLayer(viewer, canvas) : null;
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
  // Through a teleport, the walk goes on without the start screen.
  if (continued) session.resume();
  // Where people arrive (a teleport's arrival, or the tour's start). Set once the viewer has settled into walking,
  // which otherwise puts the camera back at the scene's own start.
  if (tourLayer && arrival) {
    const place = () => tourLayer.setPose(arrival);
    place();
    requestAnimationFrame(() => requestAnimationFrame(place));
    setTimeout(place, 250);
  }
  pause.addEventListener("click", () => session.close());
  const gate = document.getElementById("tenzo-stock-enter");
  const touch = window.matchMedia("(pointer: coarse)").matches;
  gate.setAttribute("aria-label", "Start the 3D tour");
  gate.innerHTML = `<span class="tour-start">
    <span class="tour-start-text">${continued ? (touch ? "Tap to continue" : "Click anywhere to continue") : touch ? "Tap to start" : "Click anywhere to start"}</span>
    <span class="tour-start-keys">${touch
      ? '<span><b>Drag</b> look around</span><span><b>Double-tap</b> walk there</span>'
      : '<span class="tour-start-move"><span class="tour-start-keyset"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><span><kbd aria-label="Up"><svg viewBox="0 0 24 24" width="13" height="13" style="transform:rotate(0deg)" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></kbd><kbd aria-label="Left"><svg viewBox="0 0 24 24" width="13" height="13" style="transform:rotate(-90deg)" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></kbd><kbd aria-label="Down"><svg viewBox="0 0 24 24" width="13" height="13" style="transform:rotate(180deg)" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></kbd><kbd aria-label="Right"><svg viewBox="0 0 24 24" width="13" height="13" style="transform:rotate(90deg)" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></kbd></span></span> move</span><span><b>Mouse</b> look around</span><span><kbd>Esc</kbd> stop</span>'}</span>
  </span>`;
}

start().catch((error) => {
  console.error("Tour viewer failed to load", error);
  document.getElementById("tenzo-stock-enter")?.remove();
  const message = document.createElement("div");
  message.id = "tour-error";
  message.setAttribute("role", "alert");
  message.textContent = "Could not load the 3D tour. Please reload the page.";
  document.body.appendChild(message);
});

