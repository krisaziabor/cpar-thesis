"use client";

import React, { useState } from "react";
import GradientSVG from "@/components/GradientSVG";

// ── Suggested palette ─────────────────────────────────────────────────────────

const PALETTE = [
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

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PaletteLabPage() {
  const [colors, setColors] = useState<[string, string, string]>([
    "#C73C28",
    "#2A86A2",
    "#7238A0",
  ]);
  const [seed, setSeed] = useState("Kanon");
  const [activeSlot, setActiveSlot] = useState<0 | 1 | 2>(0);
  const [copied, setCopied] = useState<string | null>(null);

  function setColor(index: 0 | 1 | 2, value: string) {
    const next = [...colors] as [string, string, string];
    next[index] = value;
    setColors(next);
  }

  function isValidHex(hex: string) {
    return /^#[0-9A-Fa-f]{6}$/.test(hex);
  }

  function handleSwatchClick(hex: string) {
    setColor(activeSlot, hex);
    const next = ((activeSlot + 1) % 3) as 0 | 1 | 2;
    setActiveSlot(next);
  }

  async function handleHexClick(hex: string) {
    await navigator.clipboard.writeText(hex);
    setCopied(hex);
    setTimeout(() => setCopied(null), 1200);
  }

  const allValid = colors.every(isValidHex);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-8 font-mono">
      <div className="max-w-3xl mx-auto space-y-10">

        {/* Header */}
        <div>
          <h1 className="text-lg font-medium tracking-tight">Palette Lab</h1>
          <p className="text-sm text-white/40 mt-1">
            Test gradient combinations for the avatar system.
          </p>
        </div>

        {/* Controls */}
        <div className="space-y-6">

          {/* Color slots */}
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wider mb-3">
              Colors — click a slot to make it active, then pick a swatch
            </p>
            <div className="flex gap-3">
              {([0, 1, 2] as const).map((i) => (
                <button
                  key={i}
                  onClick={() => setActiveSlot(i)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                    activeSlot === i
                      ? "border-white/40 bg-white/8"
                      : "border-white/10 bg-white/4"
                  }`}
                >
                  <div
                    className="w-5 h-5 rounded-full border border-white/20 shrink-0"
                    style={{ background: colors[i] }}
                  />
                  <input
                    type="text"
                    value={colors[i]}
                    maxLength={7}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v.length <= 7) setColor(i, v);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveSlot(i);
                    }}
                    className="bg-transparent text-sm w-20 outline-none text-white/80 placeholder-white/20"
                    placeholder="#000000"
                    spellCheck={false}
                  />
                  <input
                    type="color"
                    value={isValidHex(colors[i]) ? colors[i] : "#000000"}
                    onChange={(e) => setColor(i, e.target.value)}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveSlot(i);
                    }}
                    className="w-5 h-5 rounded cursor-pointer opacity-50 hover:opacity-100 transition-opacity"
                    style={{ background: "none", border: "none" }}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Seed */}
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wider mb-3">
              Seed name — changes shape positions, not colors
            </p>
            <input
              type="text"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm outline-none w-48 text-white/80"
              placeholder="e.g. user@yale.edu"
            />
          </div>
        </div>

        {/* Preview */}
        {allValid && (
          <div className="space-y-6">
            <p className="text-xs text-white/40 uppercase tracking-wider">Preview</p>

            {/* Sizes */}
            <div className="flex items-end gap-6">
              {[24, 40, 64, 120].map((s) => (
                <div key={s} className="flex flex-col items-center gap-2">
                  <GradientSVG colors={colors} seed={seed} size={s} round />
                  <span className="text-xs text-white/20">{s}px</span>
                </div>
              ))}
            </div>

            {/* Ambient panel — simulates the background animation context */}
            <div>
              <p className="text-xs text-white/20 mb-2">Ambient / background context</p>
              <div className="relative w-full h-48 rounded-xl overflow-hidden bg-[#111]">
                {/* Same SVG algorithm, scaled up and blurred — consistent with icon rendering */}
                <div
                  className="absolute"
                  style={{
                    inset: "-60px",
                    filter: "blur(32px) saturate(1.2)",
                    opacity: 0.75,
                  }}
                >
                  <GradientSVG colors={colors} seed={seed} size={400} round />
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <GradientSVG colors={colors} seed={seed} size={64} round />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Palette swatches */}
        <div className="space-y-3">
          <p className="text-xs text-white/40 uppercase tracking-wider">
            Suggested palette — click a swatch to set active slot, right-click hex to copy
          </p>
          <div className="grid grid-cols-6 gap-2">
            {PALETTE.map(({ name, hex }) => (
              <div key={hex} className="flex flex-col gap-1">
                <button
                  onClick={() => handleSwatchClick(hex)}
                  className={`w-full aspect-square rounded-lg border-2 transition-all hover:scale-105 active:scale-95 ${
                    colors[activeSlot] === hex
                      ? "border-white/60 scale-105"
                      : "border-transparent"
                  }`}
                  style={{ background: hex }}
                  title={`Set slot ${activeSlot + 1} to ${name} (${hex})`}
                />
                <button
                  onClick={() => handleHexClick(hex)}
                  className="text-[10px] text-white/30 hover:text-white/60 transition-colors text-left truncate"
                  title="Copy hex"
                >
                  {copied === hex ? "copied" : hex}
                </button>
                <span className="text-[10px] text-white/20 truncate">{name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Combination grid */}
        <div className="space-y-3">
          <p className="text-xs text-white/40 uppercase tracking-wider">
            Spot-check combinations — same colors, different seeds
          </p>
          <div className="flex flex-wrap gap-3">
            {["Alice", "Bob", "Carol", "Dave", "Eve", "Frank", "Grace", "Hana"].map(
              (name) => (
                <div key={name} className="flex flex-col items-center gap-1">
                  {allValid && (
                    <GradientSVG colors={colors} seed={name} size={48} round />
                  )}
                  <span className="text-[10px] text-white/20">{name}</span>
                </div>
              )
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
