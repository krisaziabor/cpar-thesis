"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { subscribeToUserKanon } from "@/lib/kanon";
import { subscribeToAllConnections, subscribeToDrafts, subscribeToItems } from "@/lib/items";
import type { KanonSave, Item, Connection } from "@/lib/types";

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

function relativeDate(ts: unknown): string {
  if (!ts) return "";
  let date: Date;
  if (typeof ts === "object" && ts !== null && "toDate" in ts) {
    date = (ts as { toDate: () => Date }).toDate();
  } else {
    return formatDate(ts);
  }
  const now = Date.now();
  const diff = now - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) !== 1 ? "s" : ""} ago`;
  return formatDate(ts);
}

export default function KanonPage() {
  const { loading: authLoading, user } = useAuth();
  const params = useParams();
  const rawEmail = params.userEmail as string;
  const decodedEmail = decodeURIComponent(rawEmail);
  const displayName = decodedEmail.split("@")[0];

  const [saves, setSaves] = useState<KanonSave[] | undefined>(undefined);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [ownDraftItems, setOwnDraftItems] = useState<Item[]>([]);
  const [allConnections, setAllConnections] = useState<Connection[]>([]);

  useEffect(() => {
    const unsub = subscribeToUserKanon(decodedEmail, (s) => setSaves(s));
    return unsub;
  }, [decodedEmail]);

  useEffect(() => {
    const unsub = subscribeToItems(setAllItems);
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribeToAllConnections(setAllConnections);
    return unsub;
  }, []);

  const isOwn = user?.email === decodedEmail;

  useEffect(() => {
    if (!isOwn) {
      setOwnDraftItems([]);
      return;
    }
    return subscribeToDrafts(decodedEmail, setOwnDraftItems);
  }, [decodedEmail, isOwn]);

  if (authLoading || saves === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-black">
        <span className="font-mono text-xs text-zinc-400">loading…</span>
      </div>
    );
  }
  if (!user) return null;

  function resolveTitle(save: KanonSave): string {
    if (save.reference_type === "item") {
      return (
        allItems.find((i) => i.id === save.reference_id)?.title ??
        ownDraftItems.find((i) => i.id === save.reference_id)?.title ??
        save.reference_id
      );
    }
    // connection: show connected item titles
    const conn = allConnections.find((c) => c.id === save.reference_id);
    if (!conn) return save.reference_id;
    // We don't have itemIds on Connection directly; fall back to ID
    return save.reference_id;
  }

  function resolveCreator(save: KanonSave): string {
    if (save.reference_type === "item") {
      const item =
        allItems.find((i) => i.id === save.reference_id) ??
        ownDraftItems.find((i) => i.id === save.reference_id);
      return item?.added_by ?? "";
    }
    const conn = allConnections.find((c) => c.id === save.reference_id);
    return conn?.created_by ?? "";
  }

  function resolveHref(save: KanonSave): string {
    if (save.reference_type === "item") return `/?item=${save.reference_id}`;
    return `/connections/${save.reference_id}`;
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <header className="border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link
            href="/"
            className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            ← library
          </Link>
          {isOwn && (
            <span className="font-mono text-xs text-zinc-400">this is your kanon</span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {displayName}&apos;s kanon
        </h1>
        <p className="mt-1 font-mono text-xs text-zinc-400">{decodedEmail}</p>

        <div className="my-6 border-t border-zinc-100 dark:border-zinc-900" />

        {saves.length === 0 ? (
          <p className="text-sm text-zinc-400">
            {isOwn
              ? "you haven't saved anything yet — browse the library and save items or connections"
              : `${displayName} hasn't saved anything yet`}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {saves.map((save) => {
              const title = resolveTitle(save);
              const creator = resolveCreator(save);
              const href = resolveHref(save);
              return (
                <Link
                  key={save.id}
                  href={href}
                  className="flex items-start justify-between border border-zinc-200 px-4 py-3 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-950"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="border border-zinc-200 px-1.5 py-0.5 font-mono text-xs text-zinc-400 dark:border-zinc-700">
                        {save.reference_type}
                      </span>
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                        {title}
                      </p>
                    </div>
                    <p className="font-mono text-xs text-zinc-500">
                      {creator && <>by {creator} · </>}saved {relativeDate(save.created_at)}
                    </p>
                  </div>
                  <span className="mt-0.5 font-mono text-xs text-zinc-300 dark:text-zinc-700">→</span>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
