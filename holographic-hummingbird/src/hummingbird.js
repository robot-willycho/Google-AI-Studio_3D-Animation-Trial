import * as THREE from "three";
import {
  createBeakShaderMaterial,
  createBodyShaderMaterial,
  createEyeShaderMaterial,
  createFeatherShaderMaterial,
} from "./shaders.js";
import { clamp, lerp, smoothstep } from "./math.js";

// Smooth C2 spline stations from tail root (s=0) through chest, curved throat, head crown, to beak base (s=1)
const SPINE_CURVE = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-0.54, -0.42, 0), // 0.00 tail socket
  new THREE.Vector3(-0.26, -0.22, 0), // 0.20 rump / lower belly
  new THREE.Vector3(0.02, 0.02, 0),   // 0.40 full chest
  new THREE.Vector3(0.18, 0.22, 0),   // 0.60 upper chest / lower throat
  new THREE.Vector3(0.28, 0.39, 0),   // 0.78 curved throat / neck
  new THREE.Vector3(0.37, 0.49, 0),   // 0.90 head cranium
  new THREE.Vector3(0.51, 0.50, 0),   // 1.00 forehead / beak junction
]);

// Smoothly interpolated anatomical radii along s in [0, 1]
function evalProfileRadii(s) {
  // Keyframes: [s, rx, ryTop, ryBot]
  const keys = [
    [0.00, 0.042, 0.036, 0.040],
    [0.20, 0.145, 0.125, 0.155],
    [0.42, 0.195, 0.165, 0.215],
    [0.62, 0.142, 0.130, 0.152],
    [0.78, 0.132, 0.125, 0.128],
    [0.88, 0.158, 0.152, 0.132],
    [0.95, 0.102, 0.098, 0.088],
    [1.00, 0.024, 0.026, 0.024],
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

// Tapered decurved hummingbird beak (upper & lower mandible)
function buildBeakGeometry() {
  const segLen = 28;
  const segRad = 16;
  const positions = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= segLen; i++) {
    const u = i / segLen;
    // Length 0.94 units extending along +X from beak base, slight downward curve
    const x = u * 0.94;
    const y = -0.032 * u * u;
    const taper = Math.pow(1.0 - u, 0.85);
    const ry = 0.036 * taper + 0.0025;
    const rz = 0.031 * taper + 0.0020;

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

// Individual curved feather blade geometry extending along local +Y (0..length), width along local X
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
    // Natural feather width profile: narrow quill base, broad mid-vane, tapered pointed tip
    const baseExpand = smoothstep(0.0, 0.18, v);
    const tipTaper = 1.0 - Math.pow(smoothstep(0.32, 1.0, v), 1.45);
    const wAtV = width * (0.28 + 0.72 * baseExpand) * (0.14 + 0.86 * tipTaper);

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
      const c = (iv + 1) * stride + (iu + 1);
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

// Build one complete articulated wing (covert arm + 11 individual layered flight feathers)
function buildWingAssembly(sideSign, featherMat) {
  const wingPivot = new THREE.Group();
  // Euler YXZ applies local Z twist (around span), then X elevation, then Y sweep
  wingPivot.rotation.order = "YXZ";

  // Leading-edge wing arm/patagium covert structure (shoulder -> wrist -> hand)
  const armCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.02, 0.0, 0.0),
    new THREE.Vector3(0.11, 0.02, sideSign * 0.30),
    new THREE.Vector3(0.07, 0.01, sideSign * 0.62),
    new THREE.Vector3(-0.08, -0.01, sideSign * 0.92),
  ]);
  const armGeom = new THREE.TubeGeometry(armCurve, 18, 0.014, 10, false);
  // Taper the tube radius slightly toward the wrist/tip
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

  // 11 individual flight feathers: 5 secondaries (inner) + 6 primaries (outer scimitar blades)
  const featherCount = 11;
  let tipMarker = null;

  for (let i = 0; i < featherCount; i++) {
    const norm = i / (featherCount - 1); // 0 = innermost secondary, 1 = outermost primary P10
    const isPrimary = i >= 5;

    // Attachment origin along the wing arm curve
    const tArm = lerp(0.10, 0.96, norm);
    const anchor = armCurve.getPoint(tArm);

    // Feather length & width: secondaries medium, primaries gracefully long & swept
    const length = isPrimary
      ? lerp(0.78, 1.14, (i - 5) / 5) * (i === 10 ? 0.96 : 1.0)
      : lerp(0.50, 0.72, i / 4);
    const width = isPrimary ? lerp(0.17, 0.135, (i - 5) / 5) : lerp(0.16, 0.18, i / 4);

    // Build blade extending along local +Y, then orient so +Y points outward-backward
    const bladeGeom = buildFeatherBladeGeometry({
      length,
      width,
      curvature: sideSign * 0.04,
      sweep: -0.14 - norm * 0.22,
      featherNormIdx: norm,
      sideSign,
    });

    const featherMesh = new THREE.Mesh(bladeGeom, featherMat);

    // Place at arm anchor, slight vertical shingle stagger so layered feathers never Z-fight
    featherMesh.position.copy(anchor);
    featherMesh.position.y += (featherCount - i) * 0.0028;

    // Blade blade starts with length along +Y, flat face normal +Z.
    // Orient via YXZ: X=-PI/2 puts +Y along -Z and normal +Z along +Y (upward).
    // Then Y = PI/2 + sideSign*fanAngle aims length along (-cos(fanAngle), 0, sideSign*sin(fanAngle)).
    const fanAngle = lerp(0.18, 1.18, Math.pow(norm, 0.92));
    featherMesh.rotation.order = "YXZ";
    featherMesh.rotation.x = -Math.PI / 2 + 0.05;
    featherMesh.rotation.y = Math.PI / 2 + sideSign * fanAngle;

    wingPivot.add(featherMesh);

    if (i === featherCount - 1) {
      // Attach tip tracking marker to the outermost primary tip
      tipMarker = new THREE.Object3D();
      tipMarker.position.set(Math.pow(0.96, 1.55) * (-0.14 - norm * 0.22) * sideSign, length * 0.96, 0);
      featherMesh.add(tipMarker);
    }
  }

  return { wingPivot, tipMarker, armMat };
}

export function createHummingbird() {
  const root = new THREE.Group();

  const bodyMat = createBodyShaderMaterial();
  const wingFeatherMat = createFeatherShaderMaterial(false);
  const tailFeatherMat = createFeatherShaderMaterial(true);
  const beakMat = createBeakShaderMaterial();
  const eyeMat = createEyeShaderMaterial();

  // 1. Sculpted Anatomical Body (Torso + Neck + Head)
  const bodyGeom = buildBodyGeometry();
  const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
  root.add(bodyMesh);

  // 2. Long Slender Beak (Upper + Lower Mandible)
  const beakGeom = buildBeakGeometry();
  const beakMesh = new THREE.Mesh(beakGeom, beakMat);
  beakMesh.position.set(0.49, 0.505, 0);
  beakMesh.rotation.z = -0.06; // subtle poised downward hover angle
  root.add(beakMesh);

  const beakTipMarker = new THREE.Object3D();
  beakTipMarker.position.set(0.94, -0.032, 0);
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
  leftEye.position.set(0.385, 0.525, -0.106);
  const leftRing = new THREE.Mesh(ringGeom, ringMat);
  leftEye.add(leftRing);
  root.add(leftEye);

  const rightEye = new THREE.Mesh(eyeGeom, eyeMat);
  rightEye.position.set(0.385, 0.525, 0.106);
  const rightRing = new THREE.Mesh(ringGeom, ringMat);
  rightEye.add(rightRing);
  root.add(rightEye);

  const eyeMarker = new THREE.Object3D();
  eyeMarker.position.set(0, 0, 0.028);
  rightEye.add(eyeMarker);

  // Gorget center marker (front-side throat)
  const gorgetMarker = new THREE.Object3D();
  gorgetMarker.position.set(0.34, 0.25, 0.12);
  root.add(gorgetMarker);

  // 4. Articulated Left & Right Wings around Shoulder Joints
  const rightWing = buildWingAssembly(1, wingFeatherMat);
  rightWing.wingPivot.position.set(0.11, 0.15, 0.155);
  root.add(rightWing.wingPivot);

  const leftWing = buildWingAssembly(-1, wingFeatherMat);
  leftWing.wingPivot.position.set(0.11, 0.15, -0.155);
  root.add(leftWing.wingPivot);

  // 5. Fanned Tail Feathers (7 Individual Layered Rectrices)
  const tailGroup = new THREE.Group();
  tailGroup.position.set(-0.51, -0.41, 0);
  // Angle tail gracefully backward-downward continuing spine
  tailGroup.rotation.z = -0.68;
  root.add(tailGroup);

  const tailCount = 7;
  let tailTipMarker = null;
  for (let i = 0; i < tailCount; i++) {
    const u = i / (tailCount - 1); // 0..1
    const spread = (u - 0.5) * 2.0; // -1..+1
    // Forked hummingbird tail: outer rectrices longer than central rectrices
    const length = lerp(0.64, 0.88, Math.pow(Math.abs(spread), 1.35));
    const width = lerp(0.15, 0.12, Math.abs(spread));

    const tailBladeGeom = buildFeatherBladeGeometry({
      length,
      width,
      curvature: 0.035,
      sweep: spread * 0.06,
      featherNormIdx: Math.abs(spread),
      sideSign: spread >= 0 ? 1 : -1,
    });

    const rectrix = new THREE.Mesh(tailBladeGeom, tailFeatherMat);
    // Lie flat in XZ fan plane and fan out along -X
    rectrix.rotation.order = "YXZ";
    rectrix.rotation.x = -Math.PI / 2;
    rectrix.rotation.y = Math.PI / 2 + spread * 0.42;
    rectrix.position.y = (3 - Math.abs(i - 3)) * 0.003; // clean overlap stagger
    tailGroup.add(rectrix);

    if (i === 5) {
      tailTipMarker = new THREE.Object3D();
      tailTipMarker.position.set(0, length * 0.92, 0);
      rectrix.add(tailTipMarker);
    }
  }

  // 6. Pre-built Anatomical Silhouette Anchors for Phase 1 Glyph Contour Assembly
  // Placed directly in hummingbird local space so glyphs map cleanly to the real 3D bird!
  const silhouetteLocalPoints = [];
  // Beak contour
  for (let k = 0; k <= 8; k++) {
    const u = k / 8;
    silhouetteLocalPoints.push(new THREE.Vector3(0.49 + u * 0.94, 0.505 - u * 0.075, 0));
  }
  // Head & dorsal spine down to tail base
  for (let k = 0; k <= 14; k++) {
    const s = 0.96 - (k / 14) * 0.92;
    const st = evalSpineStation(s);
    silhouetteLocalPoints.push(new THREE.Vector3(st.x - 0.04, st.y + st.ryTop * 0.95, 0));
  }
  // Ventral throat, gorget & belly curve
  for (let k = 0; k <= 12; k++) {
    const s = 0.92 - (k / 12) * 0.85;
    const st = evalSpineStation(s);
    silhouetteLocalPoints.push(new THREE.Vector3(st.x + 0.06, st.y - st.ryBot * 0.92, 0.04));
  }
  // Tail fan arc
  for (let k = 0; k <= 6; k++) {
    const ang = lerp(-0.42, 0.42, k / 6);
    silhouetteLocalPoints.push(
      new THREE.Vector3(-0.51 - Math.cos(ang) * 0.72, -0.41 - Math.sin(0.68) * 0.58, Math.sin(ang) * 0.36)
    );
  }
  // Swept near & far wing arcs
  for (let sgn of [1, -1]) {
    for (let k = 1; k <= 10; k++) {
      const u = k / 10;
      silhouetteLocalPoints.push(
        new THREE.Vector3(
          0.11 - u * 0.38,
          0.15 + Math.sin(u * Math.PI * 0.7) * 0.42,
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

    // Sweep forward/back, elevated figure-8 hover plane, and pronation/supination twist
    const sweep = 0.68 * s1 + 0.09 * Math.sin(wingPhase * 2.0);
    const elev = 0.26 * s2 + 0.22 * c1 + 0.18;
    const twist = 0.50 * c1;
    const wingVel = 0.68 * c1;

    rightWing.wingPivot.rotation.set(-elev, sweep, twist);
    leftWing.wingPivot.rotation.set(elev, -sweep, twist);

    // Subtle tail fan counter-balance pitch during hover
    tailGroup.rotation.z = -0.68 + 0.055 * Math.sin(wingPhase + 0.8);

    // Update GLSL shader uniforms
    bodyMat.uniforms.uTime.value = choreo.t;
    bodyMat.uniforms.uReveal.value = birdReveal;
    bodyMat.uniforms.uTurnT.value = turnT;
    bodyMat.uniforms.uYaw.value = yaw;

    wingFeatherMat.uniforms.uTime.value = choreo.t;
    wingFeatherMat.uniforms.uReveal.value = birdReveal;
    wingFeatherMat.uniforms.uWingVel.value = wingVel;
    wingFeatherMat.uniforms.uTurnT.value = turnT;

    tailFeatherMat.uniforms.uTime.value = choreo.t;
    tailFeatherMat.uniforms.uReveal.value = birdReveal;
    tailFeatherMat.uniforms.uWingVel.value = wingVel * 0.3;
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
