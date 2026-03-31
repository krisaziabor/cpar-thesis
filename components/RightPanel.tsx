"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

interface RightPanelProps {
  title?: string;
  fullPageHref?: string;
  onClose: () => void;
  children: React.ReactNode;
}

export default function RightPanel({
  title,
  fullPageHref,
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
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
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
        {fullPageHref && (
          <Link
            href={fullPageHref}
            className="shrink-0 text-xs text-zinc-500 hover:text-zinc-200"
          >
            full page ↗
          </Link>
        )}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </motion.div>
  );
}
