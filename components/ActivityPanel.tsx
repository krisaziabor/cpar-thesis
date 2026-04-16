"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { usePanelHistory } from "@/lib/panel-history-context";
import {
  subscribeToItems,
  subscribeToAllConnections,
  subscribeToAllConnectionItems,
} from "@/lib/items";
import type { Item, Connection, ConnectionItem } from "@/lib/types";
import { getWhitelistAccessInfo } from "@/lib/whitelist";
import { getUserProfile } from "@/lib/users";

type ActivityEntry =
  | {
      key: string;
      type: "added";
      person: string;
      created_at: unknown;
      itemId: string;
      itemTitle: string;
    }
  | {
      key: string;
      type: "connected";
      person: string;
      created_at: unknown;
      connectionId: string;
      connectedItems: Item[];
    };

type ActivityFilter = "all" | "added" | "connected" | "mine";

function tsMillis(ts: unknown): number {
  if (ts && typeof ts === "object" && "toDate" in ts) {
    return (ts as { toDate: () => Date }).toDate().getTime();
  }
  return 0;
}

function toDate(ts: unknown): Date | null {
  if (ts && typeof ts === "object" && "toDate" in ts) {
    return (ts as { toDate: () => Date }).toDate();
  }
  return null;
}

function formatDate(ts: unknown): string {
  const date = toDate(ts);
  if (!date) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function groupLabel(ts: unknown): "Today" | "This week" | "Earlier" {
  const date = toDate(ts);
  if (!date) return "Earlier";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfEventDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  ).getTime();
  const ageMs = startOfToday - startOfEventDay;
  const oneDayMs = 24 * 60 * 60 * 1000;
  if (ageMs <= 0) return "Today";
  if (ageMs <= oneDayMs * 6) return "This week";
  return "Earlier";
}

function formatFilterLabel(filter: ActivityFilter): string {
  if (filter === "all") return "All";
  if (filter === "added") return "Adds";
  if (filter === "connected") return "Connections";
  return "Mine";
}

function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export default function ActivityPanel() {
  const { user } = useAuth();
  const { navigatePanel } = usePanelHistory();
  const [items, setItems] = useState<Item[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectionItems, setConnectionItems] = useState<ConnectionItem[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [nameByEmail, setNameByEmail] = useState<Record<string, string>>({});

  useEffect(() => subscribeToItems((fetched) => { setItems(fetched); setDataLoading(false); }), []);
  useEffect(() => subscribeToAllConnections(setConnections), []);
  useEffect(() => subscribeToAllConnectionItems(setConnectionItems), []);

  const activity = useMemo<ActivityEntry[]>(() => {
    const itemEntries: ActivityEntry[] = items.map((item) => ({
      key: `item-${item.id}`,
      type: "added",
      person: item.added_by,
      created_at: item.created_at,
      itemId: item.id,
      itemTitle: item.title,
    }));

    const connectionEntries: ActivityEntry[] = connections.map((conn) => {
      const connectedItems = connectionItems
        .filter((ci) => ci.connection_id === conn.id)
        .map((ci) => items.find((i) => i.id === ci.item_id))
        .filter(Boolean) as Item[];
      return {
        key: `conn-${conn.id}`,
        type: "connected",
        person: conn.created_by,
        created_at: conn.created_at,
        connectionId: conn.id,
        connectedItems,
      };
    });

    return [...itemEntries, ...connectionEntries].sort(
      (a, b) => tsMillis(b.created_at) - tsMillis(a.created_at)
    );
  }, [items, connections, connectionItems]);

  const filteredActivity = useMemo(() => {
    const normalizedUser = (user?.email ?? "").toLowerCase();
    return activity.filter((entry) => {
      if (filter === "all") return true;
      if (filter === "added") return entry.type === "added";
      if (filter === "connected") return entry.type === "connected";
      return normalizedUser.length > 0 && entry.person.toLowerCase() === normalizedUser;
    });
  }, [activity, filter, user?.email]);

  const activityCounts = useMemo(() => {
    const adds = activity.filter((entry) => entry.type === "added").length;
    const connectionsCount = activity.filter((entry) => entry.type === "connected").length;
    const mine = activity.filter(
      (entry) => entry.person.toLowerCase() === (user?.email ?? "").toLowerCase()
    ).length;
    return { adds, connectionsCount, mine };
  }, [activity, user?.email]);

  const groupedActivity = useMemo(() => {
    const groups: Array<{
      label: "Today" | "This week" | "Earlier";
      items: ActivityEntry[];
    }> = [
      { label: "Today", items: [] },
      { label: "This week", items: [] },
      { label: "Earlier", items: [] },
    ];

    filteredActivity.forEach((entry) => {
      const label = groupLabel(entry.created_at);
      const target = groups.find((group) => group.label === label);
      if (target) target.items.push(entry);
    });

    return groups.filter((group) => group.items.length > 0);
  }, [filteredActivity]);

  useEffect(() => {
    const authors = Array.from(new Set(activity.map((entry) => entry.person.toLowerCase())));
    const unresolved = authors.filter((author) => author.includes("@") && !nameByEmail[author]);
    if (unresolved.length === 0) return;

    let cancelled = false;

    async function resolveNames() {
      const resolved: Record<string, string> = {};

      await Promise.all(
        unresolved.map(async (email) => {
          try {
            const access = await getWhitelistAccessInfo(email);
            if (access.firstName) {
              resolved[email] = access.firstName;
              return;
            }
            const profile = await getUserProfile(email);
            const firstName = profile?.name?.trim().split(/\s+/)[0];
            if (firstName) resolved[email] = firstName;
          } catch {
            // Ignore lookup failures and keep fallback label.
          }
        })
      );

      if (!cancelled && Object.keys(resolved).length > 0) {
        setNameByEmail((prev) => ({ ...prev, ...resolved }));
      }
    }

    void resolveNames();
    return () => {
      cancelled = true;
    };
  }, [activity, nameByEmail]);

  function displayPerson(person: string): string {
    const key = person.toLowerCase();
    if (nameByEmail[key]) return nameByEmail[key];
    if (person.includes("@")) {
      const firstToken = person.split("@")[0]?.split(/[._-]+/)[0];
      return firstToken ? firstToken : person;
    }
    return person;
  }

  return (
    <div className="space-y-5 px-6 py-6">
      <div className="space-y-1">
        <p className="font-lector text-base text-zinc-300">Activity</p>
        <p className="text-xs text-zinc-500">
          {dataLoading
            ? "Loading activity..."
            : `${pluralize(activityCounts.adds, "add", "adds")} · ${pluralize(activityCounts.connectionsCount, "connection", "connections")} · ${pluralize(activityCounts.mine, "entry", "entries")} by you`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "added", "connected", "mine"] as const).map((option) => {
          const active = filter === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              className={`rounded border px-2.5 py-1 text-[11px] transition-colors ${
                active
                  ? "border-zinc-600 bg-zinc-900 text-zinc-200"
                  : "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
              }`}
            >
              {formatFilterLabel(option)}
            </button>
          );
        })}
      </div>

      {dataLoading && (
        <p className="text-xs text-zinc-600">Loading activity...</p>
      )}

      {!dataLoading && groupedActivity.length === 0 && (
        <p className="text-xs text-zinc-600">
          No activity in this view.{" "}
          <Link href="/add" className="underline underline-offset-2 hover:text-zinc-300">
            Add the first item
          </Link>
        </p>
      )}

      {!dataLoading && groupedActivity.length > 0 && (
        <div className="space-y-5">
          {groupedActivity.map((group) => (
            <section key={group.label} className="space-y-1">
              <p className="text-[11px] uppercase tracking-wide text-zinc-600">{group.label}</p>
              <div className="flex flex-col">
                {group.items.map((a) => (
                  <div
                    key={a.key}
                    className="group flex items-start justify-between gap-3 border-b border-zinc-800 py-3 transition-colors hover:bg-zinc-900/40 last:border-0"
                  >
                    <div className="min-w-0">
                      {a.type === "added" && (
                        <p className="text-xs leading-snug text-zinc-400">
                          <span className="text-zinc-200">{displayPerson(a.person)}</span>
                          <span className="text-zinc-500"> added </span>
                          <button
                            type="button"
                            onClick={() =>
                              navigatePanel(`/?item=${a.itemId}`, "Activity")
                            }
                            className="font-lector text-zinc-200 underline-offset-2 transition-colors hover:text-zinc-100 hover:underline"
                          >
                            {a.itemTitle}
                          </button>
                        </p>
                      )}
                      {a.type === "connected" && (
                        <p className="text-xs leading-snug text-zinc-400">
                          <span className="text-zinc-200">{displayPerson(a.person)}</span>
                          <span className="text-zinc-500"> connected </span>
                          {a.connectedItems.length > 0 ? (
                            <>
                              {a.connectedItems.map((item, idx) => (
                                <span key={item.id}>
                                  {idx > 0 && <span className="text-zinc-600"> · </span>}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      navigatePanel(`/?item=${item.id}`, "Activity")
                                    }
                                    className="font-lector text-zinc-200 underline-offset-2 transition-colors hover:text-zinc-100 hover:underline"
                                  >
                                    {item.title}
                                  </button>
                                </span>
                              ))}
                            </>
                          ) : (
                            <span className="text-zinc-500">items</span>
                          )}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-zinc-600 transition-colors group-hover:text-zinc-500">
                      {formatDate(a.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Bottom padding for floating nav clearance */}
      <div className="h-16" />
    </div>
  );
}
