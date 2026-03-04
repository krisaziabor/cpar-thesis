"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { subscribeToItems, subscribeToDrafts, discardDraft } from "@/lib/items";
import { saveToKanon, removeFromKanon, subscribeToUserKanon } from "@/lib/kanon";
import type { Item, KanonSave } from "@/lib/types";

export default function Home() {
  const { user, role, loading: authLoading, signOut } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [drafts, setDrafts] = useState<Item[]>([]);
  const [kanonSaves, setKanonSaves] = useState<KanonSave[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [personFilter, setPersonFilter] = useState("all");

  useEffect(() => {
    const unsubscribe = subscribeToItems((fetched) => {
      setItems(fetched);
      setDataLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user?.email) return;
    const unsubscribe = subscribeToDrafts(user.email, setDrafts);
    return unsubscribe;
  }, [user?.email]);

  useEffect(() => {
    if (!user?.email) return;
    const unsub = subscribeToUserKanon(user.email, setKanonSaves);
    return unsub;
  }, [user?.email]);

  // Derive filter options from live data
  const typeOptions = useMemo(
    () => ["all", ...Array.from(new Set(items.map((i) => i.type))).sort()],
    [items]
  );
  const tagOptions = useMemo(
    () => ["all", ...Array.from(new Set(items.flatMap((i) => i.tags))).sort()],
    [items]
  );
  const personOptions = useMemo(
    () => ["all", ...Array.from(new Set(items.map((i) => i.added_by))).sort()],
    [items]
  );

  const savedItemIds = useMemo(
    () => new Set(kanonSaves.filter((s) => s.reference_type === "item").map((s) => s.reference_id)),
    [kanonSaves]
  );

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-black">
        <span className="font-mono text-xs text-zinc-400">loading…</span>
      </div>
    );
  }
  if (!user) return null;

  const filtered = items.filter((item) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      item.title.toLowerCase().includes(q) ||
      item.creator.toLowerCase().includes(q);
    const matchType = typeFilter === "all" || item.type === typeFilter;
    const matchTag = tagFilter === "all" || item.tags.includes(tagFilter);
    const matchPerson = personFilter === "all" || item.added_by === personFilter;
    return matchSearch && matchType && matchTag && matchPerson;
  });

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      {/* Header */}
      <header className="border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <span className="font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Kanon
          </span>
          <nav className="flex items-center gap-1">
            <span className="px-3 py-1 text-sm text-zinc-300 dark:text-zinc-700 cursor-not-allowed select-none">
              Graph
            </span>
            <span className="px-3 py-1 text-sm font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-50">
              List
            </span>
            <Link
              href="/activity"
              className="px-3 py-1 text-sm text-zinc-400 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-zinc-50"
            >
              Activity
            </Link>
            <Link
              href={`/kanon/${encodeURIComponent(user.email ?? "")}`}
              className="px-3 py-1 text-sm text-zinc-400 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-zinc-50"
            >
              My Kanon
            </Link>
            {role === "admin" && (
              <Link
                href="/admin"
                className="px-3 py-1 text-sm text-zinc-400 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-zinc-50"
              >
                Admin
              </Link>
            )}
          </nav>
          <div className="flex items-center gap-4">
            <Link
              href="/add"
              className="rounded border border-zinc-900 px-3 py-1 text-sm font-medium text-zinc-900 hover:bg-zinc-900 hover:text-white dark:border-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-100 dark:hover:text-zinc-900"
            >
              + Add
            </Link>
            <span className="font-mono text-xs text-zinc-400">
              {user.email}
              {role === "admin" && (
                <span className="ml-1 text-zinc-300 dark:text-zinc-600">
                  · admin
                </span>
              )}
            </span>
            <button
              onClick={signOut}
              className="text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-6">
        {/* Drafts — visible only to the current user */}
        {drafts.length > 0 && (
          <div className="mb-6">
            <p className="mb-2 font-mono text-xs text-zinc-400">
              your drafts ({drafts.length})
            </p>
            <div className="border border-zinc-200 dark:border-zinc-800">
              {drafts.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 last:border-0 dark:border-zinc-900"
                >
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                      {d.title || (
                        <span className="text-zinc-400">Untitled draft</span>
                      )}
                    </p>
                    <p className="font-mono text-xs text-zinc-500">
                      {d.type} · {d.creator || "—"} · {formatDate(d.created_at)}
                      {d.voice_recording_url && (
                        <span className="ml-2 text-zinc-400">· audio saved</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <Link
                      href={`/add?draft=${d.id}`}
                      className="text-xs text-zinc-700 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50"
                    >
                      resume
                    </Link>
                    <button
                      onClick={() => discardDraft(d)}
                      className="text-xs text-zinc-400 underline underline-offset-2 hover:text-red-500"
                    >
                      discard
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search + Filters */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or creator…"
            className="min-w-48 flex-1 border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:placeholder:text-zinc-600"
          />
          <FilterSelect
            value={typeFilter}
            onChange={setTypeFilter}
            options={typeOptions}
            label="Type"
          />
          <FilterSelect
            value={tagFilter}
            onChange={setTagFilter}
            options={tagOptions}
            label="Tag"
          />
          <FilterSelect
            value={personFilter}
            onChange={setPersonFilter}
            options={personOptions}
            label="Person"
          />
        </div>

        {/* Count */}
        <p className="mb-3 font-mono text-xs text-zinc-400">
          {dataLoading ? "loading…" : `${filtered.length} item${filtered.length !== 1 ? "s" : ""}`}
        </p>

        {/* Table */}
        <div className="border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
                <Th>Title</Th>
                <Th>Type</Th>
                <Th>Creator</Th>
                <Th>Added by</Th>
                <Th>Date</Th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {!dataLoading && filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center font-mono text-xs text-zinc-400"
                  >
                    {items.length === 0 ? (
                      <>
                        library is empty —{" "}
                        <Link href="/add" className="underline underline-offset-2">
                          add the first item
                        </Link>
                      </>
                    ) : (
                      "no items match"
                    )}
                  </td>
                </tr>
              )}
              {filtered.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-zinc-100 transition-colors last:border-0 hover:bg-zinc-50 dark:border-zinc-900 dark:hover:bg-zinc-950"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/items/${item.id}`}
                      className="font-medium text-zinc-900 hover:underline dark:text-zinc-50"
                    >
                      {item.title}
                    </Link>
                  </td>
                  <Td mono>{item.type}</Td>
                  <Td>{item.creator}</Td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                    <Link
                      href={`/kanon/${encodeURIComponent(item.added_by)}`}
                      className="hover:underline underline-offset-2"
                    >
                      {item.added_by}
                    </Link>
                  </td>
                  <Td mono>{formatDate(item.created_at)}</Td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={async (e) => {
                        e.preventDefault();
                        if (!user?.email) return;
                        const saveId = kanonSaves.find(
                          (s) => s.reference_type === "item" && s.reference_id === item.id
                        )?.id ?? null;
                        if (saveId) {
                          await removeFromKanon(saveId);
                        } else {
                          await saveToKanon(user.email, "item", item.id);
                        }
                      }}
                      className="font-mono text-xs text-zinc-300 hover:text-zinc-700 dark:text-zinc-700 dark:hover:text-zinc-300"
                      title={savedItemIds.has(item.id) ? "remove from kanon" : "save to kanon"}
                    >
                      {savedItemIds.has(item.id) ? "●" : "○"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

function formatDate(ts: unknown): string {
  if (!ts) return "—";
  // Firestore Timestamp
  if (typeof ts === "object" && ts !== null && "toDate" in ts) {
    return (ts as { toDate: () => Date }).toDate().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  return String(ts);
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2 text-left font-mono text-xs font-normal text-zinc-500">
      {children}
    </th>
  );
}

function Td({ children, mono }: { children: React.ReactNode; mono?: boolean }) {
  return (
    <td
      className={`px-4 py-3 text-zinc-600 dark:text-zinc-400 ${mono ? "font-mono text-xs" : "text-sm"}`}
    >
      {children}
    </td>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  label: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border border-zinc-300 bg-white px-2 py-1.5 font-mono text-xs text-zinc-700 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt === "all" ? `all ${label.toLowerCase()}s` : opt}
        </option>
      ))}
    </select>
  );
}
