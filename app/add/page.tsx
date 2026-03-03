"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import AudioRecorder from "@/components/AudioRecorder";
import {
  createAndPublishItem,
  subscribeToItems,
  getItem,
  upsertDraft,
  publishDraft,
  uploadItemFile,
  updateItem,
} from "@/lib/items";
import type { Item } from "@/lib/types";

export default function AddItemPage() {
  return (
    <Suspense>
      <AddItemPageInner />
    </Suspense>
  );
}

type Step = "url" | "metadata" | "record" | "connect";

const TYPES = ["book", "film", "article", "song", "podcast", "other"];

interface ItemDraft {
  url: string;
  title: string;
  type: string;
  creator: string;
  link: string;
  tags: string;
  audioBlob: Blob | null;
  audioUrl: string | null;
  /** Audio URL already stored in Firestore (from a saved draft). */
  existingAudioUrl: string | null;
  /** Newly selected file (image or PDF), not yet uploaded. */
  fileFile: File | null;
  /** File URL already stored in Firestore (from a saved draft). */
  existingFileUrl: string | null;
}

const EMPTY: ItemDraft = {
  url: "",
  title: "",
  type: "book",
  creator: "",
  link: "",
  tags: "",
  audioBlob: null,
  audioUrl: null,
  existingAudioUrl: null,
  fileFile: null,
  existingFileUrl: null,
};

function parseTags(raw: string): string[] {
  return raw.split(",").map((t) => t.trim()).filter(Boolean);
}

function AddItemPageInner() {
  const { loading: authLoading, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlDraftId = searchParams.get("draft");

  const [step, setStep] = useState<Step>("url");
  const [draft, setDraft] = useState<ItemDraft>(EMPTY);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [draftLoading, setDraftLoading] = useState(!!urlDraftId);
  const [saving, setSaving] = useState(false);
  const [saveStage, setSaveStage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [draftSaveStatus, setDraftSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);

  // Show a timeout error if the upload hangs for more than 45 seconds
  useEffect(() => {
    if (!saving) return;
    const t = setTimeout(() => {
      setSaveError("Upload timed out — check the browser Console (DevTools) for details.");
    }, 45000);
    return () => clearTimeout(t);
  }, [saving]);

  const [libraryItems, setLibraryItems] = useState<Item[]>([]);
  const [connectSearch, setConnectSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Load existing draft when resuming
  useEffect(() => {
    if (!urlDraftId) return;
    setDraftLoading(true);
    getItem(urlDraftId).then((item) => {
      if (item?.is_draft) {
        setDraft({
          url: "",
          title: item.title,
          type: item.type,
          creator: item.creator,
          link: item.link ?? "",
          tags: item.tags.join(", "),
          audioBlob: null,
          audioUrl: null,
          existingAudioUrl: item.voice_recording_url || null,
          fileFile: null,
          existingFileUrl: item.media_url || null,
        });
        setCurrentDraftId(urlDraftId);
        setStep("metadata");
      }
      setDraftLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally only on mount

  useEffect(() => {
    const unsubscribe = subscribeToItems(setLibraryItems);
    return unsubscribe;
  }, []);

  useEffect(() => {
    return () => {
      if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    };
  }, []);

  if (authLoading || draftLoading) return <Loading />;
  if (!user) return null;

  function patch(fields: Partial<ItemDraft>) {
    setDraft((d) => ({ ...d, ...fields }));
  }

  const hasAudio = !!(draft.audioBlob || draft.existingAudioUrl);
  const canSaveDraft = !!(draft.title && draft.creator && user?.email);

  async function handleSaveDraft() {
    if (!canSaveDraft || !user?.email) return;
    setDraftSaveStatus("saving");
    try {
      const { draftId, audioUrl: storedAudioUrl } = await upsertDraft(
        user.email,
        currentDraftId,
        {
          title: draft.title,
          type: draft.type,
          creator: draft.creator,
          ...(draft.link ? { link: draft.link } : {}),
          tags: parseTags(draft.tags),
          added_by: user.email,
        },
        draft.audioBlob ?? undefined
      );
      setCurrentDraftId(draftId);
      // If we just uploaded a new blob, replace it with the Storage URL so
      // that publishDraft receives the correct Firestore-stored URL.
      if (draft.audioBlob) {
        patch({ audioBlob: null, audioUrl: null, existingAudioUrl: storedAudioUrl });
      }
      // Upload any newly selected file and persist its URL on the draft.
      if (draft.fileFile) {
        const fileUrl = await uploadItemFile(draft.fileFile, draftId);
        await updateItem(draftId, { media_url: fileUrl });
        patch({ fileFile: null, existingFileUrl: fileUrl });
        setFilePreviewUrl(null);
      }
      setDraftSaveStatus("saved");
      draftSaveTimer.current = setTimeout(() => setDraftSaveStatus("idle"), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Draft save failed.");
      setDraftSaveStatus("idle");
    }
  }

  async function handleUrlNext() {
    if (!draft.url) { setStep("metadata"); return; }
    setFetching(true);
    await new Promise((r) => setTimeout(r, 500)); // placeholder fetch
    setPrefilled(false);
    setFetching(false);
    setStep("metadata");
  }

  async function saveItem(withConnections: boolean) {
    if (!user?.email || !hasAudio) return;
    setSaving(true);
    setSaveStage("");
    setSaveError("");
    try {
      let itemId: string;

      if (currentDraftId) {
        setSaveStage("uploading audio…");
        await publishDraft(currentDraftId, draft.audioBlob, draft.existingAudioUrl);
        itemId = currentDraftId;
      } else {
        setSaveStage("creating draft…");
        itemId = await createAndPublishItem(
          user.email,
          {
            title: draft.title,
            type: draft.type,
            creator: draft.creator,
            ...(draft.link ? { link: draft.link } : {}),
            tags: parseTags(draft.tags),
            added_by: user.email,
          },
          draft.audioBlob!
        );
      }

      if (draft.fileFile) {
        setSaveStage("uploading file…");
        const fileUrl = await uploadItemFile(draft.fileFile, itemId);
        await updateItem(itemId, { media_url: fileUrl });
      }

      if (withConnections && selectedIds.length > 0) {
        router.push(`/connect?itemId=${itemId}`);
      } else {
        router.push(`/items/${itemId}`);
      }
    } catch (err) {
      // Surface the Firebase error code if available (e.g. storage/unauthorized)
      const msg =
        err != null && typeof err === "object" && "code" in err
          ? `${(err as { code: string }).code}: ${err instanceof Error ? err.message : "Upload failed"}`
          : err instanceof Error
          ? err.message
          : "Save failed. Please try again.";
      setSaveError(msg);
      setSaving(false);
    }
  }

  function toggleId(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  const connectItems = libraryItems.filter(
    (item) =>
      !connectSearch ||
      item.title.toLowerCase().includes(connectSearch.toLowerCase()) ||
      item.creator.toLowerCase().includes(connectSearch.toLowerCase())
  );

  if (saving) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-white dark:bg-black">
        <span className="font-mono text-xs text-zinc-400">saving…</span>
        {saveStage && (
          <p className="font-mono text-xs text-zinc-400">{saveStage}</p>
        )}
        {saveError ? (
          <>
            <p className="mt-2 max-w-sm text-center font-mono text-xs text-red-500">{saveError}</p>
            <button
              onClick={() => { setSaving(false); setSaveError(""); setSaveStage(""); }}
              className="mt-1 text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-700"
            >
              go back
            </button>
          </>
        ) : (
          <button
            onClick={() => { setSaving(false); setSaveStage(""); }}
            className="mt-4 text-xs text-zinc-300 underline underline-offset-2 hover:text-zinc-500 dark:text-zinc-700 dark:hover:text-zinc-500"
          >
            cancel
          </button>
        )}
      </div>
    );
  }

  // Shared file input — rendered once at top level so both step 1 and step 2 can trigger it
  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*,application/pdf"
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0] ?? null;
        patch({ fileFile: file });
        if (file?.type.startsWith("image/")) {
          setFilePreviewUrl(URL.createObjectURL(file));
        } else {
          setFilePreviewUrl(null);
        }
      }}
    />
  );

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      {fileInput}
      <header className="border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
        <div className="mx-auto flex max-w-xl items-center justify-between">
          <Link
            href="/"
            className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            ← cancel
          </Link>
          <span className="font-mono text-xs text-zinc-400">
            {step === "url" && "step 1 of 4 — source"}
            {step === "metadata" && (currentDraftId ? "draft — details" : "step 2 of 4 — details")}
            {step === "record" && (currentDraftId ? "draft — testimony" : "step 3 of 4 — testimony")}
            {step === "connect" && "step 4 of 4 — connect"}
          </span>
          <div className="flex gap-1">
            {(["url", "metadata", "record", "connect"] as Step[]).map((s) => (
              <div
                key={s}
                className={`h-1 w-6 ${s === step ? "bg-zinc-900 dark:bg-zinc-100" : "bg-zinc-200 dark:bg-zinc-800"}`}
              />
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-6 py-10">
        {/* Step 1: URL */}
        {step === "url" && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Add an item
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                Paste a URL, upload a file, or leave blank to enter details manually.
              </p>
            </div>
            <input
              type="url"
              value={draft.url}
              onChange={(e) => patch({ url: e.target.value })}
              placeholder="https://…"
              className={inputCx}
            />
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
              <span className="font-mono text-xs text-zinc-400">or</span>
              <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
            </div>
            {!draft.fileFile && !draft.existingFileUrl && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-fit border border-zinc-300 px-3 py-2 text-sm text-zinc-500 hover:border-zinc-500 hover:text-zinc-700 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-200"
              >
                upload image or PDF
              </button>
            )}
            {draft.fileFile && (
              <div className="flex flex-col gap-2">
                {filePreviewUrl && (
                  <img
                    src={filePreviewUrl}
                    alt="preview"
                    className="max-h-40 max-w-full object-contain border border-zinc-200 dark:border-zinc-800"
                  />
                )}
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-zinc-500 truncate max-w-xs">
                    {draft.fileFile.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      patch({ fileFile: null });
                      setFilePreviewUrl(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-200"
                  >
                    remove
                  </button>
                </div>
              </div>
            )}
            <p className="font-mono text-xs text-zinc-400">
              If a URL is provided, title and creator will be pre-filled where possible.
            </p>
            <button onClick={handleUrlNext} disabled={fetching} className={primaryBtn}>
              {fetching ? "fetching…" : "next"}
            </button>
          </div>
        )}

        {/* Step 2: Metadata */}
        {step === "metadata" && (
          <div className="flex flex-col gap-5">
            <div>
              <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Item details
              </h1>
              {prefilled && (
                <p className="mt-1 font-mono text-xs text-zinc-400">
                  ✓ fields pre-filled from URL
                </p>
              )}
              {currentDraftId && (
                <p className="mt-1 font-mono text-xs text-zinc-400">
                  resuming draft
                </p>
              )}
            </div>
            <Field label="Title">
              <input
                type="text"
                value={draft.title}
                onChange={(e) => patch({ title: e.target.value })}
                placeholder="e.g. Beloved"
                className={inputCx}
              />
            </Field>
            <Field label="Type">
              <select
                value={draft.type}
                onChange={(e) => patch({ type: e.target.value })}
                className={inputCx}
              >
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Author / Creator">
              <input
                type="text"
                value={draft.creator}
                onChange={(e) => patch({ creator: e.target.value })}
                placeholder="e.g. Toni Morrison"
                className={inputCx}
              />
            </Field>
            <Field label="External link (optional)">
              <input
                type="url"
                value={draft.link}
                onChange={(e) => patch({ link: e.target.value })}
                placeholder="https://…"
                className={inputCx}
              />
            </Field>
            <Field label="File attachment (optional)">
              {!draft.fileFile && !draft.existingFileUrl && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-fit border border-zinc-300 px-3 py-2 text-sm text-zinc-500 hover:border-zinc-500 hover:text-zinc-700 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-200"
                >
                  attach image or PDF
                </button>
              )}
              {draft.fileFile && (
                <div className="flex flex-col gap-2">
                  {filePreviewUrl && (
                    <img
                      src={filePreviewUrl}
                      alt="preview"
                      className="max-h-40 max-w-full object-contain border border-zinc-200 dark:border-zinc-800"
                    />
                  )}
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-zinc-500 truncate max-w-xs">
                      {draft.fileFile.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        patch({ fileFile: null });
                        setFilePreviewUrl(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-200"
                    >
                      remove
                    </button>
                  </div>
                </div>
              )}
              {!draft.fileFile && draft.existingFileUrl && (
                <div className="flex items-center gap-3">
                  <a
                    href={draft.existingFileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-300"
                  >
                    file attached ↗
                  </a>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-200"
                  >
                    replace
                  </button>
                </div>
              )}
            </Field>
            <Field label="Tags (comma-separated)">
              <input
                type="text"
                value={draft.tags}
                onChange={(e) => patch({ tags: e.target.value })}
                placeholder="e.g. memory, community, history"
                className={inputCx}
              />
            </Field>
            {saveError && <p className="text-sm text-red-500">{saveError}</p>}
            <div className="flex items-center gap-3">
              {!currentDraftId && (
                <button onClick={() => setStep("url")} className={ghostBtn}>
                  back
                </button>
              )}
              <button
                onClick={() => setStep("record")}
                disabled={!draft.title || !draft.creator}
                className={primaryBtn}
              >
                next
              </button>
              <SaveDraftButton
                status={draftSaveStatus}
                disabled={!canSaveDraft}
                onSave={handleSaveDraft}
              />
            </div>
          </div>
        )}

        {/* Step 3: Audio */}
        {step === "record" && (
          <div className="flex flex-col gap-6">
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Add your testimony
            </h1>
            <div className="border border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <p className="font-medium text-zinc-900 dark:text-zinc-50">{draft.title}</p>
              <p className="font-mono text-xs text-zinc-500">
                {draft.type} · {draft.creator}
              </p>
              {draft.tags && (
                <p className="mt-1 font-mono text-xs text-zinc-400">{draft.tags}</p>
              )}
            </div>
            <AudioRecorder
              onRecorded={(blob, url) => patch({ audioBlob: blob, audioUrl: url, existingAudioUrl: null })}
              onClearedInitial={() => patch({ existingAudioUrl: null })}
              prompt="Why does this matter?"
              initialUrl={draft.existingAudioUrl ?? undefined}
            />
            {saveError && <p className="text-sm text-red-500">{saveError}</p>}
            <div className="flex items-center gap-3">
              <button onClick={() => setStep("metadata")} className={ghostBtn}>
                back
              </button>
              <button
                onClick={() => {
                  if (!hasAudio) return;
                  if (libraryItems.length > 0) setStep("connect");
                  else saveItem(false);
                }}
                disabled={!hasAudio}
                className={primaryBtn}
              >
                {libraryItems.length > 0 ? "next" : "save item"}
              </button>
              <SaveDraftButton
                status={draftSaveStatus}
                disabled={!canSaveDraft}
                onSave={handleSaveDraft}
              />
            </div>
          </div>
        )}

        {/* Step 4: Connect */}
        {step === "connect" && (
          <div className="flex flex-col gap-6">
            <div>
              <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                Connect to existing items
              </h1>
              <p className="mt-1 text-sm text-zinc-500">
                Select items this relates to, or skip.
              </p>
            </div>
            <div className="border border-zinc-900 px-4 py-3 dark:border-zinc-100">
              <p className="font-mono text-xs text-zinc-500">new item</p>
              <p className="font-medium text-zinc-900 dark:text-zinc-50">{draft.title}</p>
              <p className="font-mono text-xs text-zinc-500">
                {draft.type} · {draft.creator}
              </p>
            </div>
            <input
              type="search"
              value={connectSearch}
              onChange={(e) => setConnectSearch(e.target.value)}
              placeholder="Search library…"
              className={inputCx}
            />
            {selectedIds.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedIds.map((id) => {
                  const item = libraryItems.find((i) => i.id === id);
                  if (!item) return null;
                  return (
                    <button
                      key={id}
                      onClick={() => toggleId(id)}
                      className="border border-zinc-900 px-2 py-0.5 font-mono text-xs text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                    >
                      {item.title} ✕
                    </button>
                  );
                })}
              </div>
            )}
            <div className="border border-zinc-200 dark:border-zinc-800">
              {connectItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => toggleId(item.id)}
                  className={`flex w-full items-center justify-between border-b border-zinc-100 px-4 py-3 text-left last:border-0 hover:bg-zinc-50 dark:border-zinc-900 dark:hover:bg-zinc-950 ${selectedIds.includes(item.id) ? "bg-zinc-50 dark:bg-zinc-950" : ""}`}
                >
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{item.title}</p>
                    <p className="font-mono text-xs text-zinc-500">{item.type} · {item.creator}</p>
                  </div>
                  <span className="font-mono text-xs text-zinc-400">
                    {selectedIds.includes(item.id) ? "✓" : "+"}
                  </span>
                </button>
              ))}
            </div>
            {saveError && <p className="text-sm text-red-500">{saveError}</p>}
            <div className="flex gap-3">
              <button onClick={() => saveItem(false)} className={ghostBtn}>
                skip
              </button>
              <button
                onClick={() => saveItem(true)}
                disabled={selectedIds.length === 0}
                className={primaryBtn}
              >
                save & connect
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SaveDraftButton({
  status,
  disabled,
  onSave,
}: {
  status: "idle" | "saving" | "saved";
  disabled: boolean;
  onSave: () => void;
}) {
  return (
    <button
      onClick={onSave}
      disabled={disabled || status === "saving"}
      className="text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-700 disabled:opacity-40 dark:hover:text-zinc-200"
    >
      {status === "saving" && "saving…"}
      {status === "saved" && "draft saved ✓"}
      {status === "idle" && "save draft"}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="font-mono text-xs text-zinc-500">{label}</label>
      {children}
    </div>
  );
}

const inputCx =
  "border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50";

const primaryBtn =
  "border border-zinc-900 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-900 hover:text-white disabled:opacity-40 dark:border-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-100 dark:hover:text-zinc-900";

const ghostBtn =
  "px-4 py-2 text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200";

function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white dark:bg-black">
      <span className="font-mono text-xs text-zinc-400">loading…</span>
    </div>
  );
}
