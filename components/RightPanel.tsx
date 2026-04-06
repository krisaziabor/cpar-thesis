"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface RightPanelProps {
  title?: string;
  progressPercent?: number;
  headerActions?: React.ReactNode;
  onBack?: () => void;
  onClose: () => void;
  children: React.ReactNode;
}

export default function RightPanel({
  title,
  progressPercent,
  headerActions,
  onBack,
  onClose,
  children,
}: RightPanelProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    /* No backdrop — panel floats over canvas so other nodes remain clickable */
    <motion.div
      className="fixed bottom-4 right-4 top-4 z-50 flex w-[460px] max-w-[92vw] flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-[0_20px_60px_rgba(0,0,0,0.7)]"
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.25, ease: [0.215, 0.61, 0.355, 1] }}
    >
      {/* Header */}
      <div className="relative flex shrink-0 items-center justify-between border-b border-zinc-800 px-5 py-3">
        {typeof progressPercent === "number" && (
          <div
            className="pointer-events-none absolute bottom-[-1px] left-0 h-px bg-zinc-100 transition-[width] duration-250 ease-[ease]"
            style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%` }}
          />
        )}
        <div className="flex min-w-0 items-center gap-3">
          <AnimatePresence initial={false}>
            {onBack && (
              <motion.button
                key="panel-back-arrow"
                onClick={onBack}
                aria-label="Go back"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -6 }}
                transition={{ duration: 0.16, ease: [0.215, 0.61, 0.355, 1] }}
                className="shrink-0 text-base leading-none text-zinc-500 transition-colors hover:text-zinc-200"
              >
                ←
              </motion.button>
            )}
          </AnimatePresence>
          <button
            onClick={onClose}
            className="shrink-0 text-base leading-none text-zinc-500 hover:text-zinc-200"
          >
            ✕
          </button>
          {title && (
            <span className="truncate text-sm text-zinc-400">
              {title}
            </span>
          )}
        </div>
        {headerActions && <div className="ml-4 shrink-0">{headerActions}</div>}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </motion.div>
  );
}
