"use client";

import { useState, useEffect } from "react";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { useNavGuard } from "@/lib/nav-guard-context";
import { useNavStatus, type NavStatusMessage, type NavStatusPhase } from "@/lib/nav-status-context";
import { useSequenceReplayNonce, useSequenceTimings } from "@/lib/sequence-dialkit";
import { EASE_OUT, MOTION_DURATION } from "@/lib/motion";

function ThumbnailCycler({ thumbnails }: { thumbnails: string[] }) {
  const [index, setIndex] = useState(0);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (thumbnails.length <= 1) return;
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % thumbnails.length);
    }, 1200);
    return () => clearInterval(interval);
  }, [thumbnails.length]);

  return (
    <div className="relative h-7 w-7 flex-shrink-0 overflow-hidden rounded-[4px]">
      <AnimatePresence mode="popLayout">
        <motion.div
          key={`${thumbnails[index]}-${index}`}
          initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
          className="absolute inset-0"
        >
          <Image
            src={thumbnails[index]}
            alt=""
            fill
            className="object-cover"
            sizes="28px"
            unoptimized
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function MorphingText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <span className={`whitespace-nowrap font-lector text-sm ${className ?? ""}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        {text.split("").map((char, i) => (
          <motion.span
            key={`${i}-${char}-${text}`}
            initial={{ opacity: 0, filter: "blur(2px)" }}
            animate={{
              opacity: 1,
              filter: "blur(0px)",
              transition: {
                type: "spring",
                stiffness: 350,
                damping: 55,
                delay: i * 0.015,
              },
            }}
            exit={{
              opacity: 0,
              filter: "blur(2px)",
              transition: { type: "spring", stiffness: 500, damping: 55 },
            }}
            className="inline-block"
          >
            {char === " " ? "\u00A0" : char}
          </motion.span>
        ))}
      </AnimatePresence>
    </span>
  );
}

function StatusMessageCard({ message }: { message: NavStatusMessage }) {
  const shouldReduceMotion = useReducedMotion();
  const hasThumbnails = message.thumbnails && message.thumbnails.length > 0;
  const isError = message.phase === "error";
  const enterDelay = shouldReduceMotion ? 0 : MOTION_DURATION.fast + 0.04;

  return (
    <motion.div
      key={message.id}
      initial={shouldReduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: MOTION_DURATION.fast, ease: EASE_OUT, delay: enterDelay } }}
      exit={{ opacity: 0, transition: { duration: MOTION_DURATION.fast, ease: EASE_OUT } }}
      className="flex items-center gap-2.5 px-4 py-2.5"
    >
      {hasThumbnails && !isError && <ThumbnailCycler thumbnails={message.thumbnails!} />}
      {shouldReduceMotion ? (
        <span
          className={`whitespace-nowrap font-lector text-sm ${
            isError ? "text-amber-300" : "text-zinc-300"
          }`}
        >
          {message.text}
        </span>
      ) : (
        <MorphingText
          text={message.text}
          className={isError ? "text-amber-300" : "text-zinc-300"}
        />
      )}
    </motion.div>
  );
}

function borderGradient(phase: NavStatusPhase | undefined): string {
  const color = phase === "error"
    ? "rgba(251,191,36,0.9)"
    : "rgba(255,255,255,0.9)";
  return `conic-gradient(from var(--border-angle), transparent 0deg, ${color} 40deg, transparent 80deg)`;
}

export default function FloatingNav() {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const shouldReduceMotion = useReducedMotion();
  const timings = useSequenceTimings();
  const replayNonce = useSequenceReplayNonce();
  const { navigateWithGuard } = useNavGuard();
  const { currentMessage } = useNavStatus();
  const [expanded, setExpanded] = useState(false);

  const panel = searchParams.get("panel");
  const connectPanelOpen = searchParams.get("connectPanel") === "1";
  const selectedConnectIds = (searchParams.get("connectIds") ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const isConnectSelecting = pathname === "/" && panel === "connect";

  const isAddActive = pathname === "/" && panel === "add";
  const isConnectActive = isConnectSelecting || pathname === "/connect";
  const isSearchActive = pathname === "/" && panel === "search";
  const isActivityActive = pathname === "/" && panel === "activity";
  const isHoldingActive = (pathname === "/" && panel === "holds") || pathname.startsWith("/kanon");
  const holdingHref = "/?panel=holds";

  if (!user || pathname === "/login" || pathname === "/colophon" || pathname === "/onboarding" || pathname === "/onboarding-lab" || pathname === "/admin") return null;

  const enterDelay = pathname === "/" && !shouldReduceMotion
    ? Math.max(0, timings.bottomStartMs + timings.navDelayMs) / 1000
    : 0;

  function handleTabPress(isActive: boolean, href: string) {
    navigateWithGuard(isActive ? "/" : href);
  }

  function handleConnectCancel() {
    router.push("/");
  }

  function handleConnectConfirm() {
    if (selectedConnectIds.length < 2) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("panel", "connect");
    params.set("connectPanel", "1");
    params.delete("connectSelect");
    router.push(`/?${params.toString()}`);
  }

  function handleConnectSearchOpen() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("panel", "connect");
    params.set("connectPanel", "1");
    params.set("connectSelect", "1");
    router.push(`/?${params.toString()}`);
  }

  const showStatus = !!currentMessage;

  return (
    <motion.div
      key={pathname === "/" ? `floating-nav-${replayNonce}` : "floating-nav"}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: shouldReduceMotion ? 0 : timings.bottomEnterMs / 1000,
        ease: EASE_OUT,
        delay: enterDelay,
      }}
      className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2"
    >
      <motion.div
        layout
        transition={{
          layout: { duration: MOTION_DURATION.fast, ease: EASE_OUT },
        }}
        className="relative overflow-hidden rounded-md shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
      >
        {/* Progress border — loops continuously, fades out on dismiss */}
        <AnimatePresence>
          {showStatus && currentMessage.showProgress && (
            <motion.div
              key={`border-${currentMessage.id}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.15, ease: EASE_OUT, delay: MOTION_DURATION.fast + 0.04 } }}
              exit={{ opacity: 0, transition: { duration: 0.4, ease: EASE_OUT } }}
              className="pointer-events-none absolute inset-0 z-10 rounded-md"
              style={{
                padding: "1px",
                background: borderGradient(currentMessage.phase),
                mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                maskComposite: "exclude",
                WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                WebkitMaskComposite: "xor",
                animation: "nav-border-loop 1.4s linear infinite",
              } as React.CSSProperties}
            />
          )}
        </AnimatePresence>
        <div className="overflow-hidden rounded-md border border-zinc-800 bg-zinc-950">

        <AnimatePresence initial={false}>
          {isConnectSelecting && !connectPanelOpen && (
            <motion.div
              key="connect-instructions"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: MOTION_DURATION.standard, ease: EASE_OUT }}
              className="overflow-hidden border-b border-zinc-800"
            >
              <div className="flex flex-col gap-2 px-4 py-3">
                <p className="text-xs text-zinc-400">
                  Select thumbnails in the graph to connect them.
                </p>
                <span className="text-xs text-zinc-500">
                  {selectedConnectIds.length} selected
                </span>
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={handleConnectCancel}
                    className="text-xs text-zinc-500 transition-colors hover:text-zinc-200"
                  >
                    Cancel
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleConnectSearchOpen}
                      className="px-2 py-1 text-xs text-zinc-500 transition-colors hover:text-zinc-200"
                    >
                      Search & select
                    </button>
                    <button
                      onClick={handleConnectConfirm}
                      disabled={selectedConnectIds.length < 2}
                      className="rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-40"
                    >
                      Confirm
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Base row — Status message, Kanon collapsed, or full rail expanded */}
        <AnimatePresence initial={false} mode="wait">
          {showStatus ? (
            <StatusMessageCard key={`status-${currentMessage.id}`} message={currentMessage} />
          ) : expanded ? (
            <motion.div
              key="expanded-rail"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0, transition: { duration: MOTION_DURATION.standard, ease: EASE_OUT } }}
              exit={{ opacity: 0, transition: { duration: MOTION_DURATION.fast, ease: EASE_OUT } }}
              className="flex items-stretch divide-x divide-zinc-800 font-lector"
            >
              <button
                onClick={() => handleTabPress(isAddActive, "/?panel=add")}
                className={`px-4 py-2.5 text-sm transition-colors hover:bg-zinc-900 hover:text-zinc-50 ${
                  isAddActive ? "font-medium text-zinc-300" : "text-zinc-400"
                }`}
              >
                Add
              </button>
              <button
                onClick={() => handleTabPress(isConnectActive, "/?panel=connect")}
                className={`px-4 py-2.5 text-sm transition-colors hover:bg-zinc-900 hover:text-zinc-50 ${
                  isConnectActive ? "font-medium text-zinc-300" : "text-zinc-400"
                }`}
              >
                Connect
              </button>
              <button
                onClick={() => handleTabPress(isSearchActive, "/?panel=search")}
                className={`px-4 py-2.5 text-sm transition-colors hover:bg-zinc-900 hover:text-zinc-50 ${
                  isSearchActive ? "font-medium text-zinc-300" : "text-zinc-400"
                }`}
              >
                Search
              </button>
              <button
                onClick={() => handleTabPress(isHoldingActive, holdingHref)}
                className={`px-4 py-2.5 text-sm whitespace-nowrap transition-colors hover:bg-zinc-900 hover:text-zinc-50 ${
                  isHoldingActive ? "font-medium text-zinc-300" : "text-zinc-400"
                }`}
              >
                Hold
              </button>
              <button
                onClick={() => handleTabPress(isActivityActive, "/?panel=activity")}
                className={`px-4 py-2.5 text-sm whitespace-nowrap transition-colors hover:bg-zinc-900 hover:text-zinc-50 ${
                  isActivityActive ? "font-medium text-zinc-300" : "text-zinc-400"
                }`}
              >
                Activity
              </button>
              <button
                onClick={() => setExpanded(false)}
                aria-label="Collapse navigation"
                className="px-3 py-2.5 text-xs leading-none text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-200"
              >
                ×
              </button>
            </motion.div>
          ) : (
            <motion.button
              key="collapsed-kanon"
              type="button"
              onClick={() => setExpanded(true)}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0, transition: { duration: MOTION_DURATION.standard, ease: EASE_OUT } }}
              exit={{ opacity: 0, transition: { duration: MOTION_DURATION.fast, ease: EASE_OUT } }}
              className="w-full px-5 py-2.5 text-center font-lector text-sm tracking-tight text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-50"
            >
              Kanon
            </motion.button>
          )}
        </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
