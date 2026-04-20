"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";

/** Ease-out for scroll progress (animations.dev-style; avoids linear “on/off”). */
function easeOutScroll(t: number): number {
  return 1 - (1 - t) ** 2.35;
}

const BLUR_MASK_BOTTOM = `linear-gradient(to bottom, hsla(0,0%,100%,0) 0%, hsla(0,0%,100%,0) 10%, hsla(0,0%,100%,0.06) 24%, hsla(0,0%,100%,0.28) 44%, hsla(0,0%,100%,0.62) 64%, hsla(0,0%,100%,0.9) 82%, hsl(0,0%,100%) 100%)`;

const DIM_MASK_BOTTOM = `linear-gradient(to bottom, hsla(0,0%,100%,0) 0%, hsla(0,0%,100%,0) 6%, hsla(0,0%,100%,0.18) 32%, hsla(0,0%,100%,0.55) 58%, hsla(0,0%,100%,0.92) 80%, hsl(0,0%,100%) 100%)`;

/** Mirrored masks for the top band (strong near viewport top). */
const BLUR_MASK_TOP = `linear-gradient(to bottom, hsl(0,0%,100%) 0%, hsla(0,0%,100%,0.9) 18%, hsla(0,0%,100%,0.62) 36%, hsla(0,0%,100%,0.28) 56%, hsla(0,0%,100%,0.06) 76%, hsla(0,0%,100%,0) 90%, hsla(0,0%,100%,0) 100%)`;

const DIM_MASK_TOP = `linear-gradient(to bottom, hsl(0,0%,100%) 0%, hsla(0,0%,100%,0.92) 20%, hsla(0,0%,100%,0.55) 42%, hsla(0,0%,100%,0.18) 68%, hsla(0,0%,100%,0) 94%, hsla(0,0%,100%,0) 100%)`;

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
          <div
            className="absolute inset-0 bg-white/[0.03] [-webkit-backdrop-filter:blur(14px)] [backdrop-filter:blur(14px)]"
            style={{
              maskImage: BLUR_MASK_TOP,
              WebkitMaskImage: BLUR_MASK_TOP,
            }}
          />
          <div
            className="absolute inset-0 bg-gradient-to-b from-black via-black/35 to-transparent"
            style={{
              maskImage: DIM_MASK_TOP,
              WebkitMaskImage: DIM_MASK_TOP,
            }}
          />
        </div>
      )}

      {bottom && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 bottom-0 z-10 h-[min(42vh,26rem)]"
        >
          <div
            className="absolute inset-0 bg-white/[0.03] [-webkit-backdrop-filter:blur(14px)] [backdrop-filter:blur(14px)]"
            style={{
              maskImage: BLUR_MASK_BOTTOM,
              WebkitMaskImage: BLUR_MASK_BOTTOM,
            }}
          />
          <div
            className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent"
            style={{
              maskImage: DIM_MASK_BOTTOM,
              WebkitMaskImage: DIM_MASK_BOTTOM,
            }}
          />
        </div>
      )}
    </>
  );
}
