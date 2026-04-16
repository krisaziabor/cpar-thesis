"use client";

import { motion } from "framer-motion";

/* ── Palette ────────────────────────────────────────────────────────────── */

export const SWATCHES = [
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
] as const;

/* ── Config ─────────────────────────────────────────────────────────────── */

export const WHEEL_CONFIG = {
  diameter: 320,
  ringWidth: 56,
  gapDeg: 1,
  hoverScale: 1.06,
  tapScale: 0.94,
  selectionSpring: { type: "spring" as const, duration: 0.35, bounce: 0.2 },
};

/* ── Arc path utility ───────────────────────────────────────────────────── */

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

/* ── Component ──────────────────────────────────────────────────────────── */

export default function ColorWheel({
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
  const W = WHEEL_CONFIG;
  const count = SWATCHES.length;
  const segDeg = 360 / count;
  const outerR = W.diameter / 2;
  const innerR = outerR - W.ringWidth;
  const cx = outerR;
  const cy = outerR;

  return (
    <div
      className="relative"
      style={{ width: W.diameter, height: W.diameter }}
    >
      <svg
        viewBox={`0 0 ${W.diameter} ${W.diameter}`}
        width={W.diameter}
        height={W.diameter}
        className="overflow-visible"
      >
        {SWATCHES.map(({ name, hex }, i) => {
          const startDeg = i * segDeg + W.gapDeg / 2;
          const endDeg = (i + 1) * segDeg - W.gapDeg / 2;
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
                    : { scale: W.hoverScale }
                }
                whileTap={
                  shouldReduceMotion || alreadyUsed
                    ? {}
                    : { scale: W.tapScale }
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
                      : W.selectionSpring
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
