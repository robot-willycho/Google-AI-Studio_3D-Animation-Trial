import * as THREE from "three";

const FULLSCREEN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Extract bright holographic highlights above threshold
const BRIGHT_PASS_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tDiffuse;
  uniform float uThreshold;
  varying vec2 vUv;

  void main() {
    vec4 tex = texture2D(tDiffuse, vUv);
    float lum = max(tex.r, max(tex.g, tex.b));
    float soft = smoothstep(uThreshold * 0.65, uThreshold * 1.45, lum);
    gl_FragColor = vec4(tex.rgb * soft, 1.0);
  }
`;

// Separable 9-tap Gaussian blur
const BLUR_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tDiffuse;
  uniform vec2 uDirection;
  uniform vec2 uTexelSize;
  varying vec2 vUv;

  void main() {
    vec2 stepUv = uDirection * uTexelSize;
    vec3 sum = texture2D(tDiffuse, vUv).rgb * 0.227027;
    sum += texture2D(tDiffuse, vUv + stepUv * 1.384615).rgb * 0.316216;
    sum += texture2D(tDiffuse, vUv - stepUv * 1.384615).rgb * 0.316216;
    sum += texture2D(tDiffuse, vUv + stepUv * 3.230769).rgb * 0.070270;
    sum += texture2D(tDiffuse, vUv - stepUv * 3.230769).rgb * 0.070270;
    gl_FragColor = vec4(sum, 1.0);
  }
`;

// Additive bloom composite with gentle highlight roll-off
const COMPOSITE_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D tScene;
  uniform sampler2D tBloom;
  uniform float uBloomStrength;
  varying vec2 vUv;

  void main() {
    vec3 base = texture2D(tScene, vUv).rgb;
    vec3 bloom = texture2D(tBloom, vUv).rgb;
    vec3 col = base + bloom * uBloomStrength;
    // Soft filmic shoulder so bright cyan/magenta cores stay saturated instead of clipping white
    col = col / (1.0 + col * 0.18);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function createBloomPipeline(renderer, width, height) {
  const rtParams = {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.HalfFloatType,
    depthBuffer: true,
    stencilBuffer: false,
  };

  const sceneRT = new THREE.WebGLRenderTarget(width, height, rtParams);
  const bloomW = Math.max(1, Math.floor(width / 4));
  const bloomH = Math.max(1, Math.floor(height / 4));

  const bloomParams = {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.HalfFloatType,
    depthBuffer: false,
    stencilBuffer: false,
  };
  const bloomRT1 = new THREE.WebGLRenderTarget(bloomW, bloomH, bloomParams);
  const bloomRT2 = new THREE.WebGLRenderTarget(bloomW, bloomH, bloomParams);

  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadGeom = new THREE.PlaneGeometry(2, 2);

  const brightMat = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: sceneRT.texture },
      uThreshold: { value: 0.42 },
    },
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: BRIGHT_PASS_FRAG,
    depthTest: false,
    depthWrite: false,
  });

  const blurMat = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      uDirection: { value: new THREE.Vector2(1, 0) },
      uTexelSize: { value: new THREE.Vector2(1 / bloomW, 1 / bloomH) },
    },
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: BLUR_FRAG,
    depthTest: false,
    depthWrite: false,
  });

  const compositeMat = new THREE.ShaderMaterial({
    uniforms: {
      tScene: { value: sceneRT.texture },
      tBloom: { value: bloomRT1.texture },
      uBloomStrength: { value: 0.62 },
    },
    vertexShader: FULLSCREEN_VERT,
    fragmentShader: COMPOSITE_FRAG,
    depthTest: false,
    depthWrite: false,
  });

  const quadMesh = new THREE.Mesh(quadGeom, brightMat);
  const quadScene = new THREE.Scene();
  quadScene.add(quadMesh);

  function render(scene, camera, bloomStrength = 0.62) {
    // 1. Render 3D scene to offscreen target
    renderer.setRenderTarget(sceneRT);
    renderer.clear();
    renderer.render(scene, camera);

    // 2. Bright pass -> bloomRT1
    quadMesh.material = brightMat;
    renderer.setRenderTarget(bloomRT1);
    renderer.render(quadScene, quadCam);

    // 3. Two iterations of separable Gaussian blur for wide, smooth holographic halo
    quadMesh.material = blurMat;
    for (let pass = 0; pass < 2; pass++) {
      const spread = pass === 0 ? 1.0 : 2.1;
      blurMat.uniforms.tDiffuse.value = bloomRT1.texture;
      blurMat.uniforms.uDirection.value.set(spread, 0);
      renderer.setRenderTarget(bloomRT2);
      renderer.render(quadScene, quadCam);

      blurMat.uniforms.tDiffuse.value = bloomRT2.texture;
      blurMat.uniforms.uDirection.value.set(0, spread);
      renderer.setRenderTarget(bloomRT1);
      renderer.render(quadScene, quadCam);
    }

    // 4. Composite scene + bloom to screen canvas
    compositeMat.uniforms.uBloomStrength.value = bloomStrength;
    quadMesh.material = compositeMat;
    renderer.setRenderTarget(null);
    renderer.render(quadScene, quadCam);
  }

  return { render };
}
