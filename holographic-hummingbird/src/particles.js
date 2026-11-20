import * as THREE from "three";
import { hash11 } from "./math.js";

export function createHoloParticles(count = 140) {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 3); // x: speed, y: phase, z: colorMix

  for (let i = 0; i < count; i++) {
    const angle = hash11(i * 1.13 + 0.5) * Math.PI * 2;
    const radius = 0.75 + hash11(i * 2.71 + 1.3) * 2.15;
    const y = (hash11(i * 3.97 + 2.1) - 0.5) * 2.6;

    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = Math.sin(angle) * radius * 0.75;

    seeds[i * 3] = 0.4 + hash11(i * 5.19) * 0.9;
    seeds[i * 3 + 1] = hash11(i * 7.43) * Math.PI * 2;
    seeds[i * 3 + 2] = hash11(i * 9.87);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 3));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uReveal: { value: 1 },
      uTurnT: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aSeed;
      uniform float uTime;
      uniform float uReveal;
      varying float vAlpha;
      varying float vColorMix;

      void main() {
        float speed = aSeed.x;
        float phase = aSeed.y;
        vColorMix = aSeed.z;

        // Gentle deterministic helical drift
        vec3 pos = position;
        float theta = uTime * 0.22 * speed + phase;
        float rDrift = 0.08 * sin(uTime * 1.1 * speed + phase);
        pos.x += cos(theta) * rDrift;
        pos.y += 0.14 * sin(uTime * 0.65 * speed + phase);
        pos.z += sin(theta) * rDrift;

        vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mvPos;
        gl_PointSize = clamp((18.0 + 16.0 * speed) / max(1.0, -mvPos.z), 2.0, 9.0);

        float twinkle = 0.5 + 0.5 * sin(uTime * 3.2 * speed + phase);
        vAlpha = uReveal * (0.28 + 0.52 * twinkle);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTurnT;
      varying float vAlpha;
      varying float vColorMix;

      void main() {
        vec2 c = gl_PointCoord - vec2(0.5);
        float d = length(c);
        if (d > 0.5) discard;
        float core = exp(-d * d * 18.0);

        vec3 cyan = vec3(0.24, 0.86, 1.0);
        vec3 violet = vec3(0.62, 0.30, 1.0);
        vec3 magenta = vec3(0.96, 0.24, 0.72);

        vec3 col = mix(cyan, violet, smoothstep(0.15, 0.75, vColorMix));
        col = mix(col, magenta, smoothstep(0.75, 1.0, vColorMix) * (0.4 + 0.6 * uTurnT));

        gl_FragColor = vec4(col * core * 1.35, core * vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geom, mat);

  function update(choreo) {
    mat.uniforms.uTime.value = choreo.t;
    mat.uniforms.uReveal.value = choreo.birdReveal;
    mat.uniforms.uTurnT.value = choreo.turnT;
  }

  return { points, update };
}
