import * as THREE from "three";

const COMMON_GLSL = /* glsl */ `
  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  // Hexagonal scale pattern for plumage and iridescent gorget scales
  vec3 hexGrid(vec2 p) {
    vec2 r = vec2(1.0, 1.7320508);
    vec2 h = r * 0.5;
    vec2 a = mod(p, r) - h;
    vec2 b = mod(p - h, r) - h;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    float edgeDist = 0.5 - max(abs(gv.x), dot(abs(gv), normalize(r)));
    vec2 id = p - gv;
    return vec3(gv.x, gv.y, edgeDist * 2.0 + 0.0001);
  }
`;

export function createBodyShaderMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uReveal: { value: 1 },
      uTurnT: { value: 0 },
      uYaw: { value: 0 },
      uKeyDir: { value: new THREE.Vector3(0.45, 0.65, 0.60).normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormalW;
      varying vec3 vNormalL;
      varying vec3 vWorldPos;
      varying vec3 vLocalPos;
      varying vec2 vUv;

      void main() {
        vUv = uv;
        vLocalPos = position;
        vNormalL = normalize(normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;

      uniform float uTime;
      uniform float uReveal;
      uniform float uTurnT;
      uniform float uYaw;
      uniform vec3 uKeyDir;

      varying vec3 vNormalW;
      varying vec3 vNormalL;
      varying vec3 vWorldPos;
      varying vec3 vLocalPos;
      varying vec2 vUv;

      ${COMMON_GLSL}

      void main() {
        vec3 N = normalize(vNormalW);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);
        float fresnel = pow(1.0 - ndv, 2.25);

        // Soft holographic scan-in reveal from center-out + vertical sweep
        float revealWave = (vLocalPos.x + 0.85) * 0.55 + (vLocalPos.y + 0.65) * 0.25;
        float revealMask = smoothstep(revealWave - 0.14, revealWave + 0.04, uReveal * 1.35);
        float revealEdge = smoothstep(0.0, 0.12, revealMask) * (1.0 - smoothstep(0.85, 1.0, revealMask));
        if (revealMask <= 0.01) discard;

        // Procedural feather scale & barbule micro-texture across body
        vec2 scaleCoord = vec2(vUv.x * 36.0, vUv.y * 22.0 + sin(vUv.x * 18.0) * 0.35);
        vec3 hx = hexGrid(scaleCoord);
        float scaleRim = smoothstep(0.02, 0.35, hx.z);
        float barbStr = sin((vUv.y * 120.0 + hx.x * 16.0) + noise2(scaleCoord * 0.8) * 2.2);
        float featherTex = 0.72 + 0.28 * scaleRim * (0.65 + 0.35 * barbStr);

        // Dorsal iridescent emerald-cobalt-indigo plumage vs softer ventral chest
        float dorsalMask = smoothstep(-0.15, 0.35, vNormalL.y - vNormalL.x * 0.25);
        vec3 deepIndigo = vec3(0.04, 0.09, 0.26);
        vec3 holoCyan = vec3(0.14, 0.72, 1.00);
        vec3 holoBlue = vec3(0.24, 0.44, 1.00);
        vec3 holoViolet = vec3(0.62, 0.26, 0.98);

        // View-dependent blue-violet rim lighting
        float rimBand = smoothstep(0.15, 0.92, fresnel);
        vec3 rimColor = mix(holoBlue, holoViolet, 0.45 + 0.45 * sin(vLocalPos.y * 3.5 + uYaw * 1.5));
        rimColor = mix(rimColor, holoCyan, pow(fresnel, 3.0) * 0.65);

        // Subtle volumetric core shading so body has 3D form
        float keyDiff = clamp(dot(N, uKeyDir) * 0.5 + 0.5, 0.0, 1.0);
        vec3 bodyCore = mix(deepIndigo, holoBlue * 0.42, keyDiff * 0.75 + dorsalMask * 0.25) * featherTex;

        // Anatomical throat gorget mask: chin & ventral neck (forward +X, upper chest/throat)
        float gorgetX = smoothstep(0.08, 0.25, vLocalPos.x) * (1.0 - smoothstep(0.46, 0.56, vLocalPos.x));
        float gorgetY = smoothstep(-0.04, 0.14, vLocalPos.y) * (1.0 - smoothstep(0.43, 0.52, vLocalPos.y));
        float gorgetFront = smoothstep(-0.28, 0.25, vNormalL.x - vNormalL.y * 0.30);
        float gorgetMask = clamp(gorgetX * gorgetY * gorgetFront, 0.0, 1.0);

        // Gorget structural iridescence: shifts dynamically as bird rotates into side profile
        vec2 gorgetScaleUv = vec2(vLocalPos.y * 38.0, vLocalPos.z * 42.0 + vLocalPos.x * 18.0);
        vec3 gHex = hexGrid(gorgetScaleUv);
        float gCellRand = hash21(floor(gorgetScaleUv));

        // Half-vector & viewing angle modulation driven by bird turn (uYaw / uTurnT)
        vec3 lightSweep = normalize(vec3(0.42, 0.32, 0.85));
        vec3 H = normalize(V + lightSweep);
        float specG = pow(clamp(dot(N, H), 0.0, 1.0), 5.0);
        float sideGrazing = clamp(abs(dot(N, V)), 0.0, 1.0);

        // Interference phase shifts from deep violet-plum when angled -> radiant magenta-fuchsia in side profile
        float iridPhase = sideGrazing * 0.55 + uTurnT * 0.72 + gCellRand * 0.18;
        vec3 plumViolet = vec3(0.42, 0.06, 0.58);
        vec3 vividMagenta = vec3(0.98, 0.14, 0.60);
        vec3 roseLaser = vec3(1.00, 0.45, 0.86);

        vec3 gorgetGlow = mix(plumViolet, vividMagenta, smoothstep(0.20, 0.82, iridPhase));
        gorgetGlow = mix(gorgetGlow, roseLaser, clamp(specG * 0.85 + (1.0 - gHex.z) * 0.20, 0.0, 1.0));
        float gorgetBoost = mix(0.68, 1.55, uTurnT) * (0.76 + 0.42 * gHex.z) * (0.74 + 0.48 * specG);

        // Holographic scanlines & subtle longitudinal contour lines
        float scan = 0.88 + 0.12 * sin(vWorldPos.y * 92.0 - uTime * 5.0);
        float fineGrid = 0.92 + 0.08 * sin(vLocalPos.x * 65.0);

        vec3 color = bodyCore * scan * fineGrid;
        color += rimColor * rimBand * 1.15;
        color = mix(color, color * 0.45 + gorgetGlow * gorgetBoost, gorgetMask);

        // Add subtle cyan-white reveal edge sweep during Phase 1 -> 2 transition
        color += vec3(0.55, 0.88, 1.0) * revealEdge * 1.5;

        float alpha = clamp((0.68 + 0.32 * fresnel + gorgetMask * 0.25) * revealMask, 0.0, 1.0);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: true,
    side: THREE.FrontSide,
  });
}

export function createFeatherShaderMaterial(isTail = false) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uReveal: { value: 1 },
      uWingVel: { value: 0 },
      uTurnT: { value: 0 },
      uIsTail: { value: isTail ? 1.0 : 0.0 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aFeatherMeta; // x: normalized index [0..1], y: span weight, z: side sign

      uniform float uWingVel;
      uniform float uIsTail;

      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vWorldPos;
      varying vec3 vMeta;

      void main() {
        vUv = uv;
        vMeta = aFeatherMeta;

        vec3 pos = position;
        // Dynamic aerodynamic feather flex during stroke (stronger toward feather tip uv.y)
        float tipFlex = uv.y * uv.y;
        float flexAmt = uWingVel * (1.0 - uIsTail * 0.75) * (0.045 + 0.04 * aFeatherMeta.x);
        pos.y -= flexAmt * tipFlex;
        pos.z += abs(uWingVel) * 0.015 * tipFlex * aFeatherMeta.z;

        vec4 worldPos = modelMatrix * vec4(pos, 1.0);
        vWorldPos = worldPos.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;

      uniform float uTime;
      uniform float uReveal;
      uniform float uTurnT;
      uniform float uIsTail;

      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vWorldPos;
      varying vec3 vMeta;

      ${COMMON_GLSL}

      void main() {
        // Feather shape taper mask in UV space so blade edges look crisp and organic
        float tipTaper = 1.0 - smoothstep(0.72, 1.0, vUv.y);
        float sideDist = abs(vUv.x - 0.44) / 0.56;
        float vaneMask = 1.0 - smoothstep(0.72 - 0.18 * pow(vUv.y, 2.2), 0.98, sideDist);
        if (vaneMask <= 0.01) discard;

        // Materialization wave
        float revealCoord = vUv.y * 0.65 + vMeta.x * 0.35;
        float revealMask = smoothstep(revealCoord - 0.12, revealCoord + 0.06, uReveal * 1.25);
        if (revealMask <= 0.01) discard;

        vec3 N = normalize(vNormalW);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float ndv = abs(dot(N, V));
        float fresnel = pow(1.0 - clamp(ndv, 0.0, 1.0), 1.8);

        // Central rachis (quill shaft) at uv.x = 0.44
        float rachis = exp(-pow((vUv.x - 0.44) * 32.0, 2.0)) * (1.0 - vUv.y * 0.45);

        // Herringbone feather barbs angled outward from the rachis
        float barbCoord = vUv.y * 74.0 - abs(vUv.x - 0.44) * 34.0;
        float barbs = 0.55 + 0.45 * sin(barbCoord * 3.14159);
        float fineBarbs = 0.78 + 0.22 * sin(barbCoord * 9.5 + vMeta.x * 4.0);

        // Edge rim highlight around each individual feather so layered feathers separate clearly
        float borderGlow = smoothstep(0.55, 0.94, sideDist) + smoothstep(0.76, 0.99, vUv.y) * 0.8;
        borderGlow = clamp(borderGlow, 0.0, 1.0);

        // Color palette: deep cobalt vane -> cyan-blue barbs -> electric violet-blue border & tips
        vec3 deepCobalt = vec3(0.05, 0.14, 0.42);
        vec3 electricCyan = vec3(0.20, 0.78, 1.00);
        vec3 neonViolet = vec3(0.58, 0.28, 1.00);
        vec3 tipMagenta = vec3(0.86, 0.24, 0.88);

        float layerShift = clamp(vMeta.x * 0.7 + uTurnT * 0.25, 0.0, 1.0);
        vec3 vaneCol = mix(deepCobalt, electricCyan * 0.55, barbs * 0.65) * fineBarbs;
        vec3 rimCol = mix(electricCyan, neonViolet, 0.4 + 0.4 * vMeta.x);
        // Outer primaries & tail tips catch subtle violet-magenta edge iridescence
        rimCol = mix(rimCol, tipMagenta, smoothstep(0.65, 1.0, vUv.y) * (0.35 + 0.35 * uTurnT));

        // Holographic scanline modulation
        float scan = 0.88 + 0.12 * sin(vWorldPos.y * 105.0 - uTime * 4.5);

        vec3 color = vaneCol * (0.55 + 0.45 * ndv);
        color += electricCyan * rachis * 0.95;
        color += rimCol * (borderGlow * 0.95 + fresnel * 0.75);
        color *= scan;

        // Slight per-feather brightness separation for layered readability
        color *= (0.85 + 0.22 * (1.0 - layerShift * 0.3));

        float alpha = clamp((0.52 + 0.44 * borderGlow + 0.35 * rachis) * vaneMask * revealMask, 0.0, 0.96);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
}

export function createBeakShaderMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uReveal: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormalW;
      varying vec3 vWorldPos;
      varying vec2 vUv;

      void main() {
        vUv = uv;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;

      uniform float uTime;
      uniform float uReveal;

      varying vec3 vNormalW;
      varying vec3 vWorldPos;
      varying vec2 vUv;

      void main() {
        float revealMask = smoothstep(vUv.y * 0.8 - 0.1, vUv.y * 0.8 + 0.05, uReveal * 1.25);
        if (revealMask <= 0.01) discard;

        vec3 N = normalize(vNormalW);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float ndv = clamp(abs(dot(N, V)), 0.0, 1.0);
        float fresnel = pow(1.0 - ndv, 2.0);

        vec3 baseDark = vec3(0.06, 0.10, 0.26);
        vec3 cyanRim = vec3(0.32, 0.86, 1.00);
        vec3 violetRim = vec3(0.66, 0.32, 1.00);

        // Longitudinal specular sheen along the slender needle beak
        float vein = exp(-pow((vUv.x - 0.5) * 6.0, 2.0)) * 0.35;
        vec3 col = mix(baseDark, cyanRim, fresnel * 0.85 + vein);
        col = mix(col, violetRim, smoothstep(0.55, 1.0, vUv.y) * fresnel * 0.6);
        // Bright laser needle tip
        col += vec3(0.75, 0.94, 1.0) * smoothstep(0.82, 1.0, vUv.y) * 0.85;

        gl_FragColor = vec4(col, revealMask * 0.95);
      }
    `,
    transparent: true,
    depthWrite: true,
  });
}

export function createEyeShaderMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uReveal: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormalW;
      varying vec3 vWorldPos;

      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uReveal;
      varying vec3 vNormalW;
      varying vec3 vWorldPos;

      void main() {
        if (uReveal < 0.15) discard;
        vec3 N = normalize(vNormalW);
        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 L = normalize(vec3(0.4, 0.6, 0.8));
        vec3 H = normalize(V + L);

        float fresnel = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.4);
        float catchlight = pow(clamp(dot(N, H), 0.0, 1.0), 48.0);

        vec3 obsidian = vec3(0.02, 0.03, 0.08);
        vec3 rim = vec3(0.32, 0.86, 1.00) * fresnel * 1.1;
        vec3 glint = vec3(0.92, 0.98, 1.00) * catchlight * 1.8;

        gl_FragColor = vec4(obsidian + rim + glint, smoothstep(0.15, 0.45, uReveal));
      }
    `,
    transparent: true,
    depthWrite: true,
  });
}
