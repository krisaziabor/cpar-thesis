"use client";

import { useEffect, useRef } from "react";
import { RECORDER_PULSE_PERIOD_MS } from "@/lib/installation/playback";

interface Props {
  name: string;
}

/** Curator name that pulses in opacity at RECORDER_PULSE_PERIOD_MS during testimony. */
export function RecorderName({ name }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const rafRef = useRef(0);
  const startRef = useRef(performance.now());

  useEffect(() => {
    startRef.current = performance.now();
    const period = RECORDER_PULSE_PERIOD_MS;

    function tick() {
      const el = ref.current;
      if (!el) return;
      const elapsed = performance.now() - startRef.current;
      // Smooth sine oscillation between 0.4 and 1.0
      const t = (elapsed % period) / period;
      const opacity = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(2 * Math.PI * t - Math.PI / 2));
      el.style.opacity = String(opacity.toFixed(3));
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [name]);

  return (
    <span
      ref={ref}
      style={{ fontFamily: '"Lector", serif', opacity: 0.4 }}
      className="text-xs text-zinc-500 tracking-wide"
    >
      {name}
    </span>
  );
}
