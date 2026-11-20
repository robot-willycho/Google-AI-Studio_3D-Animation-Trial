export function clamp(x, min, max) {
  return x < min ? min : x > max ? max : x;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function smootherstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function easeOutCubic(t) {
  const u = clamp(t, 0, 1);
  return 1 - Math.pow(1 - u, 3);
}

export function easeInOutCubic(t) {
  const u = clamp(t, 0, 1);
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

export function easeOutExpo(t) {
  const u = clamp(t, 0, 1);
  return u === 1 ? 1 : 1 - Math.pow(2, -10 * u);
}

// Deterministic hash in [0, 1) from integer or float seed
export function hash11(p) {
  const s = Math.sin(p * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

export function hash12(a, b) {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

// Wingbeat phase integral: smooth variable frequency without phase jumps
// Beat rate: ~5.2 Hz during 1.2-2.7s hover, easing to ~4.6 Hz during 2.7-4.8s side hover
export function getWingPhase(t) {
  const baseFreq = 5.2;
  const slowDelta = -0.6;
  const turnBlend = smootherstep(2.6, 3.6, t);
  // Analytic blend approx + subtle modulation
  const effectiveFreq = baseFreq + slowDelta * turnBlend;
  return t * effectiveFreq * Math.PI * 2;
}

// Deterministic glitch intensity in [0, 1] during 1.2 - 2.7s
export function getGlitchState(t) {
  // Brief signal jump windows (duration ~0.07 - 0.11s = 2 to 3 frames at 30fps)
  const bursts = [
    { start: 1.44, end: 1.54, strength: 0.85, seed: 11 },
    { start: 1.90, end: 2.01, strength: 1.0, seed: 27 },
    { start: 2.36, end: 2.46, strength: 0.78, seed: 43 },
    { start: 2.61, end: 2.67, strength: 0.48, seed: 59 },
  ];

  for (let i = 0; i < bursts.length; i++) {
    const b = bursts[i];
    if (t >= b.start && t <= b.end) {
      const local = (t - b.start) / (b.end - b.start);
      const env = Math.sin(local * Math.PI);
      const frameIndex = Math.floor(t * 30 + 0.0001);
      return {
        active: true,
        intensity: b.strength * (0.45 + 0.55 * env),
        seed: b.seed + frameIndex * 7.31,
      };
    }
  }
  return { active: false, intensity: 0, seed: 0 };
}

// Master choreography state for any timestamp t in [0, 4.8]
export function getChoreography(t) {
  // Phase 1: 0 - 1.2s (Arc & Glyph contour formation)
  // Phase 2: 1.2 - 2.7s (3/4 holographic flight, tracking reticles, glitches)
  // Phase 3: 2.7 - 4.8s (Turn to side profile, layered primaries & glowing magenta throat)

  const birdReveal = smootherstep(0.78, 1.24, t);
  const turnT = smootherstep(2.70, 3.65, t);

  // Bird yaw: starts at -0.82 rad (~ -47 deg 3/4 diagonal facing right-camera)
  // Turns smoothly to -0.20 rad (~ -11.5 deg crisp side profile showing full beak, layered primaries & gorget)
  const yaw = lerp(-0.82, -0.20, turnT) + Math.sin(t * 1.35) * 0.02 * (1 - turnT);

  // Gentle pitch & roll hover dynamics
  const wingPhase = getWingPhase(t);
  const hoverBobY =
    Math.sin(t * 2.2) * 0.032 +
    Math.sin(wingPhase * 2.0 - 0.5) * 0.020 * birdReveal;
  // Keep bird centered horizontally inside 1080x1080 frame
  const hoverDriftX = lerp(-0.04, -0.06, turnT) + Math.cos(t * 1.5) * 0.02;
  const bodyRoll = Math.sin(t * 1.8) * 0.03 * (1 - turnT * 0.65);

  // Calibrated camera framing so wingspan, beak & tail stay comfortably inside frame
  const camZ = lerp(7.40, 6.95, turnT);
  const camY = lerp(0.24, 0.22, turnT);
  const camX = lerp(0.04, 0.04, turnT);

  return {
    t,
    birdReveal,
    turnT,
    yaw,
    wingPhase,
    hoverBobY,
    hoverDriftX,
    bodyRoll,
    camX,
    camY,
    camZ,
    hudAlpha: smoothstep(1.12, 1.38, t),
    arcAlpha: 1 - smoothstep(1.10, 1.52, t),
    glitch: getGlitchState(t),
  };
}
