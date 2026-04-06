"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { useSequenceReplayNonce, useSequenceTimings } from "@/lib/sequence-dialkit";

export default function UtilityDock() {
  const { user, role, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const shouldReduceMotion = useReducedMotion();
  const timings = useSequenceTimings();
  const replayNonce = useSequenceReplayNonce();
  const [expanded, setExpanded] = useState(false);
  const displayName =
    user?.displayName?.trim() ||
    user?.email?.split("@")[0]?.replace(/[._-]+/g, " ") ||
    "friend";
  const userInitial = displayName.charAt(0).toUpperCase();

  if (!user || pathname === "/login") return null;

  const enterDelay = pathname === "/" && !shouldReduceMotion
    ? Math.max(0, timings.bottomStartMs + timings.utilityDelayMs) / 1000
    : 0;

  function openFeedback() {
    setExpanded(false);
    const params = new URLSearchParams(searchParams.toString());
    params.set("panel", "feedback");
    router.push(params.toString() ? `${pathname}?${params.toString()}` : pathname);
  }

  return (
    <motion.div
      key={pathname === "/" ? `utility-dock-${replayNonce}` : "utility-dock"}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: shouldReduceMotion ? 0 : timings.bottomEnterMs / 1000,
        ease: [0.215, 0.61, 0.355, 1],
        delay: enterDelay,
      }}
      className="fixed bottom-6 left-6 z-50"
    >
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.22, ease: [0.215, 0.61, 0.355, 1] }}
            className="mb-3 w-[17rem] overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
          >
            <div className="border-b border-zinc-800 px-4 py-2 text-[11px] text-zinc-500">
              Hey {displayName}!
            </div>
            <div className="flex flex-col divide-y divide-zinc-800">
              <Link
                href="/colophon"
                onClick={() => setExpanded(false)}
                className="px-4 py-2.5 text-left text-xs text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-50"
              >
                Colophon
              </Link>
              <button
                type="button"
                onClick={openFeedback}
                className="px-4 py-2.5 text-left text-xs text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-50"
              >
                Feedback
              </button>
              <button
                type="button"
                onClick={() => {
                  setExpanded(false);
                  void signOut();
                }}
                className="px-4 py-2.5 text-left text-xs text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-50"
              >
                Sign out
              </button>
              {role === "admin" && (
                <Link
                  href="/admin"
                  onClick={() => setExpanded(false)}
                  className="px-4 py-2.5 text-left text-xs text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
                >
                  Admin
                </Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-label={expanded ? "Collapse utility menu" : "Expand utility menu"}
        className="grid h-9 w-9 place-items-center rounded-full border border-zinc-800 bg-zinc-950 text-xs text-zinc-300 shadow-[0_4px_24px_rgba(0,0,0,0.5)] transition-colors hover:bg-zinc-900 hover:text-zinc-100"
      >
        {expanded ? "×" : userInitial}
      </button>
    </motion.div>
  );
}
