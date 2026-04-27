"use client";

import { useState, useEffect, useCallback } from "react";
import { EntranceAnimation } from "@/components/EntranceAnimation/EntranceAnimation";

const RESTING_NONE = { count: 0, sizeRange: [14, 14] } as const;

type BlankPhase = { kind: "blank"; durationMs: number };
type FlashPhase = { kind: "flash"; slotCount: number; instanceSize: number; cycleDurationMs: number };
type Phase = BlankPhase | FlashPhase;

// Alternates between silence and two flash densities.
// "sparse"  = 3 instances at full size (14% container width)
// "dense"   = 5 instances at 80% size  (11.2% container width)
const SEQUENCE: Phase[] = [
  { kind: "blank",  durationMs: 1200 },
  { kind: "flash",  slotCount: 3, instanceSize: 14,   cycleDurationMs: 2800 },
  { kind: "blank",  durationMs: 1800 },
  { kind: "flash",  slotCount: 5, instanceSize: 11.2, cycleDurationMs: 3400 },
  { kind: "blank",  durationMs: 1000 },
  { kind: "flash",  slotCount: 3, instanceSize: 14,   cycleDurationMs: 2800 },
  { kind: "blank",  durationMs: 2400 },
  { kind: "flash",  slotCount: 5, instanceSize: 11.2, cycleDurationMs: 3400 },
  { kind: "blank",  durationMs: 1500 },
];

export default function InstallationTitlePage() {
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [animKey, setAnimKey] = useState(0);

  const phase = SEQUENCE[phaseIdx % SEQUENCE.length];

  const advance = useCallback(() => {
    setPhaseIdx((p) => p + 1);
    setAnimKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (phase.kind !== "blank") return;
    const timer = setTimeout(advance, phase.durationMs);
    return () => clearTimeout(timer);
  }, [phaseIdx, advance, phase]);

  return (
    <div className="relative flex h-dvh w-full items-center justify-center overflow-hidden bg-white">
      <h1 className="font-lector tracking-tight text-black [font-size:clamp(8rem,28vw,28rem)] leading-none select-none">
        Kanon
      </h1>

      <div className="pointer-events-none absolute inset-0 z-10">
        {phase.kind === "flash" && (
          <EntranceAnimation
            key={animKey}
            text="Kanon"
            fontOverride="DieGrotesk"
            slotCount={phase.slotCount}
            holdMin={200}
            holdMax={700}
            cycleDurationMs={phase.cycleDurationMs}
            instanceSize={phase.instanceSize}
            resting={RESTING_NONE}
            color="black"
            easing="sharp"
            onComplete={advance}
            className="absolute inset-0"
          />
        )}
      </div>
    </div>
  );
}
