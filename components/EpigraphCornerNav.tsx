"use client";

import Link from "next/link";
import { useEffect, useState, type RefObject } from "react";
import { useReducedMotion } from "framer-motion";

type Props = {
  headerRef: RefObject<HTMLElement | null>;
};

export default function EpigraphCornerNav({ headerRef }: Props) {
  const shouldReduceMotion = useReducedMotion();
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowBackToTop(!entry.isIntersecting);
      },
      { root: null, rootMargin: "0px", threshold: 0 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [headerRef]);

  const goTop = () => {
    window.scrollTo({
      top: 0,
      behavior: shouldReduceMotion ? "auto" : "smooth",
    });
  };

  const linkCls =
    "pointer-events-auto font-sans text-sm tracking-tight text-white/90 transition-colors duration-150 ease-out hover:text-white";

  const backBtnBase =
    "pointer-events-auto origin-bottom-right border-0 bg-transparent p-0 text-right font-sans text-sm tracking-tight text-white/90 hover:text-white";

  /**
   * Enter: 300ms ease-out-expo (soft flow in). Exit: ~25% faster + ease-out-quad so it
   * doesn’t “hang” on the last frames (animations.dev: exit can be quicker than enter).
   */
  const backMotion = shouldReduceMotion
    ? ""
    : [
        "transition-[opacity,transform]",
        "data-[visible=true]:duration-300 data-[visible=true]:[transition-timing-function:cubic-bezier(0.19,1,0.22,1)]",
        "data-[visible=false]:duration-220 data-[visible=false]:[transition-timing-function:cubic-bezier(0.25,0.46,0.45,0.94)]",
      ].join(" ");

  return (
    <div
      className="pointer-events-none fixed bottom-6 right-6 z-30 flex flex-col items-end gap-3"
      aria-label="Page shortcuts"
    >
      <button
        type="button"
        data-visible={showBackToTop ? "true" : "false"}
        onClick={goTop}
        className={`${backBtnBase} ${backMotion} ${
          showBackToTop
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none translate-y-3 scale-[0.96] opacity-0"
        }`}
        tabIndex={showBackToTop ? 0 : -1}
        aria-hidden={!showBackToTop}
      >
        Back to top
      </button>
      <Link href="/" className={linkCls}>
        Return to Kanon
      </Link>
    </div>
  );
}
