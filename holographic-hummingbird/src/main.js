import { createHummingbirdPlayer } from "./player.js";

const webglCanvas = document.getElementById("webgl-canvas");
const hudCanvas = document.getElementById("hud-canvas");

const player = createHummingbirdPlayer(webglCanvas, hudCanvas);

export function renderAt(timeSec) {
  player.renderAt(timeSec);
}

// Pre-warm WebGL shader compilation synchronously and signal HyperFrames readiness
window.__hf = window.__hf || {};
window.__hf.buildReady = window.__hf.buildReady || {};
player.prewarm();
window.__hf.buildReady.hummingbird = Promise.resolve();

// HyperFrames deterministic seek listener
window.addEventListener("hf-seek", (e) => {
  const t = e && e.detail && typeof e.detail.time === "number" ? e.detail.time : 0;
  renderAt(t);
});

// Initial render for frame 0
renderAt(0);

// Standalone preview fallback when opened directly outside HyperFrames
const isHyperFrames =
  typeof window !== "undefined" &&
  (window.location.search.includes("hf") || Boolean(window.__hyperframes));
if (!isHyperFrames) {
  window.__renderAt = renderAt;
}
