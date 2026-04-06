"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import AudioRecorder from "@/components/AudioRecorder";
import {
  createItemDoc,
  createAndPublishItem,
  discardDraft,
  findPublishedItemByLink,
  getItem,
  subscribeToDrafts,
  upsertDraft,
  updateItem,
  uploadItemFile,
} from "@/lib/items";
import { DEFAULT_ITEM_TYPES, ensureItemTypeExists, subscribeToItemTypes } from "@/lib/item-types";
import { saveToKanon } from "@/lib/kanon";
import { isDownloadableVideoPageUrl } from "@/lib/metadata/classify";
import type { MetadataResult, SourceMetadata } from "@/lib/metadata/types";
import { mirrorPreviewAudio, mirrorThumbnail, mirrorVideo, uploadBase64Thumbnail } from "@/lib/media-upload";
import type { Item } from "@/lib/types";

type Step = "source" | "details" | "record";
type Destination = "holding" | "library";

interface ItemDraft {
  url: string;
  title: string;
  description: string;
  mediaDate: string;
  type: string;
  creator: string;
  link: string;
  tags: string;
  audioBlob: Blob | null;
  existingAudioUrl: string | null;
  fileFile: File | null;
  existingFileUrl: string | null;
  thumbnailUrl: string | null;
  sourceMetadata: SourceMetadata | null;
  sourceLabel?: string;
}

interface QueueItem {
  sourceUrl: string;
  sourceLabel: string;
  title: string;
  description: string;
  mediaDate: string;
  type: string;
  creator: string;
  link: string;
  tags: string;
  thumbnailUrl: string | null;
  sourceMetadata: SourceMetadata | null;
  fileFile: File | null;
}

const EMPTY: ItemDraft = {
  url: "",
  title: "",
  description: "",
  mediaDate: "",
  type: DEFAULT_ITEM_TYPES[0],
  creator: "",
  link: "",
  tags: "",
  audioBlob: null,
  existingAudioUrl: null,
  fileFile: null,
  existingFileUrl: null,
  thumbnailUrl: null,
  sourceMetadata: null,
  sourceLabel: undefined,
};

function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function formatDateForDisplay(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function toDateInputValue(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function fromDateInputValue(value: string): string {
  if (!value) return "";
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function toQueueItem(draft: ItemDraft): QueueItem {
  return {
    sourceUrl: draft.url.trim(),
    sourceLabel: draft.url.trim() || (draft.fileFile?.name ?? "Uploaded file"),
    title: draft.title,
    description: draft.description.trim(),
    mediaDate: draft.mediaDate.trim(),
    type: draft.type,
    creator: draft.creator,
    link: draft.link,
    tags: draft.tags,
    thumbnailUrl: draft.thumbnailUrl,
    sourceMetadata: draft.sourceMetadata,
    fileFile: draft.fileFile,
  };
}

export default function AddItemPage() {
  return (
    <Suspense>
      <AddItemPageInner />
    </Suspense>
  );
}

export function AddItemPageInnerWithSuspense({
  hideHeader,
  onProgressChange,
  backSignal,
  closeSignal,
  onRequestPanelClose,
  onCanGoBackChange,
}: {
  hideHeader?: boolean;
  onProgressChange?: (progressPercent: number) => void;
  backSignal?: number;
  closeSignal?: number;
  onRequestPanelClose?: () => void;
  onCanGoBackChange?: (canGoBack: boolean) => void;
}) {
  return (
    <Suspense>
      <AddItemPageInner
        hideHeader={hideHeader}
        onProgressChange={onProgressChange}
        backSignal={backSignal}
        closeSignal={closeSignal}
        onRequestPanelClose={onRequestPanelClose}
        onCanGoBackChange={onCanGoBackChange}
      />
    </Suspense>
  );
}

function AddItemPageInner({
  hideHeader = false,
  onProgressChange,
  backSignal = 0,
  closeSignal = 0,
  onRequestPanelClose,
  onCanGoBackChange,
}: {
  hideHeader?: boolean;
  onProgressChange?: (progressPercent: number) => void;
  backSignal?: number;
  closeSignal?: number;
  onRequestPanelClose?: () => void;
  onCanGoBackChange?: (canGoBack: boolean) => void;
}) {
  const { loading: authLoading, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const shouldReduceMotion = useReducedMotion();
  const urlDraftId = searchParams.get("draft");

  const [step, setStep] = useState<Step>("source");
  const [draft, setDraft] = useState<ItemDraft>(EMPTY);
  const [destination, setDestination] = useState<Destination>("library");
  const [queuedItems, setQueuedItems] = useState<QueueItem[]>([]);
  const [recordings, setRecordings] = useState<Array<{ blob: Blob | null; existingUrl: string | null }>>([]);
  const [detailsIndex, setDetailsIndex] = useState(0);
  const [recordIndex, setRecordIndex] = useState(0);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Item[]>([]);
  const [fetching, setFetching] = useState(false);
  const [draftLoading, setDraftLoading] = useState(!!urlDraftId);
  const [sourceError, setSourceError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveStage, setSaveStage] = useState("");
  const [saving, setSaving] = useState(false);
  const [itemTypes, setItemTypes] = useState<string[]>([...DEFAULT_ITEM_TYPES]);
  const [isTypeMenuOpen, setIsTypeMenuOpen] = useState(false);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [showClosePrompt, setShowClosePrompt] = useState(false);
  const [draftPromptSaving, setDraftPromptSaving] = useState(false);
  const [draftPromptError, setDraftPromptError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typeBlurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevBackSignalRef = useRef(backSignal);
  const prevCloseSignalRef = useRef(closeSignal);

  useEffect(() => {
    if (!user?.email) return;
    return subscribeToDrafts(user.email, setDrafts);
  }, [user?.email]);

  useEffect(() => {
    if (!user?.email) return;
    return subscribeToItemTypes(setItemTypes);
  }, [user?.email]);

  useEffect(() => {
    if (!urlDraftId) {
      setDraftLoading(false);
      return;
    }
    setDraftLoading(true);
    getItem(urlDraftId)
      .then((item) => {
        if (!item?.is_draft) return;
        setDraft({
          url: item.link ?? "",
          title: item.title,
          description: item.description ?? "",
          mediaDate: item.media_date ?? "",
          type: item.type,
          creator: item.creator,
          link: item.link ?? "",
          tags: Array.isArray(item.tags) ? item.tags.join(", ") : "",
          audioBlob: null,
          existingAudioUrl: item.voice_recording_url || null,
          fileFile: null,
          existingFileUrl: item.media_url || null,
          thumbnailUrl: item.thumbnail_url ?? null,
          sourceMetadata: item.source_metadata ?? null,
          sourceLabel: item.link ?? item.title,
        });
        setQueuedItems([
          toQueueItem({
            url: item.link ?? "",
            title: item.title,
            description: item.description ?? "",
            mediaDate: item.media_date ?? "",
            type: item.type,
            creator: item.creator,
            link: item.link ?? "",
            tags: Array.isArray(item.tags) ? item.tags.join(", ") : "",
            audioBlob: null,
            existingAudioUrl: item.voice_recording_url || null,
            fileFile: null,
            existingFileUrl: item.media_url || null,
            thumbnailUrl: item.thumbnail_url ?? null,
            sourceMetadata: item.source_metadata ?? null,
            sourceLabel: item.link ?? item.title,
          }),
        ]);
        setDetailsIndex(0);
        setCurrentDraftId(item.id);
        setStep("details");
      })
      .finally(() => setDraftLoading(false));
  }, [urlDraftId]);

  function patch(fields: Partial<ItemDraft>) {
    setDraft((prev) => ({ ...prev, ...fields }));
  }

  function patchSourceMetadata(fields: Partial<SourceMetadata>) {
    setDraft((prev) => ({
      ...prev,
      sourceMetadata: {
        ...(prev.sourceMetadata ?? { source_type: "unknown" }),
        ...fields,
      },
    }));
  }

  const canContinueDetails = !!draft.title.trim() && !!draft.creator.trim() && !!draft.mediaDate.trim();
  const recordingQueue = useMemo<QueueItem[]>(() => queuedItems, [queuedItems]);
  const activeQueueItem = recordingQueue[recordIndex];
  const activeRecording = recordings[recordIndex] ?? { blob: null, existingUrl: null };
  const canAdvanceRecording = !!activeRecording.blob || !!activeRecording.existingUrl;
  const canContinueFromSource = queuedItems.length > 0;
  const showDraftsSection = step === "source" && drafts.length > 0;
  const stepOrder: Step[] = ["source", "details", "record"];
  const currentStepIndex = stepOrder.indexOf(step);
  const headerProgressPercent = ((currentStepIndex + 1) / stepOrder.length) * 100;
  const normalizedDraftType = draft.type.trim().toLowerCase();
  const filteredItemTypes = useMemo(() => {
    if (!normalizedDraftType) return itemTypes.slice(0, 8);
    return itemTypes
      .filter((itemType) => itemType.includes(normalizedDraftType))
      .slice(0, 8);
  }, [itemTypes, normalizedDraftType]);
  const shouldShowCreateType =
    normalizedDraftType.length > 0 && !itemTypes.includes(normalizedDraftType);
  const isMusicSource = draft.sourceMetadata?.source_type === "music";
  const fetchedMediaDate = inferMediaDate(draft.sourceMetadata);
  const canResetMediaDate = !!fetchedMediaDate && draft.mediaDate.trim() !== fetchedMediaDate;
  const hasCurrentInput =
    !!draft.url.trim() ||
    !!draft.fileFile ||
    !!draft.title.trim() ||
    !!draft.description.trim() ||
    !!draft.creator.trim() ||
    !!draft.mediaDate.trim() ||
    !!draft.tags.trim();
  const hasUnsavedProgress = queuedItems.length > 0 || hasCurrentInput;

  useEffect(() => {
    onProgressChange?.(headerProgressPercent);
  }, [headerProgressPercent, onProgressChange]);

  useEffect(() => {
    onCanGoBackChange?.(step !== "source");
  }, [onCanGoBackChange, step]);

  useEffect(() => {
    setRecordings((prev) =>
      recordingQueue.map((_, idx) => prev[idx] ?? { blob: null, existingUrl: null })
    );
    if (recordIndex >= recordingQueue.length) setRecordIndex(Math.max(0, recordingQueue.length - 1));
  }, [recordingQueue, recordIndex]);

  useEffect(() => {
    return () => {
      if (typeBlurTimerRef.current) clearTimeout(typeBlurTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (backSignal === prevBackSignalRef.current) return;
    prevBackSignalRef.current = backSignal;

    if (step === "record") {
      const safeIndex = Math.min(recordIndex, Math.max(0, queuedItems.length - 1));
      setDetailsIndex(safeIndex);
      if (queuedItems[safeIndex]) loadQueuedItemIntoDraft(queuedItems[safeIndex]);
      setStep("details");
      return;
    }

    if (step === "details") {
      if (detailsIndex > 0) {
        const nextIndex = detailsIndex - 1;
        setDetailsIndex(nextIndex);
        if (queuedItems[nextIndex]) loadQueuedItemIntoDraft(queuedItems[nextIndex]);
      } else {
        setStep("source");
      }
    }
  }, [backSignal, detailsIndex, queuedItems, recordIndex, step]);

  useEffect(() => {
    if (closeSignal === prevCloseSignalRef.current) return;
    prevCloseSignalRef.current = closeSignal;
    if (!hasUnsavedProgress) {
      onRequestPanelClose?.();
      return;
    }
    setShowClosePrompt(true);
  }, [closeSignal, hasUnsavedProgress, onRequestPanelClose]);

  if (authLoading || draftLoading) return <Loading compact={hideHeader} />;
  if (!user) return null;

  function inferMediaDate(sourceMetadata: SourceMetadata | null | undefined): string {
    if (!sourceMetadata) return "";
    const releaseDate = sourceMetadata.release_date?.trim();
    if (releaseDate) return formatDateForDisplay(releaseDate);
    const publishedDate = sourceMetadata.published_date?.trim();
    if (publishedDate) return formatDateForDisplay(publishedDate);
    if (typeof sourceMetadata.year === "number" && Number.isFinite(sourceMetadata.year)) {
      return String(sourceMetadata.year);
    }
    return "";
  }

  async function buildQueuedItemFromSource(sourceDraft: ItemDraft): Promise<QueueItem> {
    const hasUrl = !!sourceDraft.url.trim();
    const hasFile = !!sourceDraft.fileFile;
    let nextDraft: ItemDraft = { ...sourceDraft };

    try {
      let res: Response;
      if (hasFile && sourceDraft.fileFile) {
        const fd = new FormData();
        fd.append("file", sourceDraft.fileFile);
        res = await fetch("/api/metadata", { method: "POST", body: fd });
      } else {
        res = await fetch("/api/metadata", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: sourceDraft.url.trim() }),
        });
      }
      const result: MetadataResult = await res.json();
      if (result.success && result.data) {
        const metadataType = result.data.type === "essay" ? "article" : result.data.type;
        const normalizedMetadataType = metadataType?.trim().toLowerCase();
        nextDraft = {
          ...nextDraft,
          title: result.data.title || nextDraft.title || "Untitled record",
          type: normalizedMetadataType || nextDraft.type,
          creator: result.data.creator || nextDraft.creator || "Unknown creator",
          link: result.data.link || nextDraft.link,
          mediaDate: inferMediaDate(result.data.source_metadata) || nextDraft.mediaDate,
          thumbnailUrl: result.data.thumbnail_url ?? result.data.thumbnail_base64 ?? null,
          sourceMetadata: result.data.source_metadata,
        };
      }
    } catch {
      // Non-fatal: keep user-provided source and fallback metadata fields.
    }

    if (!nextDraft.title.trim()) nextDraft.title = "Untitled record";
    if (!nextDraft.creator.trim()) nextDraft.creator = "Unknown creator";
    if (!nextDraft.mediaDate.trim()) nextDraft.mediaDate = inferMediaDate(nextDraft.sourceMetadata) || "Unknown";
    if (!nextDraft.link.trim() && nextDraft.url.trim()) nextDraft.link = nextDraft.url.trim();

    return toQueueItem(nextDraft);
  }

  async function addSourceToQueue() {
    const hasUrl = !!draft.url.trim();
    const hasFile = !!draft.fileFile;
    if (!hasUrl && !hasFile) {
      setSourceError("Add a URL or file, then press Enter.");
      return;
    }
    setSourceError("");
    setFetching(true);
    try {
      const queuedItem = await buildQueuedItemFromSource(draft);
      setQueuedItems((prev) => [...prev, queuedItem]);
      patch({
        url: "",
        title: "",
        description: "",
        mediaDate: "",
        type: DEFAULT_ITEM_TYPES[0],
        creator: "",
        link: "",
        tags: "",
        fileFile: null,
        existingFileUrl: null,
        thumbnailUrl: null,
        sourceMetadata: null,
      });
      setFilePreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setFetching(false);
    }
  }

  function loadQueuedItemIntoDraft(item: QueueItem) {
    patch({
      url: item.sourceUrl,
      sourceLabel: item.sourceLabel,
      title: item.title,
      description: item.description,
      mediaDate: item.mediaDate,
      type: item.type,
      creator: item.creator,
      link: item.link,
      tags: item.tags,
      thumbnailUrl: item.thumbnailUrl,
      sourceMetadata: item.sourceMetadata,
      fileFile: item.fileFile,
      existingFileUrl: null,
      existingAudioUrl: null,
      audioBlob: null,
    });
    if (item.fileFile?.type.startsWith("image/")) {
      setFilePreviewUrl(URL.createObjectURL(item.fileFile));
    } else {
      setFilePreviewUrl(null);
    }
  }

  async function saveSessionAsDrafts() {
    const userEmail = user?.email;
    if (!userEmail) return;

    const itemsToDraft: QueueItem[] = [...queuedItems];
    if (itemsToDraft.length === 0 && hasCurrentInput) {
      itemsToDraft.push(toQueueItem(draft));
    }

    for (const queuedItem of itemsToDraft) {
      try {
        await ensureItemTypeExists(queuedItem.type, userEmail);
      } catch {
        // Best-effort vocabulary update; do not block draft save.
      }
      const { draftId } = await upsertDraft(
        userEmail,
        null,
        {
          title: queuedItem.title || "Untitled record",
          description: queuedItem.description.trim(),
          media_date: queuedItem.mediaDate.trim() || "Unknown",
          type: queuedItem.type,
          creator: queuedItem.creator || "Unknown creator",
          ...(queuedItem.link ? { link: queuedItem.link } : {}),
          tags: parseTags(queuedItem.tags),
          added_by: userEmail,
          ...(queuedItem.thumbnailUrl && !queuedItem.thumbnailUrl.startsWith("data:")
            ? { thumbnail_url: queuedItem.thumbnailUrl }
            : {}),
          ...(queuedItem.sourceMetadata ? { source_metadata: queuedItem.sourceMetadata } : {}),
        }
      );

      if (queuedItem.fileFile) {
        try {
          const fileUrl = await uploadItemFile(queuedItem.fileFile, draftId);
          await updateItem(draftId, { media_url: fileUrl });
        } catch {
          // Keep draft metadata even if file upload fails due to permissions.
        }
      }
      setCurrentDraftId(draftId);
    }
  }

  async function handleSubmitBatch() {
    const currentUser = user;
    const userEmail = currentUser?.email;
    if (!userEmail || !currentUser) return;
    setSaveError("");
    setSaving(true);
    try {
      for (let idx = 0; idx < recordingQueue.length; idx++) {
        const itemData = recordingQueue[idx];
        const recording = recordings[idx];
        if (destination === "library" && !recording?.blob && !recording?.existingUrl) {
          throw new Error(`Recording missing for item ${idx + 1}.`);
        }

        setSaveStage(`Saving ${idx + 1} of ${recordingQueue.length}…`);
        const fields = {
          title: itemData.title,
          description: itemData.description,
          media_date: itemData.mediaDate,
          type: itemData.type,
          creator: itemData.creator,
          ...(itemData.link ? { link: itemData.link } : {}),
          tags: parseTags(itemData.tags),
          added_by: userEmail,
          ...(itemData.thumbnailUrl && !itemData.thumbnailUrl.startsWith("data:")
            ? { thumbnail_url: itemData.thumbnailUrl }
            : {}),
          ...(itemData.sourceMetadata ? { source_metadata: itemData.sourceMetadata } : {}),
        };

        let itemId = "";

        try {
          await ensureItemTypeExists(itemData.type, userEmail);
        } catch {
          // Non-fatal: item type sync should not block save flow.
        }

        if (destination === "holding") {
          const existingPublished =
            itemData.link?.trim() ? await findPublishedItemByLink(itemData.link.trim()) : null;
          if (existingPublished) {
            itemId = existingPublished.id;
          } else if (recording.blob) {
            itemId = await createAndPublishItem(userEmail, fields, recording.blob);
          } else {
            itemId = await createItemDoc(fields);
          }
          await saveToKanon(userEmail, "item", itemId);
        } else {
          if (!recording.blob) throw new Error("A new recording is required to publish items.");
          itemId = await createAndPublishItem(userEmail, fields, recording.blob);
        }

        if (itemData.fileFile) {
          setSaveStage(`Uploading file for ${idx + 1} of ${recordingQueue.length}…`);
          const fileUrl = await uploadItemFile(itemData.fileFile, itemId);
          await updateItem(itemId, { media_url: fileUrl });
        }

        if (itemData.thumbnailUrl) {
          setSaveStage(`Saving thumbnail for ${idx + 1} of ${recordingQueue.length}…`);
          try {
            const savedThumbnail = itemData.thumbnailUrl.startsWith("data:")
              ? await uploadBase64Thumbnail(itemData.thumbnailUrl, itemId)
              : await mirrorThumbnail(itemData.thumbnailUrl, itemId);
            await updateItem(itemId, { thumbnail_url: savedThumbnail });
          } catch {
            // Non-fatal.
          }
        }

        if (itemData.sourceMetadata?.preview_url) {
          try {
            const previewUrl = await mirrorPreviewAudio(itemData.sourceMetadata.preview_url, itemId);
            await updateItem(itemId, {
              source_metadata: { ...itemData.sourceMetadata, preview_url: previewUrl },
            });
          } catch {
            // Non-fatal.
          }
        }

        const sourceType = itemData.sourceMetadata?.source_type;
        const pageUrl = (itemData.link || "").trim();
        const shouldMirrorVideo =
          !!pageUrl &&
          (["instagram", "tiktok", "twitter", "youtube"].includes(sourceType ?? "") ||
            isDownloadableVideoPageUrl(pageUrl));
        if (shouldMirrorVideo) {
          try {
            const token = await currentUser.getIdToken();
            const { downloadUrl } = await mirrorVideo(pageUrl, itemId, token);
            await updateItem(itemId, { media_url: downloadUrl });
          } catch {
            // Non-fatal.
          }
        }
      }

      router.push(destination === "holding" ? `/kanon/${encodeURIComponent(userEmail)}` : "/");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed. Please try again.");
      setSaving(false);
    }
  }

  async function handleDiscardDraft(item: Item) {
    await discardDraft(item);
    if (item.id === currentDraftId) {
      setCurrentDraftId(null);
      setDraft(EMPTY);
      setQueuedItems([]);
      setRecordings([]);
      setDetailsIndex(0);
      setRecordIndex(0);
      router.push("/?panel=add");
    }
  }

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*,application/pdf"
      className="hidden"
      onChange={(event) => {
        const file = event.target.files?.[0] ?? null;
        patch({ fileFile: file });
        if (sourceError) setSourceError("");
        if (file?.type.startsWith("image/")) {
          setFilePreviewUrl(URL.createObjectURL(file));
        } else {
          setFilePreviewUrl(null);
        }
      }}
    />
  );

  function handleDroppedFiles(fileList: FileList | null) {
    const file = fileList?.[0] ?? null;
    patch({ fileFile: file });
    if (sourceError) setSourceError("");
    if (file?.type.startsWith("image/")) {
      setFilePreviewUrl(URL.createObjectURL(file));
    } else {
      setFilePreviewUrl(null);
    }
  }

  function setTypeValue(nextType: string) {
    const normalized = nextType.trim().toLowerCase();
    if (!normalized) return;
    patch({ type: normalized });
    setItemTypes((prev) => {
      if (prev.includes(normalized)) return prev;
      return [...prev, normalized].sort((a, b) => a.localeCompare(b));
    });
    setIsTypeMenuOpen(false);
  }

  if (saving) {
    return (
      <div className={hideHeader ? "p-6" : "flex min-h-screen items-center justify-center bg-black"}>
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: shouldReduceMotion ? 0 : 0.18, ease: [0.215, 0.61, 0.355, 1] }}
          className="space-y-2"
        >
          <p className="text-sm text-zinc-300">Submitting…</p>
          <p className="text-xs text-zinc-500">{saveStage || "Preparing files and audio…"}</p>
          {saveError && <p className="pt-2 text-xs text-red-500">{saveError}</p>}
        </motion.div>
      </div>
    );
  }

  return (
    <div className={hideHeader ? "" : "min-h-screen bg-black"}>
      {fileInput}

      <main className="mx-auto max-w-xl px-6 py-8">
        {showClosePrompt && (
          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0, y: -4 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.18, ease: [0.215, 0.61, 0.355, 1] }}
            className="mb-4 rounded-md border border-zinc-800 bg-zinc-950/95 p-3"
          >
            <p className="font-sans text-sm text-zinc-100">Save this as a draft before closing?</p>
            <div className="mt-2 flex items-center gap-4">
              <button
                type="button"
                onClick={() => setShowClosePrompt(false)}
                className="font-lector text-xs text-zinc-500 transition-colors hover:text-zinc-300"
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={() => onRequestPanelClose?.()}
                className="font-lector text-xs text-zinc-400 transition-colors hover:text-zinc-200"
              >
                Close without saving
              </button>
              <button
                type="button"
                disabled={draftPromptSaving}
                onClick={async () => {
                  setDraftPromptError("");
                  setDraftPromptSaving(true);
                  try {
                    await saveSessionAsDrafts();
                    onRequestPanelClose?.();
                  } catch (error) {
                    setDraftPromptError(
                      error instanceof Error ? error.message : "Could not save draft."
                    );
                  } finally {
                    setDraftPromptSaving(false);
                  }
                }}
                className="font-lector text-xs text-zinc-100 transition-colors hover:text-white disabled:opacity-40"
              >
                {draftPromptSaving ? "Saving..." : "Save draft and close"}
              </button>
            </div>
            {draftPromptError && <p className="mt-2 text-xs text-red-400">{draftPromptError}</p>}
          </motion.div>
        )}

        {step === "source" && (
          <div className="space-y-5">
            <div>
              <h1 className="font-lector text-lg text-zinc-100">Add record(s)</h1>
              <p className="mt-1 text-xs text-zinc-500">
                Paste a URL or upload a file to continue.
              </p>
            </div>

            <div className="space-y-3">
              <div className="relative">
                <input
                  type="url"
                  value={draft.url}
                  onChange={(e) => {
                    patch({ url: e.target.value });
                    if (sourceError) setSourceError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void addSourceToQueue();
                    }
                  }}
                  placeholder="Paste URL and press Enter"
                  className={`${inputCx} pr-10`}
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500"
                >
                  ↵
                </span>
              </div>
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    if (draft.fileFile) {
                      void addSourceToQueue();
                      return;
                    }
                    fileInputRef.current?.click();
                  }
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDragActive(true);
                }}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsDragActive(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setIsDragActive(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragActive(false);
                  handleDroppedFiles(event.dataTransfer.files);
                }}
                className={`flex min-h-24 w-full cursor-pointer items-center justify-center rounded-md border px-4 py-4 text-center transition-colors duration-150 ease-[ease] ${
                  isDragActive
                    ? "border-zinc-500 bg-zinc-900 text-zinc-200"
                    : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
                }`}
              >
                <div className="space-y-1">
                  <p className="font-lector text-sm">Upload file</p>
                  <p className="text-xs text-zinc-600">Drag and drop image/PDF here, or click to browse.</p>
                </div>
              </div>
              {draft.fileFile && (
                <div className="space-y-2">
                  {filePreviewUrl && (
                    <img
                      src={filePreviewUrl}
                      alt="Preview"
                      className="max-h-40 max-w-full border border-zinc-800 object-contain"
                    />
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-xs text-zinc-500">{draft.fileFile.name}</p>
                    <button
                      type="button"
                      onClick={() => void addSourceToQueue()}
                      disabled={fetching}
                      className="font-lector text-xs text-zinc-300 transition-colors duration-150 ease-[ease] hover:text-zinc-100 disabled:opacity-40"
                    >
                      Add file ↵
                    </button>
                  </div>
                </div>
              )}
              {sourceError && <p className="text-xs text-red-500">{sourceError}</p>}
            </div>

            {queuedItems.length > 0 && (
              <motion.div
                initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: [0.215, 0.61, 0.355, 1] }}
                className="space-y-2 border-t border-zinc-800 pt-3"
              >
                {queuedItems.map((item, idx) => (
                  <div
                    key={`${item.sourceLabel}-${idx}`}
                    className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2"
                  >
                    <p className="truncate font-lector text-sm text-zinc-100">{item.title}</p>
                    <div className="mt-1 flex items-center justify-between">
                      <p className="truncate text-[11px] text-zinc-600">{item.creator}</p>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            const canRestoreSource = !!item.sourceUrl || !!item.fileFile;
                            setQueuedItems((prev) => prev.filter((_, queuedIdx) => queuedIdx !== idx));
                            if (!canRestoreSource) return;
                            patch({
                              url: item.sourceUrl,
                              fileFile: item.fileFile,
                            });
                            if (item.fileFile?.type.startsWith("image/")) {
                              setFilePreviewUrl(URL.createObjectURL(item.fileFile));
                            } else {
                              setFilePreviewUrl(null);
                            }
                          }}
                          className="font-lector text-[11px] text-zinc-400 transition-colors duration-150 ease-[ease] hover:text-zinc-200"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setQueuedItems((prev) => prev.filter((_, queuedIdx) => queuedIdx !== idx))}
                          className="font-lector text-[11px] text-zinc-500 transition-colors duration-150 ease-[ease] hover:text-red-400"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </motion.div>
            )}

            <div className="pt-3">
              <button
                type="button"
                disabled={!canContinueFromSource || fetching}
                onClick={() => {
                  const firstQueued = queuedItems[0];
                  if (!firstQueued) return;
                  setDetailsIndex(0);
                  loadQueuedItemIntoDraft(firstQueued);
                  setStep("details");
                }}
                className={sourceActionPrimaryBtn}
              >
                {fetching ? "Fetching…" : "Next"}
              </button>
            </div>
          </div>
        )}

        {step === "details" && (
          <div className="space-y-5">
            <div>
              <h1 className="font-lector text-base text-zinc-100">Edit record details</h1>
              {queuedItems.length > 1 && (
                <p className="mt-1 text-xs text-zinc-500">
                  Record {detailsIndex + 1} of {queuedItems.length}
                </p>
              )}
              {draft.thumbnailUrl && (
                <div className="mt-2 w-full rounded-md border border-zinc-800 bg-zinc-950 p-2">
                  <img
                    src={draft.thumbnailUrl}
                    alt="Source thumbnail"
                    className="h-auto w-full rounded border border-zinc-800 object-contain"
                  />
                </div>
              )}
            </div>
            <Field label="Title" required>
              <input
                type="text"
                value={draft.title}
                onChange={(e) => patch({ title: e.target.value })}
                placeholder="e.g. Beloved"
                className={inputCx}
              />
            </Field>
            <Field label="Description">
              <textarea
                rows={3}
                value={draft.description}
                onChange={(e) => patch({ description: e.target.value })}
                placeholder="A few words of context"
                className={inputCx}
              />
            </Field>
            <Field label="Original media date" required>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input
                  type="text"
                  value={draft.mediaDate}
                  onChange={(e) => patch({ mediaDate: e.target.value })}
                  placeholder="e.g. 1998, Mar 2020, Mar 12 2020"
                  className={inputCx}
                />
                <input
                  type="date"
                  value={toDateInputValue(draft.mediaDate)}
                  onChange={(e) => patch({ mediaDate: fromDateInputValue(e.target.value) })}
                  className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-2 text-xs text-zinc-300 outline-none transition-colors duration-150 ease-[ease] focus:border-zinc-600"
                />
              </div>
              <p className="text-[11px] text-zinc-600">
                All levels of detail are accepted.
              </p>
              {canResetMediaDate && (
                <button
                  type="button"
                  onClick={() => patch({ mediaDate: fetchedMediaDate })}
                  className="font-lector text-xs text-zinc-400 transition-colors duration-150 ease-[ease] hover:text-zinc-100"
                >
                  Reset to fetched date
                </button>
              )}
            </Field>
            {isMusicSource && (
              <Field label="Album">
                <input
                  type="text"
                  value={draft.sourceMetadata?.album ?? ""}
                  onChange={(e) => patchSourceMetadata({ album: e.target.value })}
                  placeholder="Album title"
                  className={inputCx}
                />
              </Field>
            )}
            <Field label="Type" required>
              <div className="space-y-1.5">
                <div className="relative">
                  <input
                    type="text"
                    value={draft.type}
                    onFocus={() => setIsTypeMenuOpen(true)}
                    onChange={(e) => {
                      patch({ type: e.target.value.toLowerCase() });
                      setIsTypeMenuOpen(true);
                    }}
                    onBlur={() => {
                      if (typeBlurTimerRef.current) clearTimeout(typeBlurTimerRef.current);
                      typeBlurTimerRef.current = setTimeout(() => setIsTypeMenuOpen(false), 120);
                      if (!user?.email || !draft.type.trim()) return;
                      void ensureItemTypeExists(draft.type, user.email).catch(() => {
                        // Best-effort type creation.
                      });
                    }}
                    placeholder="Type to choose or create"
                    className={inputCx}
                  />
                  {isTypeMenuOpen && (
                    <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-md border border-zinc-800 bg-zinc-950 shadow-[0_10px_28px_rgba(0,0,0,0.45)]">
                      {filteredItemTypes.map((itemType) => (
                        <button
                          key={itemType}
                          type="button"
                          onMouseDown={() => {
                            if (typeBlurTimerRef.current) clearTimeout(typeBlurTimerRef.current);
                            setTypeValue(itemType);
                          }}
                          className="block w-full px-3 py-2 text-left font-lector text-sm text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-100"
                        >
                          {itemType}
                        </button>
                      ))}
                      {shouldShowCreateType && (
                        <button
                          type="button"
                          onMouseDown={() => {
                            if (typeBlurTimerRef.current) clearTimeout(typeBlurTimerRef.current);
                            setTypeValue(normalizedDraftType);
                          }}
                          className="block w-full border-t border-zinc-800 px-3 py-2 text-left font-lector text-sm text-zinc-100 transition-colors hover:bg-zinc-900"
                        >
                          Create "{normalizedDraftType}"
                        </button>
                      )}
                      {!shouldShowCreateType && filteredItemTypes.length === 0 && (
                        <p className="px-3 py-2 text-xs text-zinc-600">No matching types</p>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-zinc-600">
                  Start typing to choose an existing type or create a new one.
                </p>
              </div>
            </Field>
            <Field label="Author / Creator" required>
              <input
                type="text"
                value={draft.creator}
                onChange={(e) => patch({ creator: e.target.value })}
                placeholder="e.g. Toni Morrison"
                className={inputCx}
              />
            </Field>
            {!isMusicSource && (
              <Field label="External link">
                <input
                  type="url"
                  value={draft.link}
                  onChange={(e) => patch({ link: e.target.value })}
                  placeholder="https://…"
                  className={inputCx}
                />
              </Field>
            )}
            <Field label="Destination" required>
              <div className="grid grid-cols-2 overflow-hidden rounded-md border border-zinc-800 bg-zinc-950">
                <button
                  type="button"
                  onClick={() => setDestination("library")}
                  className={`px-3 py-2 text-sm transition-colors ${
                    destination === "library"
                      ? "bg-zinc-800 font-sans text-zinc-100"
                      : "font-sans text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                  }`}
                >
                  Publish to library
                </button>
                <button
                  type="button"
                  onClick={() => setDestination("holding")}
                  className={`border-l border-zinc-800 px-3 py-2 text-sm transition-colors ${
                    destination === "holding"
                      ? "bg-zinc-800 font-sans text-zinc-100"
                      : "font-sans text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                  }`}
                >
                  Hold only
                </button>
              </div>
            </Field>

            {saveError && <p className="text-xs text-red-500">{saveError}</p>}
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  if (!canContinueDetails) return;
                  setQueuedItems((prev) =>
                    prev.map((item, idx) =>
                      idx === detailsIndex
                        ? {
                            ...item,
                            ...toQueueItem(draft),
                          }
                        : item
                    )
                  );
                  if (detailsIndex < queuedItems.length - 1) {
                    const nextIndex = detailsIndex + 1;
                    setDetailsIndex(nextIndex);
                    loadQueuedItemIntoDraft(queuedItems[nextIndex]);
                    return;
                  }
                  setRecordIndex(0);
                  setStep("record");
                }}
                disabled={!canContinueDetails}
                className="font-lector text-sm text-zinc-100 transition-colors duration-150 ease-[ease] hover:text-white disabled:opacity-40"
              >
                {detailsIndex < queuedItems.length - 1 ? "Next record" : "Add narrative"}
              </button>
            </div>
          </div>
        )}

        {step === "record" && (
          <div className="space-y-5">
            <div>
              <h1 className="text-base font-medium text-zinc-100">Record narratives</h1>
              <p className="mt-1 text-xs text-zinc-500">
                {destination === "holding"
                  ? "Record in sequence, or skip recordings and save directly to Hold."
                  : "Record in sequence. Each queued item needs its own audio before submit."}
              </p>
            </div>

            {activeQueueItem && (
              <div className="space-y-2 rounded-lg border border-zinc-800 px-4 py-3">
                {activeQueueItem.thumbnailUrl && (
                  <img
                    src={activeQueueItem.thumbnailUrl}
                    alt={`${activeQueueItem.title} thumbnail`}
                    className="h-auto w-full rounded border border-zinc-800 object-cover"
                  />
                )}
                <p className="text-xs text-zinc-500">
                  Item {recordIndex + 1} of {recordingQueue.length}
                </p>
                <p className="text-sm text-zinc-100">{activeQueueItem.title}</p>
                <p className="text-xs text-zinc-500">
                  {[activeQueueItem.creator, activeQueueItem.mediaDate].filter(Boolean).join(" · ")}
                </p>
              </div>
            )}

            <AudioRecorder
              onRecorded={(blob) => {
                setRecordings((prev) =>
                  prev.map((entry, idx) =>
                    idx === recordIndex ? { blob, existingUrl: null } : entry
                  )
                );
              }}
              onClearedInitial={() =>
                setRecordings((prev) =>
                  prev.map((entry, idx) => (idx === recordIndex ? { blob: null, existingUrl: null } : entry))
                )
              }
              initialUrl={undefined}
              prompt="Why does this matter?"
            />

            {saveError && <p className="text-xs text-red-500">{saveError}</p>}
            <div className="flex items-center gap-3">
              {destination === "holding" && (
                <button
                  type="button"
                  onClick={() => {
                    if (recordIndex < recordingQueue.length - 1) {
                      setRecordIndex((idx) => idx + 1);
                    } else {
                      void handleSubmitBatch();
                    }
                  }}
                  className="font-lector text-sm text-zinc-500 transition-colors duration-150 ease-[ease] hover:text-zinc-200"
                >
                  Skip
                </button>
              )}
              {recordIndex < recordingQueue.length - 1 ? (
                <button
                  onClick={() => setRecordIndex((idx) => idx + 1)}
                  disabled={destination === "library" ? !canAdvanceRecording : false}
                  className="font-lector text-sm text-zinc-100 transition-colors duration-150 ease-[ease] hover:text-white disabled:opacity-40"
                >
                  Next recording
                </button>
              ) : (
                <button
                  onClick={handleSubmitBatch}
                  disabled={destination === "library" ? !canAdvanceRecording : false}
                  className="font-lector text-sm text-zinc-100 transition-colors duration-150 ease-[ease] hover:text-white disabled:opacity-40"
                >
                  Submit all
                </button>
              )}
            </div>
          </div>
        )}

        {showDraftsSection && (
          <section className="mt-8 border-t border-zinc-800 pt-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs uppercase tracking-wide text-zinc-500">Drafts</h2>
              <span className="text-xs text-zinc-600">{drafts.length}</span>
            </div>
            <div className="space-y-2">
              {drafts.map((draftItem) => (
                <div key={draftItem.id} className="flex items-center justify-between rounded-md border border-zinc-800 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => router.push(`/?panel=add&draft=${draftItem.id}`)}
                    className="truncate text-left text-xs text-zinc-300 hover:text-zinc-100"
                  >
                    {draftItem.title}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDiscardDraft(draftItem)}
                    className="text-xs text-zinc-500 hover:text-red-400"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="font-sans text-xs text-zinc-500">
        {label}
        {required ? <span className="ml-0.5 text-zinc-400">*</span> : null}
      </label>
      {children}
    </div>
  );
}

function Loading({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "p-6" : "flex min-h-screen items-center justify-center bg-black"}>
      <span className="text-xs text-zinc-500">loading…</span>
    </div>
  );
}

const inputCx =
  "w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none transition-colors duration-150 ease-[ease] placeholder:text-zinc-600 focus:border-zinc-600";

const primaryBtn =
  "rounded-md border border-zinc-700 px-4 py-2 text-sm text-zinc-200 transition-colors duration-150 ease-[ease] hover:border-zinc-500 hover:text-zinc-50 disabled:opacity-40";

const ghostBtn = "text-xs text-zinc-500 transition-colors duration-150 ease-[ease] hover:text-zinc-200 disabled:opacity-40";
const sourceActionPrimaryBtn =
  "font-lector text-sm tracking-tight text-zinc-100 transition-colors duration-150 ease-[ease] hover:text-white disabled:opacity-40";
