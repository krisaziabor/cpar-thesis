"use client";

/* ─────────────────────────────────────────────────────────────
 * MOBILE BOTTOM DRAWER — STORYBOARD
 *
 * Three states: "icon" → "bar" → "open"
 *
 *   "icon"  avatar circle, centered at bottom
 *              → tap → "bar"
 *
 *   "bar"   full-width handle expands from bottom (spring)
 *              → tap bar → "open"
 *              → tap anywhere else → "icon"
 *
 *   "open"  sheet slides up, backdrop fades in
 *              → tap backdrop / drag handle → "icon"
 *
 * Sheet section reveal (after sheet enters):
 *   280ms   nav tiles stagger in (40ms per tile)
 *   440ms   Getting Started (collapsed by default, expandable)
 *   520ms   account section
 * ───────────────────────────────────────────────────────────── */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { useNavGuard } from "@/lib/nav-guard-context";
import { useNavStatus } from "@/lib/nav-status-context";
import { useFloatingNavSuppressed } from "@/lib/floating-nav-suppress-context";
import {
  subscribeToUserChecklistProgress,
  backfillChecklistProgress,
  type UserChecklistProgress,
} from "@/lib/user-checklist";
import GradientSVG from "@/components/GradientSVG";
import { EASE_OUT } from "@/lib/motion";

// ── Timing ────────────────────────────────────────────────────

const TIMING = {
  backdropDelay:  0.06,  // s — backdrop when sheet opens
  sheetDelay:     0.08,  // s — sheet slide-up
  navItemsStart:  0.28,  // s — first nav tile
  navItemStagger: 0.04,  // s — between tiles
  checklistDelay: 0.44,  // s — getting started section
  accountDelay:   0.52,  // s — account section
};

// ── Motion configs ─────────────────────────────────────────────

const SPRING_ICON    = { type: "spring" as const, stiffness: 480, damping: 38 };
const SPRING_BAR     = { type: "spring" as const, stiffness: 420, damping: 38 };
const SPRING_SHEET   = { type: "spring" as const, stiffness: 380, damping: 42 };
const SPRING_SECTION = { type: "spring" as const, stiffness: 300, damping: 32 };

// ── Nav items ─────────────────────────────────────────────────

const NAV_ITEMS = [
  { id: "add",      label: "Add",      href: "/?panel=add" },
  { id: "connect",  label: "Connect",  href: "/?panel=connect" },
  { id: "search",   label: "Search",   href: "/?panel=search" },
  { id: "hold",     label: "Hold",     href: "/?panel=holds" },
  { id: "activity", label: "Activity", href: "/?panel=activity" },
] as const;

// ── Types + helpers ────────────────────────────────────────────

type DrawerState = "icon" | "bar" | "open";

function emptyProgress(email: string): UserChecklistProgress {
  return {
    user_email: email,
    texts_added_count: 0,
    own_to_other_connections_count: 0,
    foreign_connections_count: 0,
    kanon_saves_count: 0,
    completed: {
      add_texts_to_library: false,
      connect_own_to_other: false,
      connect_foreign_to_foreign: false,
      add_to_my_kanon: false,
    },
  };
}

function progressCount(n: number, target: number): string {
  return `${Math.min(n, target)}/${target}`;
}

// ── Component ─────────────────────────────────────────────────

export default function MobileBottomDrawer() {
  const { user, role, avatarColors, signOut, firstName } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const shouldReduceMotion = useReducedMotion();
  const { navigateWithGuard } = useNavGuard();
  const { currentMessage } = useNavStatus();
  const navSuppressed = useFloatingNavSuppressed();

  const [drawerState, setDrawerState] = useState<DrawerState>("icon");
  const [checklistCollapsed, setChecklistCollapsed] = useState(true);
  const [progress, setProgress] = useState<UserChecklistProgress>(() =>
    emptyProgress(user?.email ?? "")
  );

  useEffect(() => {
    if (!user?.email) return;
    return subscribeToUserChecklistProgress(user.email, setProgress);
  }, [user?.email]);

  useEffect(() => {
    if (!user?.email) return;
    void backfillChecklistProgress(user.email);
  }, [user?.email]);

  // ── Nav state ──────────────────────────────────────────────
  const panel = searchParams.get("panel");
  const connectPanelOpen = searchParams.get("connectPanel") === "1";
  const selectedConnectIds = (searchParams.get("connectIds") ?? "")
    .split(",").map((v) => v.trim()).filter(Boolean);
  const showConnectHandle = pathname === "/" && panel === "connect" && !connectPanelOpen;

  const displayName =
    firstName?.trim() ||
    user?.displayName?.trim().split(/\s+/)[0] ||
    user?.email?.split("@")[0]?.replace(/[._-]+/g, " ") ||
    "friend";
  const userInitial = displayName.charAt(0).toUpperCase();

  // ── Checklist ─────────────────────────────────────────────
  const checklistItems = useMemo(() => [
    {
      key: "add_texts",
      label: "Add 3 records that matter to you",
      done: progress.completed.add_texts_to_library,
      counter: progressCount(progress.texts_added_count, 3),
    },
    {
      key: "connect_own",
      label: "Connect your records to someone else's",
      done: progress.completed.connect_own_to_other,
      counter: progressCount(progress.own_to_other_connections_count, 2),
    },
    {
      key: "connect_foreign",
      label: "Connect 2 records you didn't add",
      done: progress.completed.connect_foreign_to_foreign,
      counter: progressCount(progress.foreign_connections_count, 2),
    },
    {
      key: "my_hold",
      label: "Save a record to your Hold",
      done: progress.completed.add_to_my_kanon,
      counter: progress.completed.add_to_my_kanon ? "1/1" : "0/1",
    },
  ], [progress]);

  const allDone = checklistItems.every((i) => i.done);

  // ── Helpers ────────────────────────────────────────────────
  function close() { setDrawerState("icon"); }

  function navigate(href: string) {
    close();
    navigateWithGuard(href);
  }

  function openFeedback() {
    close();
    const params = new URLSearchParams(searchParams.toString());
    params.set("panel", "feedback");
    router.push(params.toString() ? `${pathname}?${params.toString()}` : pathname);
  }

  function openWalkthrough() {
    close();
    const params = new URLSearchParams(pathname === "/" ? searchParams.toString() : "");
    params.set("introTour", "fullscreen");
    router.push(`/?${params.toString()}`);
  }

  function handleConnectCancel() {
    close();
    router.push("/");
  }

  function handleConnectConfirm() {
    if (selectedConnectIds.length < 2) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("panel", "connect");
    params.set("connectPanel", "1");
    params.delete("connectSelect");
    close();
    router.push(`/?${params.toString()}`);
  }

  // ── Guard ──────────────────────────────────────────────────
  if (
    !user ||
    pathname === "/login" ||
    pathname === "/colophon" ||
    pathname === "/epigraph" ||
    pathname === "/onboarding" ||
    pathname === "/onboarding-lab" ||
    pathname === "/admin"
  ) return null;

  const bottomInset = "calc(1rem + env(safe-area-inset-bottom, 0px))";

  return (
    <div className="sm:hidden">
      {/* Invisible tap-catcher — dismisses bar → icon on outside tap */}
      {drawerState === "bar" && (
        <div className="fixed inset-0 z-40" onClick={close} />
      )}

      {/* Sheet backdrop — z-[60] so it covers panels (z-50) and all other page elements */}
      <AnimatePresence>
        {drawerState === "open" && (
          <motion.div
            key="mbd-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.2, delay: TIMING.backdropDelay, ease: EASE_OUT } }}
            exit={{ opacity: 0, transition: { duration: 0.18, ease: EASE_OUT } }}
            onClick={close}
            className="fixed inset-0 z-[60] bg-black/75"
          />
        )}
      </AnimatePresence>

      {/* Sheet */}
      <AnimatePresence>
        {drawerState === "open" && (
          <motion.div
            key="mbd-sheet"
            initial={shouldReduceMotion ? { opacity: 0 } : { y: "100%" }}
            animate={
              shouldReduceMotion
                ? { opacity: 1 }
                : { y: "0%", transition: { ...SPRING_SHEET, delay: TIMING.sheetDelay } }
            }
            exit={
              shouldReduceMotion
                ? { opacity: 0 }
                : { y: "100%", transition: SPRING_SHEET }
            }
            className="fixed inset-x-0 bottom-0 z-[61] rounded-t-2xl border-t border-zinc-800 bg-zinc-950 shadow-[0_-4px_32px_rgba(0,0,0,0.7)]"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
          >
            {/* Drag handle — tap to close */}
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="flex w-full justify-center pt-3 pb-2"
            >
              <div className="h-1 w-10 rounded-full bg-zinc-700" />
            </button>

            {/* Nav grid */}
            <div className="px-4 pt-1 pb-2">
              <div className="grid grid-cols-3 gap-2">
                {NAV_ITEMS.map((item, i) => {
                  const isActive =
                    panel === item.id ||
                    (item.id === "hold" && panel === "holds");
                  return (
                    <motion.button
                      key={item.id}
                      type="button"
                      onClick={() => navigate(isActive ? "/" : item.href)}
                      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                      animate={{
                        opacity: 1,
                        y: 0,
                        transition: {
                          ...SPRING_SECTION,
                          delay: TIMING.navItemsStart + i * TIMING.navItemStagger,
                        },
                      }}
                      className={`flex min-h-[52px] items-end rounded-lg border px-3 py-2.5 text-left transition-colors ${
                        isActive
                          ? "border-zinc-600 bg-zinc-900 text-zinc-100"
                          : "border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                      }`}
                    >
                      <span className="font-lector text-sm">{item.label}</span>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Getting Started — collapsed by default */}
            {!allDone && (
              <motion.div
                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  transition: { ...SPRING_SECTION, delay: TIMING.checklistDelay },
                }}
                className="mx-4 mt-1 overflow-hidden rounded-lg border border-zinc-800"
              >
                <button
                  type="button"
                  onClick={() => setChecklistCollapsed((v) => !v)}
                  className="flex w-full items-center justify-between px-4 py-2.5"
                >
                  <p className="font-lector text-sm tracking-tight text-zinc-200">
                    Getting Started
                  </p>
                  <span className="text-xs text-zinc-500">
                    {checklistCollapsed ? "▸" : "▾"}
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {!checklistCollapsed && (
                    <motion.div
                      key="checklist-body"
                      initial={shouldReduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1, transition: { duration: 0.2, ease: EASE_OUT } }}
                      exit={shouldReduceMotion ? { opacity: 0 } : { height: 0, opacity: 0, transition: { duration: 0.15, ease: EASE_OUT } }}
                      className="overflow-hidden border-t border-zinc-800"
                    >
                      <div className="flex flex-col divide-y divide-zinc-800">
                        {checklistItems.map((item) => (
                          <div
                            key={item.key}
                            className="flex items-center justify-between gap-3 px-4 py-2.5"
                          >
                            <p className={`text-xs ${item.done ? "text-zinc-300" : "text-zinc-500"}`}>
                              {item.label}
                            </p>
                            <span className={`shrink-0 text-[11px] ${item.done ? "text-zinc-300" : "text-zinc-600"}`}>
                              {item.counter}
                            </span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {/* Account */}
            <motion.div
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: { ...SPRING_SECTION, delay: TIMING.accountDelay },
              }}
              className="mx-4 mt-2 mb-4 overflow-hidden rounded-lg border border-zinc-800"
            >
              <div className="border-b border-zinc-800 px-4 py-2.5 font-sans text-xs text-white/50">
                Hey {displayName}!
              </div>
              <div className="flex flex-col divide-y divide-zinc-800">
                <button
                  type="button"
                  onClick={openWalkthrough}
                  className="px-4 py-3 text-left text-xs text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
                >
                  Walkthrough
                </button>
                <button
                  type="button"
                  onClick={openFeedback}
                  className="px-4 py-3 text-left text-xs text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
                >
                  Feedback
                </button>
                <Link
                  href="/colophon"
                  onClick={close}
                  className="block px-4 py-3 text-xs text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
                >
                  Colophon
                </Link>
                <Link
                  href="/epigraph"
                  onClick={close}
                  className="block px-4 py-3 text-xs text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
                >
                  Epigraph
                </Link>
                <button
                  type="button"
                  onClick={() => { close(); void signOut(); }}
                  className="px-4 py-3 text-left text-xs text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
                >
                  Sign out
                </button>
                {role === "admin" && (
                  <Link
                    href="/admin"
                    onClick={close}
                    className="block px-4 py-3 text-xs text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
                  >
                    Admin
                  </Link>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Connect handle — overrides icon/bar during graph item selection */}
      {showConnectHandle && (
        <div className="fixed inset-x-4 z-50" style={{ bottom: bottomInset }}>
          <div className="overflow-hidden rounded-md border border-zinc-800 bg-zinc-950 shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
            <div className="flex items-center justify-between px-4 py-3 font-sans">
              <button
                type="button"
                onClick={handleConnectCancel}
                className="-mx-1 px-1 py-1 text-xs text-zinc-500 transition-colors hover:text-zinc-200"
              >
                Cancel
              </button>
              <span className="text-xs text-zinc-400">
                {selectedConnectIds.length} selected
              </span>
              <button
                type="button"
                onClick={handleConnectConfirm}
                disabled={selectedConnectIds.length < 2}
                className="-mx-1 px-1 py-1 text-xs text-zinc-300 transition-colors hover:text-zinc-100 disabled:opacity-40"
              >
                Confirm →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Icon / Bar — hidden while sheet is open, connect handle is showing, or nav is suppressed */}
      {!showConnectHandle && drawerState !== "open" && (
        <AnimatePresence>
          {!navSuppressed && (
            <motion.div
              key="mobile-nav-icon-bar"
              className="fixed inset-x-0 z-50 flex justify-center px-4"
              style={{ bottom: bottomInset }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.15, ease: [0.215, 0.61, 0.355, 1] } }}
              exit={{ opacity: 0, transition: { duration: 0.12, ease: [0.215, 0.61, 0.355, 1] } }}
            >
          <AnimatePresence mode="wait" initial={false}>
            {drawerState === "icon" && (
              <motion.button
                key="icon"
                type="button"
                onClick={() => setDrawerState("bar")}
                aria-label="Open navigation"
                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1, transition: SPRING_ICON }}
                exit={
                  shouldReduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, scale: 0.85, transition: { duration: 0.1 } }
                }
                className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-zinc-800 bg-zinc-950 shadow-[0_4px_16px_rgba(0,0,0,0.5)]"
              >
                {avatarColors ? (
                  <GradientSVG
                    colors={avatarColors}
                    seed={user?.email ?? "kanon"}
                    size={36}
                    round
                    blurDeviation={4}
                  />
                ) : (
                  <span className="text-[11px] text-zinc-400">{userInitial}</span>
                )}
              </motion.button>
            )}

            {drawerState === "bar" && (
              <motion.button
                key="bar"
                type="button"
                onClick={() => setDrawerState("open")}
                initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0, transition: SPRING_BAR }}
                exit={
                  shouldReduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, y: 6, transition: { duration: 0.1 } }
                }
                className="flex w-full items-center justify-between rounded-md border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 shadow-[0_4px_24px_rgba(0,0,0,0.5)] transition-colors hover:bg-zinc-900"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-800 bg-zinc-900">
                  {avatarColors ? (
                    <GradientSVG
                      colors={avatarColors}
                      seed={user?.email ?? "kanon"}
                      size={28}
                      round
                      blurDeviation={4}
                    />
                  ) : (
                    <span className="text-[10px] text-zinc-400">{userInitial}</span>
                  )}
                </div>
                <span className="font-lector text-sm tracking-tight text-zinc-300">
                  {currentMessage ? currentMessage.text : "Kanon"}
                </span>
                <span className="text-xs text-zinc-500">▴</span>
              </motion.button>
            )}
            </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
