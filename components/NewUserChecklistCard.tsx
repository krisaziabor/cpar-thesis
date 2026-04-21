"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import {
  backfillChecklistProgress,
  subscribeToUserChecklistProgress,
  type UserChecklistProgress,
} from "@/lib/user-checklist";
import { useSequenceReplayNonce, useSequenceTimings } from "@/lib/sequence-dialkit";

interface NewUserChecklistCardProps {
  userEmail: string;
  /** Added after sequence timing so another UI (e.g. corner feature intro) can enter first. */
  extraEnterDelaySec?: number;
}

function emptyProgress(userEmail: string): UserChecklistProgress {
  return {
    user_email: userEmail,
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

function progressCount(count: number, target: number): string {
  return `${Math.min(count, target)}/${target}`;
}

export default function NewUserChecklistCard({
  userEmail,
  extraEnterDelaySec = 0,
}: NewUserChecklistCardProps) {
  const pathname = usePathname();
  const shouldReduceMotion = useReducedMotion();
  const timings = useSequenceTimings();
  const replayNonce = useSequenceReplayNonce();
  const [progress, setProgress] = useState<UserChecklistProgress>(() => emptyProgress(userEmail));
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!userEmail) return;
    return subscribeToUserChecklistProgress(userEmail, setProgress);
  }, [userEmail]);

  useEffect(() => {
    if (!userEmail) return;
    void backfillChecklistProgress(userEmail);
  }, [userEmail]);

  const items = useMemo(
    () => [
      {
        key: "add_texts",
        label: "Add 3 records that matter to you",
        done: progress.completed.add_texts_to_library,
        counterLabel: progressCount(progress.texts_added_count, 3),
      },
      {
        key: "connect_own_to_other",
        label: "Connect your records to someone else's",
        done: progress.completed.connect_own_to_other,
        counterLabel: progressCount(progress.own_to_other_connections_count, 2),
      },
      {
        key: "connect_foreign",
        label: "Connect 2 records you didn't add",
        done: progress.completed.connect_foreign_to_foreign,
        counterLabel: progressCount(progress.foreign_connections_count, 2),
      },
      {
        key: "my_kanon",
        label: "Save a record to your Hold",
        done: progress.completed.add_to_my_kanon,
        counterLabel: progress.completed.add_to_my_kanon ? "1/1" : "0/1",
      },
    ],
    [progress]
  );

  const enterDelay =
    pathname === "/" && !shouldReduceMotion
      ? Math.max(0, timings.bottomStartMs + timings.checklistDelayMs) / 1000 +
        extraEnterDelaySec
      : 0;

  return (
    <motion.aside
      key={pathname === "/" ? `checklist-${replayNonce}` : "checklist"}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: shouldReduceMotion ? 0 : timings.bottomEnterMs / 1000,
        ease: [0.215, 0.61, 0.355, 1],
        delay: enterDelay,
      }}
      className="pointer-events-none hidden sm:block fixed bottom-6 right-6 z-40 w-[22rem]"
    >
      <div className="pointer-events-auto overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 font-sans shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand checklist" : "Collapse checklist"}
          className={`flex items-center justify-between px-4 py-3 ${
            collapsed ? "" : "border-b border-zinc-800"
          } w-full text-left`}
        >
          <p className="font-lector text-sm tracking-tight text-zinc-200">Getting Started</p>
          <span className="text-xs text-zinc-500 transition-colors hover:text-zinc-300">
            {collapsed ? "▸" : "▾"}
          </span>
        </button>

        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              key="checklist-items"
              initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={
                shouldReduceMotion
                  ? { duration: 0 }
                  : { duration: 0.22, ease: [0.215, 0.61, 0.355, 1] }
              }
              className="overflow-hidden"
            >
              <div className="flex flex-col divide-y divide-zinc-800">
                {items.map((item) => (
                  <div key={item.key} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className={`text-xs ${item.done ? "text-zinc-200" : "text-zinc-400"}`}>{item.label}</p>
                    </div>
                    <span
                      className={`mt-0.5 shrink-0 text-[11px] ${
                        item.done ? "text-zinc-300" : "text-zinc-600"
                      }`}
                    >
                      {item.counterLabel}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.aside>
  );
}
