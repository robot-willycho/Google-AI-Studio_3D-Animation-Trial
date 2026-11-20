import { useEffect, useRef, useState } from "react";
import { Box, Check, Copy, Film, Orbit, Pause, Play, RotateCcw } from "lucide-react";
import { createHummingbirdPlayer, DURATION } from "../holographic-hummingbird/src/player.js";

interface Chapter {
  id: string;
  range: string;
  time: number;
  title: string;
  summary: string;
}

const CHAPTERS: Chapter[] = [
  {
    id: "emergence",
    range: "0.0 – 1.2s",
    time: 0.55,
    title: "Arc & Glyph Silhouette",
    summary:
      "Blue-violet plasma ribbon sweeps across pure black while glowing glyphs lock onto the projected 3D contour.",
  },
  {
    id: "hover",
    range: "1.2 – 2.7s",
    time: 1.95,
    title: "Flight & Signal Tracking",
    summary:
      "Procedural hummingbird hovers and beats its wings around shoulder and wrist pivots with 3D-to-2D projected reticles and horizontal scan glitches.",
  },
  {
    id: "profile",
    range: "2.7 – 4.8s",
    time: 3.7,
    title: "Side Profile & Gorget Iridescence",
    summary:
      "Rotates cleanly into side profile to showcase the slender beak, layered primary feathers, and view-dependent magenta throat.",
  },
];

const REDO_COMMAND = `cd holographic-hummingbird
npx hyperframes render --fps 30 --format png-sequence --output frames
ffmpeg -y -framerate 30 -i frames/frame_%06d.png -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -movflags +faststart -an output.mp4`;

export default function App() {
  const [mode, setMode] = useState<"live3d" | "mp4">("live3d");
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [bloomScale, setBloomScale] = useState(1.0);
  const [wingSpeed, setWingSpeed] = useState(1.0);
  const [copied, setCopied] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const webglCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hudCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const playerRef = useRef<ReturnType<typeof createHummingbirdPlayer> | null>(null);

  const stateRef = useRef({
    isPlaying: true,
    time: 0,
    bloomScale: 1.0,
    wingSpeed: 1.0,
  });
  stateRef.current.isPlaying = isPlaying;
  stateRef.current.bloomScale = bloomScale;
  stateRef.current.wingSpeed = wingSpeed;

  const dragRef = useRef<{ active: boolean; x: number; y: number }>({
    active: false,
    x: 0,
    y: 0,
  });

  // Mount / unmount Live 3D WebGL player
  useEffect(() => {
    if (mode !== "live3d") return;
    const webgl = webglCanvasRef.current;
    const hud = hudCanvasRef.current;
    if (!webgl || !hud) return;

    const player = createHummingbirdPlayer(webgl, hud);
    player.prewarm();
    playerRef.current = player;

    let rafId = 0;
    let lastTs = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;

      if (stateRef.current.isPlaying) {
        stateRef.current.time = (stateRef.current.time + dt) % DURATION;
        setCurrentTime(stateRef.current.time);
      }

      player.renderAt(stateRef.current.time, {
        bloomScale: stateRef.current.bloomScale,
        wingSpeed: stateRef.current.wingSpeed,
      });

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      player.dispose();
      playerRef.current = null;
    };
  }, [mode]);

  function togglePlay() {
    if (mode === "live3d") {
      setIsPlaying((prev) => !prev);
      return;
    }
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) {
      void vid.play();
      setIsPlaying(true);
    } else {
      vid.pause();
      setIsPlaying(false);
    }
  }

  function seekTo(seconds: number) {
    const clamped = Math.max(0, Math.min(DURATION, seconds));
    stateRef.current.time = clamped;
    setCurrentTime(clamped);
    if (mode === "mp4" && videoRef.current) {
      videoRef.current.currentTime = clamped;
    }
  }

  function restart() {
    seekTo(0);
    if (mode === "live3d") {
      setIsPlaying(true);
      return;
    }
    const vid = videoRef.current;
    if (!vid) return;
    void vid.play();
    setIsPlaying(true);
  }

  function resetCamera() {
    playerRef.current?.resetOrbit();
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (mode !== "live3d") return;
    dragRef.current = { active: true, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (mode !== "live3d" || !dragRef.current.active || !playerRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    dragRef.current.x = e.clientX;
    dragRef.current.y = e.clientY;
    const orbit = playerRef.current.getOrbit();
    playerRef.current.setOrbit(orbit.yaw - dx * 0.008, orbit.pitch - dy * 0.006, orbit.zoom);
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  function handleWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (mode !== "live3d" || !playerRef.current) return;
    e.preventDefault();
    const orbit = playerRef.current.getOrbit();
    const nextZoom = orbit.zoom * (e.deltaY > 0 ? 0.94 : 1.06);
    playerRef.current.setOrbit(orbit.yaw, orbit.pitch, nextZoom);
  }

  async function copyCommands() {
    try {
      await navigator.clipboard.writeText(REDO_COMMAND);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#05060a] text-slate-100">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-6 py-4">
          <span className="text-base font-semibold tracking-tight text-white whitespace-nowrap shrink-0">
            Holographic Hummingbird
          </span>
          <nav className="hidden md:flex items-center gap-6 text-sm text-slate-400">
            <a href="#film" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              Film
            </a>
            <a href="#storyboard" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              Storyboard
            </a>
            <a href="#pipeline" className="hover:text-white transition-colors whitespace-nowrap shrink-0">
              Pipeline
            </a>
          </nav>
          <a
            href="/output.mp4"
            download="holographic-hummingbird.mp4"
            className="rounded-lg bg-sky-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-400 transition-colors whitespace-nowrap shrink-0"
          >
            Download MP4
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <section id="film" className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-7">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.03] p-1">
                <button
                  type="button"
                  onClick={() => setMode("live3d")}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    mode === "live3d"
                      ? "bg-sky-500 text-slate-950"
                      : "text-slate-300 hover:text-white"
                  }`}
                >
                  <Box className="h-3.5 w-3.5" />
                  Live 3D (WebGL)
                </button>
                <button
                  type="button"
                  onClick={() => setMode("mp4")}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    mode === "mp4"
                      ? "bg-sky-500 text-slate-950"
                      : "text-slate-300 hover:text-white"
                  }`}
                >
                  <Film className="h-3.5 w-3.5" />
                  Rendered MP4
                </button>
              </div>

              {mode === "live3d" && (
                <button
                  type="button"
                  onClick={resetCamera}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10 transition-colors"
                >
                  <Orbit className="h-3.5 w-3.5 text-sky-400" />
                  Reset View
                </button>
              )}
            </div>

            {mode === "live3d" ? (
              <div
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onWheel={handleWheel}
                className="relative aspect-square w-full cursor-grab active:cursor-grabbing overflow-hidden rounded-xl border border-white/10 bg-black select-none touch-none"
                title="Drag to orbit · Scroll to zoom"
              >
                <canvas
                  ref={webglCanvasRef}
                  width={1080}
                  height={1080}
                  className="absolute inset-0 h-full w-full block z-[1]"
                />
                <canvas
                  ref={hudCanvasRef}
                  width={1080}
                  height={1080}
                  className="absolute inset-0 h-full w-full block z-[2] pointer-events-none"
                />
                <div className="pointer-events-none absolute bottom-3 left-3 z-[3] rounded bg-black/60 px-2.5 py-1 text-[11px] text-slate-300 backdrop-blur-sm">
                  Drag to orbit · Scroll to zoom
                </div>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-white/10 bg-black">
                <video
                  ref={videoRef}
                  src="/output.mp4"
                  autoPlay
                  loop
                  muted
                  playsInline
                  onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  className="aspect-square w-full bg-black object-contain"
                />
              </div>
            )}

            <div className="mt-4 space-y-3 border-t border-white/10 pt-4">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={DURATION}
                  step={0.01}
                  value={currentTime}
                  onChange={(e) => seekTo(parseFloat(e.target.value))}
                  aria-label="Timeline Scrubber"
                  className="h-1.5 w-full cursor-pointer accent-sky-400"
                />
                <span className="font-mono text-xs text-slate-400 tabular-nums whitespace-nowrap">
                  {currentTime.toFixed(2)}s / {DURATION.toFixed(2)}s
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={togglePlay}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-white hover:bg-white/10 transition-colors whitespace-nowrap shrink-0"
                  >
                    {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    {isPlaying ? "Pause" : "Play"}
                  </button>
                  <button
                    type="button"
                    onClick={restart}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-white/10 transition-colors whitespace-nowrap shrink-0"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restart
                  </button>
                </div>

                {mode === "live3d" && (
                  <div className="flex flex-wrap items-center gap-5 text-xs text-slate-300">
                    <label className="flex items-center gap-2">
                      <span>Bloom</span>
                      <input
                        type="range"
                        min={0}
                        max={2}
                        step={0.05}
                        value={bloomScale}
                        onChange={(e) => setBloomScale(parseFloat(e.target.value))}
                        className="w-20 cursor-pointer accent-sky-400"
                      />
                      <span className="font-mono w-8 text-right tabular-nums">{bloomScale.toFixed(2)}</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <span>Wing</span>
                      <input
                        type="range"
                        min={0.5}
                        max={1.8}
                        step={0.05}
                        value={wingSpeed}
                        onChange={(e) => setWingSpeed(parseFloat(e.target.value))}
                        className="w-20 cursor-pointer accent-sky-400"
                      />
                      <span className="font-mono w-8 text-right tabular-nums">{wingSpeed.toFixed(2)}x</span>
                    </label>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 space-y-8">
            <div>
              <p className="text-xs text-slate-400">
                1080 × 1080 · 30 fps · 144 frames · Interactive WebGL + H.264
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
                Procedural 3D Holographic Hummingbird
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                Built from scratch with procedural Three.js geometry, custom GLSL feather and gorget
                iridescence shaders, multi-pass WebGL bloom, 3D-to-2D projected Canvas tracking reticles,
                and deterministic HyperFrames + FFmpeg capture.
              </p>
            </div>

            <div id="storyboard" className="space-y-3 border-t border-white/10 pt-6">
              <h2 className="text-sm font-semibold text-white">Storyboard Chapters</h2>
              <div className="space-y-2">
                {CHAPTERS.map((ch) => (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => seekTo(ch.time)}
                    className="w-full rounded-lg border border-white/10 bg-white/[0.03] p-4 text-left hover:border-sky-400/50 hover:bg-white/[0.06] transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-white">{ch.title}</span>
                      <span className="font-mono text-xs text-sky-400 tabular-nums">{ch.range}</span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{ch.summary}</p>
                  </button>
                ))}
              </div>
            </div>

            <div id="pipeline" className="space-y-3 border-t border-white/10 pt-6">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-white">Rebuild Commands</h2>
                <button
                  type="button"
                  onClick={copyCommands}
                  className="inline-flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 transition-colors whitespace-nowrap shrink-0"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/70 p-4 font-mono text-xs leading-relaxed text-slate-300">
                {REDO_COMMAND}
              </pre>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
