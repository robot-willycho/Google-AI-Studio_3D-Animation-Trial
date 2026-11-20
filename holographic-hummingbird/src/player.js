import * as THREE from "three";
import { createBloomPipeline } from "./bloom.js";
import { createHummingbird } from "./hummingbird.js";
import { clamp, getChoreography } from "./math.js";
import { createOverlayRenderer } from "./overlay2d.js";
import { createHoloParticles } from "./particles.js";

export const WIDTH = 1080;
export const HEIGHT = 1080;
export const DURATION = 4.8;

export function createHummingbirdPlayer(webglCanvas, hudCanvas) {
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

  const holoParticles = createHoloParticles(140);
  scene.add(holoParticles.points);

  const bloom = createBloomPipeline(renderer, WIDTH, HEIGHT);
  const overlay = createOverlayRenderer(hudCanvas, webglCanvas);

  const _projVec = new THREE.Vector3();
  const _target = new THREE.Vector3();
  const _offset = new THREE.Vector3();

  const orbit = { yaw: 0, pitch: 0, zoom: 1.0 };

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
      isGorget: localVec.x > 0.06 && localVec.x < 0.38 && localVec.y > 0.14 && localVec.y < 0.52,
    };
  }

  let cachedArrivalContour = null;
  function getArrivalContourPoints() {
    if (cachedArrivalContour) return cachedArrivalContour;
    const arrivalChoreo = getChoreography(1.2);
    camera.position.set(arrivalChoreo.camX, arrivalChoreo.camY, arrivalChoreo.camZ);
    camera.lookAt(0.06 + arrivalChoreo.turnT * 0.12, 0.02, 0);
    camera.updateMatrixWorld(true);
    hummingbird.update(arrivalChoreo);
    cachedArrivalContour = hummingbird.silhouetteLocalPoints.map(projectLocalContourPoint);
    return cachedArrivalContour;
  }

  function renderAt(timeSec, options = {}) {
    const t = Math.max(0, Math.min(DURATION, Number(timeSec) || 0));
    const contour2D = getArrivalContourPoints();
    const choreo = getChoreography(t);

    if (typeof options.wingSpeed === "number" && options.wingSpeed !== 1) {
      choreo.wingPhase *= options.wingSpeed;
      choreo.wingFreq *= options.wingSpeed;
    }

    const targetX = 0.06 + choreo.turnT * 0.12;
    const targetY = 0.02;
    _target.set(targetX, targetY, 0);

    // Apply optional interactive orbit around the choreography camera target
    const baseDx = choreo.camX - targetX;
    const baseDy = choreo.camY - targetY;
    const baseDz = choreo.camZ;
    const radius = Math.hypot(baseDx, baseDy, baseDz) / clamp(orbit.zoom, 0.5, 2.2);

    const baseAzimuth = Math.atan2(baseDx, baseDz);
    const basePolar = Math.acos(clamp(baseDy / Math.max(0.001, Math.hypot(baseDx, baseDy, baseDz)), -1, 1));

    const azimuth = baseAzimuth + orbit.yaw;
    const polar = clamp(basePolar + orbit.pitch, 0.2, Math.PI - 0.2);

    _offset.set(
      radius * Math.sin(polar) * Math.sin(azimuth),
      radius * Math.cos(polar),
      radius * Math.sin(polar) * Math.cos(azimuth)
    );
    camera.position.copy(_target).add(_offset);
    camera.lookAt(_target);
    camera.updateMatrixWorld(true);

    hummingbird.update(choreo);
    holoParticles.update(choreo);

    const bloomMul = typeof options.bloomScale === "number" ? options.bloomScale : 1.0;
    const bloomStrength = (0.55 + 0.18 * choreo.turnT) * bloomMul;
    bloom.render(scene, camera, bloomStrength);

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

  function setOrbit(yaw, pitch, zoom) {
    orbit.yaw = yaw;
    orbit.pitch = clamp(pitch, -1.1, 1.1);
    orbit.zoom = clamp(zoom, 0.55, 2.0);
  }

  function getOrbit() {
    return { ...orbit };
  }

  function resetOrbit() {
    orbit.yaw = 0;
    orbit.pitch = 0;
    orbit.zoom = 1.0;
  }

  function prewarm() {
    renderer.compile(scene, camera);
    renderAt(0);
  }

  function dispose() {
    renderer.dispose();
  }

  return {
    renderAt,
    setOrbit,
    getOrbit,
    resetOrbit,
    prewarm,
    dispose,
  };
}
