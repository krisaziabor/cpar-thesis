"use client";

import type { PanelState, SynergyState, DebugEvent } from "@/lib/installation/playback";

interface Props {
  panels: PanelState[];
  synergy: SynergyState | null;
  bagRemaining: number;
  bagTotal: number;
  events: DebugEvent[];
  masterTime: number; // seconds since loop started
  audioCtxState: string;
}

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function DebugOverlay({
  panels,
  synergy,
  bagRemaining,
  bagTotal,
  events,
  masterTime,
  audioCtxState,
}: Props) {
  const panelLabels = ["LEFT", "CENTER", "RIGHT"];

  return (
    <div
      className="fixed inset-0 z-[9999] pointer-events-none"
      style={{ fontFamily: "monospace" }}
    >
      {/* Semi-transparent backdrop on top half */}
      <div className="absolute top-0 left-0 right-0 bg-black/80 text-white text-xs p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/20 pb-2">
          <span className="font-bold text-sm">KANON INSTALLATION — DEBUG</span>
          <span className="text-white/60">
            {fmt(masterTime * 1000)} · AudioCtx: <span className={audioCtxState === "running" ? "text-green-400" : "text-red-400"}>{audioCtxState}</span>
          </span>
        </div>

        {/* Panel states */}
        <div className="grid grid-cols-3 gap-4">
          {panels.map((panel, i) => (
            <div key={i} className="space-y-0.5">
              <div className="text-white/50 uppercase tracking-wider text-[10px]">{panelLabels[i]}</div>
              <div>
                Phase:{" "}
                <span className="text-yellow-300">{panel.phase}</span>
              </div>
              <div className="text-white/70 truncate">
                {panel.record ? `"${panel.record.title.slice(0, 30)}"` : "—"}
              </div>
              <div className="text-white/50 text-[10px]">
                {panel.record ? panel.record.id.slice(0, 8) : ""}
              </div>
            </div>
          ))}
        </div>

        {/* Bag + synergy */}
        <div className="flex gap-8 text-white/70 border-t border-white/20 pt-2">
          <span>
            Bag: <span className="text-white">{bagRemaining}</span>/{bagTotal}
          </span>
          <span>
            Synergy:{" "}
            <span className={synergy && synergy.status !== "none" ? "text-pink-400" : "text-white/40"}>
              {synergy ? `${synergy.status} (${synergy.records.length} records)` : "none"}
            </span>
          </span>
        </div>

        {/* Recent events */}
        <div className="border-t border-white/20 pt-2">
          <div className="text-white/50 text-[10px] uppercase tracking-wider mb-1">Last events</div>
          <div className="space-y-0.5 max-h-24 overflow-hidden">
            {events.slice(-20).reverse().map((ev, i) => (
              <div key={i} className="flex gap-2 text-[10px]">
                <span className="text-white/40 shrink-0">{new Date(ev.ts).toISOString().slice(11, 19)}</span>
                <span className="text-white/80">{ev.message}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="text-white/30 text-[10px]">Press D to hide · Press R to reset</div>
      </div>
    </div>
  );
}
