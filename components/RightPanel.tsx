"use client";

import type { MutableRefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { EASE_OUT, MOTION_DURATION } from "@/lib/motion";

interface RightPanelProps {
  title?: string;
  progressPercent?: number;
  headerActions?: React.ReactNode;
  onBack?: () => void;
  /** Label shown as a tooltip on the back arrow (e.g. the previous panel's title). */
  backLabel?: string;
  onClose: () => void;
  /** When provided, renders a fullscreen icon button next to the close button. */
  onFullScreen?: () => void;
  children: React.ReactNode;
  /** When true the body area will not scroll; the child is responsible for its own overflow. */
  disableBodyScroll?: boolean;
  /** When true the panel expands wide. */
  wide?: boolean;
  /** Override the wide width (default 1640). */
  wideWidth?: number;
  /** Optional layer rendered behind the header and body (e.g. ambient gradient). */
  backgroundOverlay?: React.ReactNode;
  /** When false, Escape does not call onClose (e.g. child fullscreen handles Escape). Default true. */
  closeOnEscape?: boolean;
  /**
   * When provided, Escape does not call onClose while this ref is true (read synchronously on each keydown).
   * Use for overlays that dismiss on Escape before the panel should.
   */
  escapeDismissBlockedRef?: MutableRefObject<boolean>;
}

export default function RightPanel({
  title,
  progressPercent,
  headerActions,
  onBack,
  backLabel,
  onClose,
  onFullScreen,
  children,
  disableBodyScroll,
  wide,
  wideWidth = 1640,
  backgroundOverlay,
  closeOnEscape = true,
  escapeDismissBlockedRef,
}: RightPanelProps) {
  const shouldReduceMotion = useReducedMotion();
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const [backTooltipPos, setBackTooltipPos] = useState<{ left: number; top: number } | null>(null);
  const [viewportWidth, setViewportWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);

  useEffect(() => {
    function onResize() { setViewportWidth(window.innerWidth); }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function showBackTooltip() {
    const el = backButtonRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setBackTooltipPos({ left: rect.left + rect.width / 2, top: rect.bottom + 8 });
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (escapeDismissBlockedRef?.current) return;
      if (!closeOnEscape) return;
      onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, closeOnEscape, escapeDismissBlockedRef]);

  return (
    /* No backdrop — panel floats over canvas so other nodes remain clickable */
    <motion.div
      className="fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-[0_20px_60px_rgba(0,0,0,0.7)]"
      style={{
        maxWidth: "calc(100vw - 2rem)",
        top: "max(1rem, env(safe-area-inset-top, 0px))",
        right: "max(1rem, env(safe-area-inset-right, 0px))",
        bottom: "max(1rem, env(safe-area-inset-bottom, 0px))",
      }}
      initial={shouldReduceMotion ? false : { opacity: 0, x: 24, width: Math.min(460, viewportWidth - 32) }}
      animate={{ opacity: 1, x: 0, width: wide ? wideWidth : Math.min(460, viewportWidth - 32) }}
      exit={shouldReduceMotion ? { opacity: 1, x: 0 } : { opacity: 0, x: 24 }}
      transition={{
        duration: shouldReduceMotion ? 0 : MOTION_DURATION.panel,
        ease: EASE_OUT,
        width: { duration: shouldReduceMotion ? 0 : 0.4, ease: [0.645, 0.045, 0.355, 1] },
      }}
    >
      {/* Background overlay — behind header and body, clipped by panel's overflow-hidden */}
      {backgroundOverlay && (
        <div className="pointer-events-none absolute inset-0 z-0 rounded-2xl overflow-hidden">
          {backgroundOverlay}
        </div>
      )}

      {/* Header */}
      <div className="relative z-10 flex shrink-0 items-center justify-between border-b border-zinc-800 px-3 py-3 sm:px-5">
        {typeof progressPercent === "number" && (
          <div
            className="pointer-events-none absolute bottom-[-1px] left-0 h-px bg-zinc-100 transition-[width] duration-250 ease-[ease]"
            style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%` }}
          />
        )}
        <div className="flex min-w-0 items-center gap-3">
          <AnimatePresence initial={false}>
            {onBack && (
              <motion.div
                key="panel-back-arrow"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                transition={{ duration: shouldReduceMotion ? 0 : MOTION_DURATION.fast, ease: EASE_OUT }}
                className="shrink-0"
              >
                <button
                  ref={backButtonRef}
                  onClick={onBack}
                  onMouseEnter={showBackTooltip}
                  onMouseLeave={() => setBackTooltipPos(null)}
                  aria-label={backLabel ? `Back to ${backLabel}` : "Go back"}
                  className="flex h-11 w-11 items-center justify-center text-base leading-none text-zinc-500 transition-colors hover:text-zinc-200"
                >
                  ←
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          {backLabel && backTooltipPos && createPortal(
            <div
              className="pointer-events-none fixed z-[9999] -translate-x-1/2 whitespace-nowrap rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 font-sans text-[11px] text-zinc-300 shadow-[0_8px_20px_rgba(0,0,0,0.5)]"
              style={{ left: backTooltipPos.left, top: backTooltipPos.top }}
            >
              {backLabel}
            </div>,
            document.body
          )}
          <button
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center text-base leading-none text-zinc-500 hover:text-zinc-200"
          >
            ✕
          </button>
          {onFullScreen && (
            <button
              onClick={onFullScreen}
              aria-label="Full screen"
              className="shrink-0 text-zinc-500 hover:text-zinc-200 transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M1 4.5V1H4.5M8.5 1H12V4.5M12 8.5V12H8.5M4.5 12H1V8.5" />
              </svg>
            </button>
          )}
          {title && (
            <span className="truncate font-lector text-sm tracking-tight text-zinc-400">
              {title}
            </span>
          )}
        </div>
        {headerActions && <div className="ml-4 shrink-0">{headerActions}</div>}
      </div>

      {/* Body */}
      <div
        className={`relative z-10 flex min-h-0 flex-1 flex-col ${disableBodyScroll ? "overflow-hidden" : "overflow-y-auto"}`}
      >
        {children}
      </div>
    </motion.div>
  );
}
