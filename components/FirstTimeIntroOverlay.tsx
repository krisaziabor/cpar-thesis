"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";
import { EASE_OUT, MOTION_DURATION } from "@/lib/motion";

const INTRO_GRADIENT: [string, string, string] = [
  "#C73C28",
  "#2A86A2",
  "#7238A0",
];

type Slide = {
  id: string;
  title: string;
  body: string;
  visual: React.ReactNode;
};

type IntroVisualCompact = boolean;

/* ── Decorative visuals ─────────────────────────────────────────────────── */

function WaveVisual({ compact = false }: { compact?: IntroVisualCompact }) {
  // Inline canvas animation that replicates RecordingWave's exact drawing
  // algorithm but drives a simulated speech-like energy instead of a real
  // AnalyserNode — so it looks like someone is actively recording.
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let rafId: number;
    const startTime = Date.now();
    let smoothedEnergy = 0.04;

    function hexToRgb(hex: string): [number, number, number] {
      return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
    }

    const LAYERS = compact
      ? [
          { ci: 0, ph: 0, sp: 0.00052, cy: 1.12, rs: 1.0, ba: 0.48 },
          { ci: 1, ph: Math.PI * 0.7, sp: 0.0004, cy: 1.42, rs: 0.9, ba: 0.4 },
          { ci: 2, ph: Math.PI * 1.4, sp: 0.0006, cy: 0.92, rs: 0.78, ba: 0.34 },
        ]
      : [
          { ci: 0, ph: 0, sp: 0.0005, cy: 1.15, rs: 1.0, ba: 0.68 },
          { ci: 1, ph: Math.PI * 0.7, sp: 0.00038, cy: 1.45, rs: 0.9, ba: 0.56 },
          { ci: 2, ph: Math.PI * 1.4, sp: 0.00058, cy: 0.95, rs: 0.78, ba: 0.48 },
        ];
    const rgb = INTRO_GRADIENT.map(hexToRgb);

    function resize() {
      if (!canvas) return;
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      if (!W || !H) return;
      const dpr = window.devicePixelRatio ?? 1;
      canvas.width  = W * dpr;
      canvas.height = H * dpr;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(dpr, dpr);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    function draw() {
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      ctx.clearRect(0, 0, W, H);

      const t = (Date.now() - startTime) / 1000;
      // Multiple overlapping freqs simulate the irregular amplitude of speech
      const raw = Math.max(0.12, Math.min(0.62,
        0.28 + 0.18 * Math.sin(t * 2.3) + 0.1 * Math.sin(t * 7.1) + 0.06 * Math.sin(t * 13.4)
      ));
      smoothedEnergy = smoothedEnergy * 0.88 + raw * 0.12;

      const now = Date.now() - startTime;
      for (const l of LAYERS) {
        const [r, g, b] = rgb[l.ci];
        const phase = l.ph + now * l.sp;
        const rise  = H * (0.05 + smoothedEnergy * 0.48 * l.rs);
        const ripple = H * 0.018 + smoothedEnergy * H * 0.026;

        ctx.beginPath();
        ctx.moveTo(0, H);
        for (let s = 0; s <= 120; s++) {
          const x = (s / 120) * W;
          const y = (H - rise) + ripple * Math.sin((s / 120) * Math.PI * 2 * l.cy + phase);
          ctx.lineTo(x, y);
        }
        ctx.lineTo(W, H);
        ctx.closePath();

        const grad = ctx.createLinearGradient(0, 0, W, 0);
        grad.addColorStop(0,    `rgba(${r},${g},${b},0)`);
        grad.addColorStop(0.15, `rgba(${r},${g},${b},${l.ba})`);
        grad.addColorStop(0.85, `rgba(${r},${g},${b},${l.ba})`);
        grad.addColorStop(1,    `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      rafId = requestAnimationFrame(draw);
    }

    rafId = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(rafId); ro.disconnect(); };
  }, [compact]);

  return (
    <div
      className={`relative h-full w-full overflow-hidden border border-white/10 bg-black ${
        compact ? "rounded-xl" : "rounded-3xl"
      }`}
    >
      {/* Filter on a div, not on canvas — iOS Safari drops canvas renders when filter is applied directly */}
      <div
        className="absolute inset-0"
        style={{
          filter: compact ? "blur(28px) saturate(1.22)" : "blur(36px) saturate(1.12)",
        }}
      >
        <canvas ref={canvasRef} className="h-full w-full" />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: compact
            ? "radial-gradient(ellipse at center, transparent 22%, rgba(0,0,0,0.38) 100%)"
            : "radial-gradient(ellipse at center, transparent 28%, rgba(0,0,0,0.52) 100%)",
        }}
      />
    </div>
  );
}

const RECORD_URLS = [
  "https://music.apple.com/us/album/13mos",
  "https://doi.org/10.1038/s41586-020-2649-2",
  "https://www.instagram.com/stevebracknall/reel/DCyU00Ls3wa/",
] as const;

function RecordVisual({ compact = false }: { compact?: IntroVisualCompact }) {
  const shouldReduceMotion = useReducedMotion();
  // Three URLs appear in sequence, hold together, then loop.
  const CYCLE = shouldReduceMotion ? 0 : 4.8;
  const APPEAR_AT = [0.08, 0.26, 0.44] as const;
  const FADE_START = 0.92;

  return (
    <div
      className={`relative flex h-full w-full flex-col overflow-hidden border border-white/10 bg-black ${
        compact ? "rounded-xl" : "rounded-3xl"
      }`}
    >
      <div
        className={`flex min-h-0 flex-1 flex-col ${
          compact ? "px-3 pb-3 pt-3" : "px-4 pb-4 pt-4 sm:px-5 sm:pb-5 sm:pt-5"
        }`}
      >
        {!compact && (
          <div className="hidden sm:block">
            <h1 className="font-lector text-lg tracking-tight text-zinc-100">Add record(s)</h1>
            <p className="mt-1 text-xs text-zinc-500">Paste a URL or upload a file to continue.</p>
          </div>
        )}
        <div
          className={`flex min-h-0 flex-1 flex-col justify-center ${
            compact ? "gap-2" : "gap-2 sm:mt-4 sm:gap-3"
          }`}
        >
          {RECORD_URLS.map((url, i) => {
            const appear = APPEAR_AT[i];
            return (
              <motion.div
                key={url}
                className={`relative overflow-hidden rounded-md border border-zinc-800 bg-zinc-950 ${
                  compact ? "px-2.5 py-2" : "px-3 py-2 sm:py-2.5"
                }`}
                initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
                animate={
                  shouldReduceMotion
                    ? { opacity: 1, y: 0 }
                    : {
                        opacity: [0, 0, 1, 1, 0],
                        y: [6, 6, 0, 0, 0],
                      }
                }
                transition={
                  shouldReduceMotion
                    ? { duration: 0 }
                    : {
                        duration: CYCLE,
                        times: [0, appear, appear + 0.06, FADE_START, 1],
                        ease: EASE_OUT,
                        repeat: Infinity,
                      }
                }
              >
                <span
                  className={`block truncate pr-6 font-sans text-zinc-300 ${
                    compact ? "text-[11px]" : "text-xs sm:text-sm"
                  }`}
                >
                  {url}
                </span>
                <span
                  aria-hidden
                  className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 ${
                    compact ? "text-xs" : "text-sm"
                  }`}
                >
                  ↵
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function formatMmSs(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds % 3600);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function ConnectVisual({ compact = false }: { compact?: IntroVisualCompact }) {
  const shouldReduceMotion = useReducedMotion();
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (shouldReduceMotion) return;
    const id = window.setInterval(() => {
      setElapsedSec((n) => (n >= 3599 ? 0 : n + 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [shouldReduceMotion]);

  // Connect panel record step only: gradient wave + stacked records + timer.
  const records = [
    {
      title: "13MOS",
      meta: "Aminé",
      img: "/intro/amine-13mos.png",
    },
    {
      title: "The Photograph as an Intersection of Gazes",
      meta: "Catherine Lutz, Jane Collins",
      img: "/intro/essay-gazes.png",
    },
  ] as const;

  return (
    <div
      className={`relative flex h-full w-full overflow-hidden border border-white/10 bg-black ${
        compact ? "rounded-xl" : "rounded-3xl"
      }`}
    >
      <div className="absolute inset-0">
        <WaveVisual compact={compact} />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background: compact
            ? "radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.42) 100%)"
            : "radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.5) 100%)",
        }}
      />
      <div className={`relative z-10 flex h-full flex-col ${compact ? "p-3 pb-3" : "p-4 sm:p-6"}`}>
        <motion.h2
          className={`font-lector tracking-tight text-zinc-100 ${
            compact ? "text-sm leading-tight" : "text-lg"
          }`}
          initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: MOTION_DURATION.panel, ease: EASE_OUT }}
        >
          Record the connection
        </motion.h2>
        <div className={compact ? "min-h-1 flex-1" : "min-h-2 flex-1 sm:min-h-4"} />
        <motion.div
          className={`flex flex-row flex-wrap items-end justify-start overflow-hidden ${
            compact
              ? "max-h-[min(58%,180px)] gap-x-3 gap-y-3"
              : "max-h-[min(34vh,260px)] gap-x-4 gap-y-2 sm:max-h-[min(38vh,260px)] sm:gap-x-5 sm:gap-y-3"
          }`}
          initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: MOTION_DURATION.standard,
            ease: EASE_OUT,
            delay: shouldReduceMotion ? 0 : 0.06,
          }}
        >
          {records.map((r, idx) => (
            <div
              key={idx}
              className={`flex min-w-0 items-end ${
                compact ? "w-full max-w-full shrink-0 basis-full gap-2" : "max-w-[min(100%,22rem)] gap-2.5"
              }`}
            >
              <img
                src={r.img}
                alt=""
                draggable={false}
                className={
                  compact
                    ? "h-11 w-auto max-w-[3.35rem] shrink-0 bg-zinc-900 object-cover"
                    : "h-12 w-auto max-w-[3.5rem] shrink-0 bg-zinc-900 object-cover sm:h-[4.25rem] sm:max-w-[5rem]"
                }
              />
              <div className="min-w-0 flex-1">
                <p
                  className={`font-lector leading-tight tracking-tight text-zinc-100 ${
                    compact ? "line-clamp-2 text-[10px]" : "line-clamp-2 text-xs sm:text-sm sm:text-[15px]"
                  }`}
                >
                  {r.title}
                </p>
                <p
                  className={`mt-0.5 font-sans text-white/55 ${compact ? "break-words text-[9px] leading-snug" : "text-[11px]"}`}
                >
                  {r.meta}
                </p>
              </div>
            </div>
          ))}
        </motion.div>
        <motion.div
          className={`flex items-baseline ${compact ? "mt-2 gap-2 pt-1.5" : "mt-3 gap-3 sm:mt-5 sm:gap-4"}`}
          initial={shouldReduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{
            duration: MOTION_DURATION.standard,
            ease: EASE_OUT,
            delay: shouldReduceMotion ? 0 : 0.12,
          }}
        >
          <span className={`font-sans text-zinc-300 ${compact ? "text-xs" : "text-sm"}`}>
            Recording
          </span>
          <span
            className={`font-mono tabular-nums text-zinc-400 ${compact ? "text-xs" : "text-sm"}`}
          >
            {shouldReduceMotion ? "00:00" : formatMmSs(elapsedSec)}
          </span>
        </motion.div>
      </div>
    </div>
  );
}

function RespondVisual({ compact = false }: { compact?: IntroVisualCompact }) {
  return (
    <div
      className={`relative flex h-full w-full items-center justify-center overflow-hidden border border-white/10 bg-zinc-950 ${
        compact ? "rounded-xl px-2" : "rounded-3xl px-8"
      }`}
    >
      <div className={`w-full ${compact ? "max-w-full space-y-2" : "max-w-md space-y-3"}`}>
        {/* Source record row */}
        <motion.div
          className={`flex items-center rounded-xl border border-white/15 bg-zinc-900 shadow-[0_8px_24px_rgba(0,0,0,0.45)] ${
            compact ? "gap-2 px-2.5 py-2" : "gap-3 px-4 py-3"
          }`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE_OUT, delay: 0.1 }}
        >
          <div
            className={`shrink-0 overflow-hidden rounded-md ${
              compact ? "h-10 w-10" : "h-12 w-12"
            }`}
          >
            <img
              src="/intro/neo-soul-video.png"
              alt="Can white people sing neo-soul?"
              draggable={false}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="min-w-0 flex-1 space-y-0.5">
            <p
              className={`font-lector leading-tight text-white/90 ${
                compact ? "line-clamp-2 text-[11px]" : "text-xs"
              }`}
            >
              Can white people sing neo-soul?
            </p>
            <p className={`font-sans text-white/40 ${compact ? "text-[9px]" : "text-[10px]"}`}>
              Apr 8
            </p>
          </div>
          <div
            className={`shrink-0 rounded-full bg-white font-sans text-black ${
              compact ? "px-2 py-0.5 text-[9px]" : "px-2.5 py-1 text-[10px]"
            }`}
          >
            Respond
          </div>
        </motion.div>

        {/* Nested responses */}
        <motion.div
          className={`space-y-2 ${compact ? "ml-4" : "ml-8"}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE_OUT, delay: 0.28 }}
        >
          <div
            className={`relative rounded-lg border border-white/10 pl-3 ${
              compact ? "px-2 py-2 pl-3" : "px-3 py-2.5 pl-4"
            }`}
          >
            <span
              aria-hidden
              className="absolute bottom-1 left-0 top-1 w-1 rounded-full"
              style={{
                background:
                  "linear-gradient(to bottom, #C73C28, #2A86A2, #7238A0)",
              }}
            />
            <div
              className={`rounded-sm bg-white/35 ${compact ? "mt-1 h-1 w-1/2" : "h-1.5 w-2/5"}`}
            />
            <div
              className={`rounded-sm bg-white/15 ${compact ? "mt-1 h-0.5 w-4/5" : "mt-1.5 h-1 w-4/5"}`}
            />
          </div>
          <motion.div
            className={`relative rounded-lg border border-white/10 pl-3 ${
              compact ? "px-2 py-2 pl-3" : "px-3 py-2.5 pl-4"
            }`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.42 }}
          >
            <span
              aria-hidden
              className="absolute bottom-1 left-0 top-1 w-1 rounded-full"
              style={{
                background:
                  "linear-gradient(to bottom, #7238A0, #C73C28, #2A86A2)",
              }}
            />
            <div
              className={`rounded-sm bg-white/35 ${compact ? "mt-1 h-1 w-2/5" : "h-1.5 w-1/3"}`}
            />
            <div
              className={`rounded-sm bg-white/15 ${compact ? "mt-1 h-0.5 w-3/5" : "mt-1.5 h-1 w-3/5"}`}
            />
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}

/* ── Component ──────────────────────────────────────────────────────────── */

interface FirstTimeIntroOverlayProps {
  open: boolean;
  onClose: () => void;
  /**
   * Layout variant.
   * - "fullscreen" (default): centered modal, dim + blurred backdrop.
   * - "card": small floating card pinned to the bottom-right; no backdrop,
   *   so the graph stays fully visible behind.
   */
  variant?: "fullscreen" | "card";
}

export default function FirstTimeIntroOverlay({
  open,
  onClose,
  variant = "fullscreen",
}: FirstTimeIntroOverlayProps) {
  const shouldReduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const compact = variant === "card";

  const slides = useMemo<Slide[]>(
    () => [
      {
        id: "voice",
        title: "In Kanon, voice comes first.",
        body: "Your voice is the main tool for communication. Every record added, connection made, and response sent requires an audio narrative from the user.",
        visual: <WaveVisual compact={compact} />,
      },
      {
        id: "add",
        title: "All media welcome.",
        body: "Paste a URL and Kanon fetches the thumbnail and metadata automatically. Books, films, songs, articles, PDFs, links: Kanon stores them all with care.",
        visual: <RecordVisual compact={compact} />,
      },
      {
        id: "connect",
        title: "Connect records together.",
        body: "Take any combination of records and share why you think they are tied together.",
        visual: <ConnectVisual compact={compact} />,
      },
      {
        id: "respond",
        title: "Respond to anything.",
        body: "Add your voice to any record, connection, or existing response, taking the conversation to a new dimension.",
        visual: <RespondVisual compact={compact} />,
      },
    ],
    [compact]
  );

  // Reset index whenever the overlay opens fresh.
  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  const advance = useCallback(() => {
    if (index >= slides.length - 1) onClose();
    else setIndex((i) => i + 1);
  }, [index, slides.length, onClose]);

  const goBack = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === "Enter") advance();
      else if (e.key === "ArrowLeft") goBack();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, advance, goBack, onClose]);

  const isLast = index === slides.length - 1;
  const current = slides[index];

  // ── Compact / card variant ────────────────────────────────────────────────
  if (variant === "card") {
    return (
      <AnimatePresence>
        {open && (
          <motion.div
            key="first-time-intro-card"
            className="fixed bottom-6 right-4 z-[80] w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/95 shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-md"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
          >
            {/* Dismiss — top right, generous touch target + margin */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Dismiss"
              className="absolute right-2.5 top-2.5 z-10 flex h-8 w-8 items-center justify-center rounded-full text-white/45 transition-colors duration-150 ease-out hover:bg-white/10 hover:text-white/90"
            >
              <span className="text-base leading-none">×</span>
            </button>

            <div className="flex flex-col gap-4 p-5 pt-12">
              {/* Visual — taller than 16:9 so dense UIs stay legible in the corner card */}
              <div className="relative min-h-[220px] w-full overflow-hidden rounded-xl sm:min-h-[232px]">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={current.id}
                    className="absolute inset-0 origin-top"
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                    transition={{ duration: MOTION_DURATION.standard, ease: EASE_OUT }}
                  >
                    {current.visual}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Caption */}
              <div className="flex flex-col items-start gap-1.5 pr-6 text-left">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={`text-${current.id}`}
                    className="flex flex-col items-start gap-1.5"
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                    transition={{ duration: MOTION_DURATION.standard, ease: EASE_OUT }}
                  >
                    <h2 className="font-lector text-base leading-tight tracking-tight text-white/95">
                      {current.title}
                    </h2>
                    <p className="font-sans text-[12px] leading-relaxed text-white/55">
                      {current.body}
                    </p>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Pager + actions */}
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={goBack}
                  disabled={index === 0}
                  className="font-sans text-[11px] text-white/40 transition-colors duration-150 ease-out hover:text-white/90 disabled:invisible"
                >
                  Back
                </button>

                <div className="flex items-center gap-1.5">
                  {slides.map((s, i) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setIndex(i)}
                      aria-label={`Go to slide ${i + 1}`}
                      className={`h-1 rounded-full transition-all duration-200 ease-out ${
                        i === index
                          ? "w-4 bg-white/90"
                          : "w-1 bg-white/25 hover:bg-white/50"
                      }`}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={advance}
                  className="rounded-full bg-white px-3 py-1 font-sans text-[11px] text-black transition-colors duration-150 ease-out hover:bg-white/90"
                >
                  {isLast ? "Done" : "Next"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  // ── Fullscreen variant (default) ──────────────────────────────────────────
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="first-time-intro"
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/95 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: EASE_OUT }}
        >
          {/* Skip — top right */}
          <button
            type="button"
            onClick={onClose}
            className="absolute right-6 top-6 font-sans text-xs text-white/40 transition-colors duration-150 ease-out hover:text-white/90"
          >
            Skip
          </button>

          <div className="flex w-full max-w-5xl flex-col items-start gap-4 px-5 sm:gap-10 sm:px-8">
            {/* Visual area */}
            <div className="relative aspect-[4/3] w-full max-h-[52vh] overflow-hidden rounded-2xl sm:aspect-[16/9] sm:max-h-none sm:rounded-3xl">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={current.id}
                  className="absolute inset-0"
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
                  transition={{
                    duration: MOTION_DURATION.panel,
                    ease: EASE_OUT,
                  }}
                >
                  {current.visual}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Caption — left-aligned with visual */}
            <div className="flex w-full flex-col items-start gap-3 text-left">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={`text-${current.id}`}
                  className="flex flex-col items-start gap-3"
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                  transition={{
                    duration: MOTION_DURATION.standard,
                    ease: EASE_OUT,
                  }}
                >
                  <h2 className="font-lector text-xl leading-tight tracking-tight text-white/95 sm:text-3xl">
                    {current.title}
                  </h2>
                  <p className="max-w-lg font-sans text-sm leading-relaxed text-white/60">
                    {current.body}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Pager + actions */}
            <div className="flex w-full items-center justify-between">
              {/* Back (invisible on first) */}
              <button
                type="button"
                onClick={goBack}
                disabled={index === 0}
                className="font-sans text-xs text-white/40 transition-colors duration-150 ease-out hover:text-white/90 disabled:invisible"
              >
                Back
              </button>

              {/* Dots */}
              <div className="flex items-center gap-2">
                {slides.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-label={`Go to slide ${i + 1}`}
                    className={`h-1.5 rounded-full transition-all duration-200 ease-out ${
                      i === index
                        ? "w-6 bg-white/90"
                        : "w-1.5 bg-white/25 hover:bg-white/50"
                    }`}
                  />
                ))}
              </div>

              {/* Next / Done */}
              <button
                type="button"
                onClick={advance}
                className="rounded-full bg-white px-5 py-1.5 font-sans text-xs text-black transition-colors duration-150 ease-out hover:bg-white/90"
              >
                {isLast ? "Enter Kanon" : "Next"}
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
