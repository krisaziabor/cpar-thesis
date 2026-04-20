"use client";

import { useRef, useEffect, useCallback } from "react";

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

type WaveLayer = {
  colorIndex: 0 | 1 | 2;
  phaseOffset: number;
  speed: number;
  cycles: number;
  riseScale: number;
  baseAlpha: number;
};

const WAVE_LAYERS: WaveLayer[] = [
  { colorIndex: 0, phaseOffset: 0,             speed: 0.00055, cycles: 1.2, riseScale: 1.00, baseAlpha: 0.90 },
  { colorIndex: 1, phaseOffset: Math.PI * 0.7, speed: 0.00040, cycles: 1.6, riseScale: 0.88, baseAlpha: 0.80 },
  { colorIndex: 2, phaseOffset: Math.PI * 1.4, speed: 0.00065, cycles: 0.9, riseScale: 0.75, baseAlpha: 0.70 },
];

const MAX_RISE_FRACTION = 0.78;
const BASE_RISE_FRACTION = 0.04;

/**
 * Blurred sine-wave gradient canvas — the same visualization used in the
 * audio-wave lab. `active` drives energy from the AnalyserNode; when false
 * it falls back to a slow idle breath animation.
 */
export default function RecordingWave({
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

    let targetEnergy = 0;
    if (analyser && active) {
      const buf = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i];
      targetEnergy = sum / buf.length / 255;
    } else {
      const t = (Date.now() - startTimeRef.current) / 4000;
      targetEnergy = 0.04 + 0.02 * Math.sin(t * Math.PI * 2);
    }

    const smoothAlpha = active ? 0.15 : 0.03;
    smoothedEnergyRef.current =
      smoothedEnergyRef.current * (1 - smoothAlpha) + targetEnergy * smoothAlpha;

    const energy = smoothedEnergyRef.current;
    const now = Date.now() - startTimeRef.current;
    const rgb = colors.map(hexToRgb);

    for (const layer of WAVE_LAYERS) {
      const [r, g, b] = rgb[layer.colorIndex];
      const phase = layer.phaseOffset + now * layer.speed;
      const rise = H * (BASE_RISE_FRACTION + energy * MAX_RISE_FRACTION * layer.riseScale);
      const rippleAmp = H * 0.025 + energy * H * 0.04;

      ctx.beginPath();
      ctx.moveTo(0, H);
      const steps = 120;
      for (let s = 0; s <= steps; s++) {
        const x = (s / steps) * W;
        const angle = (s / steps) * Math.PI * 2 * layer.cycles + phase;
        const y = (H - rise) + rippleAmp * Math.sin(angle);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H);
      ctx.closePath();

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
    <div className="absolute inset-0 overflow-hidden">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ filter: "blur(32px) saturate(1.4)" }}
      />
    </div>
  );
}
