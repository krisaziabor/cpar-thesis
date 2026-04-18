"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import {
  subscribeToWhitelist,
  subscribeToAllOnboarding,
  subscribeToFeedback,
  subscribeToAllItems,
  subscribeToAllConnectionsAdmin,
  subscribeToAllSaves,
  type WhitelistEntry,
} from "@/lib/admin";
import { subscribeToDeletionRequests, resolveDeletionRequest } from "@/lib/items";
import type {
  DeletionRequest,
  Feedback,
  InstallationOnboarding,
  Item,
  Connection,
  KanonSave,
} from "@/lib/types";

type Tab = "overview" | "users" | "pieces" | "feedback" | "requests";

function formatDate(ts: unknown): string {
  if (!ts) return "—";
  if (typeof ts === "object" && ts !== null && "toDate" in ts) {
    return (ts as { toDate: () => Date }).toDate().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  return String(ts);
}

function formatDateTime(ts: unknown): string {
  if (!ts) return "—";
  if (typeof ts === "object" && ts !== null && "toDate" in ts) {
    const d = (ts as { toDate: () => Date }).toDate();
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }) + " " + d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return String(ts);
}

// ─── Stat card ───────────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-5 py-4">
      <p className="text-xs text-zinc-500 uppercase tracking-wider">{label}</p>
      <p className="mt-1 text-2xl font-medium text-zinc-50">{value}</p>
    </div>
  );
}

// ─── Overview tab ────────────────────────────────────────────────────────────

function OverviewTab({
  whitelist,
  items,
  connections,
  saves,
  onboarding,
  feedback,
  requests,
}: {
  whitelist: WhitelistEntry[];
  items: Item[];
  connections: Connection[];
  saves: KanonSave[];
  onboarding: InstallationOnboarding[];
  feedback: Feedback[];
  requests: DeletionRequest[];
}) {
  const publishedItems = items.filter((i) => !i.is_draft);
  const drafts = items.filter((i) => i.is_draft);
  const completedOnboarding = onboarding.filter((o) => o.completed_at);
  const uniqueContributors = new Set(publishedItems.map((i) => i.added_by));
  const uniqueSavers = new Set(saves.map((s) => s.user_email));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Stat label="Users" value={whitelist.length} />
        <Stat label="Published records" value={publishedItems.length} />
        <Stat label="Drafts" value={drafts.length} />
        <Stat label="Connections" value={connections.length} />
        <Stat label="Holds" value={saves.length} />
        <Stat label="Contributors" value={uniqueContributors.size} />
        <Stat label="Users with holds" value={uniqueSavers.size} />
        <Stat label="Feedback" value={feedback.length} />
        <Stat
          label="Onboarding completed"
          value={`${completedOnboarding.length} / ${onboarding.length}`}
        />
        <Stat label="Pending deletions" value={requests.length} />
      </div>

      <div>
        <h3 className="mb-3 text-xs text-zinc-500 uppercase tracking-wider">
          Recent activity
        </h3>
        <div className="space-y-2">
          {items.slice(0, 8).map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded border border-zinc-800 px-4 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-zinc-200">{item.title}</p>
                <p className="text-xs text-zinc-500">
                  {item.is_draft ? "Draft" : "Published"} by {item.added_by}
                </p>
              </div>
              <span className="shrink-0 text-xs text-zinc-600">
                {formatDate(item.created_at)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Users tab ───────────────────────────────────────────────────────────────

function UsersTab({
  whitelist,
  onboarding,
  items,
  saves,
}: {
  whitelist: WhitelistEntry[];
  onboarding: InstallationOnboarding[];
  items: Item[];
  saves: KanonSave[];
}) {
  const [search, setSearch] = useState("");

  const onboardingMap = useMemo(() => {
    const m = new Map<string, InstallationOnboarding>();
    onboarding.forEach((o) => m.set(o.user_email, o));
    return m;
  }, [onboarding]);

  const itemCountByUser = useMemo(() => {
    const m = new Map<string, number>();
    items.filter((i) => !i.is_draft).forEach((i) => {
      m.set(i.added_by, (m.get(i.added_by) ?? 0) + 1);
    });
    return m;
  }, [items]);

  const saveCountByUser = useMemo(() => {
    const m = new Map<string, number>();
    saves.forEach((s) => {
      m.set(s.user_email, (m.get(s.user_email) ?? 0) + 1);
    });
    return m;
  }, [saves]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return whitelist
      .filter((w) => {
        if (!term) return true;
        const ob = onboardingMap.get(w.email);
        const name = ob?.user_name ?? w.name ?? "";
        return (
          w.email.toLowerCase().includes(term) ||
          name.toLowerCase().includes(term)
        );
      })
      .sort((a, b) => a.email.localeCompare(b.email));
  }, [whitelist, search, onboardingMap]);

  return (
    <div className="space-y-4">
      <input
        type="text"
        placeholder="Search users…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-600"
      />

      <div className="overflow-x-auto rounded border border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wider">
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium text-center">Onboarding</th>
              <th className="px-4 py-2.5 font-medium text-center">Records</th>
              <th className="px-4 py-2.5 font-medium text-center">Holds</th>
              <th className="px-4 py-2.5 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((w) => {
              const ob = onboardingMap.get(w.email);
              const name = ob?.user_name ?? w.name ?? "—";
              const onboardingStatus = ob?.completed_at
                ? "Complete"
                : ob
                ? "In progress"
                : "Not started";

              return (
                <tr
                  key={w.email}
                  className="border-b border-zinc-900 last:border-0 hover:bg-zinc-900/50"
                >
                  <td className="px-4 py-2.5 text-zinc-300">{w.email}</td>
                  <td className="px-4 py-2.5 text-zinc-400">{name}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-xs ${
                        w.role === "admin"
                          ? "bg-amber-900/40 text-amber-300"
                          : "bg-zinc-800 text-zinc-400"
                      }`}
                    >
                      {w.role}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span
                      className={`text-xs ${
                        onboardingStatus === "Complete"
                          ? "text-emerald-400"
                          : onboardingStatus === "In progress"
                          ? "text-amber-400"
                          : "text-zinc-600"
                      }`}
                    >
                      {onboardingStatus}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center text-zinc-400">
                    {itemCountByUser.get(w.email) ?? 0}
                  </td>
                  <td className="px-4 py-2.5 text-center text-zinc-400">
                    {saveCountByUser.get(w.email) ?? 0}
                  </td>
                  <td className="px-4 py-2.5 text-zinc-500 text-xs">
                    {w.self_registered ? "Self-registered" : ""}{" "}
                    {formatDate(w.created_at)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-zinc-600">
            No users match your search.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Written pieces tab ──────────────────────────────────────────────────────

function PiecesTab({
  onboarding,
}: {
  onboarding: InstallationOnboarding[];
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const pieces = useMemo(
    () =>
      onboarding
        .filter((o) => o.book_text || o.book_pdf_url)
        .sort((a, b) => {
          const aT = a.book_submitted_at;
          const bT = b.book_submitted_at;
          if (!aT && !bT) return 0;
          if (!aT) return 1;
          if (!bT) return -1;
          const aDate = (aT as { toDate: () => Date }).toDate?.() ?? new Date(0);
          const bDate = (bT as { toDate: () => Date }).toDate?.() ?? new Date(0);
          return bDate.getTime() - aDate.getTime();
        }),
    [onboarding]
  );

  if (pieces.length === 0) {
    return (
      <div className="rounded border border-zinc-800 px-4 py-8 text-center text-xs text-zinc-500">
        No written pieces submitted yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pieces.map((p) => {
        const isExpanded = expanded === p.id;
        return (
          <div
            key={p.id}
            className="rounded border border-zinc-800 overflow-hidden"
          >
            <button
              onClick={() => setExpanded(isExpanded ? null : p.id)}
              className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-zinc-900/50"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-200 truncate">
                  {p.book_title || "Untitled"}
                  {p.book_date && (
                    <span className="ml-2 text-xs text-zinc-500">
                      ({p.book_date})
                    </span>
                  )}
                </p>
                <p className="text-xs text-zinc-500">
                  {p.user_name ?? p.user_email} · submitted{" "}
                  {formatDate(p.book_submitted_at)}
                </p>
              </div>
              <span className="ml-3 shrink-0 text-zinc-600">
                {isExpanded ? "▾" : "▸"}
              </span>
            </button>

            {isExpanded && (
              <div className="border-t border-zinc-800 px-4 py-4 space-y-3">
                {p.book_text && (
                  <div className="whitespace-pre-wrap text-sm text-zinc-300 leading-relaxed max-h-96 overflow-y-auto">
                    {p.book_text}
                  </div>
                )}
                {p.book_pdf_url && (
                  <a
                    href={p.book_pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-200"
                  >
                    View formatting PDF ↗
                  </a>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Feedback tab ────────────────────────────────────────────────────────────

function FeedbackTab({ feedback }: { feedback: Feedback[] }) {
  if (feedback.length === 0) {
    return (
      <div className="rounded border border-zinc-800 px-4 py-8 text-center text-xs text-zinc-500">
        No feedback submitted yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {feedback.map((f) => (
        <div
          key={f.id}
          className="rounded border border-zinc-800 px-4 py-3.5"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
              {f.text}
            </p>
            <span className="shrink-0 text-xs text-zinc-600">
              {formatDateTime(f.created_at)}
            </span>
          </div>
          <p className="mt-2 text-xs text-zinc-500">
            {f.user_name} ({f.user_email})
          </p>
        </div>
      ))}
    </div>
  );
}

// ─── Deletion requests tab ───────────────────────────────────────────────────

function RequestsTab({
  requests,
  user,
}: {
  requests: DeletionRequest[];
  user: { email: string | null };
}) {
  const [resolving, setResolving] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleResolve(
    req: DeletionRequest,
    decision: "approved" | "rejected"
  ) {
    if (!user.email) return;
    setResolving((r) => ({ ...r, [req.id]: true }));
    setErrors((e) => ({ ...e, [req.id]: "" }));
    try {
      await resolveDeletionRequest(req.id, req.item_id, decision, user.email);
    } catch (err) {
      setErrors((e) => ({
        ...e,
        [req.id]: err instanceof Error ? err.message : "Action failed.",
      }));
    }
    setResolving((r) => ({ ...r, [req.id]: false }));
  }

  if (requests.length === 0) {
    return (
      <div className="rounded border border-zinc-800 px-4 py-8 text-center text-xs text-zinc-500">
        No pending deletion requests.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {requests.map((req) => (
        <div
          key={req.id}
          className="rounded border border-zinc-800 px-4 py-3.5"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium text-zinc-200">
                <Link
                  href={`/?item=${req.item_id}`}
                  className="hover:underline underline-offset-2"
                >
                  {req.item_title}
                </Link>
              </p>
              <p className="text-xs text-zinc-500">
                Requested by {req.requested_by} · {formatDate(req.created_at)}
              </p>
              <p className="text-sm text-zinc-400">{req.reason}</p>
              {errors[req.id] && (
                <p className="text-xs text-red-500">{errors[req.id]}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <button
                onClick={() => handleResolve(req, "approved")}
                disabled={resolving[req.id]}
                className="text-xs font-medium text-red-500 underline underline-offset-2 hover:text-red-400 disabled:opacity-40"
              >
                approve
              </button>
              <button
                onClick={() => handleResolve(req, "rejected")}
                disabled={resolving[req.id]}
                className="text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-200 disabled:opacity-40"
              >
                reject
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "users", label: "Users" },
  { id: "pieces", label: "Written pieces" },
  { id: "feedback", label: "Feedback" },
  { id: "requests", label: "Deletion requests" },
];

export default function AdminPage() {
  const { loading, user, role, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");

  const [whitelist, setWhitelist] = useState<WhitelistEntry[]>([]);
  const [onboarding, setOnboarding] = useState<InstallationOnboarding[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [saves, setSaves] = useState<KanonSave[]>([]);
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (role !== "admin") return;

    let loadedCount = 0;
    const total = 7;
    const checkReady = () => {
      loadedCount++;
      if (loadedCount >= total) setDataLoading(false);
    };

    const unsubs = [
      subscribeToWhitelist((d) => { setWhitelist(d); checkReady(); }),
      subscribeToAllOnboarding((d) => { setOnboarding(d); checkReady(); }),
      subscribeToFeedback((d) => { setFeedback(d); checkReady(); }),
      subscribeToAllItems((d) => { setItems(d); checkReady(); }),
      subscribeToAllConnectionsAdmin((d) => { setConnections(d); checkReady(); }),
      subscribeToAllSaves((d) => { setSaves(d); checkReady(); }),
      subscribeToDeletionRequests((d) => { setRequests(d); checkReady(); }),
    ];

    return () => unsubs.forEach((u) => u());
  }, [role]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <span className="text-xs text-zinc-500">loading…</span>
      </div>
    );
  }

  if (!user || role !== "admin") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black">
        <p className="font-sans text-lg font-medium text-zinc-400">404</p>
        <p className="text-sm text-zinc-500">This page could not be found.</p>
        <Link
          href="/"
          className="text-xs text-zinc-500 underline underline-offset-2 transition-colors hover:text-zinc-300"
        >
          Back to Kanon
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-zinc-200">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link
            href="/"
            className="font-lector text-sm text-zinc-50 hover:text-zinc-300"
          >
            Kanon
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-xs text-zinc-500">
              {user.email}
              <span className="ml-1 text-zinc-600">· admin</span>
            </span>
            <button
              onClick={signOut}
              className="text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-300"
            >
              sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        {/* Tab bar */}
        <div className="mb-6 flex items-center gap-1 border-b border-zinc-800 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap px-3 py-2 text-sm transition-colors ${
                tab === t.id
                  ? "border-b-2 border-zinc-200 text-zinc-50 -mb-px"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {t.label}
              {t.id === "requests" && requests.length > 0 && (
                <span className="ml-1.5 rounded-full bg-red-900/60 px-1.5 py-0.5 text-[10px] text-red-300">
                  {requests.length}
                </span>
              )}
              {t.id === "feedback" && feedback.length > 0 && (
                <span className="ml-1.5 rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                  {feedback.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {dataLoading ? (
          <p className="text-xs text-zinc-500">loading data…</p>
        ) : (
          <>
            {tab === "overview" && (
              <OverviewTab
                whitelist={whitelist}
                items={items}
                connections={connections}
                saves={saves}
                onboarding={onboarding}
                feedback={feedback}
                requests={requests}
              />
            )}
            {tab === "users" && (
              <UsersTab
                whitelist={whitelist}
                onboarding={onboarding}
                items={items}
                saves={saves}
              />
            )}
            {tab === "pieces" && <PiecesTab onboarding={onboarding} />}
            {tab === "feedback" && <FeedbackTab feedback={feedback} />}
            {tab === "requests" && (
              <RequestsTab requests={requests} user={user} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
