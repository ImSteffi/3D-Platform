// Only manages the embed's preview/start screen. SuperSplat owns input,
// pointer capture, touch controls and camera movement on its native canvas.
/** How far the view turns per pixel the mouse moves before the pointer is captured again after a teleport. */
const LOOK_DEGREES_PER_PIXEL = 0.15;

export function attachStockSession(viewer, canvas, { onActive, onReady } = {}) {
  const { state, events } = viewer.global;
  let ready = false;
  let active = false;
  let entering = false;
  const gate = document.createElement("button");
  gate.type = "button";
  gate.id = "tenzo-stock-enter";
  gate.setAttribute("aria-label", "Try it out");
  gate.disabled = true;
  gate.style.cssText = "position:fixed;inset:0;z-index:50;border:0;background:transparent;cursor:pointer;";
  if (window.parent === window) {
    gate.textContent = "Try it out";
    gate.style.color = "white";
    gate.style.font = "600 24px Arial, sans-serif";
  }
  document.body.appendChild(gate);

  // Prevent a saved gaming preference from trying to capture during loading.
  // Enabling it from the gate's real click calls SuperSplat's native manager.
  state.gamingControls = false;
  const touch = () => state.inputMode === "touch";
  // Escape and native pointer capture can change the engine camera mode.
  // Restore walking after those transitions without recapturing the pointer.
  const ensureWalk = () => {
    if (ready && state.walkAllowed && state.cameraMode !== "walk") state.cameraMode = "walk";
  };
  const restoreWalk = () => queueMicrotask(ensureWalk);
  events.on("cameraMode:changed", restoreWalk);
  events.on("gamingControls:changed", restoreWalk);
  events.on("walkAllowed:changed", restoreWalk);
  const setActive = (value) => {
    entering = false;
    gate.hidden = value;
    gate.style.display = value ? "none" : "block";
    if (active === value) return;
    active = value;
    onActive?.(value);
  };
  const close = () => {
    setActive(false);
    state.gamingControls = false;
    if (!document.fullscreenElement) state.isFullscreen = false;
    restoreWalk();
    window.dispatchEvent(new CustomEvent("tenzo-measure-reset"));
  };
  const enter = (event) => {
    if (!ready || entering || active) return;
    entering = true;
    const isTouch = event.pointerType === "touch" || window.matchMedia("(pointer: coarse)").matches;
    state.inputMode = isTouch ? "touch" : "desktop";
    canvas.tabIndex = 0;
    canvas.focus({ preventScroll: true });
    // Walk is the tour mode; Escape only releases interaction.
    state.gamingControls = false;
    state.cameraMode = state.walkAllowed ? "walk" : "fly";
    try {
      state.gamingControls = true;
      ensureWalk();
    } catch {
      state.gamingControls = false;
      setActive(true);
      return;
    }
    if (isTouch) setActive(true);
    // Desktop normally starts after pointer capture; unsupported embeds use native drag controls.
  };
  // Arrived through a teleport: people were already walking, so no start screen. A new page cannot capture the
  // pointer without a click, so until the first click the mouse turns the view as it moves (as the captured pointer
  // did), and the first click captures it again.
  const resume = () => {
    if (!ready || active) return;
    const isTouch = window.matchMedia("(pointer: coarse)").matches;
    state.inputMode = isTouch ? "touch" : "desktop";
    canvas.tabIndex = 0;
    canvas.focus({ preventScroll: true });
    state.gamingControls = false;
    state.cameraMode = state.walkAllowed ? "walk" : "fly";
    setActive(true);
    if (isTouch) return;
    const look = (event) => {
      if (!active || document.pointerLockElement || event.buttons) return;
      const camera = viewer.cameraManager?.camera;
      if (!camera || (!event.movementX && !event.movementY)) return;
      const pitch = Math.max(-89, Math.min(89, camera.angles.x - event.movementY * LOOK_DEGREES_PER_PIXEL));
      camera.angles.set(pitch, camera.angles.y - event.movementX * LOOK_DEGREES_PER_PIXEL, 0);
      viewer.cameraManager.snap();
      viewer.global.app.renderNextFrame = true;
    };
    window.addEventListener("mousemove", look);
    // Once the pointer is captured (or the walk stops), the viewer's own controls take over again.
    const stopLook = () => window.removeEventListener("mousemove", look);
    document.addEventListener("pointerlockchange", stopLook, { once: true });
    canvas.addEventListener("pointerdown", () => {
      if (!active || state.gamingControls) return;
      entering = true;
      try {
        state.gamingControls = true;
        ensureWalk();
      } catch {
        state.gamingControls = false;
        entering = false;
      }
    }, { once: true, capture: true });
  };
  // A same-origin parent may call this synchronously from its real Start click.
  // Do not use postMessage: pointer capture needs that original user activation.
  window.tenzoStartWalk = () => enter({ pointerType: "" });
  gate.addEventListener("click", enter);
  document.addEventListener("pointerlockchange", () => {
    if (document.pointerLockElement === canvas) setActive(true);
    else if (!touch() && (active || entering)) close();
  });
  document.addEventListener("pointerlockerror", () => {
    if (!touch() && entering) {
      // Embedded browsers can reject pointer lock. Keep native walk controls
      // interactive (drag / click-to-walk) rather than showing a second gate.
      state.gamingControls = false;
      canvas.focus({ preventScroll: true });
      setActive(true);
    }
  });
  // Let the engine process Escape first; never swallow or simulate it.
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && active && !document.fullscreenElement) close();
  });
  const firstFrame = () => {
    if (ready) return;
    ready = true;
    if (state.walkAllowed) state.cameraMode = "walk";
    gate.disabled = false;
    onReady?.();
  };
  if (viewer.inputController && state.loaded) firstFrame();
  else events.on("firstFrame", firstFrame);
  return { close, resume, isActive: () => active, isReady: () => ready };
}



