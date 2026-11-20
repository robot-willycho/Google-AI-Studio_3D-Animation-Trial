import * as THREE from "three";
import { createHummingbird } from "./hummingbird.js";
import { getChoreography } from "./math.js";
import { createOverlayRenderer } from "./overlay2d.js";

const WIDTH = 1080;
const HEIGHT = 1080;
const DURATION = 4.8;

const webglCanvas = document.getElementById("webgl-canvas");
const hudCanvas = document.getElementById("hud-canvas");

const renderer = new THREE.WebGLRenderer({
  canvas: webglCanvas,
  antialias: true,
  alpha: false,
  preserveDrawingBuffer: true,
  powerPreference: "high-performance",
});
renderer.setSize(WIDTH, HEIGHT, false);
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 1);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(34, WIDTH / HEIGHT, 0.1, 50);
camera.position.set(0.02, 0.18, 6.05);
camera.lookAt(0.06, 0.08, 0);

const hummingbird = createHummingbird();
scene.add(hummingbird.root);

const overlay = createOverlayRenderer(hudCanvas, webglCanvas);

// Pre-allocated vectors for zero-GC projection
const _projVec = new THREE.Vector3();

function projectWorldPoint(obj) {
  obj.getWorldPosition(_projVec);
  _projVec.project(camera);
  return {
    x: (_projVec.x * 0.5 + 0.5) * WIDTH,
    y: (-_projVec.y * 0.5 + 0.5) * HEIGHT,
    z: _projVec.z,
  };
}

function projectLocalContourPoint(localVec) {
  _projVec.copy(localVec).applyMatrix4(hummingbird.root.matrixWorld);
  _projVec.project(camera);
  return {
    x: (_projVec.x * 0.5 + 0.5) * WIDTH,
    y: (-_projVec.y * 0.5 + 0.5) * HEIGHT,
    isGorget: localVec.x > 0.14 && localVec.x < 0.48 && localVec.y > 0.04 && localVec.y < 0.44,
  };
}

// Compute static Phase-1 silhouette contour targets once in the arrival pose (t = 1.2s)
let cachedArrivalContour = null;
function getArrivalContourPoints() {
  if (cachedArrivalContour) return cachedArrivalContour;
  const arrivalChoreo = getChoreography(1.2);
  camera.position.set(arrivalChoreo.camX, arrivalChoreo.camY, arrivalChoreo.camZ);
  camera.lookAt(0.06 + arrivalChoreo.turnT * 0.12, 0.08, 0);
  camera.updateMatrixWorld(true);
  hummingbird.update(arrivalChoreo);
  cachedArrivalContour = hummingbird.silhouetteLocalPoints.map(projectLocalContourPoint);
  return cachedArrivalContour;
}

// Pure deterministic frame renderer for any timestamp t in [0, 4.8]
export function renderAt(timeSec) {
  const t = Math.max(0, Math.min(DURATION, Number(timeSec) || 0));
  const contour2D = getArrivalContourPoints();
  const choreo = getChoreography(t);

  camera.position.set(choreo.camX, choreo.camY, choreo.camZ);
  camera.lookAt(0.06 + choreo.turnT * 0.14, 0.08, 0);
  camera.updateMatrixWorld(true);

  hummingbird.update(choreo);
  renderer.render(scene, camera);

  const projectedMarkers = {
    eye: projectWorldPoint(hummingbird.markers.eye),
    wingTipRight: projectWorldPoint(hummingbird.markers.wingTipRight),
    wingTipLeft: projectWorldPoint(hummingbird.markers.wingTipLeft),
    tailTip: projectWorldPoint(hummingbird.markers.tailTip),
    beakTip: projectWorldPoint(hummingbird.markers.beakTip),
    gorget: projectWorldPoint(hummingbird.markers.gorget),
  };

  overlay.render(choreo, projectedMarkers, contour2D);
}

// Pre-warm WebGL shader compilation synchronously and signal HyperFrames readiness
window.__hf = window.__hf || {};
window.__hf.buildReady = window.__hf.buildReady || {};
renderer.compile(scene, camera);
renderAt(0);
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
