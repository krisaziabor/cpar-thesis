"use client";

import { useState, useId, useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useDialKit } from "dialkit";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD
 *
 * Read top-to-bottom. Each `at` value is ms after trigger.
 *
 *    0ms   prompt card visible; color wheel centered below it
 *          progress dots above card are clickable to revisit steps
 *          user picks a swatch → dot snaps to segment (spring)
 *  400ms   after pick, card crossfades to next prompt (ease-out)
 *          wheel segments already-used dim to 15%
 *
 * — after third pick —
 *
 *    0ms   card + wheel exit upward (ease-out-cubic, 250ms)
 *  600ms   avatar fades in top-left under "Kanon", scale 0.95 → 1.0
 * 1200ms   "This is yours." text fades in beside avatar
 * 2000ms   ambient container fades in (fixed inset-0)
 *          SVG inside starts at translateY(80%), creeps toward 15%
 *          rise takes ~10s with very long-tail ease-out
 *          gradient is still growing as user sits with their avatar
 *          drift loop runs concurrently
 * ───────────────────────────────────────────────────────── */

/* ── Timing ────────────────────────────────────────────────────────────────── */

const TIMING = {
  pickAdvance:      400,    // ms pause after swatch pick before advancing
  avatarAppear:     600,    // ms after reveal — avatar comes first
  textAppear:       1200,   // ms after reveal — text follows quickly
  ambientRise:      2000,   // ms after reveal — gradient begins after text
};

/* ── Element configs ───────────────────────────────────────────────────────── */

const CARD = {
  yOffset: 6,             // px slide on enter/exit
  spring: { duration: 0.2, ease: [0.215, 0.61, 0.355, 1] },
};

const WHEEL = {
  diameter: 320,          // px — large, commanding
  ringWidth: 56,          // px — thickness of each color segment
  gapDeg: 1,              // degrees between segments — tight seams
  hoverScale: 1.06,       // segment scale on hover
  tapScale: 0.94,         // segment scale on press
  selectionSpring: { type: "spring" as const, duration: 0.35, bounce: 0.2 },
};

const AMBIENT = {
  svgSize: 80,            // viewBox size — keeps path coordinates proportional
  blurInternal: 12,       // SVG feGaussianBlur — scaled up from icon's 7
  blurCSS: 120,           // px — heavy CSS blur on top for smoothness
  saturation: 1.4,        // CSS saturate multiplier
  opacity: 0.8,           // max opacity of ambient layer
  driftDuration: 30,      // seconds for one full drift cycle
  growDuration: 14,       // seconds — very slow height growth
  growEase: [0.05, 0.5, 0.12, 1], // gentler start, longer deceleration
  startHeight: 3,         // scaleY % — barely visible whisper at bottom
  endHeight: 120,         // scaleY % — fills past viewport
  startWidth: 75,         // scaleX % — starts at 75% of the 200vw base
  endWidth: 100,          // scaleX % — grows to full width
  fadeInDuration: 4,      // seconds — slow fade-in paired with growth
};

const REVEAL = {
  avatarSize: 40,         // px — slightly smaller, tucked into header
  avatarScale: 0.95,      // initial scale
  avatarSpring: { duration: 0.5, ease: [0.23, 1, 0.32, 1] },
  textFade: { duration: 0.4 },
};

/* ── Gradient utilities (from fallback-avatar) ─────────────────────────────── */

function hash(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h << 5) - h + name.charCodeAt(i);
    h = h & h;
  }
  return Math.abs(h);
}

function getUnit(number: number, range: number, index?: number): number {
  const value = number % range;
  if (index && Math.floor(number / Math.pow(10, index)) % 2 === 0)
    return -value;
  return value;
}

/* ── SVG gradient — same algorithm as avatar icon ──────────────────────────── */

function GradientSVG({
  colors,
  seed,
  size,
  round = false,
  blurDeviation = 7,
}: {
  colors: [string, string, string];
  seed: string;
  size: number;
  round?: boolean;
  blurDeviation?: number;
}) {
  const maskId = useId();
  const filterId = useId();
  const num = hash(seed || "kanon");

  const layers = colors.map((color, i) => ({
    color,
    translateX: getUnit(num * (i + 1), size / 10, 1),
    translateY: getUnit(num * (i + 1), size / 10, 2),
    scale: 1.2 + getUnit(num * (i + 1), size / 20) / 10,
    rotate: getUnit(num * (i + 1), 360, 1),
  }));

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      width={round ? size : "100%"}
      height={round ? size : "100%"}
      preserveAspectRatio={round ? undefined : "xMidYMid slice"}
    >
      <mask
        id={maskId}
        maskUnits="userSpaceOnUse"
        x={0}
        y={0}
        width={size}
        height={size}
      >
        <rect
          width={size}
          height={size}
          rx={round ? size * 2 : 0}
          fill="#FFFFFF"
        />
      </mask>
      <g mask={`url(#${maskId})`}>
        <rect width={size} height={size} fill={layers[0].color} />
        <path
          filter={`url(#${filterId})`}
          d="M32.414 59.35L50.376 70.5H72.5v-71H33.728L26.5 13.381l19.057 27.08L32.414 59.35z"
          fill={layers[1].color}
          transform={`translate(${layers[1].translateX} ${layers[1].translateY}) rotate(${layers[1].rotate} ${size / 2} ${size / 2}) scale(${layers[1].scale})`}
        />
        <path
          filter={`url(#${filterId})`}
          style={{ mixBlendMode: "overlay" }}
          d="M22.216 24L0 46.75l14.108 38.129L78 86l-3.081-59.276-22.378 4.005 12.972 20.186-23.35 27.395L22.215 24z"
          fill={layers[2].color}
          transform={`translate(${layers[2].translateX} ${layers[2].translateY}) rotate(${layers[2].rotate} ${size / 2} ${size / 2}) scale(${layers[2].scale})`}
        />
      </g>
      <defs>
        <filter
          id={filterId}
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity={0} result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur
            stdDeviation={blurDeviation}
            result="effect1_foregroundBlur"
          />
        </filter>
      </defs>
    </svg>
  );
}

/* ── Palette ───────────────────────────────────────────────────────────────── */

const SWATCHES = [
  { name: "Brick",      hex: "#C73C28" },
  { name: "Terracotta", hex: "#C86235" },
  { name: "Amber",      hex: "#C48D28" },
  { name: "Ochre",      hex: "#8A9430" },
  { name: "Fern",       hex: "#3E9450" },
  { name: "Verdigris",  hex: "#30927A" },
  { name: "Teal",       hex: "#2A86A2" },
  { name: "Slate",      hex: "#2E5EA8" },
  { name: "Indigo",     hex: "#4A44A0" },
  { name: "Violet",     hex: "#7238A0" },
  { name: "Plum",       hex: "#A03080" },
  { name: "Rosewood",   hex: "#B83055" },
];

/* ── Steps ─────────────────────────────────────────────────────────────────── */

const STEPS = [
  {
    key: "consumed",
    prompt:
      "Think of something you\u2019ve consumed recently that stuck with you \u2014 a film, an album, a piece of writing, anything. Pick a color.",
  },
  {
    key: "made",
    prompt:
      "Now something you\u2019ve made \u2014 however small, however unfinished. Pick a color.",
  },
  {
    key: "changed",
    prompt:
      "Finally, something that changed the way you think. An idea, a theory, a conversation. Pick a color.",
  },
] as const;

/* ── Color wheel ───────────────────────────────────────────────────────────── */

function arcPath(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startDeg: number,
  endDeg: number,
): string {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const s = toRad(startDeg - 90);
  const e = toRad(endDeg - 90);

  const x1 = cx + outerR * Math.cos(s);
  const y1 = cy + outerR * Math.sin(s);
  const x2 = cx + outerR * Math.cos(e);
  const y2 = cy + outerR * Math.sin(e);
  const x3 = cx + innerR * Math.cos(e);
  const y3 = cy + innerR * Math.sin(e);
  const x4 = cx + innerR * Math.cos(s);
  const y4 = cy + innerR * Math.sin(s);

  const largeArc = endDeg - startDeg > 180 ? 1 : 0;

  return [
    `M ${x1} ${y1}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4} ${y4}`,
    `Z`,
  ].join(" ");
}

function ColorWheel({
  picked,
  currentStep,
  onPick,
  shouldReduceMotion,
}: {
  picked: [string | null, string | null, string | null];
  currentStep: number;
  onPick: (hex: string) => void;
  shouldReduceMotion: boolean | null;
}) {
  const count = SWATCHES.length;
  const segDeg = 360 / count;
  const gap = WHEEL.gapDeg;
  const outerR = WHEEL.diameter / 2;
  const innerR = outerR - WHEEL.ringWidth;
  const cx = outerR;
  const cy = outerR;

  return (
    <div
      className="relative"
      style={{ width: WHEEL.diameter, height: WHEEL.diameter }}
    >
      <svg
        viewBox={`0 0 ${WHEEL.diameter} ${WHEEL.diameter}`}
        width={WHEEL.diameter}
        height={WHEEL.diameter}
        className="overflow-visible"
      >
        {SWATCHES.map(({ name, hex }, i) => {
          const startDeg = i * segDeg + gap / 2;
          const endDeg = (i + 1) * segDeg - gap / 2;
          const alreadyUsed = picked.includes(hex) && picked[currentStep] !== hex;
          const isSelected = picked[currentStep] === hex;
          const d = arcPath(cx, cy, outerR, innerR, startDeg, endDeg);

          const midDeg = ((startDeg + endDeg) / 2 - 90) * (Math.PI / 180);
          const indicatorR = outerR + 8;
          const dotX = cx + indicatorR * Math.cos(midDeg);
          const dotY = cy + indicatorR * Math.sin(midDeg);

          return (
            <g key={hex}>
              <motion.path
                d={d}
                fill={hex}
                initial={false}
                animate={{
                  opacity: alreadyUsed ? 0.15 : 1,
                  scale: isSelected ? 1.03 : 1,
                }}
                whileHover={
                  shouldReduceMotion || alreadyUsed
                    ? {}
                    : { scale: WHEEL.hoverScale }
                }
                whileTap={
                  shouldReduceMotion || alreadyUsed
                    ? {}
                    : { scale: WHEEL.tapScale }
                }
                transition={
                  shouldReduceMotion
                    ? { duration: 0 }
                    : { type: "spring", duration: 0.3, bounce: 0.15 }
                }
                style={{
                  transformOrigin: `${cx}px ${cy}px`,
                  cursor: alreadyUsed ? "not-allowed" : "pointer",
                }}
                onClick={() => {
                  if (!alreadyUsed) onPick(hex);
                }}
                role="button"
                aria-label={`Select ${name}`}
              >
                <title>{name}</title>
              </motion.path>

              {isSelected && (
                <motion.circle
                  cx={dotX}
                  cy={dotY}
                  r={3}
                  fill="white"
                  initial={shouldReduceMotion ? false : { opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={
                    shouldReduceMotion
                      ? { duration: 0 }
                      : WHEEL.selectionSpring
                  }
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* Center — show already-picked colors */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="flex gap-2">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="rounded-full"
              animate={{
                width: picked[i] ? 10 : 6,
                height: picked[i] ? 10 : 6,
                backgroundColor: picked[i] ?? "rgba(255,255,255,0.1)",
              }}
              transition={
                shouldReduceMotion
                  ? { duration: 0 }
                  : { type: "spring", duration: 0.3, bounce: 0.2 }
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Ambient drift (continuous gentle motion via CSS keyframes) ────────────── */

const driftKeyframes = `
@keyframes ambientDrift {
  0%   { transform: translate(0%, 0%) scale(1.0) rotate(0deg); }
  25%  { transform: translate(3%, -4%) scale(1.06) rotate(2.5deg); }
  50%  { transform: translate(-3%, -6%) scale(1.03) rotate(-1.5deg); }
  75%  { transform: translate(1%, -2%) scale(1.07) rotate(1deg); }
  100% { transform: translate(0%, 0%) scale(1.0) rotate(0deg); }
}
`;

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default function OnboardingLabPage() {
  const shouldReduceMotion = useReducedMotion();

  /* ── DialKit controls ──────────────────────────────────────────────────── */

  const timing = useDialKit("Sequence", {
    avatarDelay:  [TIMING.avatarAppear, 0, 3000],   // ms — when avatar appears
    textDelay:    [TIMING.textAppear, 0, 4000],      // ms — when text appears
    ambientDelay: [TIMING.ambientRise, 500, 6000],   // ms — when gradient starts
    pickPause:    [TIMING.pickAdvance, 100, 1000],    // ms — pause after swatch pick
  });

  const replayGradient = useRef<() => void>(null);

  const gradient = useDialKit("Gradient", {
    blurInternal:  [AMBIENT.blurInternal, 4, 24],    // SVG feGaussianBlur stdDeviation
    blurCSS:       [AMBIENT.blurCSS, 40, 200],       // px — CSS blur on top
    saturation:    [AMBIENT.saturation, 1, 2],        // CSS saturate multiplier
    opacity:       [AMBIENT.opacity, 0.3, 1],         // max opacity of gradient layer
    growDuration:  [AMBIENT.growDuration, 5, 60],      // seconds — how long height growth takes
    fadeIn:        [AMBIENT.fadeInDuration, 1, 8],     // seconds — container opacity fade-in
    startHeight:   [AMBIENT.startHeight, 1, 20],       // % — initial scaleY
    endHeight:     [AMBIENT.endHeight, 60, 160],      // % — final scaleY
    startWidth:    [AMBIENT.startWidth, 50, 100],      // % — initial scaleX
    endWidth:      [AMBIENT.endWidth, 80, 120],        // % — final scaleX
    driftDuration: [AMBIENT.driftDuration, 10, 60],   // seconds — one drift cycle
    replay:        { type: "action" as const, label: "Replay gradient" },
  }, {
    onAction: (action: string) => {
      if (action === "replay") replayGradient.current?.();
    },
  });

  const reveal = useDialKit("Avatar", {
    size:       [REVEAL.avatarSize, 24, 80],       // px — avatar diameter
    startScale: [REVEAL.avatarScale, 0.8, 1],      // scale before appearing
  });

  /* ── State ─────────────────────────────────────────────────────────────── */

  const [picked, setPicked] = useState<[string | null, string | null, string | null]>([
    null, null, null,
  ]);
  const [step, setStep] = useState(0); // 0, 1, 2 = prompts; 3 = reveal
  const [revealStage, setRevealStage] = useState(0); // 0 = nothing, 1 = avatar, 2 = text, 3 = ambient
  const [seed] = useState("Kanon");
  const revealTimers = useRef<NodeJS.Timeout[]>([]);

  /* Wire up gradient replay — drops to stage 2, then re-triggers stage 3 */
  replayGradient.current = useCallback(() => {
    if (step !== 3) return;
    revealTimers.current.forEach(clearTimeout);
    setRevealStage(2);
    const t = setTimeout(() => setRevealStage(3), 100);
    revealTimers.current = [t];
  }, [step]);

  const handlePick = useCallback(
    (hex: string) => {
      const next = [...picked] as [string | null, string | null, string | null];
      next[step] = hex;
      setPicked(next);

      const delay = shouldReduceMotion ? 0 : timing.pickPause;
      setTimeout(() => setStep((s) => s + 1), delay);
    },
    [step, picked, shouldReduceMotion, timing.pickPause],
  );

  const handleReset = useCallback(() => {
    revealTimers.current.forEach(clearTimeout);
    revealTimers.current = [];
    setStep(0);
    setRevealStage(0);
    setPicked([null, null, null]);
  }, []);

  const handleDotClick = useCallback(
    (targetStep: number) => {
      if (targetStep < step && targetStep < 3) {
        setStep(targetStep);
      }
    },
    [step],
  );

  /* Trigger reveal stages — avatar first, then text, then gradient */
  /* stage 1 = avatar, stage 2 = text, stage 3 = ambient starts rising */
  useEffect(() => {
    if (step !== 3) return;
    revealTimers.current.forEach(clearTimeout);
    const t: NodeJS.Timeout[] = [];

    if (shouldReduceMotion) {
      setRevealStage(3);
    } else {
      t.push(setTimeout(() => setRevealStage(1), timing.avatarDelay));
      t.push(setTimeout(() => setRevealStage(2), timing.textDelay));
      t.push(setTimeout(() => setRevealStage(3), timing.ambientDelay));
    }

    revealTimers.current = t;
    return () => t.forEach(clearTimeout);
  }, [step, shouldReduceMotion, timing.avatarDelay, timing.textDelay, timing.ambientDelay]);

  const allPicked = picked.every((c) => c !== null);
  const colors = (allPicked ? picked : ["#000", "#000", "#000"]) as [
    string, string, string,
  ];

  const isPromptStep = step < 3;

  const stepAnim = {
    initial: shouldReduceMotion ? false : ({ opacity: 0, y: CARD.yOffset } as const),
    animate: { opacity: 1, y: 0 } as const,
    exit: shouldReduceMotion
      ? ({ opacity: 1 } as const)
      : ({ opacity: 0, y: -CARD.yOffset } as const),
    transition: shouldReduceMotion ? { duration: 0 } : CARD.spring,
  };

  return (
    <div className="min-h-screen bg-black overflow-hidden">
      <style>{driftKeyframes}</style>

      {/* ── Ambient gradient — grows upward from the bottom ────────────────── */}
      <AnimatePresence>
        {step === 3 && allPicked && (
          <motion.div
            key="ambient"
            /* Container stays fixed at inset-0 — fades in when stage 3 */
            initial={{ opacity: 0 }}
            animate={{ opacity: revealStage >= 3 ? 1 : 0 }}
            exit={{ opacity: 0 }}
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : { duration: gradient.fadeIn, ease: [0.215, 0.61, 0.355, 1] }
            }
            className="fixed inset-0 pointer-events-none z-0"
          >
            {/* SVG element — anchored to bottom, scaleY + scaleX grow together (GPU-only) */}
            <motion.div
              initial={false}
              animate={{
                scaleY: revealStage >= 3
                  ? gradient.endHeight / 100
                  : gradient.startHeight / 100,
                scaleX: revealStage >= 3
                  ? gradient.endWidth / 100
                  : gradient.startWidth / 100,
              }}
              transition={
                shouldReduceMotion
                  ? { duration: 0 }
                  : {
                      scaleY: {
                        duration: gradient.growDuration,
                        ease: AMBIENT.growEase,
                      },
                      scaleX: {
                        duration: gradient.growDuration * 0.55,
                        ease: [0.215, 0.61, 0.355, 1], // ease-out-cubic — reaches full width earlier
                      },
                    }
              }
              style={{
                position: "absolute",
                bottom: 0,
                left: "-50vw",
                width: "200vw",
                height: "100vh",
                transformOrigin: "center bottom",
                willChange: "transform",
              }}
            >
              {/* Inner wrapper — blur + drift */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  filter: `blur(${gradient.blurCSS}px) saturate(${gradient.saturation})`,
                  opacity: gradient.opacity,
                  animation: shouldReduceMotion
                    ? "none"
                    : `ambientDrift ${gradient.driftDuration}s ease-in-out infinite`,
                  willChange: "transform",
                }}
              >
                <GradientSVG
                  colors={colors}
                  seed={seed}
                  size={AMBIENT.svgSize}
                  blurDeviation={gradient.blurInternal}
                />
              </div>
            </motion.div>

            {/* Soft top vignette — feathers the growing edge */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to bottom, black 0%, rgba(0,0,0,0.6) 20%, rgba(0,0,0,0.2) 35%, transparent 55%)",
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Header area ──────────────────────────────────────────────────────── */}
      <div className="fixed left-6 top-6 z-20 flex flex-col gap-3">
        <h1 className="font-lector text-2xl tracking-tight text-white/90">
          Kanon
        </h1>

        {/* ── Reveal content — avatar + text, tucked under header ───────────── */}
        <AnimatePresence>
          {step === 3 && (
            <motion.div
              key="reveal-content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col gap-3"
            >
              {/* Avatar — appears first (stage 1) */}
              <motion.div
                initial={
                  shouldReduceMotion
                    ? false
                    : { opacity: 0, scale: reveal.startScale }
                }
                animate={{
                  opacity: revealStage >= 1 ? 1 : 0,
                  scale: revealStage >= 1 ? 1 : reveal.startScale,
                }}
                transition={
                  shouldReduceMotion ? { duration: 0 } : REVEAL.avatarSpring
                }
              >
                <GradientSVG
                  colors={colors}
                  seed={seed}
                  size={reveal.size}
                  round
                />
              </motion.div>

              {/* Text — appears second (stage 2) */}
              <motion.p
                initial={shouldReduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: revealStage >= 2 ? 1 : 0 }}
                transition={
                  shouldReduceMotion ? { duration: 0 } : REVEAL.textFade
                }
                className="font-sans text-xs text-zinc-400"
              >
                This is yours.
              </motion.p>

              {/* Try again — appears with text */}
              <motion.button
                initial={shouldReduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: revealStage >= 2 ? 1 : 0 }}
                transition={
                  shouldReduceMotion
                    ? { duration: 0 }
                    : { duration: 0.3, delay: 0.2 }
                }
                onClick={handleReset}
                className="font-lector text-xs text-zinc-600 transition-colors hover:text-zinc-300 text-left w-fit"
              >
                Try again
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Reset ────────────────────────────────────────────────────────────── */}
      <button
        onClick={handleReset}
        className="fixed right-6 top-6 z-20 font-sans text-xs text-zinc-600 transition-colors hover:text-zinc-300"
      >
        Start over
      </button>

      {/* ── Prompt flow — vertically centered, card + wheel stacked ──────── */}
      <AnimatePresence mode="wait">
        {isPromptStep && (
          <motion.div
            key="prompt-flow"
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={
              shouldReduceMotion
                ? { opacity: 0 }
                : {
                    opacity: 0,
                    y: -30,
                    transition: { duration: 0.25, ease: [0.215, 0.61, 0.355, 1] },
                  }
            }
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-10 flex flex-col items-center justify-center gap-8"
          >
            {/* Progress dots — clickable to go back */}
            <div className="flex gap-2">
              {[0, 1, 2].map((i) => {
                const canGoBack = i < step;
                return (
                  <motion.button
                    key={i}
                    onClick={() => handleDotClick(i)}
                    disabled={!canGoBack}
                    className="h-1.5 rounded-full"
                    style={{
                      cursor: canGoBack ? "pointer" : "default",
                    }}
                    animate={{
                      width: step > i ? 24 : 6,
                      backgroundColor:
                        picked[i] ??
                        (step === i
                          ? "rgba(255,255,255,0.4)"
                          : "rgba(255,255,255,0.1)"),
                    }}
                    whileHover={
                      canGoBack && !shouldReduceMotion
                        ? { opacity: 0.7 }
                        : {}
                    }
                    transition={
                      shouldReduceMotion
                        ? { duration: 0 }
                        : { duration: 0.3, ease: [0.215, 0.61, 0.355, 1] }
                    }
                  />
                );
              })}
            </div>

            {/* Prompt card */}
            <div className="w-[min(440px,calc(100vw-3rem))]">
              <motion.div
                layout
                transition={shouldReduceMotion ? { duration: 0 } : CARD.spring}
                className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
              >
                <AnimatePresence initial={false} mode="wait">
                  <motion.div
                    key={STEPS[step].key}
                    {...stepAnim}
                    className="px-5 py-4 font-sans text-sm leading-relaxed text-zinc-400"
                  >
                    {STEPS[step].prompt}
                  </motion.div>
                </AnimatePresence>
              </motion.div>
            </div>

            {/* Color wheel */}
            <ColorWheel
              picked={picked}
              currentStep={step}
              onPick={handlePick}
              shouldReduceMotion={shouldReduceMotion}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
