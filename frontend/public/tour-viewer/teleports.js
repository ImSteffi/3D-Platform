// Teleports in a 3DGS tour: rings on the floor that take people to another spot or floor.
// Drawn as an SVG overlay, projected from the scene each frame, so each ring lies on the floor in perspective.
// Taken by walking into a ring, by clicking it, or, while the mouse is captured, by clicking with the ring in the middle.
// Edit mode (the team's tour editor) adds placing a spot with a click, reading the current view, and moving the camera.

/** A ring's radius in metres unless the team set its size. */
export const RING_RADIUS = 0.45;
const RING_POINTS = 40;
/** Walking within this distance (metres, along the floor) of a ring's edge takes it. */
const TRIGGER_MARGIN = 0.05;
/** A ring only works once people have been this far beyond its edge, so arriving in one never bounces straight back. */
const ARM_MARGIN = 0.65;
/** The name's letter height as a share of the ring's radius: it lies on the floor inside the ring. */
const LABEL_SCALE = 0.26;
const SVG = "http://www.w3.org/2000/svg";
/** Eye height above the floor in walk mode (hover height 0.2 plus eye height 1.2, set in index.js). */
const EYE = 1.4;

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
    if (floorId === null || t.from === floorId)
      ends.push({ id: t.id, teleport: t.id, position: t.position, target: t.arrive, label: t.label, radius: t.radius ?? RING_RADIUS });
    if (floorId === null || t.to === floorId) {
      const [x, y, z] = t.arrive.position;
      // Each ring has its own name; without one it shows the floor it leads to.
      ends.push({ id: `${t.id}~back`, teleport: t.id, position: [x, y - EYE, z], target: back, label: t.backLabel || "",
        radius: t.backRadius ?? RING_RADIUS });
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
    #tour-teleports .tp-pill { fill: rgb(20 21 22 / .78); pointer-events: none; }
    #tour-teleports .tp-text { fill: #fff; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; font-weight: 600; text-anchor: middle;
      dominant-baseline: central; pointer-events: none; }
    #tour-fade { position: fixed; inset: 0; z-index: 80; background: #000; opacity: 0; pointer-events: none; transition: opacity 260ms ease; }
    #tour-fade.is-on { opacity: 1; }
    body.tour-placing, body.tour-placing * { cursor: crosshair !important; }
    body.tour-placing #tenzo-stock-enter, body.tour-looking #tenzo-stock-enter { display: none !important; }
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
      // The name: drawn flat on the floor in the ring's middle (see draw()), so it stays put and shrinks with distance.
      const label = document.createElementNS(SVG, "g");
      const pill = document.createElementNS(SVG, "rect");
      pill.setAttribute("class", "tp-pill");
      const text = document.createElementNS(SVG, "text");
      text.setAttribute("class", "tp-text");
      text.textContent = spec.label || "Teleport";
      label.append(pill, text);
      g.append(ring, label);
      g.addEventListener("click", (event) => {
        event.stopPropagation();
        if (placing) return;
        if (edit) onSelect?.(spec.id);
        else take(spec.id);
      });
      overlay.appendChild(g);
      const marker = { ...spec, radius: spec.radius ?? RING_RADIUS, armed: false, g, ring, label, text, pill, sized: false };
      marker.armed = distanceTo(marker) > marker.radius + ARM_MARGIN;
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
    const reach = marker.radius * 0.8;
    const targets = [[cx, cy + 0.25, cz], [cx + reach, cy + 0.25, cz], [cx - reach, cy + 0.25, cz],
      [cx, cy + 0.25, cz + reach], [cx, cy + 0.25, cz - reach]];
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
      // Along the floor: the view's right and its forward, without tilt. The name lies on the floor along these,
      // reading upright to whoever looks at it, and shrinks with distance like the ring.
      const entity = cameraEntity();
      const right = entity.right, forward = entity.forward;
      const rLen = Math.hypot(right.x, right.z) || 1, fLen = Math.hypot(forward.x, forward.z) || 1;
      const ux = right.x / rLen, uz = right.z / rLen, fx = forward.x / fLen, fz = forward.z / fLen;
      for (const marker of markers) {
        const [cx, cy, cz] = marker.position;
        const radius = marker.radius;
        const points = [];
        for (let i = 0; i < RING_POINTS; i++) {
          const a = (i / RING_POINTS) * Math.PI * 2;
          const p = project(cx + Math.cos(a) * radius, cy, cz + Math.sin(a) * radius, camera, rect, srcW, srcH);
          if (!p) { points.length = 0; break; }
          points.push(p);
        }
        const centre = project(cx, cy, cz, camera, rect, srcW, srcH);
        const step = 0.05;
        const along = project(cx + ux * step, cy, cz + uz * step, camera, rect, srcW, srcH);
        const away = project(cx + fx * step, cy, cz + fz * step, camera, rect, srcW, srcH);
        if (!points.length || !centre || !along || !away || hidden(marker, performance.now())) {
          marker.g.style.display = "none"; marker.screen = null; continue;
        }
        marker.g.style.display = "";
        marker.screen = points;
        marker.ring.setAttribute("d", "M" + points.map((p) => p.map((n) => n.toFixed(1)).join(" ")).join("L") + "Z");
        // The name in centimetres on the floor: x along the view's right, y towards the viewer (so the text stands upright).
        if (!marker.sized) {
          const size = radius * 100 * LABEL_SCALE;
          marker.text.style.fontSize = `${size}px`;
          const width = Math.min(marker.text.getComputedTextLength() + size * 0.9, radius * 100 * 1.7);
          marker.pill.setAttribute("x", (-width / 2).toFixed(2));
          marker.pill.setAttribute("y", (-size * 0.85).toFixed(2));
          marker.pill.setAttribute("width", width.toFixed(2));
          marker.pill.setAttribute("height", (size * 1.7).toFixed(2));
          marker.pill.setAttribute("rx", (size * 0.85).toFixed(2));
          marker.sized = true;
        }
        const k = 1 / (step * 100);
        const a = (along[0] - centre[0]) * k, b = (along[1] - centre[1]) * k;
        const c = -(away[0] - centre[0]) * k, d = -(away[1] - centre[1]) * k;
        marker.label.setAttribute("transform", `matrix(${a.toFixed(4)} ${b.toFixed(4)} ${c.toFixed(4)} ${d.toFixed(4)} ${centre[0].toFixed(1)} ${centre[1].toFixed(1)})`);
      }
    }
    // Walking into a ring takes it (not while editing, where rings are picked to change them).
    if (!edit && !taking) {
      for (const marker of markers) {
        const d = distanceTo(marker);
        if (d > marker.radius + ARM_MARGIN) marker.armed = true;
        else if (marker.armed && d < marker.radius + TRIGGER_MARGIN) { take(marker.id); break; }
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

  /**
   * Stops a walk people started by clicking or double-tapping a spot. Otherwise, after the jump, the viewer keeps
   * walking towards that spot (where they came from), often straight back into the ring they took.
   */
  const stopWalking = () => viewer.global.events.fire("navigateCancel");

  async function take(id) {
    if (taking) return;
    taking = true;
    stopWalking();
    fade.classList.add("is-on");
    await new Promise((resolve) => setTimeout(resolve, 280));
    try {
      await onTake?.(id);
    } catch (error) {
      // Never leave people in the dark: stay where they are.
      console.warn("Teleport failed", error);
      reveal();
    } finally {
      taking = false;
    }
  }

  /** Puts the eye at a pose (eye position, heading and up/down angle in degrees) and keeps walking from there. */
  function setPose(next) {
    const cam = pose();
    if (!cam || !next?.position) return;
    stopWalking();
    cam.position.set(next.position[0], next.position[1], next.position[2]);
    cam.angles.set(next.pitch || 0, next.yaw || 0, 0);
    viewer.cameraManager.snap();
    app.renderNextFrame = true;
    markers.forEach((marker) => { marker.armed = distanceTo(marker) > marker.radius + ARM_MARGIN; });
  }

  function reveal() {
    fade.classList.remove("is-on");
  }

  /** Where the eye is and which way it looks. */
  function getPose() {
    const cam = pose();
    if (!cam) return null;
    return { position: [cam.position.x, cam.position.y, cam.position.z], yaw: cam.angles.y, pitch: cam.angles.x };
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
  /** Edit mode: the start screen steps aside so the team can drag to look around, without placing anything. */
  function setLooking(on) {
    document.body.classList.toggle("tour-looking", on);
    if (on) { canvas.tabIndex = 0; canvas.focus({ preventScroll: true }); }
  }

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

  return { setMarkers, setPose, getPose, floorBelow, setPlacing, setLooking, reveal };
}
