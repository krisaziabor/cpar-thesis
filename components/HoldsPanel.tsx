"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { subscribeToAllKanonSaves, subscribeToUserKanon } from "@/lib/kanon";
import { subscribeToItems } from "@/lib/items";
import type { Item, KanonSave } from "@/lib/types";
import { getUserProfile } from "@/lib/users";

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

export default function HoldsPanel({ currentUserEmail, initialUserEmail }: HoldsPanelProps) {
  const [allSaves, setAllSaves] = useState<KanonSave[]>([]);
  const [selectedUserEmail, setSelectedUserEmail] = useState<string | null>(
    initialUserEmail ?? currentUserEmail ?? null
  );
  const [selectedUserSaves, setSelectedUserSaves] = useState<KanonSave[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [userNames, setUserNames] = useState<Record<string, string>>({});

  useEffect(() => subscribeToAllKanonSaves(setAllSaves), []);
  useEffect(() => subscribeToItems(setItems), []);

  const holdUsers = useMemo(() => {
    const byEmail = new Map<string, { email: string; count: number; lastSavedAt: unknown }>();
    allSaves.forEach((save) => {
      const key = save.user_email;
      const prev = byEmail.get(key);
      if (!prev) {
        byEmail.set(key, { email: key, count: 1, lastSavedAt: save.created_at });
        return;
      }
      byEmail.set(key, { ...prev, count: prev.count + 1 });
    });
    return [...byEmail.values()].sort((a, b) => a.email.localeCompare(b.email));
  }, [allSaves]);

  useEffect(() => {
    if (!selectedUserEmail && holdUsers.length > 0) {
      setSelectedUserEmail(holdUsers[0]?.email ?? null);
    }
  }, [holdUsers, selectedUserEmail]);

  useEffect(() => {
    if (!selectedUserEmail) {
      setSelectedUserSaves([]);
      return;
    }
    return subscribeToUserKanon(selectedUserEmail, setSelectedUserSaves);
  }, [selectedUserEmail]);

  useEffect(() => {
    const uniqueEmails = [...new Set(holdUsers.map((u) => u.email))];
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
  }, [holdUsers]);

  const selectedItemSaves = useMemo(
    () => selectedUserSaves.filter((save) => save.reference_type === "item"),
    [selectedUserSaves]
  );

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  return (
    <div className="space-y-6 px-6 py-6">
      <div className="space-y-1">
        <h2 className="font-lector text-lg text-zinc-100">Holds</h2>
        <p className="text-xs text-zinc-500">Browse public hold lists and open records in-panel.</p>
      </div>

      <section className="space-y-2">
        <h3 className="font-lector text-sm text-zinc-300">Users</h3>
        <div className="flex flex-wrap gap-2">
          {holdUsers.map((entry) => {
            const selected = entry.email === selectedUserEmail;
            const label = userNames[entry.email] ?? entry.email.split("@")[0];
            return (
              <button
                key={entry.email}
                type="button"
                onClick={() => setSelectedUserEmail(entry.email)}
                className={`rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                  selected
                    ? "border-zinc-600 bg-zinc-900 text-zinc-100"
                    : "border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="font-lector text-sm text-zinc-300">
          {selectedUserEmail ? `${userNames[selectedUserEmail] ?? selectedUserEmail.split("@")[0]}'s Hold` : "Hold"}
        </h3>
        {selectedItemSaves.length === 0 ? (
          <p className="text-xs text-zinc-600">No saved records yet.</p>
        ) : (
          <div className="space-y-2">
            {selectedItemSaves.map((save) => {
              const item = itemById.get(save.reference_id);
              if (!item) return null;
              return (
                <Link
                  key={save.id}
                  href={`/?item=${item.id}&holdUser=${encodeURIComponent(selectedUserEmail ?? "")}`}
                  className="flex gap-3 rounded-md border border-zinc-800 px-3 py-2 transition-colors hover:border-zinc-700 hover:bg-zinc-900"
                >
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded border border-zinc-800 bg-zinc-900">
                    {item.thumbnail_url ? (
                      <img src={item.thumbnail_url} alt={item.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] text-zinc-600">
                        no image
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <p className="truncate font-lector text-sm text-zinc-100">{item.title}</p>
                    <p className="truncate text-xs text-zinc-500">
                      {[item.creator, item.media_date].filter(Boolean).join(" · ")}
                    </p>
                    <p className="text-[11px] text-zinc-600">Saved {formatDate(save.created_at)}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

