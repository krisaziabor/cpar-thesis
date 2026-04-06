"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import AudioRecorder from "@/components/AudioRecorder";
import { subscribeToItems, createConnection } from "@/lib/items";
import type { Item } from "@/lib/types";

type Step = "select" | "record";

export default function ConnectPage() {
  return (
    <Suspense>
      <ConnectPageInner />
    </Suspense>
  );
}

function ConnectPageInner() {
  const { loading, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const anchorId = searchParams.get("itemId");

  const [step, setStep] = useState<Step>("select");
  const [selected, setSelected] = useState<string[]>(anchorId ? [anchorId] : []);
  const [search, setSearch] = useState("");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    const unsubscribe = subscribeToItems(setItems);
    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="text-xs text-zinc-400">loading…</span>
      </div>
    );
  }
  if (!user) return null;

  const anchorItem = anchorId ? items.find((i) => i.id === anchorId) : null;

  function toggle(id: string) {
    if (anchorId && id === anchorId) return;
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  const filtered = items.filter((item) => {
    if (item.id === anchorId) return false;
    return (
      !search ||
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      item.creator.toLowerCase().includes(search.toLowerCase())
    );
  });

  const selectedItems = selected
    .map((id) => items.find((i) => i.id === id))
    .filter(Boolean);

  const canProceed = selected.filter((id) => id !== anchorId).length > 0;

  async function handleSave(withAudio: boolean) {
    if (!user?.email) return;
    setSaving(true);
    setSaveError("");
    try {
      const connectionId = await createConnection(
        selected,
        withAudio ? audioBlob : null,
        user.email
      );
      router.push(`/connections/${connectionId}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed.");
      setSaving(false);
    }
  }

  if (saving) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-white dark:bg-black">
        <span className="text-xs text-zinc-400">saving…</span>
        {saveError && (
          <>
            <p className="mt-2 max-w-sm text-center text-xs text-red-500">{saveError}</p>
            <button
              onClick={() => { setSaving(false); setSaveError(""); }}
              className="mt-1 text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-700"
            >
              go back
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <header className="border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
        <div className="mx-auto flex max-w-xl items-center justify-between">
          <Link
            href={anchorId ? `/?item=${anchorId}` : "/"}
            className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            ← cancel
          </Link>
          <span className="text-xs text-zinc-400">
            {step === "select" ? "connect — select items" : "connect — add audio"}
          </span>
          <div className="flex gap-1">
            {(["select", "record"] as Step[]).map((s) => (
              <div
                key={s}
                className={`h-1 w-8 ${s === step ? "bg-zinc-900 dark:bg-zinc-100" : "bg-zinc-200 dark:bg-zinc-800"}`}
              />
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-6 py-10">
        {step === "select" && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Select items to connect
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                Choose item(s) that share a meaningful relationship.
              </p>
            </div>

            {anchorItem && (
              <div className="border border-zinc-900 px-4 py-3 dark:border-zinc-100">
                <p className="text-xs text-zinc-500">anchor item</p>
                <p className="font-medium text-zinc-900 dark:text-zinc-50">
                  {anchorItem.title}
                </p>
                <p className="text-xs text-zinc-500">
                  {anchorItem.type} · {anchorItem.creator}
                </p>
              </div>
            )}

            {selected.filter((id) => id !== anchorId).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selected
                  .filter((id) => id !== anchorId)
                  .map((id) => {
                    const item = items.find((i) => i.id === id)!;
                    return (
                      <button
                        key={id}
                        onClick={() => toggle(id)}
                        className="border border-zinc-900 px-2 py-0.5 text-xs text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                      >
                        {item.title} ✕
                      </button>
                    );
                  })}
              </div>
            )}

            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search library…"
              className="border border-zinc-300 bg-white px-3 py-2 text-sm placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:placeholder:text-zinc-600"
            />

            <div className="border border-zinc-200 dark:border-zinc-800">
              {filtered.length === 0 && (
                <p className="px-4 py-6 text-center text-xs text-zinc-400">
                  no items found
                </p>
              )}
              {filtered.map((item) => {
                const isSelected = selected.includes(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => toggle(item.id)}
                    className={`flex w-full items-center justify-between border-b border-zinc-100 px-4 py-3 text-left last:border-0 hover:bg-zinc-50 dark:border-zinc-900 dark:hover:bg-zinc-950 ${isSelected ? "bg-zinc-50 dark:bg-zinc-950" : ""}`}
                  >
                    <div>
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                        {item.title}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {item.type} · {item.creator}
                      </p>
                    </div>
                    <span className="text-xs text-zinc-400">
                      {isSelected ? "✓" : "+"}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep("record")}
                disabled={!canProceed}
                className="border border-zinc-900 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-900 hover:text-white disabled:opacity-40 dark:border-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-100 dark:hover:text-zinc-900"
              >
                next
              </button>
            </div>
          </div>
        )}

        {step === "record" && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Describe the connection
              </h1>
              <p className="mt-1 text-sm text-zinc-500">Audio is optional.</p>
            </div>

            <div className="border border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <p className="text-xs text-zinc-400">connecting</p>
              <div className="mt-1 flex flex-col gap-1">
                {selectedItems.map((item, i) => (
                  <p key={item!.id} className="text-sm text-zinc-700 dark:text-zinc-300">
                    {i > 0 && <span className="mr-2 text-zinc-400">·</span>}
                    {item!.title}
                  </p>
                ))}
              </div>
            </div>

            <AudioRecorder
              onRecorded={(blob) => setAudioBlob(blob)}
              prompt="What links these items?"
            />

            {saveError && <p className="text-sm text-red-500">{saveError}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => setStep("select")}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                back
              </button>
              <button
                onClick={() => handleSave(false)}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                skip
              </button>
              <button
                onClick={() => handleSave(true)}
                disabled={!audioBlob}
                className="border border-zinc-900 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-900 hover:text-white disabled:opacity-40 dark:border-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-100 dark:hover:text-zinc-900"
              >
                save connection
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
