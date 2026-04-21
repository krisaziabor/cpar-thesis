"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";

/** Ease-out for scroll progress (animations.dev-style; avoids linear “on/off”). */
function easeOutScroll(t: number): number {
  return 1 - (1 - t) ** 2.35;
}


type Props = {
  /** Frosted + dim strip at the bottom of the viewport */
  bottom?: boolean;
  /** Same at top; opacity follows scroll (0 = hidden, seamless as user scrolls down) */
  top?: boolean;
};

export default function ViewportScrollFades({ bottom = true, top = true }: Props) {
  const shouldReduceMotion = useReducedMotion();
  const [topStrength, setTopStrength] = useState(0);

  useEffect(() => {
    if (!top) return;
    let raf = 0;
    const rangePx = shouldReduceMotion ? 90 : 220;

    const measure = () => {
      const y = window.scrollY ?? document.documentElement.scrollTop;
      const raw = Math.min(1, y / rangePx);
      const eased = shouldReduceMotion ? raw : easeOutScroll(raw);
      setTopStrength(eased);
    };

    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, [top, shouldReduceMotion]);

  return (
    <>
      {top && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 top-0 z-10"
          style={{
            height: "min(42vh, 26rem)",
            opacity: topStrength,
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-black via-black/35 to-transparent" />
        </div>
      )}

      {bottom && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 bottom-0 z-10 h-[min(42vh,26rem)]"
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />
        </div>
      )}
    </>
  );
}
