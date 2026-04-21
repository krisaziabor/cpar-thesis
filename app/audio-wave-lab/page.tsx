"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { AdminOnlyLabGate } from "@/components/AdminOnlyLabGate";

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

// ── Abstract wave canvas ──────────────────────────────────────────────────────
//
// Instead of bars, this draws 3 overlapping soft filled sine-wave bands —
// one per gradient color — whose amplitude rises and falls with mic energy.
// The canvas has a heavy CSS blur applied so no edge or shape is visible,
// only a flowing gradient light.

// Each layer rises from the bottom. The top edge is a sine wave.
// Energy controls how high each layer rises — capped at 55% of canvas height.
type WaveLayer = {
  colorIndex: 0 | 1 | 2;
  phaseOffset: number; // radians
  speed: number;       // radians per ms
  cycles: number;      // sine cycles across width
  riseScale: number;   // multiplier on shared energy rise (slight layer variation)
  baseAlpha: number;
};

const WAVE_LAYERS: WaveLayer[] = [
  { colorIndex: 0, phaseOffset: 0,             speed: 0.00055, cycles: 1.2, riseScale: 1.00, baseAlpha: 0.90 },
  { colorIndex: 1, phaseOffset: Math.PI * 0.7, speed: 0.00040, cycles: 1.6, riseScale: 0.88, baseAlpha: 0.80 },
  { colorIndex: 2, phaseOffset: Math.PI * 1.4, speed: 0.00065, cycles: 0.9, riseScale: 0.75, baseAlpha: 0.70 },
];

// Gradient never rises above this fraction of canvas height from the bottom
const MAX_RISE_FRACTION = 0.78;
// Always a thin glow sitting at the very bottom even at silence
const BASE_RISE_FRACTION = 0.04;

function AbstractWave({
  analyser,
  colors,
  active,
}: {
  analyser: AnalyserNode | null;
  colors: [string, string, string];
  active: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const smoothedEnergyRef = useRef(0);
  const startTimeRef = useRef(Date.now());

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.offsetWidth;
    const H = canvas.offsetHeight;
    ctx.clearRect(0, 0, W, H);

    // ── Compute energy (0..1) ─────────────────────────────────────────────
    let targetEnergy = 0;
    if (analyser && active) {
      const buf = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i];
      targetEnergy = sum / buf.length / 255;
    } else {
      // Idle: very slow, very low breath
      const t = (Date.now() - startTimeRef.current) / 4000;
      targetEnergy = 0.04 + 0.02 * Math.sin(t * Math.PI * 2);
    }

    const smoothAlpha = active ? 0.15 : 0.03;
    smoothedEnergyRef.current =
      smoothedEnergyRef.current * (1 - smoothAlpha) + targetEnergy * smoothAlpha;

    const energy = smoothedEnergyRef.current;
    const now = Date.now() - startTimeRef.current;

    // ── Draw each wave layer ──────────────────────────────────────────────
    const rgb = colors.map(hexToRgb);

    for (const layer of WAVE_LAYERS) {
      const [r, g, b] = rgb[layer.colorIndex];
      const phase = layer.phaseOffset + now * layer.speed;

      // How high this layer rises from the bottom (in px)
      const rise = H * (BASE_RISE_FRACTION + energy * MAX_RISE_FRACTION * layer.riseScale);
      // Small sine ripple on the top edge
      const rippleAmp = H * 0.025 + energy * H * 0.04;

      // Draw bottom-anchored filled shape
      ctx.beginPath();
      ctx.moveTo(0, H); // bottom-left
      const steps = 120;
      for (let s = 0; s <= steps; s++) {
        const x = (s / steps) * W;
        const angle = (s / steps) * Math.PI * 2 * layer.cycles + phase;
        // Top edge: canvas bottom minus rise, plus ripple
        const y = (H - rise) + rippleAmp * Math.sin(angle);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H); // bottom-right
      ctx.closePath();

      // Horizontal gradient: fades in from left edge, fades out at right edge
      const grad = ctx.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0,    `rgba(${r},${g},${b},0)`);
      grad.addColorStop(0.15, `rgba(${r},${g},${b},${layer.baseAlpha})`);
      grad.addColorStop(0.85, `rgba(${r},${g},${b},${layer.baseAlpha})`);
      grad.addColorStop(1,    `rgba(${r},${g},${b},0)`);

      ctx.fillStyle = grad;
      ctx.fill();
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [analyser, colors, active]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  // Scale canvas to device pixel ratio
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio ?? 1;
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(dpr, dpr);
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  return (
    // overflow-hidden clips the blur so it doesn't bleed outside the panel
    <div className="absolute inset-0 overflow-hidden">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ filter: "blur(32px) saturate(1.4)" }}
      />
    </div>
  );
}

// ── Palette ───────────────────────────────────────────────────────────────────

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

export default function AudioWaveLabPage() {
  const [colors, setColors] = useState<[string, string, string]>([
    "#C73C28",
    "#2A86A2",
    "#7238A0",
  ]);
  const [activeSlot, setActiveSlot] = useState<0 | 1 | 2>(0);

  const [recording, setRecording] = useState(false);
  const [micError, setMicError] = useState("");
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Re-render trigger so AbstractWave picks up the live analyser ref
  const [, forceUpdate] = useState(0);

  function setColor(index: 0 | 1 | 2, value: string) {
    const next = [...colors] as [string, string, string];
    next[index] = value;
    setColors(next);
  }

  async function startRecording() {
    setMicError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      analyserRef.current = analyser;

      setRecording(true);
      forceUpdate((n) => n + 1);
    } catch {
      setMicError("Microphone access is required. Check browser permissions.");
    }
  }

  function stopRecording() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close();
    analyserRef.current = null;
    setRecording(false);
    forceUpdate((n) => n + 1);
  }

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close();
    };
  }, []);

  function isValidHex(hex: string) {
    return /^#[0-9A-Fa-f]{6}$/.test(hex);
  }

  const allValid = colors.every(isValidHex);

  return (
    <AdminOnlyLabGate>
    <div className="min-h-screen bg-black text-white p-8 font-mono">
      <div className="max-w-3xl mx-auto space-y-10">

        {/* Header */}
        <div>
          <h1 className="text-lg font-medium tracking-tight">Audio Wave Lab</h1>
          <p className="text-sm text-white/40 mt-1">
            Abstract gradient breathing driven by real microphone input.
          </p>
        </div>

        {/* Main preview */}
        <div className="relative w-full h-[480px] rounded-2xl overflow-hidden bg-black">
          {/* Abstract wave — rises from the bottom only */}
          {allValid && (
            <AbstractWave
              analyser={analyserRef.current}
              colors={colors}
              active={recording}
            />
          )}

          {/* Mic button — centered, sits above the wave */}
          <div className="absolute inset-0 flex items-center justify-center">
            {!recording ? (
              <button
                onClick={startRecording}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-black/60 backdrop-blur-sm text-white/60 hover:text-white hover:border-white/40 transition-colors"
                aria-label="Start recording"
              >
                <MicIcon />
              </button>
            ) : (
              <button
                onClick={stopRecording}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-black/60 backdrop-blur-sm text-white/60 hover:text-white hover:border-white/40 transition-colors"
                aria-label="Stop recording"
              >
                <StopIcon />
              </button>
            )}
          </div>
        </div>

        {micError && <p className="text-xs text-red-400">{micError}</p>}

        <p className="text-xs text-white/25">
          {recording ? "● recording" : "○ idle"}
        </p>

        {/* Color controls */}
        <div className="space-y-4">
          <p className="text-xs text-white/40 uppercase tracking-wider">
            Gradient colors — click slot then pick a swatch
          </p>
          <div className="flex gap-3">
            {([0, 1, 2] as const).map((i) => (
              <button
                key={i}
                onClick={() => setActiveSlot(i)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                  activeSlot === i
                    ? "border-white/30 bg-white/6"
                    : "border-white/8 bg-white/2"
                }`}
              >
                <div
                  className="w-4 h-4 rounded-full border border-white/20 shrink-0"
                  style={{ background: colors[i] }}
                />
                <input
                  type="text"
                  value={colors[i]}
                  maxLength={7}
                  onChange={(e) => {
                    if (e.target.value.length <= 7) setColor(i, e.target.value);
                  }}
                  onClick={(e) => { e.stopPropagation(); setActiveSlot(i); }}
                  className="bg-transparent text-xs w-16 outline-none text-white/60"
                  spellCheck={false}
                />
                <input
                  type="color"
                  value={isValidHex(colors[i]) ? colors[i] : "#000000"}
                  onChange={(e) => setColor(i, e.target.value)}
                  onClick={(e) => { e.stopPropagation(); setActiveSlot(i); }}
                  className="w-4 h-4 rounded cursor-pointer opacity-40 hover:opacity-100 transition-opacity"
                />
              </button>
            ))}
          </div>

          <div className="grid grid-cols-12 gap-1.5">
            {PALETTE.map(({ name, hex }) => (
              <button
                key={hex}
                onClick={() => {
                  setColor(activeSlot, hex);
                  setActiveSlot(((activeSlot + 1) % 3) as 0 | 1 | 2);
                }}
                className={`aspect-square rounded-md border-2 transition-all hover:scale-105 active:scale-95 ${
                  colors[activeSlot] === hex ? "border-white/60" : "border-transparent"
                }`}
                style={{ background: hex }}
                title={name}
              />
            ))}
          </div>
        </div>

      </div>
    </div>
    </AdminOnlyLabGate>
  );
}

function MicIcon() {
  return (
    <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" viewBox="0 0 24 24">
      <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 19v3M9 22h6" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
      <rect x="5" y="5" width="14" height="14" rx="2" />
    </svg>
  );
}
