// Teleports in a 3DGS tour: rings on the floor that take people to another spot or floor.
// Drawn as an SVG overlay, projected from the scene each frame, so each ring lies on the floor in perspective.
// Taken by walking into a ring, by clicking it, or, while the mouse is captured, by clicking with the ring in the middle.
// Edit mode (the team's tour editor) adds placing a spot with a click, reading the current view, and moving the camera.

const RING_RADIUS = 0.45;
const RING_POINTS = 32;
/** Walking within this distance (metres, along the floor) of a ring's centre takes it. */
const TRIGGER = 0.5;
/** A ring only works once people have been this far from it, so arriving next to one never bounces straight back. */
const ARM = 1.1;
const SVG = "http://www.w3.org/2000/svg";
/** Eye height above the floor in walk mode (hover height plus eye height). */
const EYE = 1.5;

/**
 * Every teleport is a portal with a ring at each end. Its first end is at `position` on floor `from` and takes people
 * to `arrive`; its second end is where `arrive` stands and takes them back (to `back`, or onto the first ring).
 * Returns the ends on one floor (all ends when floorId is null), each with where it leads.
 * The second end's id is "<id>~back".
 */
export function portalEnds(teleports, floorId) {
  const ends = [];
  for (const t of teleports || []) {
    const back = t.back ?? { areaId: t.from, position: [t.position[0], t.position[1] + EYE, t.position[2]], yaw: 0 };
    if (floorId === null || t.from === floorId) ends.push({ id: t.id, teleport: t.id, position: t.position, target: t.arrive, label: t.label });
    if (floorId === null || t.to === floorId) {
      const [x, y, z] = t.arrive.position;
      // Each ring has its own name; without one it shows the floor it leads to.
      ends.push({ id: `${t.id}~back`, teleport: t.id, position: [x, y - EYE, z], target: back, label: t.backLabel || "" });
    }
  }
  return ends;
}

export function attachTeleports(viewer, canvas, { edit = false, onTake, onPick, onSelect } = {}) {
  const app = viewer.global.app;
  const cameraEntity = () => app.root.findComponents("camera")[0]?.entity;
  const Vec3 = cameraEntity()?.getPosition().constructor;
  const world = new Vec3();
  const screen = new Vec3();
  const view = new Vec3();
  const far = new Vec3();

  const style = document.createElement("style");
  style.textContent = `
    #tour-teleports { position: fixed; z-index: 40; overflow: visible; pointer-events: none; }
    #tour-teleports .tp-ring { fill: rgb(255 255 255 / .16); stroke: #fff; stroke-width: 2.5; pointer-events: auto; cursor: pointer;
      filter: drop-shadow(0 0 6px rgb(0 0 0 / .45)); transition: fill 160ms ease; }
    #tour-teleports .tp:hover .tp-ring { fill: rgb(255 255 255 / .32); }
    #tour-teleports .tp--selected .tp-ring { stroke: #f2a31b; fill: rgb(242 163 27 / .28); }
    #tour-teleports .tp-pill { fill: rgb(20 21 22 / .78); pointer-events: auto; cursor: pointer; }
    #tour-teleports .tp-text { fill: #fff; font: 600 14px system-ui, -apple-system, "Segoe UI", sans-serif; text-anchor: middle;
      dominant-baseline: central; pointer-events: none; }
    #tour-fade { position: fixed; inset: 0; z-index: 80; background: #000; opacity: 0; pointer-events: none; transition: opacity 260ms ease; }
    #tour-fade.is-on { opacity: 1; }
    body.tour-placing, body.tour-placing * { cursor: crosshair !important; }
    body.tour-placing #tenzo-stock-enter { display: none !important; }
  `;
  document.head.appendChild(style);
  const overlay = document.createElementNS(SVG, "svg");
  overlay.id = "tour-teleports";
  overlay.setAttribute("aria-hidden", "true");
  document.body.appendChild(overlay);
  const fade = document.createElement("div");
  fade.id = "tour-fade";
  document.body.appendChild(fade);

  /** @type {{ id: string, position: number[], label: string, selected?: boolean, armed: boolean, g: SVGGElement, ring: SVGPathElement, text: SVGTextElement, pill: SVGRectElement }[]} */
  let markers = [];
  let placing = false;
  let taking = false;

  const collision = () => viewer.inputController?.collision ?? viewer.cameraManager?.controllers?.walk?.collision ?? null;
  const pose = () => viewer.cameraManager?.camera;
  const locked = () => document.pointerLockElement === canvas;

  function setMarkers(list) {
    markers.forEach((marker) => marker.g.remove());
    markers = (list || []).map((spec) => {
      const g = document.createElementNS(SVG, "g");
      g.setAttribute("class", "tp" + (spec.selected ? " tp--selected" : ""));
      const ring = document.createElementNS(SVG, "path");
      ring.setAttribute("class", "tp-ring");
      const pill = document.createElementNS(SVG, "rect");
      pill.setAttribute("class", "tp-pill");
      pill.setAttribute("rx", "12");
      const text = document.createElementNS(SVG, "text");
      text.setAttribute("class", "tp-text");
      text.textContent = spec.label || "Teleport";
      g.append(ring, pill, text);
      g.addEventListener("click", (event) => {
        event.stopPropagation();
        if (placing) return;
        if (edit) onSelect?.(spec.id);
        else take(spec.id);
      });
      overlay.appendChild(g);
      const marker = { ...spec, armed: false, g, ring, text, pill };
      marker.armed = distanceTo(marker) > ARM;
      return marker;
    });
  }

  function project(x, y, z, camera, rect, srcW, srcH) {
    world.set(x, y, z);
    camera.viewMatrix.transformPoint(world, view);
    if (view.z > -0.1) return null;
    camera.worldToScreen(world, screen);
    return [(screen.x / srcW) * rect.width, (screen.y / srcH) * rect.height];
  }

  /**
   * Whether a wall stands between the eye and the ring. Rays go from the eye to a few points of the ring, a little above
   * the floor, so the floor itself never counts; the ring is hidden only when every one of them is blocked.
   * Checked a few times a second, not every frame.
   */
  function hidden(marker, now) {
    if (marker.checkedAt && now - marker.checkedAt < 120) return marker.blocked;
    marker.checkedAt = now;
    const c = collision();
    const eye = cameraEntity()?.getPosition();
    if (!c?.queryRay || !eye) return (marker.blocked = false);
    const [cx, cy, cz] = marker.position;
    const targets = [[cx, cy + 0.25, cz], [cx + RING_RADIUS * 0.8, cy + 0.25, cz], [cx - RING_RADIUS * 0.8, cy + 0.25, cz],
      [cx, cy + 0.25, cz + RING_RADIUS * 0.8], [cx, cy + 0.25, cz - RING_RADIUS * 0.8]];
    marker.blocked = targets.every(([tx, ty, tz]) => {
      const dx = tx - eye.x, dy = ty - eye.y, dz = tz - eye.z;
      const len = Math.hypot(dx, dy, dz);
      if (len < 0.4) return false;
      const hit = c.queryRay(eye.x, eye.y, eye.z, dx / len, dy / len, dz / len, len);
      if (!hit || !Number.isFinite(hit.x)) return false;
      return Math.hypot(hit.x - eye.x, hit.y - eye.y, hit.z - eye.z) < len - 0.15;
    });
    return marker.blocked;
  }

  function distanceTo(marker) {
    const at = pose()?.position;
    if (!at) return Infinity;
    const dy = at.y - marker.position[1];
    // Only rings on the floor people stand on: roughly eye height above it.
    if (dy < 0.6 || dy > 2.6) return Infinity;
    return Math.hypot(at.x - marker.position[0], at.z - marker.position[2]);
  }

  function draw() {
    const camera = cameraEntity()?.camera;
    if (camera) {
      const rect = canvas.getBoundingClientRect();
      const device = app.graphicsDevice;
      const srcW = Math.max(1, device.clientRect?.width || canvas.clientWidth || 1);
      const srcH = Math.max(1, device.clientRect?.height || canvas.clientHeight || 1);
      overlay.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
      Object.assign(overlay.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      for (const marker of markers) {
        const [cx, cy, cz] = marker.position;
        const points = [];
        for (let i = 0; i < RING_POINTS; i++) {
          const a = (i / RING_POINTS) * Math.PI * 2;
          const p = project(cx + Math.cos(a) * RING_RADIUS, cy, cz + Math.sin(a) * RING_RADIUS, camera, rect, srcW, srcH);
          if (!p) { points.length = 0; break; }
          points.push(p);
        }
        const top = project(cx, cy, cz, camera, rect, srcW, srcH);
        if (!points.length || !top || hidden(marker, performance.now())) { marker.g.style.display = "none"; marker.screen = null; continue; }
        marker.g.style.display = "";
        marker.screen = points;
        marker.ring.setAttribute("d", "M" + points.map((p) => p.map((n) => n.toFixed(1)).join(" ")).join("L") + "Z");
        // Labels shrink with distance, within reason.
        const size = Math.max(11, Math.min(15, 15 - (distanceTo(marker) || 0) * 0.4));
        marker.text.setAttribute("x", top[0].toFixed(1));
        marker.text.setAttribute("y", top[1].toFixed(1));
        marker.text.style.fontSize = `${size}px`;
        const width = marker.text.getComputedTextLength() + 20;
        marker.pill.setAttribute("x", (top[0] - width / 2).toFixed(1));
        marker.pill.setAttribute("y", (top[1] - (size + 12) / 2).toFixed(1));
        marker.pill.setAttribute("width", width.toFixed(1));
        marker.pill.setAttribute("height", (size + 12).toFixed(1));
      }
    }
    // Walking into a ring takes it (not while editing, where rings are picked to change them).
    if (!edit && !taking) {
      for (const marker of markers) {
        const d = distanceTo(marker);
        if (d > ARM) marker.armed = true;
        else if (marker.armed && d < TRIGGER) { take(marker.id); break; }
      }
    }
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);

  /** With the mouse captured there is no pointer: a click takes the ring in the middle of the view. */
  function inside(points, x, y) {
    let hit = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i];
      const [xj, yj] = points[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
  }
  canvas.addEventListener("click", (event) => {
    if (placing) return;
    const rect = canvas.getBoundingClientRect();
    const x = locked() ? rect.width / 2 : event.clientX - rect.left;
    const y = locked() ? rect.height / 2 : event.clientY - rect.top;
    const marker = markers.find((m) => m.screen && inside(m.screen, x, y));
    if (!marker) return;
    if (edit) onSelect?.(marker.id);
    else take(marker.id);
  });

  async function take(id) {
    if (taking) return;
    taking = true;
    fade.classList.add("is-on");
    await new Promise((resolve) => setTimeout(resolve, 280));
    try {
      await onTake?.(id);
    } finally {
      taking = false;
    }
  }

  /** Puts the eye at a pose (eye position, heading in degrees) and keeps walking from there. */
  function setPose(next) {
    const cam = pose();
    if (!cam || !next?.position) return;
    cam.position.set(next.position[0], next.position[1], next.position[2]);
    cam.angles.set(0, next.yaw || 0, 0);
    viewer.cameraManager.snap();
    app.renderNextFrame = true;
    markers.forEach((marker) => { marker.armed = distanceTo(marker) > ARM; });
  }

  function reveal() {
    fade.classList.remove("is-on");
  }

  /** Where the eye is and which way it looks. */
  function getPose() {
    const cam = pose();
    if (!cam) return null;
    return { position: [cam.position.x, cam.position.y, cam.position.z], yaw: cam.angles.y };
  }

  /** The floor straight below a point, or null. */
  function floorBelow(x, y, z) {
    const hit = collision()?.queryRay?.(x, y, z, 0, -1, 0, 6);
    return hit && Number.isFinite(hit.y) ? [x, hit.y, z] : null;
  }

  /** The floor point a click lands on: the surface hit, then straight down to the floor. */
  function pickAt(clientX, clientY) {
    const entity = cameraEntity();
    const c = collision();
    if (!entity?.camera || !c?.queryRay) return null;
    const rect = canvas.getBoundingClientRect();
    const origin = entity.getPosition();
    entity.camera.screenToWorld(clientX - rect.left, clientY - rect.top, 1, far);
    const dx = far.x - origin.x, dy = far.y - origin.y, dz = far.z - origin.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-8) return null;
    const hit = c.queryRay(origin.x, origin.y, origin.z, dx / len, dy / len, dz / len, entity.camera.farClip);
    if (!hit || !Number.isFinite(hit.x)) return null;
    // Back off the surface a little, then find the floor below it, so a click on a wall still lands on the floor.
    const bx = hit.x - (dx / len) * 0.25, bz = hit.z - (dz / len) * 0.25;
    return floorBelow(bx, hit.y + 0.3, bz) ?? [hit.x, hit.y, hit.z];
  }

  /** Edit mode: the next click on the view picks a floor spot instead of starting to walk. */
  function setPlacing(on) {
    placing = on;
    document.body.classList.toggle("tour-placing", on);
    // The keys walk while placing, so the view takes the keyboard.
    if (on) { canvas.tabIndex = 0; canvas.focus({ preventScroll: true }); }
  }
  // While placing, dragging still looks around and the keys still walk; only a click without dragging places.
  let down = null;
  window.addEventListener("pointerdown", (event) => { down = [event.clientX, event.clientY]; }, true);
  const placeClick = (event) => {
    if (!placing) return;
    event.preventDefault();
    event.stopPropagation();
    if (down && Math.hypot(event.clientX - down[0], event.clientY - down[1]) > 6) return;
    // The viewer walks to a clicked spot on pointer-up; a placing click must not move the view.
    viewer.global.events.fire("navigateCancel");
    const point = pickAt(event.clientX, event.clientY);
    onPick?.(point, getPose());
  };
  // Capture phase, so the walk controls never see a placing click.
  window.addEventListener("click", placeClick, true);

  return { setMarkers, setPose, getPose, floorBelow, setPlacing, reveal };
}
