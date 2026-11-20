import * as THREE from "three";
import {
  createBeakShaderMaterial,
  createBodyShaderMaterial,
  createEyeShaderMaterial,
  createFeatherShaderMaterial,
} from "./shaders.js";
import { clamp, lerp, smoothstep } from "./math.js";

// Smooth C2 spline stations calibrated to upright hovering hummingbird proportions:
// Tail socket (-0.25,-0.40) -> plump belly/chest -> gentle neck curve -> rounded crown -> beak base (0.40,0.545)
const SPINE_CURVE = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-0.25, -0.40, 0), // 0.00 tail socket / lower rump
  new THREE.Vector3(-0.14, -0.22, 0), // 0.20 lower belly / flank
  new THREE.Vector3(0.02, 0.02, 0),   // 0.42 full rounded chest
  new THREE.Vector3(0.14, 0.24, 0),   // 0.62 upper chest / lower throat
  new THREE.Vector3(0.21, 0.41, 0),   // 0.78 neck / upper throat
  new THREE.Vector3(0.29, 0.525, 0),  // 0.90 rounded cranium
  new THREE.Vector3(0.40, 0.545, 0),  // 1.00 forehead / beak junction
]);

// Smoothly interpolated anatomical radii along s in [0, 1]
// Keep ventral ryBot bounded on the concave chin/throat bend so cross-sections never self-intersect
function evalProfileRadii(s) {
  // Keyframes: [s, rx, ryTop (dorsal), ryBot (ventral)]
  const keys = [
    [0.00, 0.056, 0.050, 0.056],
    [0.20, 0.162, 0.148, 0.168],
    [0.42, 0.204, 0.162, 0.222],
    [0.62, 0.156, 0.140, 0.154],
    [0.78, 0.142, 0.140, 0.114],
    [0.88, 0.156, 0.166, 0.092],
    [0.95, 0.102, 0.105, 0.058],
    [1.00, 0.028, 0.028, 0.026],
  ];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (s >= a[0] && s <= b[0]) {
      const u = (s - a[0]) / (b[0] - a[0]);
      const t = u * u * (3 - 2 * u);
      return {
        rx: lerp(a[1], b[1], t),
        ryTop: lerp(a[2], b[2], t),
        ryBot: lerp(a[3], b[3], t),
      };
    }
  }
  const last = keys[keys.length - 1];
  return { rx: last[1], ryTop: last[2], ryBot: last[3] };
}

function evalSpineStation(s) {
  const pt = SPINE_CURVE.getPoint(clamp(s, 0, 1));
  const rad = evalProfileRadii(clamp(s, 0, 1));
  return { x: pt.x, y: pt.y, rx: rad.rx, ryTop: rad.ryTop, ryBot: rad.ryBot };
}

function buildBodyGeometry() {
  const segS = 54;
  const segTheta = 36;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= segS; i++) {
    const s = i / segS;
    const st = evalSpineStation(s);

    // Local tangent along spine to tilt cross-section perpendicular to spine
    const stNext = evalSpineStation(Math.min(1, s + 0.01));
    const stPrev = evalSpineStation(Math.max(0, s - 0.01));
    const tx = stNext.x - stPrev.x;
    const ty = stNext.y - stPrev.y;
    const tLen = Math.hypot(tx, ty) || 1;
    // Up-normal perpendicular to spine in XY plane
    const nx = -ty / tLen;
    const ny = tx / tLen;

    for (let j = 0; j <= segTheta; j++) {
      const v = j / segTheta;
      const theta = v * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      // Asymmetric dorsal/ventral height
      const ry = cosT >= 0 ? st.ryTop : st.ryBot;
      const inPlaneOffset = cosT * ry;
      const z = sinT * st.rx;

      const px = st.x + nx * inPlaneOffset;
      const py = st.y + ny * inPlaneOffset;

      positions.push(px, py, z);
      uvs.push(s, v);
    }
  }

  const stride = segTheta + 1;
  for (let i = 0; i < segS; i++) {
    for (let j = 0; j < segTheta; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = (i + 1) * stride + (j + 1);
      const d = i * stride + (j + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

// Anatomical holographic contour lattice (meridians + cross-section rings) aligned to body spline
function buildBodyContourLattice() {
  const positions = [];
  const uvs = [];
  const ringStations = 12;
  const ringSegs = 28;

  // Cross-sectional rings
  for (let i = 1; i < ringStations; i++) {
    const s = i / ringStations;
    const st = evalSpineStation(s);
    const stNext = evalSpineStation(Math.min(1, s + 0.01));
    const stPrev = evalSpineStation(Math.max(0, s - 0.01));
    const tx = stNext.x - stPrev.x;
    const ty = stNext.y - stPrev.y;
    const tLen = Math.hypot(tx, ty) || 1;
    const nx = -ty / tLen;
    const ny = tx / tLen;

    for (let j = 0; j < ringSegs; j++) {
      const t0 = (j / ringSegs) * Math.PI * 2;
      const t1 = ((j + 1) / ringSegs) * Math.PI * 2;
      for (const th of [t0, t1]) {
        const cosT = Math.cos(th);
        const sinT = Math.sin(th);
        const ry = (cosT >= 0 ? st.ryTop : st.ryBot) * 1.012;
        const rx = st.rx * 1.012;
        positions.push(st.x + nx * cosT * ry, st.y + ny * cosT * ry, sinT * rx);
        uvs.push(s, th / (Math.PI * 2));
      }
    }
  }

  // Longitudinal meridians
  const meridians = 10;
  const longSegs = 36;
  for (let m = 0; m < meridians; m++) {
    const th = (m / meridians) * Math.PI * 2;
    const cosT = Math.cos(th);
    const sinT = Math.sin(th);
    for (let i = 0; i < longSegs; i++) {
      for (const s of [i / longSegs, (i + 1) / longSegs]) {
        const st = evalSpineStation(s);
        const stNext = evalSpineStation(Math.min(1, s + 0.01));
        const stPrev = evalSpineStation(Math.max(0, s - 0.01));
        const tx = stNext.x - stPrev.x;
        const ty = stNext.y - stPrev.y;
        const tLen = Math.hypot(tx, ty) || 1;
        const nx = -ty / tLen;
        const ny = tx / tLen;
        const ry = (cosT >= 0 ? st.ryTop : st.ryBot) * 1.012;
        const rx = st.rx * 1.012;
        positions.push(st.x + nx * cosT * ry, st.y + ny * cosT * ry, sinT * rx);
        uvs.push(s, m / meridians);
      }
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  return geom;
}

function createContourLatticeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uReveal: { value: 1 },
      uTurnT: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vLocalPos;
      varying vec2 vUv;
      void main() {
        vLocalPos = position;
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime;
      uniform float uReveal;
      uniform float uTurnT;
      varying vec3 vLocalPos;
      varying vec2 vUv;

      void main() {
        float revealWave = (vLocalPos.x + 0.85) * 0.55 + (vLocalPos.y + 0.65) * 0.25;
        float revealMask = smoothstep(revealWave - 0.14, revealWave + 0.04, uReveal * 1.35);
        if (revealMask <= 0.01) discard;

        float pulse = 0.55 + 0.45 * sin(vUv.x * 18.0 - uTime * 3.8);
        vec3 cyan = vec3(0.24, 0.86, 1.0);
        vec3 violet = vec3(0.66, 0.34, 1.0);
        vec3 col = mix(cyan, violet, 0.35 + 0.35 * uTurnT);
        float alpha = (0.14 + 0.14 * pulse) * revealMask;
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

// Tucked hovering tarsus & curled toes under lower belly
function buildTuckedFootGeometry() {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.0, 0.0, 0.0),
    new THREE.Vector3(0.025, -0.042, 0.0),
    new THREE.Vector3(0.068, -0.056, 0.0),
    new THREE.Vector3(0.092, -0.036, 0.0),
    new THREE.Vector3(0.072, -0.015, 0.0),
  ]);
  return new THREE.TubeGeometry(curve, 12, 0.012, 6, false);
}

// Tapered decurved hummingbird beak proportional to real hummingbird head
function buildBeakGeometry() {
  const segLen = 28;
  const segRad = 16;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= segLen; i++) {
    const u = i / segLen;
    // Length 0.78 units extending cleanly along +X from beak base, subtle natural curve
    const x = u * 0.78;
    const y = -0.020 * u * u;
    const taper = Math.pow(1.0 - u, 0.85);
    const ry = 0.035 * taper + 0.0022;
    const rz = 0.029 * taper + 0.0018;

    for (let j = 0; j <= segRad; j++) {
      const v = j / segRad;
      const theta = v * Math.PI * 2;
      // Subtle lateral tomium pinch between upper & lower mandible
      const seamPinch = 1.0 - 0.14 * Math.exp(-Math.pow(Math.sin(theta), 2) * 18.0);
      const py = y + Math.sin(theta) * ry;
      const pz = Math.cos(theta) * rz * seamPinch;
      positions.push(x, py, pz);
      uvs.push(v, u);
    }
  }

  const stride = segRad + 1;
  for (let i = 0; i < segLen; i++) {
    for (let j = 0; j < segRad; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = (i + 1) * stride + (j + 1);
      const d = i * stride + (j + 1);
      indices.push(a, d, b);
      indices.push(b, d, c);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

// Individual curved feather blade geometry with smooth rounded paddle/scimitar tip
function buildFeatherBladeGeometry({
  length,
  width,
  curvature,
  sweep,
  featherNormIdx,
  sideSign,
}) {
  const segU = 8; // width segments
  const segV = 14; // length segments
  const positions = [];
  const uvs = [];
  const metas = [];
  const indices = [];

  for (let iv = 0; iv <= segV; iv++) {
    const v = iv / segV; // 0 base -> 1 tip
    // Natural feather width profile: narrow quill base, broad mid-vane, smoothly rounded tip
    const baseExpand = smoothstep(0.0, 0.16, v);
    const tipTaper = 1.0 - Math.pow(smoothstep(0.46, 1.0, v), 1.65) * 0.84;
    const wAtV = width * (0.34 + 0.66 * baseExpand) * tipTaper;

    const y = v * length;
    const zCamber = Math.sin(v * Math.PI) * curvature;
    const xSweep = Math.pow(v, 1.55) * sweep * sideSign;

    for (let iu = 0; iu <= segU; iu++) {
      const u = iu / segU; // 0 leading edge -> 1 trailing edge
      // Asymmetric vane: rachis at u = 0.42
      const centered = u - 0.42;
      const x = centered * wAtV + xSweep;
      const crossCamber = -Math.pow(centered * 1.8, 2) * width * 0.08;
      positions.push(x, y, zCamber + crossCamber);
      uvs.push(u, v);
      metas.push(featherNormIdx, length, sideSign);
    }
  }

  const stride = segU + 1;
  for (let iv = 0; iv < segV; iv++) {
    for (let iu = 0; iu < segU; iu++) {
      const a = iv * stride + iu;
      const b = (iv + 1) * stride + iu;
      const c = (i_next(iv, stride) + iu + 1);
      const d = iv * stride + (iu + 1);
      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setAttribute("aFeatherMeta", new THREE.Float32BufferAttribute(metas, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

function i_next(iv, stride) {
  return (iv + 1) * stride;
}

// Build one complete articulated wing: sleek leading-edge arm + 14 tightly shingled flight feathers + 10 coverts
function buildWingAssembly(sideSign, featherMat) {
  const wingPivot = new THREE.Group();
  // Euler YXZ applies local Z twist (around span), then X elevation, then Y sweep
  wingPivot.rotation.order = "YXZ";

  // Smooth swept leading-edge wing arm/patagium covert structure (shoulder -> wrist -> hand)
  const armCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.01, 0.0, 0.0),
    new THREE.Vector3(0.09, 0.025, sideSign * 0.31),
    new THREE.Vector3(0.03, 0.015, sideSign * 0.62),
    new THREE.Vector3(-0.13, -0.005, sideSign * 0.92),
  ]);
  const armGeom = new THREE.TubeGeometry(armCurve, 18, 0.014, 10, false);
  const posAttr = armGeom.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const z = posAttr.getZ(i);
    const spanNorm = clamp(Math.abs(z) / 0.92, 0, 1);
    const scale = 1.0 - spanNorm * 0.65;
    posAttr.setY(i, posAttr.getY(i) * scale);
  }
  armGeom.computeVertexNormals();
  const armMat = new THREE.ShaderMaterial({
    uniforms: featherMat.uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vNormalW;
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uReveal;
      varying vec3 vNormalW;
      varying vec3 vWorldPos;
      void main() {
        if (uReveal < 0.08) discard;
        vec3 N = normalize(vNormalW);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float f = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 1.8);
        vec3 col = mix(vec3(0.08, 0.25, 0.62), vec3(0.35, 0.85, 1.0), f);
        gl_FragColor = vec4(col, smoothstep(0.08, 0.45, uReveal) * 0.85);
      }
    `,
    transparent: true,
    depthWrite: true,
  });
  const armMesh = new THREE.Mesh(armGeom, armMat);
  wingPivot.add(armMesh);

  // Secondary wrist joint for outer primary flexion & supination lag
  const wristPos = armCurve.getPoint(0.50);
  const wristPivot = new THREE.Group();
  wristPivot.rotation.order = "YXZ";
  wristPivot.position.copy(wristPos);
  wingPivot.add(wristPivot);

  // 14 tightly shingled flight feathers: 6 secondaries (inner) + 8 primaries (outer scimitar airfoil)
  const featherCount = 14;
  let tipMarker = null;

  for (let i = 0; i < featherCount; i++) {
    const norm = i / (featherCount - 1); // 0 = innermost secondary at flank, 1 = outermost primary P10
    const isPrimary = i >= 6;

    // Attachment origin along the wing arm curve (starting right from shoulder)
    const tArm = lerp(0.04, 0.96, norm);
    const anchor = armCurve.getPoint(tArm);

    // Continuous scimitar trailing-edge envelope matching real hummingbird wing chord
    const length = isPrimary
      ? lerp(0.72, 1.08, Math.pow((i - 6) / 7, 0.88)) * (i === featherCount - 1 ? 0.97 : 1.0)
      : lerp(0.40, 0.68, i / 5);
    const width = isPrimary
      ? lerp(0.19, 0.145, (i - 6) / 7)
      : lerp(0.20, 0.21, i / 5);

    const bladeGeom = buildFeatherBladeGeometry({
      length,
      width,
      curvature: sideSign * 0.036,
      sweep: -0.11 - norm * 0.18,
      featherNormIdx: norm,
      sideSign,
    });

    const featherMesh = new THREE.Mesh(bladeGeom, featherMat);

    if (isPrimary) {
      featherMesh.position.copy(anchor).sub(wristPos);
    } else {
      featherMesh.position.copy(anchor);
    }
    featherMesh.position.y += (featherCount - i) * 0.0024;

    // Cohesive imbricated fan from inner secondary (0.12 rad) to outer swept primary (0.92 rad)
    const fanAngle = lerp(0.12, 0.92, Math.pow(norm, 0.96));
    featherMesh.rotation.order = "YXZ";
    featherMesh.rotation.x = -Math.PI / 2 + 0.05;
    featherMesh.rotation.y = Math.PI / 2 + sideSign * fanAngle;

    if (isPrimary) {
      wristPivot.add(featherMesh);
    } else {
      wingPivot.add(featherMesh);
    }

    if (i === featherCount - 1) {
      tipMarker = new THREE.Object3D();
      tipMarker.position.set(Math.pow(0.96, 1.55) * (-0.11 - norm * 0.18) * sideSign, length * 0.96, 0);
      featherMesh.add(tipMarker);
    }
  }

  // 10 layered upper wing coverts for lush seamless shoulder-to-wrist airfoil transition
  const covertCount = 10;
  for (let c = 0; c < covertCount; c++) {
    const cNorm = c / (covertCount - 1);
    const tArm = lerp(0.02, 0.78, cNorm);
    const anchor = armCurve.getPoint(tArm);
    const cLen = lerp(0.22, 0.44, Math.sin(cNorm * Math.PI * 0.85));
    const cWidth = lerp(0.17, 0.19, cNorm);

    const covertGeom = buildFeatherBladeGeometry({
      length: cLen,
      width: cWidth,
      curvature: sideSign * 0.03,
      sweep: -0.07 - cNorm * 0.12,
      featherNormIdx: cNorm * 0.55,
      sideSign,
    });
    const covertMesh = new THREE.Mesh(covertGeom, featherMat);
    const isOuterCovert = tArm >= 0.50;
    if (isOuterCovert) {
      covertMesh.position.copy(anchor).sub(wristPos);
    } else {
      covertMesh.position.copy(anchor);
    }
    covertMesh.position.y += 0.011 + (covertCount - c) * 0.0016;

    const fanAngle = lerp(0.10, 0.82, cNorm);
    covertMesh.rotation.order = "YXZ";
    covertMesh.rotation.x = -Math.PI / 2 + 0.08;
    covertMesh.rotation.y = Math.PI / 2 + sideSign * fanAngle;

    if (isOuterCovert) {
      wristPivot.add(covertMesh);
    } else {
      wingPivot.add(covertMesh);
    }
  }

  return { wingPivot, wristPivot, tipMarker, armMat };
}

export function createHummingbird() {
  const root = new THREE.Group();

  const bodyMat = createBodyShaderMaterial();
  const wingFeatherMat = createFeatherShaderMaterial(false);
  const tailFeatherMat = createFeatherShaderMaterial(true);
  const beakMat = createBeakShaderMaterial();
  const eyeMat = createEyeShaderMaterial();

  // 1. Sculpted Anatomical Body (Upright Torso + Curved Neck + Rounded Head)
  const bodyGeom = buildBodyGeometry();
  const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
  root.add(bodyMesh);

  // 1b. Fine Holographic Contour Lattice over Body
  const latticeGeom = buildBodyContourLattice();
  const latticeMat = createContourLatticeMaterial();
  const latticeMesh = new THREE.LineSegments(latticeGeom, latticeMat);
  root.add(latticeMesh);

  // 1c. Tucked Hovering Feet under Lower Belly (matching real hover curl)
  const footGeom = buildTuckedFootGeometry();
  const rightFoot = new THREE.Mesh(footGeom, beakMat);
  rightFoot.position.set(-0.07, -0.34, 0.052);
  root.add(rightFoot);
  const leftFoot = new THREE.Mesh(footGeom, beakMat);
  leftFoot.position.set(-0.07, -0.34, -0.052);
  root.add(leftFoot);

  // 2. Long Slender Beak (nearly horizontal with whisper of decurve)
  const beakGeom = buildBeakGeometry();
  const beakMesh = new THREE.Mesh(beakGeom, beakMat);
  beakMesh.position.set(0.39, 0.545, 0);
  beakMesh.rotation.z = -0.025;
  root.add(beakMesh);

  const beakTipMarker = new THREE.Object3D();
  beakTipMarker.position.set(0.78, -0.020, 0);
  beakMesh.add(beakTipMarker);

  // 3. Eyes (Glossy Cornea + Subtle Holographic Orbital Ring)
  const eyeGeom = new THREE.SphereGeometry(0.035, 24, 18);
  const ringGeom = new THREE.TorusGeometry(0.041, 0.0026, 8, 28);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x38e8ff,
    transparent: true,
    opacity: 0.48,
  });

  const leftEye = new THREE.Mesh(eyeGeom, eyeMat);
  leftEye.position.set(0.30, 0.558, -0.108);
  const leftRing = new THREE.Mesh(ringGeom, ringMat);
  leftEye.add(leftRing);
  root.add(leftEye);

  const rightEye = new THREE.Mesh(eyeGeom, eyeMat);
  rightEye.position.set(0.30, 0.558, 0.108);
  const rightRing = new THREE.Mesh(ringGeom, ringMat);
  rightEye.add(rightRing);
  root.add(rightEye);

  const eyeMarker = new THREE.Object3D();
  eyeMarker.position.set(0, 0, 0.028);
  rightEye.add(eyeMarker);

  // Gorget center marker (front-side throat)
  const gorgetMarker = new THREE.Object3D();
  gorgetMarker.position.set(0.24, 0.34, 0.130);
  root.add(gorgetMarker);

  // 4. Articulated Left & Right Wings around Shoulder Joints
  const rightWing = buildWingAssembly(1, wingFeatherMat);
  rightWing.wingPivot.position.set(0.03, 0.19, 0.155);
  root.add(rightWing.wingPivot);

  const leftWing = buildWingAssembly(-1, wingFeatherMat);
  leftWing.wingPivot.position.set(0.03, 0.19, -0.155);
  root.add(leftWing.wingPivot);

  // 5. Downward-Hanging Fanned Tail Feathers (7 Overlapping Rectrices continuing upright spine)
  const tailGroup = new THREE.Group();
  tailGroup.position.set(-0.24, -0.40, 0);
  // Positive Z rotation swings local -X downward to (-0.27, -0.96, 0), matching real hover tail hang
  tailGroup.rotation.z = 1.30;
  root.add(tailGroup);

  const tailCount = 7;
  let tailTipMarker = null;
  for (let i = 0; i < tailCount; i++) {
    const u = i / (tailCount - 1); // 0..1
    const spread = (u - 0.5) * 2.0; // -1..+1
    // Gently rounded natural hummingbird tail fan (slightly longer inner/mid rectrices)
    const length = lerp(0.68, 0.60, Math.pow(Math.abs(spread), 1.35));
    const width = lerp(0.17, 0.145, Math.abs(spread));

    const tailBladeGeom = buildFeatherBladeGeometry({
      length,
      width,
      curvature: 0.028,
      sweep: spread * 0.035,
      featherNormIdx: Math.abs(spread),
      sideSign: spread >= 0 ? 1 : -1,
    });

    const rectrix = new THREE.Mesh(tailBladeGeom, tailFeatherMat);
    rectrix.rotation.order = "YXZ";
    rectrix.rotation.x = -Math.PI / 2;
    rectrix.rotation.y = Math.PI / 2 + spread * 0.22;
    rectrix.position.y = (3 - Math.abs(i - 3)) * 0.003;
    tailGroup.add(rectrix);

    if (i === 5) {
      tailTipMarker = new THREE.Object3D();
      tailTipMarker.position.set(0, length * 0.92, 0);
      rectrix.add(tailTipMarker);
    }
  }

  // 5b. Layered Tail Upper Coverts
  const tailCovertCount = 5;
  for (let c = 0; c < tailCovertCount; c++) {
    const u = c / (tailCovertCount - 1);
    const spread = (u - 0.5) * 2.0;
    const cLen = lerp(0.32, 0.26, Math.abs(spread));
    const covertGeom = buildFeatherBladeGeometry({
      length: cLen,
      width: 0.14,
      curvature: 0.022,
      sweep: spread * 0.02,
      featherNormIdx: Math.abs(spread) * 0.5,
      sideSign: spread >= 0 ? 1 : -1,
    });
    const covert = new THREE.Mesh(covertGeom, tailFeatherMat);
    covert.rotation.order = "YXZ";
    covert.rotation.x = -Math.PI / 2 + 0.06;
    covert.rotation.y = Math.PI / 2 + spread * 0.18;
    covert.position.y = 0.015 + (2 - Math.abs(c - 2)) * 0.002;
    tailGroup.add(covert);
  }

  // 6. Anatomical Silhouette Anchors for Phase 1 Glyph Contour Assembly (matched to upright posture)
  const silhouetteLocalPoints = [];
  // Beak contour
  for (let k = 0; k <= 7; k++) {
    const u = k / 7;
    silhouetteLocalPoints.push(new THREE.Vector3(0.38 + u * 0.78, 0.552 - u * 0.04, 0));
  }
  // Head & dorsal spine down to tail base
  for (let k = 0; k <= 14; k++) {
    const s = 0.96 - (k / 14) * 0.92;
    const st = evalSpineStation(s);
    silhouetteLocalPoints.push(new THREE.Vector3(st.x - 0.05, st.y + st.ryTop * 0.95, 0));
  }
  // Ventral throat, gorget & belly curve
  for (let k = 0; k <= 12; k++) {
    const s = 0.92 - (k / 12) * 0.85;
    const st = evalSpineStation(s);
    silhouetteLocalPoints.push(new THREE.Vector3(st.x + 0.06, st.y - st.ryBot * 0.92, 0.04));
  }
  // Downward-hanging tail fan arc
  for (let k = 0; k <= 6; k++) {
    const ang = lerp(-0.22, 0.22, k / 6);
    silhouetteLocalPoints.push(
      new THREE.Vector3(
        -0.24 - Math.cos(1.30) * 0.62,
        -0.40 - Math.sin(1.30) * 0.62,
        Math.sin(ang) * 0.24
      )
    );
  }
  // Swept near & far wing arcs
  for (let sgn of [1, -1]) {
    for (let k = 1; k <= 10; k++) {
      const u = k / 10;
      silhouetteLocalPoints.push(
        new THREE.Vector3(
          0.03 - u * 0.44,
          0.19 + Math.sin(u * Math.PI * 0.7) * 0.44,
          sgn * (0.16 + u * 1.18)
        )
      );
    }
  }

  function update(choreo) {
    const { birdReveal, turnT, yaw, wingPhase, hoverBobY, hoverDriftX, bodyRoll } = choreo;

    // Position & orient entire hummingbird
    root.position.set(hoverDriftX, hoverBobY, 0);
    root.rotation.set(0, yaw, bodyRoll);

    // Figure-8 wingbeat kinematics around shoulder joints
    const s1 = Math.sin(wingPhase);
    const c1 = Math.cos(wingPhase);
    const s2 = Math.sin(wingPhase * 2.0 + 0.35);

    // Swept back & slightly elevated hover plane (keeps throat clear in side profile & matches real hover)
    const sweep = -0.14 + 0.58 * s1 + 0.08 * Math.sin(wingPhase * 2.0);
    const elev = 0.24 * s2 + 0.22 * c1 + 0.24;
    const twist = 0.46 * c1;
    const freqScale = (choreo.wingFreq || 5.2) / 5.2;
    const wingVel = 0.58 * c1 * freqScale;

    rightWing.wingPivot.rotation.set(-elev, sweep, twist);
    leftWing.wingPivot.rotation.set(elev, -sweep, twist);

    // Secondary wrist-joint flexion & supination lag for organic figure-8 stroke
    const wristElev = 0.10 * Math.sin(wingPhase - 0.55);
    const wristSweep = 0.12 * Math.cos(wingPhase - 0.35);
    const wristTwist = 0.15 * Math.sin(wingPhase - 0.45);
    rightWing.wristPivot.rotation.set(-wristElev, wristSweep, wristTwist);
    leftWing.wristPivot.rotation.set(wristElev, -wristSweep, wristTwist);

    // Subtle tail fan counter-balance pitch during hover
    tailGroup.rotation.z = 1.30 + 0.045 * Math.sin(wingPhase + 0.8);

    // Update GLSL shader uniforms
    bodyMat.uniforms.uTime.value = choreo.t;
    bodyMat.uniforms.uReveal.value = birdReveal;
    bodyMat.uniforms.uTurnT.value = turnT;
    bodyMat.uniforms.uYaw.value = yaw;

    latticeMat.uniforms.uTime.value = choreo.t;
    latticeMat.uniforms.uReveal.value = birdReveal;
    latticeMat.uniforms.uTurnT.value = turnT;

    wingFeatherMat.uniforms.uTime.value = choreo.t;
    wingFeatherMat.uniforms.uReveal.value = birdReveal;
    wingFeatherMat.uniforms.uWingVel.value = wingVel;
    wingFeatherMat.uniforms.uTurnT.value = turnT;

    tailFeatherMat.uniforms.uTime.value = choreo.t;
    tailFeatherMat.uniforms.uReveal.value = birdReveal;
    tailFeatherMat.uniforms.uWingVel.value = wingVel * 0.25;
    tailFeatherMat.uniforms.uTurnT.value = turnT;

    beakMat.uniforms.uTime.value = choreo.t;
    beakMat.uniforms.uReveal.value = birdReveal;

    eyeMat.uniforms.uReveal.value = birdReveal;
    ringMat.opacity = 0.75 * smoothstep(0.25, 0.75, birdReveal);

    root.updateMatrixWorld(true);
  }

  return {
    root,
    markers: {
      eye: eyeMarker,
      wingTipRight: rightWing.tipMarker,
      wingTipLeft: leftWing.tipMarker,
      tailTip: tailTipMarker,
      beakTip: beakTipMarker,
      gorget: gorgetMarker,
    },
    silhouetteLocalPoints,
    update,
  };
}
