"use client";

import { useEffect, useState } from "react";
import { useDialKit } from "dialkit";
import { EntranceAnimation } from "@/components/EntranceAnimation/EntranceAnimation";
import type { EasingPreset } from "@/components/EntranceAnimation/storyboard";

const TITLES = ["Panopticon", "Blue Moon Safari", "Crooked", "Kanon"];

type EntranceParams = {
  title: string;
  slotCount: number;
  holdMin: number;
  holdMax: number;
  cycleDurationMs: number;
  easing: string;
  resting: { count: number; sizeMin: number; sizeMax: number };
  replay: unknown;
};

export default function TestEntrancePage() {
  const [replayKey, setReplayKey] = useState(0);
  const [done, setDone] = useState(false);
  const [dialKitVisible, setDialKitVisible] = useState(true);
  const [fontsLoaded, setFontsLoaded] = useState(false);

  const params = useDialKit(
    "Entrance",
    {
      title: { type: "select", options: TITLES, default: TITLES[0] },
      slotCount: [4, 1, 8],
      holdMin: [300, 80, 1500],
      holdMax: [700, 80, 2000],
      cycleDurationMs: [7000, 2000, 20000],
      easing: {
        type: "select",
        options: ["sharp", "smooth", "snappy"],
        default: "sharp",
      },
      resting: {
        count: [1, 0, 1],
        sizeMin: [14, 5, 40],
        sizeMax: [14, 5, 40],
      },
      replay: { type: "action", label: "Replay" },
    },
    {
      onAction: (action) => {
        if (action === "replay") {
          setDone(false);
          setReplayKey((k) => k + 1);
        }
      },
    },
  ) as EntranceParams;

  useEffect(() => {
    if (typeof document === "undefined") return;
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) setFontsLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.key === "h" || e.key === "H") {
        setDialKitVisible((v) => !v);
      } else if (e.key === " ") {
        e.preventDefault();
        setDone(false);
        setReplayKey((k) => k + 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (dialKitVisible) {
      document.body.classList.remove("dialkit-hidden");
    } else {
      document.body.classList.add("dialkit-hidden");
    }
    return () => { document.body.classList.remove("dialkit-hidden"); };
  }, [dialKitVisible]);

  const sizeRange: readonly [number, number] = [
    params.resting.sizeMin,
    params.resting.sizeMax,
  ];

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#EDEDED]">
      <style>{`body.dialkit-hidden .dialkit-root { display: none !important; }`}</style>

      <EntranceAnimation
        text={params.title}
        slotCount={params.slotCount}
        holdMin={params.holdMin}
        holdMax={params.holdMax}
        cycleDurationMs={params.cycleDurationMs}
        easing={params.easing as EasingPreset}
        resting={{ count: params.resting.count, sizeRange }}
        replayKey={replayKey}
        onComplete={() => setDone(true)}
      />

      <button
        type="button"
        onClick={() => {
          setDone(false);
          setReplayKey((k) => k + 1);
        }}
        className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-full border border-black/20 bg-white/60 px-4 py-2 text-xs uppercase tracking-wider text-black/60 backdrop-blur-sm transition-colors hover:border-black/40 hover:text-black"
      >
        Replay
      </button>

      <div className="pointer-events-none absolute left-4 top-4 space-y-1 font-mono text-xs text-black/30">
        <div>{fontsLoaded ? "● fonts ready" : "○ loading fonts…"}</div>
        <div>{done ? "● settled" : "○ animating"}</div>
        <div className="text-black/20">[h] hide panel · [space] replay</div>
      </div>
    </div>
  );
}
