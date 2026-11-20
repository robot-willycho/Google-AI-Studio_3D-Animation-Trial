import { useRef, useState } from "react";
import { Check, Copy, Pause, Play, RotateCcw } from "lucide-react";

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
      "Procedural hummingbird hovers and beats its wings around shoulder pivots with 3D-to-2D projected reticles and horizontal scan glitches.",
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
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [copied, setCopied] = useState(false);

  function togglePlay() {
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
    const vid = videoRef.current;
    if (!vid) return;
    vid.currentTime = seconds;
    setCurrentTime(seconds);
  }

  function restart() {
    const vid = videoRef.current;
    if (!vid) return;
    vid.currentTime = 0;
    void vid.play();
    setIsPlaying(true);
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

            <div className="mt-4 flex items-center justify-between gap-4 border-t border-white/10 pt-4">
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

              <div className="font-mono text-xs text-slate-400 tabular-nums">
                {currentTime.toFixed(2)}s / 4.80s
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 space-y-8">
            <div>
              <p className="text-xs text-slate-400">
                1080 × 1080 · 30 fps · 144 frames · Silent H.264
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
                Procedural 3D Holographic Hummingbird
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                Built from scratch with procedural Three.js geometry, custom GLSL feather and gorget
                iridescence shaders, 3D-to-2D projected Canvas tracking reticles, and deterministic
                HyperFrames + FFmpeg capture.
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
