"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { usePanelHistory } from "@/lib/panel-history-context";
import {
  subscribeToAllKanonSaves,
  subscribeToUserKanon,
  removeFromKanon,
} from "@/lib/kanon";
import { subscribeToItems, subscribeToAllConnections, subscribeToAllConnectionItems } from "@/lib/items";
import type { Connection, ConnectionItem, Item, KanonSave } from "@/lib/types";
import { CONNECTION_PREVIEW_DEFAULT_COLORS } from "@/components/ConnectionItemsPreview";
import { getUserProfile } from "@/lib/users";
import { EASE_OUT, MOTION_DURATION } from "@/lib/motion";

function formatDateShort(ts: unknown): string {
  if (!ts) return "";
  if (typeof ts === "object" && ts !== null && "toDate" in ts) {
    const date = (ts as { toDate: () => Date }).toDate();
    const sameYear = date.getFullYear() === new Date().getFullYear();
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(sameYear ? {} : { year: "numeric" }),
    });
  }
  return String(ts);
}

function connLabel(conn: Connection): string {
  if (conn.title) return conn.title;
  return `Connection · ${formatDateShort(conn.created_at)}`;
}

type HoldsPanelProps = {
  currentUserEmail?: string | null;
  initialUserEmail?: string | null;
};

type HoldUser = { email: string; name: string };

function UserCard({
  user,
  isExpanded,
  onToggle,
  items,
  connections,
  saves,
  connectionItemIdsMap,
  connCreatorFirstNames,
  connCreatorGradients,
  shouldReduceMotion,
  onNavigate,
}: {
  user: HoldUser;
  isExpanded: boolean;
  onToggle: () => void;
  items: Map<string, Item>;
  connections: Map<string, Connection>;
  saves: KanonSave[];
  connectionItemIdsMap: Record<string, string[]>;
  connCreatorFirstNames: Record<string, string>;
  connCreatorGradients: Record<string, [string, string, string]>;
  shouldReduceMotion: boolean | null;
  onNavigate: (url: string) => void;
}) {
  const [firstName, lastName] = useMemo(() => {
    const parts = user.name.trim().split(/\s+/);
    return [parts[0] ?? "", parts.slice(1).join(" ")];
  }, [user.name]);

  const itemSaves = useMemo(
    () => saves.filter((s) => s.reference_type === "item" && items.has(s.reference_id)),
    [saves, items]
  );
  const connectionSaves = useMemo(
    () =>
      saves.filter(
        (s) => s.reference_type === "connection" && connections.has(s.reference_id)
      ),
    [saves, connections]
  );

  const subtitleParts: string[] = [];
  if (itemSaves.length > 0)
    subtitleParts.push(`${itemSaves.length} ${itemSaves.length === 1 ? "record" : "records"}`);
  if (connectionSaves.length > 0)
    subtitleParts.push(
      `${connectionSaves.length} ${connectionSaves.length === 1 ? "connection" : "connections"}`
    );

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-zinc-900/50"
      >
        <div className="min-w-0">
          <p className="truncate font-sans text-sm font-medium text-zinc-100">
            {firstName}
            {lastName && <span className="text-zinc-400"> {lastName}</span>}
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            {subtitleParts.length > 0 ? subtitleParts.join(" · ") : "Nothing held"}
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
            <div className="space-y-1 border-t border-zinc-800 px-3 py-3">
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
                      onClick={() => onNavigate(`/?item=${item.id}`)}
                      className="flex w-full gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-zinc-900"
                    >
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded border border-zinc-800 bg-zinc-900">
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
                        <p className="truncate font-lector text-xs text-zinc-200">{item.title}</p>
                        <p className="truncate text-[11px] text-zinc-500">
                          {[item.creator, item.media_date].filter(Boolean).join(" · ")}
                        </p>
                        {!item.voice_recording_url && (
                          <p className="text-[11px] text-amber-400/60">No audio recorded</p>
                        )}
                      </div>
                    </button>
                  </motion.div>
                );
              })}

              {connectionSaves.length > 0 && itemSaves.length > 0 && (
                <div className="pt-1.5 pb-0.5">
                  <div className="border-t border-zinc-800/60" />
                </div>
              )}

              {connectionSaves.map((save, i) => {
                const conn = connections.get(save.reference_id);
                if (!conn) return null;
                const [c1, c2, c3] = connCreatorGradients[conn.created_by] ?? CONNECTION_PREVIEW_DEFAULT_COLORS;
                const creatorFirst = connCreatorFirstNames[conn.created_by] ?? conn.created_by.split("@")[0];
                const connItemIds = connectionItemIdsMap[conn.id] ?? [];
                const connItems = connItemIds.map((id) => items.get(id)).filter(Boolean) as Item[];
                const thumbPx = 24; const stackW = 36; const stackH = 32; const oxStep = 3; const oyStep = 2;
                const n = Math.min(connItems.length, 5);
                return (
                  <motion.div
                    key={save.id}
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: MOTION_DURATION.standard, ease: EASE_OUT, delay: shouldReduceMotion ? 0 : i * 0.04 }}
                  >
                    <button
                      type="button"
                      onClick={() => onNavigate(`/?connection=${conn.id}`)}
                      className="relative w-full overflow-hidden rounded-md border border-white/10 bg-black/20 text-left transition-opacity hover:opacity-90"
                    >
                      <div className="pointer-events-none absolute inset-0 scale-110" style={{ background: `radial-gradient(ellipse at center, ${c1} 0%, ${c2} 50%, ${c3} 100%)`, filter: "blur(24px) brightness(0.22)" }} />
                      <div className="relative z-10 grid grid-cols-[auto_1fr] items-center gap-3 px-2 py-2">
                        <div className="relative shrink-0 self-center" style={{ width: stackW, height: stackH }}>
                          {[...connItems.slice(0, 5)].reverse().map((item, revIdx) => {
                            const idx2 = n - 1 - revIdx;
                            return (
                              <div key={item.id} className="absolute overflow-hidden rounded border border-white/15 bg-zinc-900 shadow-[0_4px_12px_rgba(0,0,0,0.4)]" style={{ width: thumbPx, height: thumbPx, left: idx2 * oxStep, top: idx2 * oyStep, zIndex: idx2 + 1 }}>
                                {item.thumbnail_url ? <img src={item.thumbnail_url} alt="" className="h-full w-full object-cover" draggable={false} /> : <div className="flex h-full w-full items-center justify-center bg-zinc-800 text-[8px] font-medium uppercase tracking-wider text-zinc-500">···</div>}
                              </div>
                            );
                          })}
                        </div>
                        <div className="min-w-0 space-y-0.5 py-0.5">
                          {conn.title ? (
                            <p className="truncate font-lector text-xs text-white/85">{conn.title}</p>
                          ) : (
                            <p className="min-w-0 truncate font-lector text-xs text-white/85">
                              {connItems.length > 0 ? connItems.map((item, idx2) => <span key={item.id}>{idx2 > 0 ? <span className="text-white/35"> & </span> : null}{item.title}</span>) : <span className="text-white/35">Connection</span>}
                            </p>
                          )}
                          <p className="text-[11px]"><span className="text-white/55">{creatorFirst}</span><span className="text-white/35">, {formatDateShort(conn.created_at)}</span></p>
                        </div>
                      </div>
                    </button>
                  </motion.div>
                );
              })}

              {itemSaves.length === 0 && connectionSaves.length === 0 && (
                <p className="px-1 text-xs text-zinc-600">Nothing held yet.</p>
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
  const [isMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 900
  );
  const [mobileTab, setMobileTab] = useState<"left" | "right">("left");

  // ── Shared data ───────────────────────────────────────────
  const [items, setItems] = useState<Item[]>([]);
  const [allConnections, setAllConnections] = useState<Connection[]>([]);
  const [allConnectionItems, setAllConnectionItems] = useState<ConnectionItem[]>([]);
  const [allSaves, setAllSaves] = useState<KanonSave[]>([]);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [connCreatorFirstNames, setConnCreatorFirstNames] = useState<Record<string, string>>({});
  const [connCreatorGradients, setConnCreatorGradients] = useState<Record<string, [string, string, string]>>({});

  // ── Left pane — My Hold ───────────────────────────────────
  const [myUserSaves, setMyUserSaves] = useState<KanonSave[]>([]);
  const [isRemoving, setIsRemoving] = useState(false);
  const [selectedToRemove, setSelectedToRemove] = useState<Set<string>>(new Set());
  const [removingItems, setRemovingItems] = useState(false);

  // ── Right pane — Everyone's Holds ─────────────────────────
  const [expandedEmail, setExpandedEmail] = useState<string | null>(
    initialUserEmail ?? currentUserEmail ?? null
  );
  const [userSearch, setUserSearch] = useState("");

  useEffect(() => subscribeToItems(setItems), []);
  useEffect(() => subscribeToAllConnections(setAllConnections), []);
  useEffect(() => subscribeToAllConnectionItems(setAllConnectionItems), []);
  useEffect(() => subscribeToAllKanonSaves(setAllSaves), []);

  useEffect(() => {
    if (!currentUserEmail) return;
    return subscribeToUserKanon(currentUserEmail, setMyUserSaves);
  }, [currentUserEmail]);

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
    const emails = [...new Set(allConnections.map((c) => c.created_by).filter(Boolean))];
    if (emails.length === 0) return;
    let cancelled = false;
    void Promise.all(
      emails.map(async (email) => {
        const profile = await getUserProfile(email);
        const first = profile?.name?.trim()
          ? profile.name.trim().split(/\s+/)[0]!
          : email.split("@")[0]!;
        const gradient = (profile?.avatar_colors ?? CONNECTION_PREVIEW_DEFAULT_COLORS) as [string, string, string];
        return [email, { first, gradient }] as const;
      })
    ).then((entries) => {
      if (cancelled) return;
      const names: Record<string, string> = {};
      const grads: Record<string, [string, string, string]> = {};
      entries.forEach(([email, { first, gradient }]) => {
        names[email] = first;
        grads[email] = gradient;
      });
      setConnCreatorFirstNames(names);
      setConnCreatorGradients(grads);
    });
    return () => { cancelled = true; };
  }, [allConnections]);

  const itemById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items]
  );
  const connectionById = useMemo(
    () => new Map(allConnections.map((c) => [c.id, c])),
    [allConnections]
  );
  const connectionItemIdsMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const ci of allConnectionItems) {
      if (!map[ci.connection_id]) map[ci.connection_id] = [];
      map[ci.connection_id].push(ci.item_id);
    }
    return map;
  }, [allConnectionItems]);

  // My Hold derived
  const myHeldItemSaves = useMemo(
    () => myUserSaves.filter((s) => s.reference_type === "item"),
    [myUserSaves]
  );
  const myHeldConnectionSaves = useMemo(
    () => myUserSaves.filter((s) => s.reference_type === "connection"),
    [myUserSaves]
  );

  // Per-user saves derived from allSaves (already subscribed to all)
  const savesByEmail = useMemo(() => {
    const map: Record<string, KanonSave[]> = {};
    for (const s of allSaves) {
      if (!map[s.user_email]) map[s.user_email] = [];
      map[s.user_email].push(s);
    }
    return map;
  }, [allSaves]);

  // Everyone's holds
  const holdUsers = useMemo<HoldUser[]>(() => {
    const emails = [...new Set(allSaves.map((s) => s.user_email))];
    return emails
      .map((email) => ({
        email,
        name: userNames[email] ?? email.split("@")[0],
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allSaves, userNames]);

  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return holdUsers;
    const q = userSearch.toLowerCase().trim();
    return holdUsers.filter((u) => u.name.toLowerCase().includes(q));
  }, [holdUsers, userSearch]);

  function toggleRemoveSelection(saveId: string) {
    setSelectedToRemove((prev) => {
      const next = new Set(prev);
      if (next.has(saveId)) next.delete(saveId); else next.add(saveId);
      return next;
    });
  }

  async function removeSelected() {
    if (selectedToRemove.size === 0) return;
    setRemovingItems(true);
    try {
      await Promise.all([...selectedToRemove].map((id) => removeFromKanon(id)));
      setSelectedToRemove(new Set());
      setIsRemoving(false);
    } finally {
      setRemovingItems(false);
    }
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {isMobile && (
        <div className="flex shrink-0 border-b border-white/10">
          <button
            type="button"
            onClick={() => setMobileTab("left")}
            className={`flex-1 py-2.5 text-xs transition-colors ${mobileTab === "left" ? "text-white/90" : "text-white/35 hover:text-white/60"}`}
          >
            My Hold
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("right")}
            className={`flex-1 py-2.5 text-xs transition-colors ${mobileTab === "right" ? "text-white/90" : "text-white/35 hover:text-white/60"}`}
          >
            Everyone's
          </button>
        </div>
      )}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">

      {/* ── Left pane — My Hold ──────────────────────────────── */}
      <div className={`relative z-10 min-w-0 flex-1 overflow-y-auto scrollbar-hide${isMobile && mobileTab !== "left" ? " hidden" : ""}`}>
        <div className="flex flex-col gap-6 px-6 py-6">

          <div className="flex items-center justify-between">
            <motion.h2
              className="font-lector text-xl tracking-tight text-white/95"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: MOTION_DURATION.standard, ease: EASE_OUT }}
            >
              My Hold
            </motion.h2>
            <AnimatePresence mode="wait">
              {isRemoving ? (
                <motion.div
                  key="remove-controls"
                  initial={shouldReduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: MOTION_DURATION.standard, ease: EASE_OUT }}
                  className="flex items-center gap-3"
                >
                  {selectedToRemove.size > 0 && (
                    <button
                      type="button"
                      disabled={removingItems}
                      onClick={() => void removeSelected()}
                      className="-mx-1 px-1 py-1.5 text-xs text-red-400 transition-colors hover:text-red-300 disabled:opacity-50"
                    >
                      Remove {selectedToRemove.size}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={removingItems}
                    onClick={() => { setIsRemoving(false); setSelectedToRemove(new Set()); }}
                    className="-mx-1 px-1 py-1.5 text-xs text-white/40 transition-colors hover:text-white/70 disabled:opacity-50"
                  >
                    Done
                  </button>
                </motion.div>
              ) : (myHeldItemSaves.length > 0 || myHeldConnectionSaves.length > 0) ? (
                <motion.button
                  key="edit-btn"
                  type="button"
                  initial={shouldReduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: MOTION_DURATION.standard, ease: EASE_OUT }}
                  onClick={() => setIsRemoving(true)}
                  className="-mx-1 px-1 py-1.5 text-xs text-white/40 transition-colors hover:text-white/70"
                >
                  Edit
                </motion.button>
              ) : null}
            </AnimatePresence>
          </div>

          {/* Records */}
          <div className="space-y-3">
            <p className="font-lector text-sm tracking-tight text-white/50">
              {myHeldItemSaves.length}{" "}
              {myHeldItemSaves.length === 1 ? "record" : "records"}
            </p>
            {myHeldItemSaves.length === 0 ? (
              <p className="text-xs text-zinc-600">
                No records in hold. Add them from any record page.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {myHeldItemSaves.map((save, idx) => {
                  const item = itemById.get(save.reference_id);
                  if (!item) return null;
                  return (
                    <motion.button
                      key={save.id}
                      type="button"
                      onClick={() => isRemoving ? toggleRemoveSelection(save.id) : navigatePanel(`/?item=${item.id}`, "Hold")}
                      initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: MOTION_DURATION.standard, ease: EASE_OUT, delay: shouldReduceMotion ? 0 : idx * 0.05 }}
                      whileHover={shouldReduceMotion || isRemoving ? undefined : { y: -1 }}
                      className={`group flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                        isRemoving && selectedToRemove.has(save.id)
                          ? "border-white/25 bg-zinc-900/40"
                          : "border-white/10 bg-black/20 hover:border-white/20 hover:bg-zinc-900/40"
                      }`}
                    >
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md border border-white/10 bg-zinc-900">
                        {item.thumbnail_url ? (
                          <img src={item.thumbnail_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[9px] uppercase tracking-widest text-zinc-600">
                            {item.type}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5 py-0.5">
                        <p className="truncate font-lector text-sm text-white/90">{item.title}</p>
                        <p className="truncate text-[11px] text-white/40">
                          {[item.creator, item.media_date].filter(Boolean).join(" · ")}
                        </p>
                        {!item.voice_recording_url && (
                          <p className="text-[11px] text-amber-400/60">No audio recorded</p>
                        )}
                      </div>
                      <span aria-hidden className={`ml-auto shrink-0 text-xs transition-colors ${
                        isRemoving
                          ? selectedToRemove.has(save.id) ? "text-white/80" : "text-white/20"
                          : "text-white/30 group-hover:text-white/70"
                      }`}>
                        {isRemoving ? (selectedToRemove.has(save.id) ? "●" : "○") : "Open →"}
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Connections */}
          <div className="space-y-3">
            <p className="font-lector text-sm tracking-tight text-white/50">
              {myHeldConnectionSaves.length}{" "}
              {myHeldConnectionSaves.length === 1 ? "connection" : "connections"}
            </p>

            {myHeldConnectionSaves.length > 0 && (
              <div className="flex flex-col gap-2">
                {myHeldConnectionSaves.map((save, idx) => {
                  const conn = connectionById.get(save.reference_id);
                  if (!conn) return null;
                  const [c1, c2, c3] = connCreatorGradients[conn.created_by] ?? CONNECTION_PREVIEW_DEFAULT_COLORS;
                  const creatorFirst = connCreatorFirstNames[conn.created_by] ?? conn.created_by.split("@")[0];
                  const connItemIds = connectionItemIdsMap[conn.id] ?? [];
                  const connItems = connItemIds.map((id) => itemById.get(id)).filter(Boolean) as Item[];
                  const isSelected = selectedToRemove.has(save.id);
                  return (
                    <motion.button
                      key={save.id}
                      type="button"
                      onClick={() => isRemoving ? toggleRemoveSelection(save.id) : navigatePanel(`/?connection=${conn.id}`, "Hold")}
                      initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: MOTION_DURATION.standard, ease: EASE_OUT, delay: shouldReduceMotion ? 0 : idx * 0.05 }}
                      whileHover={shouldReduceMotion || isRemoving ? undefined : { y: -1 }}
                      className={`group relative w-full overflow-hidden rounded-xl border text-left transition-colors ${
                        isRemoving && isSelected
                          ? "border-white/25 bg-zinc-900/40"
                          : "border-white/10 bg-black/20 hover:border-white/20 hover:bg-zinc-900/40"
                      }`}
                    >
                      <div className="pointer-events-none absolute inset-0 scale-110" style={{ background: `radial-gradient(ellipse at center, ${c1} 0%, ${c2} 50%, ${c3} 100%)`, filter: "blur(24px) brightness(0.22)" }} />
                      <div className="relative z-10 flex w-full items-center gap-3 p-3">
                        <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-white/10">
                          {connItems.length === 0 ? (
                            <div className="flex h-full w-full items-center justify-center text-[9px] uppercase tracking-widest text-zinc-500">∿</div>
                          ) : (
                            connItems.slice(0, 5).map((item, i) => (
                              <div key={item.id} className="absolute inset-0" style={{ zIndex: i + 1 }}>
                                {item.thumbnail_url ? (
                                  <img src={item.thumbnail_url} alt="" className="h-full w-full object-cover" draggable={false} />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center bg-zinc-800 text-[8px] uppercase tracking-widest text-zinc-600">···</div>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                        <div className="min-w-0 flex-1 space-y-0.5 py-0.5">
                          {conn.title ? (
                            <p className="truncate font-lector text-sm text-white/90">{conn.title}</p>
                          ) : (
                            <p className="min-w-0 truncate font-lector text-sm text-white/90">
                              {connItems.length > 0 ? connItems.map((item, i) => <span key={item.id}>{i > 0 ? <span className="text-white/40"> & </span> : null}{item.title}</span>) : <span className="text-white/40">Connection</span>}
                            </p>
                          )}
                          <p className="truncate text-xs text-white/40">{creatorFirst}, {formatDateShort(conn.created_at)}</p>
                        </div>
                        <span aria-hidden className={`ml-auto shrink-0 text-xs transition-colors ${
                          isRemoving
                            ? isSelected ? "text-white/80" : "text-white/20"
                            : "text-white/30 group-hover:text-white/70"
                        }`}>
                          {isRemoving ? (isSelected ? "●" : "○") : "Open →"}
                        </span>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="h-6" />
        </div>
      </div>

      {/* ── Right pane — Everyone's Holds ────────────────────── */}
      <motion.div
        className={`relative z-10 flex flex-col overflow-hidden border-l border-white/10 bg-black${isMobile ? " flex-1" : " w-[420px] shrink-0"}${isMobile && mobileTab !== "right" ? " hidden" : ""}`}
        initial={shouldReduceMotion ? false : { opacity: 0, x: 8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{
          duration: MOTION_DURATION.panel,
          ease: EASE_OUT,
          delay: shouldReduceMotion ? 0 : 0.04,
        }}
      >
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto scrollbar-hide px-6 py-6">
          <h2 className="font-lector text-xl tracking-tight text-white/95">
            Everyone's Holds
          </h2>

          <div className="relative">
            <input
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search contributors..."
              className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2.5 font-sans text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:border-zinc-600"
            />
            {userSearch && (
              <button
                type="button"
                onClick={() => setUserSearch("")}
                className="absolute right-0 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center text-xs text-zinc-500 transition-colors hover:text-zinc-300"
              >
                ×
              </button>
            )}
          </div>

          {filteredUsers.length === 0 ? (
            <p className="text-xs text-zinc-600">
              {userSearch ? "No contributors match." : "No holds yet."}
            </p>
          ) : (
            <div className="space-y-2">
              {filteredUsers.map((u) => (
                <UserCard
                  key={u.email}
                  user={u}
                  isExpanded={expandedEmail === u.email}
                  onToggle={() =>
                    setExpandedEmail((prev) => (prev === u.email ? null : u.email))
                  }
                  items={itemById}
                  connections={connectionById}
                  saves={savesByEmail[u.email] ?? []}
                  connectionItemIdsMap={connectionItemIdsMap}
                  connCreatorFirstNames={connCreatorFirstNames}
                  connCreatorGradients={connCreatorGradients}
                  shouldReduceMotion={shouldReduceMotion}
                  onNavigate={(url) => navigatePanel(url, "Holds")}
                />
              ))}
            </div>
          )}
        </div>
      </motion.div>
      </div>
    </div>
  );
}
