"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { isLabPathname } from "@/lib/lab-paths";
import { useSequenceReplayNonce, useSequenceTimings } from "@/lib/sequence-dialkit";
import { EASE_OUT, MOTION_DURATION } from "@/lib/motion";
import GradientSVG from "@/components/GradientSVG";

export default function UtilityDock() {
  const { user, role, avatarColors, signOut, firstName } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const shouldReduceMotion = useReducedMotion();
  const timings = useSequenceTimings();
  const replayNonce = useSequenceReplayNonce();
  const [expanded, setExpanded] = useState(false);
  const displayName =
    firstName?.trim() ||
    user?.displayName?.trim().split(/\s+/)[0] ||
    user?.email?.split("@")[0]?.replace(/[._-]+/g, " ") ||
    "friend";
  const userInitial = displayName.charAt(0).toUpperCase();

  if (
    !user ||
    pathname === "/login" ||
    pathname === "/onboarding" ||
    pathname === "/admin" ||
    isLabPathname(pathname)
  )
    return null;

  const enterDelay = pathname === "/" && !shouldReduceMotion
    ? Math.max(0, timings.bottomStartMs + timings.utilityDelayMs) / 1000
    : 0;

  function openFeedback() {
    setExpanded(false);
    const params = new URLSearchParams(searchParams.toString());
    params.set("panel", "feedback");
    router.push(params.toString() ? `${pathname}?${params.toString()}` : pathname);
  }

  function openFullscreenFeatureIntro() {
    setExpanded(false);
    const params = new URLSearchParams(pathname === "/" ? searchParams.toString() : "");
    params.set("introTour", "fullscreen");
    router.push(`/?${params.toString()}`);
  }

  return (
    <motion.div
      key={pathname === "/" ? `utility-dock-${replayNonce}` : "utility-dock"}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: shouldReduceMotion ? 0 : timings.bottomEnterMs / 1000,
        ease: EASE_OUT,
        delay: enterDelay,
      }}
      className="hidden sm:block fixed left-6 z-50"
      style={{ bottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: MOTION_DURATION.standard, ease: EASE_OUT }}
            className="mb-3 w-[17rem] overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
          >
            <div className="border-b border-zinc-800 px-4 py-2.5 font-sans text-xs tracking-tight text-white/95">
              Hey {displayName}!
            </div>
            <div className="flex flex-col divide-y divide-zinc-800">
              <button
                type="button"
                onClick={openFullscreenFeatureIntro}
                className="px-4 py-2.5 text-left text-xs text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-50"
              >
                Walkthrough
              </button>
              <button
                type="button"
                onClick={openFeedback}
                className="px-4 py-2.5 text-left text-xs text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-50"
              >
                Feedback
              </button>
              <Link
                href="/colophon"
                onClick={() => setExpanded(false)}
                className="px-4 py-2.5 text-left text-xs text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-50"
              >
                Colophon
              </Link>
              <Link
                href="/epigraph"
                onClick={() => setExpanded(false)}
                className="px-4 py-2.5 text-left text-xs text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-50"
              >
                Epigraph
              </Link>
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
        className={`grid h-11 w-11 place-items-center overflow-hidden rounded-full text-xs transition-colors shadow-[0_4px_24px_rgba(0,0,0,0.5)] ${
          expanded || !avatarColors
            ? "border border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900 hover:text-zinc-100"
            : ""
        }`}
      >
        {expanded ? (
          "×"
        ) : avatarColors ? (
          <GradientSVG colors={avatarColors} seed={user?.email ?? "kanon"} size={44} round blurDeviation={5} />
        ) : (
          userInitial
        )}
      </button>
    </motion.div>
  );
}
