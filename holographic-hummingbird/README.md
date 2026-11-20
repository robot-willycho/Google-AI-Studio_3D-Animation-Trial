# Holographic Hummingbird (全息蜂鳥短片)

A procedural 1080 × 1080 square short film (4.8 seconds, 30 fps, 144 frames, silent) built from scratch with HTML, CSS, JavaScript, Three.js (WebGL), custom GLSL shaders, Canvas 2D, HyperFrames, and FFmpeg.

## Architecture

- `index.html` & `styles.css`: 1080 × 1080 HyperFrames composition (`data-duration="4.8"`, `data-fps="30"`).
- `src/math.js`: Deterministic choreography curves, wingbeat phase integration, and seeded glitch schedule (`renderAt(t)` depends solely on `t`).
- `src/shaders.js`: Custom GLSL shaders for procedural feather barbules/scales, blue-violet Fresnel rim light, dynamic view-dependent iridescent magenta throat gorget, aerodynamic feather flex, beak, and glossy eye.
- `src/hummingbird.js`: Procedural 3D hummingbird (`THREE.Group` with sculpted spline torso/neck/head, upper/lower mandible beak, eyes, 11 individual layered flight feathers per wing around shoulder joints, 7 fanned tail rectrices, and 3D anatomical tracking markers).
- `src/overlay2d.js`: Canvas 2D compositor for Phase 1 blue-violet luminous arc & contour-assembling glyphs, Phase 2–3 3D-to-2D projected corner-bracket tracking reticles & leader lines, and horizontal scan-signal slice glitches.
- `src/main.js`: Three.js WebGLRenderer + `hf-seek` deterministic frame renderer.

## Reproduce the MP4 Video

1. Install dependencies (if not already installed):
   ```bash
   npm install
   ```

2. Capture 144 PNG frames via HyperFrames in headless Chrome (`1080x1080`, `30 fps`):
   ```bash
   npx hyperframes render --fps 30 --format png-sequence --output frames
   ```

3. Encode the 144 frames into a silent, playable H.264 MP4 via FFmpeg:
   ```bash
   ffmpeg -y -framerate 30 -i frames/frame_%06d.png \
     -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -movflags +faststart -an output.mp4
   ```

*(Or render directly to MP4 with HyperFrames in one step: `npx hyperframes render --fps 30 --quality delivery --output output.mp4`)*
