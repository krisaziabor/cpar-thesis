"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { usePanelHistory } from "@/lib/panel-history-context";
import { subscribeToAllKanonSaves, subscribeToUserKanon } from "@/lib/kanon";
import { subscribeToItems } from "@/lib/items";
import type { Item, KanonSave } from "@/lib/types";
import { getUserProfile } from "@/lib/users";
import { EASE_OUT, MOTION_DURATION } from "@/lib/motion";

function formatDate(ts: unknown): string {
  if (!ts) return "";
  if (typeof ts === "object" && ts !== null && "toDate" in ts) {
    return (ts as { toDate: () => Date }).toDate().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  return String(ts);
}

type HoldsPanelProps = {
  currentUserEmail?: string | null;
  initialUserEmail?: string | null;
};

type HoldUser = {
  email: string;
  count: number;
  name: string;
};

function UserCard({
  user,
  isExpanded,
  onToggle,
  items,
  saves,
  shouldReduceMotion,
  onNavigateToItem,
}: {
  user: HoldUser;
  isExpanded: boolean;
  onToggle: () => void;
  items: Map<string, Item>;
  saves: KanonSave[];
  shouldReduceMotion: boolean | null;
  onNavigateToItem: (url: string) => void;
}) {
  const [firstName, lastName] = useMemo(() => {
    const parts = user.name.trim().split(/\s+/);
    return [parts[0] ?? "", parts.slice(1).join(" ")];
  }, [user.name]);

  const itemSaves = useMemo(
    () => saves.filter((s) => s.reference_type === "item" && items.has(s.reference_id)),
    [saves, items]
  );

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-zinc-900/50"
      >
        <div className="min-w-0">
          <p className="truncate font-lector text-sm text-zinc-100">
            {firstName}
            {lastName && (
              <span className="text-zinc-400"> {lastName}</span>
            )}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            {itemSaves.length} {itemSaves.length === 1 ? "record" : "records"}
          </p>
        </div>
        <motion.span
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: MOTION_DURATION.standard, ease: EASE_OUT }}
          className="ml-3 shrink-0 text-xs text-zinc-500"
        >
          ▾
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="content"
            initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: MOTION_DURATION.panel, ease: EASE_OUT }}
            className="overflow-hidden"
          >
            <div className="border-t border-zinc-800 px-3 py-3">
              {itemSaves.length === 0 ? (
                <p className="px-1 text-xs text-zinc-600">No saved records yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {itemSaves.map((save, i) => {
                    const item = items.get(save.reference_id);
                    if (!item) return null;
                    return (
                      <motion.div
                        key={save.id}
                        initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: MOTION_DURATION.standard,
                          ease: EASE_OUT,
                          delay: shouldReduceMotion ? 0 : i * 0.04,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            onNavigateToItem(
                              `/?item=${item.id}&holdUser=${encodeURIComponent(user.email)}`
                            )
                          }
                          className="flex w-full gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-zinc-900"
                        >
                          <div className="h-12 w-12 shrink-0 overflow-hidden rounded border border-zinc-800 bg-zinc-900">
                            {item.thumbnail_url ? (
                              <img
                                src={item.thumbnail_url}
                                alt={item.title}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[9px] uppercase tracking-widest text-zinc-600">
                                {item.type}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 space-y-0.5 py-0.5">
                            <p className="truncate font-lector text-xs text-zinc-200">
                              {item.title}
                            </p>
                            <p className="truncate text-[11px] text-zinc-500">
                              {[item.creator, item.media_date].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                        </button>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function HoldsPanel({ currentUserEmail, initialUserEmail }: HoldsPanelProps) {
  const shouldReduceMotion = useReducedMotion();
  const { navigatePanel } = usePanelHistory();
  const [allSaves, setAllSaves] = useState<KanonSave[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [expandedEmail, setExpandedEmail] = useState<string | null>(
    initialUserEmail ?? currentUserEmail ?? null
  );
  const [userSavesMap, setUserSavesMap] = useState<Record<string, KanonSave[]>>({});
  const [search, setSearch] = useState("");

  useEffect(() => subscribeToAllKanonSaves(setAllSaves), []);
  useEffect(() => subscribeToItems(setItems), []);

  const holdUsers = useMemo<HoldUser[]>(() => {
    const byEmail = new Map<string, number>();
    allSaves.forEach((save) => {
      if (save.reference_type !== "item") return;
      byEmail.set(save.user_email, (byEmail.get(save.user_email) ?? 0) + 1);
    });
    return [...byEmail.entries()]
      .map(([email, count]) => ({
        email,
        count,
        name: userNames[email] ?? email.split("@")[0],
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allSaves, userNames]);

  useEffect(() => {
    const uniqueEmails = [...new Set(allSaves.map((s) => s.user_email))];
    if (uniqueEmails.length === 0) return;
    void (async () => {
      const pairs = await Promise.all(
        uniqueEmails.map(async (email) => {
          const profile = await getUserProfile(email);
          return [email, profile?.name ?? ""] as const;
        })
      );
      setUserNames((prev) => {
        const next = { ...prev };
        pairs.forEach(([email, name]) => {
          if (name) next[email] = name;
        });
        return next;
      });
    })();
  }, [allSaves]);

  useEffect(() => {
    if (!expandedEmail) return;
    return subscribeToUserKanon(expandedEmail, (saves) => {
      setUserSavesMap((prev) => ({ ...prev, [expandedEmail]: saves }));
    });
  }, [expandedEmail]);

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return holdUsers;
    const q = search.toLowerCase().trim();
    return holdUsers.filter((u) => u.name.toLowerCase().includes(q));
  }, [holdUsers, search]);

  function handleToggle(email: string) {
    setExpandedEmail((prev) => (prev === email ? null : email));
  }

  return (
    <div className="space-y-5 px-6 py-6">
      <div className="space-y-1">
        <h2 className="font-lector text-lg text-zinc-100">Holds</h2>
        <p className="text-xs text-zinc-500">
          Browse records saved by each user.
        </p>
      </div>

      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users..."
          className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 font-sans text-xs text-zinc-200 placeholder-zinc-600 outline-none transition-colors focus:border-zinc-600"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
          >
            ×
          </button>
        )}
      </div>

      {filteredUsers.length === 0 ? (
        <p className="text-xs text-zinc-600">
          {search ? "No users match your search." : "No holds yet."}
        </p>
      ) : (
        <div className="space-y-2">
          {filteredUsers.map((user) => (
            <UserCard
              key={user.email}
              user={user}
              isExpanded={expandedEmail === user.email}
              onToggle={() => handleToggle(user.email)}
              items={itemById}
              saves={userSavesMap[user.email] ?? []}
              shouldReduceMotion={shouldReduceMotion}
              onNavigateToItem={(url) => navigatePanel(url, "Holds")}
            />
          ))}
        </div>
      )}
    </div>
  );
}
