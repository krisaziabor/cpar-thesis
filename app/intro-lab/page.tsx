"use client";

import { useState } from "react";
import FirstTimeIntroOverlay from "@/components/FirstTimeIntroOverlay";
import { AdminOnlyLabGate } from "@/components/AdminOnlyLabGate";

type Mode = "fullscreen" | "card" | "closed";

export default function IntroLabPage() {
  const [mode, setMode] = useState<Mode>("closed");

  return (
    <AdminOnlyLabGate>
    <div className="min-h-screen bg-black">
      {/* Faux graph dots in the background — stands in for the real graph
          so the card variant has something meaningful behind it. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.18) 1.5px, transparent 1.5px)",
          backgroundSize: "28px 28px",
        }}
      />

      {/* Lab controls */}
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-4 text-center font-sans text-sm text-white/60">
        <p className="font-lector text-2xl tracking-tight text-white/90">
          Intro overlay lab
        </p>
        <p className="max-w-sm text-xs text-white/40">
          Four-slide feature intro. Try the fullscreen modal (post-onboarding)
          or the compact card that docks in the bottom-right.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMode("fullscreen")}
            className={`rounded-full px-4 py-1.5 text-xs transition-colors duration-150 ease-out ${
              mode === "fullscreen"
                ? "bg-white text-black"
                : "border border-white/20 text-white/70 hover:border-white/40 hover:text-white/90"
            }`}
          >
            Fullscreen
          </button>
          <button
            type="button"
            onClick={() => setMode("card")}
            className={`rounded-full px-4 py-1.5 text-xs transition-colors duration-150 ease-out ${
              mode === "card"
                ? "bg-white text-black"
                : "border border-white/20 text-white/70 hover:border-white/40 hover:text-white/90"
            }`}
          >
            Corner card
          </button>
          <button
            type="button"
            onClick={() => setMode("closed")}
            className="rounded-full border border-white/20 px-4 py-1.5 text-xs text-white/70 transition-colors duration-150 ease-out hover:border-white/40 hover:text-white/90"
          >
            Close
          </button>
        </div>
      </div>

      <FirstTimeIntroOverlay
        variant="fullscreen"
        open={mode === "fullscreen"}
        onClose={() => setMode("closed")}
      />
      <FirstTimeIntroOverlay
        variant="card"
        open={mode === "card"}
        onClose={() => setMode("closed")}
      />
    </div>
    </AdminOnlyLabGate>
  );
}
