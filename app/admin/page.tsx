"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { subscribeToDeletionRequests, resolveDeletionRequest } from "@/lib/items";
import type { DeletionRequest } from "@/lib/types";

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

export default function AdminPage() {
  const { loading, user, role, signOut } = useAuth();
  const router = useRouter();

  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [resolving, setResolving] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Guard: non-admins get redirected
  useEffect(() => {
    if (!loading && role !== "admin") {
      router.replace("/");
    }
  }, [loading, role, router]);

  useEffect(() => {
    const unsubscribe = subscribeToDeletionRequests((fetched) => {
      setRequests(fetched);
      setDataLoading(false);
    });
    return unsubscribe;
  }, []);

  if (loading || role !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-black">
        <span className="font-mono text-xs text-zinc-400">loading…</span>
      </div>
    );
  }
  if (!user) return null;

  async function handleResolve(
    req: DeletionRequest,
    decision: "approved" | "rejected"
  ) {
    setResolving((r) => ({ ...r, [req.id]: true }));
    setErrors((e) => ({ ...e, [req.id]: "" }));
    // Optimistic removal
    setRequests((prev) => prev.filter((r) => r.id !== req.id));
    try {
      await resolveDeletionRequest(req.id, req.item_id, decision, user!.email!);
    } catch (err) {
      // Revert on failure
      setRequests((prev) => [req, ...prev]);
      setErrors((e) => ({
        ...e,
        [req.id]: err instanceof Error ? err.message : "Action failed.",
      }));
    }
    setResolving((r) => ({ ...r, [req.id]: false }));
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <header className="border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <span className="font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Kanon
          </span>
          <nav className="flex items-center gap-1">
            <span className="px-3 py-1 text-sm text-zinc-300 dark:text-zinc-700 cursor-not-allowed select-none">
              Graph
            </span>
            <Link
              href="/"
              className="px-3 py-1 text-sm text-zinc-400 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-zinc-50"
            >
              List
            </Link>
            <Link
              href="/activity"
              className="px-3 py-1 text-sm text-zinc-400 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-zinc-50"
            >
              Activity
            </Link>
            <span className="px-3 py-1 text-sm font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-50">
              Admin
            </span>
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
              <span className="ml-1 text-zinc-300 dark:text-zinc-600">· admin</span>
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
        <p className="mb-4 font-mono text-xs text-zinc-400">deletion requests</p>

        {dataLoading && (
          <p className="font-mono text-xs text-zinc-400">loading…</p>
        )}

        {!dataLoading && requests.length === 0 && (
          <div className="border border-zinc-200 px-4 py-8 text-center font-mono text-xs text-zinc-400 dark:border-zinc-800">
            no pending requests
          </div>
        )}

        {requests.length > 0 && (
          <div className="border border-zinc-200 dark:border-zinc-800">
            {requests.map((req) => (
              <div
                key={req.id}
                className="border-b border-zinc-100 px-4 py-4 last:border-0 dark:border-zinc-900"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                      <Link
                        href={`/?item=${req.item_id}`}
                        className="hover:underline underline-offset-2"
                      >
                        {req.item_title}
                      </Link>
                    </p>
                    <p className="font-mono text-xs text-zinc-500">
                      requested by {req.requested_by} · {formatDate(req.created_at)}
                    </p>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      {req.reason}
                    </p>
                    {errors[req.id] && (
                      <p className="text-xs text-red-500">{errors[req.id]}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      onClick={() => handleResolve(req, "approved")}
                      disabled={resolving[req.id]}
                      className="text-xs font-medium text-red-500 underline underline-offset-2 hover:text-red-700 disabled:opacity-40"
                    >
                      approve
                    </button>
                    <button
                      onClick={() => handleResolve(req, "rejected")}
                      disabled={resolving[req.id]}
                      className="text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-700 disabled:opacity-40 dark:hover:text-zinc-200"
                    >
                      reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
