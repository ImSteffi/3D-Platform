// Reports this tour view to the platform, without personal data: no cookies and nothing stored in
// the browser. Sent: which space and floor (?space=<id>&floor=<id>), where it is shown, the time zone,
// and how long the tour was watched.
// A combined tour (?tour=) learns its space and floor once loaded (boot.js); a floor reached by teleport is the
// same visit, so it is not counted again. The team's tour editor (&edit=1) is never counted.
const params = new URLSearchParams(location.search);
let space = Number(params.get("space"));
let floor = Number(params.get("floor")) || null;
const tourReady = () => new Promise((resolve) => {
  if (window.__tenzoTour) return resolve(window.__tenzoTour);
  window.addEventListener("tenzo-tour", (event) => resolve(event.detail), { once: true });
});

/** Inside the platform itself, on another site (iframe), or opened from the link. */
function sourceOf() {
  if (window.parent === window) return "direct";
  try {
    return window.parent.location.origin === location.origin ? "app" : "embed";
  } catch {
    return "embed";
  }
}

function timeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch { return null; }
}

async function track() {
  if (params.get("edit") === "1") return;
  if (params.get("tour")) {
    const found = await tourReady();
    if (found.continued) return;
    space = found.space; floor = found.floor;
  }
  if (!Number.isInteger(space) || space <= 0) return;
  const response = await fetch("/api/public/tour-views", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ space, floor, source: sourceOf(), referrer: document.referrer || null, timeZone: timeZone() }),
  });
  if (!response.ok) return;
  const { id } = await response.json();

  // Only time with the page visible counts.
  let seconds = 0;
  let since = document.visibilityState === "visible" ? Date.now() : null;
  const total = () => seconds + (since ? Math.round((Date.now() - since) / 1000) : 0);
  const send = () => fetch(`/api/public/tour-views/${id}/time`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ seconds: total() }),
    keepalive: true,
  }).catch(() => {});

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") { since = Date.now(); return; }
    seconds = total(); since = null; send();
  });
  addEventListener("pagehide", send);
  setInterval(() => { if (since) send(); }, 15000);
}

track().catch(() => {});
