"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import AudioRecorder from "@/components/AudioRecorder";
import {
  createItemDoc,
  createAndPublishItem,
  discardDraft,
  findPublishedItemByLink,
  findPublishedMusicItemBySongLink,
  findPublishedItemByTitle,
  getItem,
  subscribeToDrafts,
  upsertDraft,
  updateItem,
  uploadItemFile,
} from "@/lib/items";
import { DEFAULT_ITEM_TYPES, ensureItemTypeExists, subscribeToItemTypes } from "@/lib/item-types";
import { hasKanonSave, saveToKanon } from "@/lib/kanon";
import { isDownloadableVideoPageUrl } from "@/lib/metadata/classify";
import type { MetadataResult, SourceMetadata, SourceType } from "@/lib/metadata/types";
import { mirrorPreviewAudio, mirrorThumbnail, mirrorVideo, uploadBase64Thumbnail } from "@/lib/media-upload";
import type { Item } from "@/lib/types";
import { EASE_OUT, MOTION_DURATION } from "@/lib/motion";

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
  id: string;
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

interface PendingSourceCard {
  id: string;
  sourceLabel: string;
  sourceType: SourceType;
}

interface DuplicatePromptState {
  sourceDraft: ItemDraft;
  warnings: string[];
  libraryItemId?: string;
  libraryItemAlreadyInHold?: boolean;
  targetQueueItemId?: string;
}
function createQueueItemId(): string {
  return `queue-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
    id: createQueueItemId(),
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

function getPendingSourceType(url: string, file: File | null): SourceType {
  if (file) {
    if (file.type === "application/pdf") return "pdf";
    if (file.type.startsWith("audio/")) return "audio";
    if (file.type.startsWith("video/")) return "video";
    if (file.type.startsWith("image/")) return "image";
    return "unknown";
  }
  const value = url.trim().toLowerCase();
  if (!value) return "unknown";
  if (value.includes("youtube.com") || value.includes("youtu.be")) return "youtube";
  if (value.includes("spotify.com") || value.includes("music.apple.com") || value.includes("song.link")) return "music";
  if (value.includes("instagram.com")) return "instagram";
  if (value.includes("tiktok.com")) return "tiktok";
  if (value.includes("twitter.com") || value.includes("x.com")) return "twitter";
  if (value.includes("doi.org")) return "doi";
  if (value.includes("/news") || value.includes("news.")) return "news";
  return "url";
}

function isHeicFile(file: File): boolean {
  if (file.type === "image/heic" || file.type === "image/heif") return true;
  return /\.heic$/i.test(file.name) || /\.heif$/i.test(file.name);
}

function formatPendingSourceLabel(url: string, file: File | null): string {
  if (file) return file.name;
  const trimmed = url.trim();
  if (!trimmed) return "source";
  let sanitized = trimmed
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/$/, "");
  try {
    const parsed = new URL(trimmed);
    sanitized = `${parsed.hostname.replace(/^www\./i, "")}${parsed.pathname}`.replace(/\/$/, "");
  } catch {
    // Keep sanitized fallback from regex above.
  }
  if (sanitized.length <= 44) return sanitized;
  return `${sanitized.slice(0, 41)}…`;
}

function getSourceTypeIconPath(sourceType: SourceType): string {
  switch (sourceType) {
    case "audio":
      return "/icons/18_waveform-lines.svg";
    case "video":
      return "/icons/18_video-2.svg";
    case "music":
      return "/icons/18_music.svg";
    case "pdf":
    case "doi":
    case "news":
      return "/icons/18_brochure.svg";
    case "youtube":
      return "/icons/18_youtube-1.svg";
    case "image":
      return "/icons/18_photo.svg";
    case "instagram":
      return "/icons/18_instagram-1.svg";
    case "twitter":
      return "/icons/18_x-twitter-1.svg";
    case "tiktok":
    case "url":
    case "unknown":
    default:
      return "/icons/18_globe-3.svg";
  }
}

function normalizeUrlForCompare(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  try {
    const parsed = new URL(value.startsWith("http") ? value : `https://${value}`);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const pathname = parsed.pathname.replace(/\/+$/, "");
    const search = parsed.search;
    return `${hostname}${pathname}${search}`;
  } catch {
    return value.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "");
  }
}

async function resolveCanonicalSongLink(url: string): Promise<string | null> {
  try {
    const res = await fetch("/api/metadata", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) return null;
    const result = (await res.json()) as MetadataResult;
    if (!result.success || !result.data) return null;
    if (result.data.source_metadata?.source_type !== "music") return null;
    const songLink = result.data.source_metadata.song_link_url?.trim();
    if (songLink) return songLink;
    const fallbackLink = result.data.link?.trim();
    if (fallbackLink && fallbackLink.includes("song.link")) return fallbackLink;
    return null;
  } catch {
    return null;
  }
}

function filenameStem(name: string): string {
  return name.replace(/\.[^/.]+$/, "").trim().toLowerCase();
}

function isValidSourceUrl(raw: string): boolean {
  const value = raw.trim();
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function extractYear(raw: string): string {
  const value = raw.trim();
  if (!value || value.toLowerCase() === "unknown") return "";
  const directYearMatch = value.match(/\b(19|20)\d{2}\b/);
  if (directYearMatch) return directYearMatch[0];
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return String(parsed.getFullYear());
}

function formatCreatorWithYear(creator: string, mediaDate: string): string {
  const normalizedCreator = creator.trim();
  const creatorLabel =
    normalizedCreator &&
    normalizedCreator.toLowerCase() !== "unknown creator" &&
    normalizedCreator.toLowerCase() !== "unknown"
      ? normalizedCreator
      : "";
  const parts = [creatorLabel, extractYear(mediaDate)].filter(Boolean);
  return parts.join(" • ");
}

async function generateVideoThumbnailDataUrl(file: File): Promise<string | null> {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  if (!file.type.startsWith("video/")) return null;

  return new Promise((resolve) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    let settled = false;

    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute("src");
      video.load();
      resolve(value);
    };

    const capture = () => {
      try {
        const width = video.videoWidth || 0;
        const height = video.videoHeight || 0;
        if (!width || !height) {
          finish(null);
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          finish(null);
          return;
        }
        ctx.drawImage(video, 0, 0, width, height);
        finish(canvas.toDataURL("image/jpeg", 0.82));
      } catch {
        finish(null);
      }
    };

    const onLoadedData = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0.05) {
        capture();
        return;
      }
      const seekTarget = Math.min(Math.max(video.duration * 0.15, 0.05), 1.2);
      try {
        video.currentTime = seekTarget;
      } catch {
        capture();
      }
    };

    const timer = window.setTimeout(() => finish(null), 5000);

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.addEventListener("loadeddata", onLoadedData, { once: true });
    video.addEventListener("seeked", capture, { once: true });
    video.addEventListener(
      "error",
      () => {
        window.clearTimeout(timer);
        finish(null);
      },
      { once: true }
    );
    video.addEventListener(
      "loadeddata",
      () => {
        window.clearTimeout(timer);
      },
      { once: true }
    );
    video.src = objectUrl;
  });
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
  onHasUnsavedProgressChange,
}: {
  hideHeader?: boolean;
  onProgressChange?: (progressPercent: number) => void;
  backSignal?: number;
  closeSignal?: number;
  onRequestPanelClose?: () => void;
  onCanGoBackChange?: (canGoBack: boolean) => void;
  onHasUnsavedProgressChange?: (hasUnsaved: boolean) => void;
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
        onHasUnsavedProgressChange={onHasUnsavedProgressChange}
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
  onHasUnsavedProgressChange,
}: {
  hideHeader?: boolean;
  onProgressChange?: (progressPercent: number) => void;
  backSignal?: number;
  closeSignal?: number;
  onRequestPanelClose?: () => void;
  onCanGoBackChange?: (canGoBack: boolean) => void;
  onHasUnsavedProgressChange?: (hasUnsaved: boolean) => void;
}) {
  const { loading: authLoading, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const shouldReduceMotion = useReducedMotion();
  const urlInputControls = useAnimationControls();
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
  const [activeFetchCount, setActiveFetchCount] = useState(0);
  const [pendingSourceCards, setPendingSourceCards] = useState<PendingSourceCard[]>([]);
  const [duplicatePrompt, setDuplicatePrompt] = useState<DuplicatePromptState | null>(null);
  const [editingQueueItemId, setEditingQueueItemId] = useState<string | null>(null);
  const [replacingQueueItemId, setReplacingQueueItemId] = useState<string | null>(null);
  const [editingReplacementUrl, setEditingReplacementUrl] = useState("");
  const [editingSourceError, setEditingSourceError] = useState("");
  const [draftLoading, setDraftLoading] = useState(!!urlDraftId);
  const [sourceError, setSourceError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveStage, setSaveStage] = useState("");
  const [saving, setSaving] = useState(false);
  const [itemTypes, setItemTypes] = useState<string[]>([...DEFAULT_ITEM_TYPES]);
  const [isTypeMenuOpen, setIsTypeMenuOpen] = useState(false);
  const [, setFilePreviewUrl] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [showClosePrompt, setShowClosePrompt] = useState(false);
  const [draftPromptSaving, setDraftPromptSaving] = useState(false);
  const [draftPromptError, setDraftPromptError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const cardsScrollRef = useRef<HTMLDivElement>(null);
  const [cardsScrolledDown, setCardsScrolledDown] = useState(false);
  const typeBlurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevBackSignalRef = useRef(backSignal);
  const prevCloseSignalRef = useRef(closeSignal);
  const fetching = activeFetchCount > 0;
  const hasPendingDuplicateDecision = !!duplicatePrompt;

  useEffect(() => {
    const el = cardsScrollRef.current;
    if (!el) { setCardsScrolledDown(false); return; }
    const check = () => setCardsScrolledDown(el.scrollTop > 2);
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", check); ro.disconnect(); };
  }, [pendingSourceCards.length, queuedItems.length]);

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
    onHasUnsavedProgressChange?.(hasUnsavedProgress);
  }, [hasUnsavedProgress, onHasUnsavedProgressChange]);

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
          thumbnailUrl:
            result.data.thumbnail_url ?? result.data.thumbnail_base64 ?? nextDraft.thumbnailUrl ?? null,
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

  async function queueSourceDraft(sourceDraft: ItemDraft, replaceItemId: string | null = null): Promise<QueueItem | null> {
    let preparedDraft = sourceDraft;
    if (!preparedDraft.thumbnailUrl && preparedDraft.fileFile?.type.startsWith("video/")) {
      const generatedThumbnail = await generateVideoThumbnailDataUrl(preparedDraft.fileFile);
      if (generatedThumbnail) {
        preparedDraft = { ...preparedDraft, thumbnailUrl: generatedThumbnail };
      }
    }

    const pendingCardId = `pending-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const pendingCard: PendingSourceCard = {
      id: pendingCardId,
      sourceLabel: formatPendingSourceLabel(preparedDraft.url, preparedDraft.fileFile),
      sourceType: getPendingSourceType(preparedDraft.url, preparedDraft.fileFile),
    };

    setPendingSourceCards((prev) => [...prev, pendingCard]);
    setActiveFetchCount((count) => count + 1);
    try {
      const queuedItem = await buildQueuedItemFromSource(preparedDraft);
      const nextItem = replaceItemId ? { ...queuedItem, id: replaceItemId } : queuedItem;
      setQueuedItems((prev) => {
        if (!replaceItemId) return [...prev, nextItem];
        return prev.map((item) => (item.id === replaceItemId ? nextItem : item));
      });
      return nextItem;
    } finally {
      setPendingSourceCards((prev) => prev.filter((card) => card.id !== pendingCardId));
      setActiveFetchCount((count) => Math.max(0, count - 1));
    }
  }

  async function detectDuplicateWarnings(
    sourceDraft: ItemDraft,
    options?: { excludeQueueItemId?: string; queuedCandidate?: QueueItem }
  ): Promise<{ warnings: string[]; libraryItemId?: string; libraryItemAlreadyInHold?: boolean }> {
    const warnings: string[] = [];
    let libraryItemId: string | undefined;
    const hasUrl = !!sourceDraft.url.trim();
    const hasFile = !!sourceDraft.fileFile;

    if (hasUrl) {
      const normalizedIncoming = normalizeUrlForCompare(sourceDraft.url);
      if (
        queuedItems.some(
          (item) =>
            item.id !== options?.excludeQueueItemId &&
            item.sourceUrl &&
            normalizeUrlForCompare(item.sourceUrl) === normalizedIncoming
        )
      ) {
        warnings.push("This URL already appears in the records you are adding.");
      }
      if (
        drafts.some(
          (draftItem) =>
            draftItem.id !== currentDraftId &&
            draftItem.link &&
            normalizeUrlForCompare(draftItem.link) === normalizedIncoming
        )
      ) {
        warnings.push("This URL matches one of your saved drafts.");
      }
      const existingPublished = await findPublishedItemByLink(sourceDraft.url.trim());
      if (existingPublished) {
        warnings.push("This URL already exists in the Kanon library.");
        libraryItemId = existingPublished.id;
      }

      if (getPendingSourceType(sourceDraft.url, null) === "music") {
        const canonicalSongLink =
          options?.queuedCandidate?.sourceMetadata?.song_link_url || (await resolveCanonicalSongLink(sourceDraft.url));
        if (canonicalSongLink) {
          const normalizedSongLink = normalizeUrlForCompare(canonicalSongLink);
          if (
            queuedItems.some((item) => {
              if (item.id === options?.excludeQueueItemId) return false;
              const queueSongLink =
                item.sourceMetadata?.song_link_url || (item.link.includes("song.link") ? item.link : "");
              return queueSongLink && normalizeUrlForCompare(queueSongLink) === normalizedSongLink;
            })
          ) {
            warnings.push("This track already appears in the records you are adding.");
          }
          if (
            drafts.some((draftItem) => {
              const draftSongLink = draftItem.source_metadata?.song_link_url;
              return !!draftSongLink && normalizeUrlForCompare(draftSongLink) === normalizedSongLink;
            })
          ) {
            warnings.push("This track matches one of your saved drafts.");
          }
          const existingBySongLink = await findPublishedMusicItemBySongLink(canonicalSongLink);
          if (existingBySongLink) {
            warnings.push("This track already exists in the Kanon library.");
            libraryItemId = existingBySongLink.id;
          } else {
            const existingByCanonicalLink = await findPublishedItemByLink(canonicalSongLink);
            if (existingByCanonicalLink) {
              warnings.push("This track already exists in the Kanon library.");
              libraryItemId = existingByCanonicalLink.id;
            }
          }
        }
      }
    }

    if (hasFile && sourceDraft.fileFile) {
      const incomingFile = sourceDraft.fileFile;
      if (
        queuedItems.some(
          (item) =>
            item.id !== options?.excludeQueueItemId &&
            item.fileFile &&
            item.fileFile.name === incomingFile.name &&
            item.fileFile.size === incomingFile.size &&
            item.fileFile.type === incomingFile.type
        )
      ) {
        warnings.push("This file already appears in the records you are adding.");
      }
      const incomingStem = filenameStem(incomingFile.name);
      if (
        drafts.some(
          (draftItem) =>
            draftItem.id !== currentDraftId && draftItem.title && draftItem.title.trim().toLowerCase() === incomingStem
        )
      ) {
        warnings.push("A draft with a matching file name already exists.");
      }

      const existingPublishedByTitle = await findPublishedItemByTitle(
        sourceDraft.title.trim() || sourceDraft.fileFile.name.replace(/\.[^/.]+$/, "").trim(),
        sourceDraft.creator
      );
      if (existingPublishedByTitle) {
        warnings.push("A matching file record already exists in the Kanon library.");
        libraryItemId = existingPublishedByTitle.id;
      }
    }

    // Collapse to one clear warning so users don't see redundant messages.
    const firstLibraryWarning = warnings.find((warning) => warning.includes("already exists in the Kanon library"));
    const firstQueueWarning = warnings.find((warning) => warning.includes("already appears in the records"));
    const firstDraftWarning = warnings.find((warning) => warning.includes("matches one of your saved drafts"));
    const firstFileDraftWarning = warnings.find((warning) => warning.includes("matching file name"));
    const resolvedWarning =
      firstLibraryWarning ?? firstQueueWarning ?? firstDraftWarning ?? firstFileDraftWarning ?? warnings[0] ?? null;
    const normalizedWarnings = resolvedWarning ? [resolvedWarning] : [];

    const libraryItemAlreadyInHold =
      !!libraryItemId && !!user?.email ? await hasKanonSave(user.email, "item", libraryItemId) : false;
    return { warnings: normalizedWarnings, libraryItemId, libraryItemAlreadyInHold };
  }

  async function addSourceToQueue(sourceDraftOverride?: ItemDraft, skipDuplicateCheck = false) {
    if (hasPendingDuplicateDecision && !skipDuplicateCheck) return;
    const sourceDraft = sourceDraftOverride ? { ...sourceDraftOverride } : { ...draft };
    const hasUrl = !!sourceDraft.url.trim();
    const hasFile = !!sourceDraft.fileFile;
    if (!hasUrl && !hasFile) {
      setSourceError("Add a URL or file, then press Enter.");
      return;
    }
    if (hasUrl && !hasFile && !isValidSourceUrl(sourceDraft.url)) {
      setSourceError("Enter a valid URL (including https://) before continuing.");
      if (!shouldReduceMotion) {
        void urlInputControls.start({
          x: [0, -7, 7, -5, 5, 0],
          transition: { duration: 0.28, ease: EASE_OUT },
        });
      }
      return;
    }

    setSourceError("");
    setDuplicatePrompt(null);
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
    const editTargetId = editingQueueItemId;
    if (editTargetId) {
      setEditingQueueItemId(null);
    }
    const queuedCandidate = await queueSourceDraft(sourceDraft, editTargetId);
    if (!queuedCandidate || skipDuplicateCheck) return;
    const { warnings, libraryItemId, libraryItemAlreadyInHold } = await detectDuplicateWarnings(sourceDraft, {
      excludeQueueItemId: queuedCandidate.id,
      queuedCandidate,
    });
    if (warnings.length > 0) {
      setDuplicatePrompt({
        sourceDraft,
        warnings,
        libraryItemId,
        libraryItemAlreadyInHold,
        targetQueueItemId: queuedCandidate.id,
      });
    }
  }

  async function replaceQueuedItemSource(itemId: string) {
    if (fetching || hasPendingDuplicateDecision) return;
    const nextUrl = editingReplacementUrl.trim();
    if (!isValidSourceUrl(nextUrl)) {
      setEditingSourceError("Enter a valid URL (including https://).");
      return;
    }

    const sourceDraft: ItemDraft = {
      ...EMPTY,
      url: nextUrl,
      type: DEFAULT_ITEM_TYPES[0],
    };

    setEditingSourceError("");
    setEditingQueueItemId(null);
    setReplacingQueueItemId(itemId);
    setActiveFetchCount((count) => count + 1);
    try {
      const queuedItem = await buildQueuedItemFromSource(sourceDraft);
      setQueuedItems((prev) => prev.map((item) => (item.id === itemId ? { ...queuedItem, id: item.id } : item)));
      setEditingReplacementUrl("");
    } finally {
      setReplacingQueueItemId(null);
      setActiveFetchCount((count) => Math.max(0, count - 1));
    }
  }

  async function replaceQueuedItemFile(itemId: string, file: File | null) {
    if (fetching || hasPendingDuplicateDecision) return;
    if (!file) {
      setEditingSourceError("Choose a file to replace this source.");
      return;
    }
    if (isHeicFile(file)) {
      setEditingSourceError("HEIC files are not supported. Please convert to JPEG or PNG first.");
      return;
    }

    const sourceDraft: ItemDraft = {
      ...EMPTY,
      fileFile: file,
      type: DEFAULT_ITEM_TYPES[0],
    };

    setEditingSourceError("");
    setEditingQueueItemId(null);
    setReplacingQueueItemId(itemId);
    setActiveFetchCount((count) => count + 1);
    try {
      const queuedItem = await buildQueuedItemFromSource(sourceDraft);
      setQueuedItems((prev) => prev.map((item) => (item.id === itemId ? { ...queuedItem, id: item.id } : item)));
    } finally {
      setReplacingQueueItemId(null);
      setActiveFetchCount((count) => Math.max(0, count - 1));
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

    const uniqueTypes = [...new Set(itemsToDraft.map((q) => q.type))];
    await Promise.all(
      uniqueTypes.map((t) => ensureItemTypeExists(t, userEmail).catch(() => {}))
    );

    let lastDraftId = "";
    await Promise.all(
      itemsToDraft.map(async (queuedItem) => {
        const { draftId } = await upsertDraft(userEmail, null, {
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
        });
        lastDraftId = draftId;

        const mediaUploads: Promise<void>[] = [];

        if (queuedItem.thumbnailUrl) {
          mediaUploads.push(
            (async () => {
              let persistedUrl = queuedItem.thumbnailUrl!;
              if (persistedUrl.startsWith("data:")) {
                persistedUrl = await uploadBase64Thumbnail(persistedUrl, draftId);
              } else if (
                persistedUrl.startsWith("http") &&
                !persistedUrl.includes("firebasestorage.googleapis.com")
              ) {
                persistedUrl = await mirrorThumbnail(persistedUrl, draftId);
              } else {
                return;
              }
              await updateItem(draftId, { thumbnail_url: persistedUrl });
            })().catch(() => {})
          );
        }

        if (queuedItem.fileFile) {
          mediaUploads.push(
            uploadItemFile(queuedItem.fileFile, draftId)
              .then((fileUrl) => updateItem(draftId, { media_url: fileUrl }))
              .catch(() => {})
          );
        }

        await Promise.all(mediaUploads);
      })
    );

    if (lastDraftId) setCurrentDraftId(lastDraftId);
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
      multiple
      accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml,image/bmp,image/tiff,application/pdf,audio/*,video/*"
      className="hidden"
      onChange={(event) => {
        if (hasPendingDuplicateDecision) {
          event.target.value = "";
          return;
        }
        void handleDroppedFiles(event.target.files);
        event.target.value = "";
      }}
    />
  );

  async function handleDroppedFiles(fileList: FileList | null) {
    if (hasPendingDuplicateDecision) return;
    const files = Array.from(fileList ?? []).filter((f) => {
      if (isHeicFile(f)) {
        setSourceError("HEIC files are not supported. Please convert to JPEG or PNG first.");
        return false;
      }
      return true;
    });
    if (files.length === 0) return;
    setSourceError("");
    setDuplicatePrompt(null);
    await Promise.all(
      files.map((file) =>
        addSourceToQueue(
          { ...EMPTY, fileFile: file, type: DEFAULT_ITEM_TYPES[0] },
          true
        )
      )
    );
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
          transition={{ duration: shouldReduceMotion ? 0 : MOTION_DURATION.standard, ease: EASE_OUT }}
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
    <div className={hideHeader ? "relative" : "relative min-h-screen bg-black"}>
      {fileInput}

      <AnimatePresence>
        {showClosePrompt && (
          <motion.div
            key="close-prompt-overlay"
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : MOTION_DURATION.panel, ease: EASE_OUT }}
            className="absolute inset-0 z-30 flex items-start justify-start backdrop-blur-xl"
            style={{ backgroundColor: "rgba(0, 0, 0, 0.6)" }}
          >
            <motion.div
              initial={shouldReduceMotion ? false : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
              transition={{ duration: shouldReduceMotion ? 0 : MOTION_DURATION.panel, ease: EASE_OUT }}
              className="px-6 pt-6 max-w-sm"
            >
              <p className="font-lector text-sm text-zinc-100">Save your progress?</p>
              <div className="mt-4 flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setShowClosePrompt(false)}
                  className="font-sans text-xs text-zinc-100 transition-colors duration-150 ease-[ease] hover:text-white"
                >
                  Keep editing
                </button>
                <button
                  type="button"
                  onClick={() => onRequestPanelClose?.()}
                  className="font-sans text-xs text-zinc-500 transition-colors duration-150 ease-[ease] hover:text-zinc-300"
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
                  className="font-sans text-xs text-zinc-500 transition-colors duration-150 ease-[ease] hover:text-zinc-300 disabled:opacity-40"
                >
                  {draftPromptSaving ? "Saving..." : "Save drafts and close"}
                </button>
              </div>
              {draftPromptError && <p className="mt-3 text-xs text-red-400">{draftPromptError}</p>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="mx-auto max-w-xl px-6 pb-8 pt-6">
        <AnimatePresence initial={false} mode="wait">
        {step === "source" && (
          <motion.section
            key="add-step-source"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: shouldReduceMotion ? 0 : MOTION_DURATION.standard, ease: EASE_OUT }}
            className="flex h-[calc(100vh-9rem)] flex-col"
          >
            <div className="flex flex-1 flex-col space-y-5 min-h-0">
              <div>
                <h1 className="font-lector text-lg text-zinc-100">Add record(s)</h1>
                <p className="mt-1 text-xs text-zinc-500">
                  Paste a URL or upload a file to continue.
                </p>
              </div>

              {showDraftsSection && (
                <section className="space-y-2 pt-1">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-xs uppercase tracking-wide text-zinc-500">
                      <span className="text-zinc-600">{drafts.length}</span> {drafts.length === 1 ? "Draft" : "Drafts"}
                    </h2>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={async () => {
                          const items = drafts.map((d) =>
                            toQueueItem({
                              url: d.link ?? "",
                              title: d.title,
                              description: d.description ?? "",
                              mediaDate: d.media_date ?? "",
                              type: d.type,
                              creator: d.creator,
                              link: d.link ?? "",
                              tags: Array.isArray(d.tags) ? d.tags.join(", ") : "",
                              audioBlob: null,
                              existingAudioUrl: d.voice_recording_url || null,
                              fileFile: null,
                              existingFileUrl: d.media_url || null,
                              thumbnailUrl: d.thumbnail_url ?? null,
                              sourceMetadata: d.source_metadata ?? null,
                              sourceLabel: d.link ?? d.title,
                            })
                          );
                          setQueuedItems((prev) => [...prev, ...items]);
                          for (const d of drafts) await discardDraft(d);
                        }}
                        className="text-xs text-zinc-500 transition-colors duration-150 ease-[ease] hover:text-zinc-300"
                      >
                        Recover all
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const toDelete = [...drafts];
                          await Promise.all(toDelete.map((d) => discardDraft(d)));
                        }}
                        className="text-xs text-zinc-500 transition-colors duration-150 ease-[ease] hover:text-red-400"
                      >
                        Delete all
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <AnimatePresence initial={false}>
                    {drafts.map((draftItem) => (
                      <motion.div
                        key={draftItem.id}
                        layout
                        initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
                        transition={{
                          duration: shouldReduceMotion ? 0 : 0.18,
                          ease: EASE_OUT,
                          layout: { duration: 0.2, ease: EASE_OUT },
                        }}
                        className="flex items-center gap-2 rounded-md border border-zinc-800 px-3 py-2"
                      >
                        <span className="min-w-0 flex-1 truncate text-xs text-zinc-300">
                          {draftItem.title}
                        </span>
                        <button
                          type="button"
                          aria-label="Add to queue"
                          onClick={() => {
                            setQueuedItems((prev) => [
                              ...prev,
                              toQueueItem({
                                url: draftItem.link ?? "",
                                title: draftItem.title,
                                description: draftItem.description ?? "",
                                mediaDate: draftItem.media_date ?? "",
                                type: draftItem.type,
                                creator: draftItem.creator,
                                link: draftItem.link ?? "",
                                tags: Array.isArray(draftItem.tags) ? draftItem.tags.join(", ") : "",
                                audioBlob: null,
                                existingAudioUrl: draftItem.voice_recording_url || null,
                                fileFile: null,
                                existingFileUrl: draftItem.media_url || null,
                                thumbnailUrl: draftItem.thumbnail_url ?? null,
                                sourceMetadata: draftItem.source_metadata ?? null,
                                sourceLabel: draftItem.link ?? draftItem.title,
                              }),
                            ]);
                            void discardDraft(draftItem);
                          }}
                          className="shrink-0 text-sm text-zinc-500 transition-colors duration-150 ease-[ease] hover:text-zinc-200"
                        >
                          →
                        </button>
                        <button
                          type="button"
                          aria-label="Delete draft"
                          onClick={() => void handleDiscardDraft(draftItem)}
                          className="shrink-0 text-sm text-zinc-500 transition-colors duration-150 ease-[ease] hover:text-red-400"
                        >
                          ✕
                        </button>
                      </motion.div>
                    ))}
                    </AnimatePresence>
                  </div>
                </section>
              )}

              {(pendingSourceCards.length > 0 || queuedItems.length > 0) && (
                <div className="relative mt-auto flex min-h-0 flex-1 flex-col">
                  <div
                    aria-hidden
                    className="pointer-events-none absolute left-0 right-0 top-0 z-20 h-10 bg-gradient-to-b from-black to-transparent transition-opacity duration-200"
                    style={{ opacity: cardsScrolledDown ? 1 : 0 }}
                  />
                  <div
                    ref={cardsScrollRef}
                    className="flex min-h-0 flex-1 flex-col overflow-y-auto scrollbar-hide"
                  >
                <motion.div
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: shouldReduceMotion ? 0 : MOTION_DURATION.standard, ease: EASE_OUT }}
                  className="mt-auto space-y-2 pb-5"
                >
                  <AnimatePresence initial={false} mode="popLayout">
                    {[...pendingSourceCards].reverse().map((pendingCard) => (
                    <motion.div
                      key={pendingCard.id}
                      layout
                      initial={shouldReduceMotion ? false : { opacity: 0, y: 8, scale: 0.985 }}
                      animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                      exit={
                        shouldReduceMotion
                          ? { opacity: 0 }
                          : { opacity: 0, y: 6, scale: 0.99, filter: "blur(2px)" }
                      }
                      transition={
                        shouldReduceMotion
                          ? { duration: 0 }
                          : {
                              duration: 0.24,
                              ease: EASE_OUT,
                              layout: { type: "spring", duration: 0.3, bounce: 0.08 },
                            }
                      }
                      className="relative overflow-hidden rounded-md border border-zinc-800 bg-zinc-950 p-3"
                    >
                      <motion.div
                        aria-hidden
                        className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.14),transparent)]"
                        animate={{ x: ["-140%", "140%"] }}
                        transition={{ duration: 1.2, ease: "linear", repeat: Infinity, repeatType: "loop" }}
                        style={{ willChange: "transform" }}
                      />
                      <div className="relative flex min-h-14 items-center gap-2.5">
                        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-sm bg-zinc-900/35 text-zinc-500">
                          <Image
                            src={getSourceTypeIconPath(pendingCard.sourceType)}
                            alt=""
                            aria-hidden
                            width={24}
                            height={24}
                            className="h-5 w-5 animate-pulse opacity-70"
                          />
                        </div>
                        <div className="flex min-w-0 flex-1 items-center">
                          <p className="truncate font-lector text-xs text-zinc-300">{pendingCard.sourceLabel}</p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                  </AnimatePresence>
                  <AnimatePresence initial={false} mode="popLayout">
                    {[...queuedItems].reverse().map((item, reverseIndex) => {
                      const isEditing = editingQueueItemId === item.id;
                      const isReplacing = replacingQueueItemId === item.id;
                      const isDuplicateCard = duplicatePrompt?.targetQueueItemId === item.id;
                      const isFileSource = !item.sourceUrl && !!item.fileFile;
                      const creatorLine = formatCreatorWithYear(item.creator, item.mediaDate);
                      return (
                    <motion.div
                      key={item.id}
                      layout
                      initial={shouldReduceMotion ? false : { opacity: 0, y: 6, scale: 0.97 }}
                      animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                      exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.99 }}
                      transition={
                        shouldReduceMotion
                          ? { duration: 0 }
                          : {
                              duration: 0.24,
                              ease: EASE_OUT,
                              delay: reverseIndex * 0.03,
                              layout: { type: "spring", duration: 0.32, bounce: 0.06 },
                            }
                      }
                      style={shouldReduceMotion ? undefined : { transformOrigin: "top center" }}
                      className="relative overflow-hidden rounded-md border border-zinc-800 bg-zinc-950 p-3"
                    >
                      {isReplacing && (
                        <motion.div
                          aria-hidden
                          className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(110deg,transparent,rgba(255,255,255,0.14),transparent)]"
                          animate={{ x: ["-140%", "140%"] }}
                          transition={{ duration: 1.2, ease: "linear", repeat: Infinity, repeatType: "loop" }}
                          style={{ willChange: "transform" }}
                        />
                      )}
                      {isDuplicateCard && (
                        <motion.div
                          initial={shouldReduceMotion ? false : { opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0 }}
                          transition={{ duration: shouldReduceMotion ? 0 : 0.16, ease: EASE_OUT }}
                          className="absolute inset-0 z-20 flex h-full flex-col rounded-md border border-yellow-500/70 bg-amber-950/35 p-3"
                        >
                          <p className="text-xs text-zinc-100">Possible duplicate detected.</p>
                          <p className="mt-1 text-[11px] text-zinc-300">{duplicatePrompt?.warnings.join(" ")}</p>
                          <div className="mt-auto flex items-center gap-3 pt-2">
                            <button
                              type="button"
                              onClick={() => {
                                setQueuedItems((prev) =>
                                  prev.filter((queuedItem) => queuedItem.id !== duplicatePrompt?.targetQueueItemId)
                                );
                                setDuplicatePrompt(null);
                                setSourceError("");
                                patch({ url: "" });
                              }}
                              className="font-sans text-[11px] text-zinc-100 transition-colors hover:text-white"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => setDuplicatePrompt(null)}
                              className="font-sans text-[11px] text-zinc-400 transition-colors hover:text-zinc-200"
                            >
                              Add anyway
                            </button>
                            {duplicatePrompt?.libraryItemId && user?.email && (
                              <button
                                type="button"
                                disabled={duplicatePrompt.libraryItemAlreadyInHold}
                                onClick={async () => {
                                  try {
                                    await saveToKanon(user.email!, "item", duplicatePrompt.libraryItemId!);
                                    setQueuedItems((prev) =>
                                      prev.filter((queuedItem) => queuedItem.id !== duplicatePrompt.targetQueueItemId)
                                    );
                                    setDuplicatePrompt(null);
                                    setSourceError("");
                                    patch({ url: "" });
                                  } catch (error) {
                                    setSourceError(
                                      error instanceof Error
                                        ? error.message
                                        : "Could not add existing item to Hold."
                                    );
                                  }
                                }}
                                className="font-sans text-[11px] text-zinc-400 transition-colors hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {duplicatePrompt.libraryItemAlreadyInHold ? "Already in Hold" : "Add to Hold"}
                              </button>
                            )}
                          </div>
                        </motion.div>
                      )}
                      <motion.div
                        animate={
                          shouldReduceMotion
                            ? { opacity: 1 }
                            : {
                                filter: isReplacing || isDuplicateCard ? "blur(10px)" : "blur(0px)",
                                opacity: isReplacing || isDuplicateCard ? 0.24 : 1,
                              }
                        }
                        transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: EASE_OUT }}
                        className={`flex items-start gap-3 ${isReplacing || isDuplicateCard ? "pointer-events-none" : ""}`}
                      >
                        <motion.div
                          animate={
                            shouldReduceMotion
                              ? { opacity: 1 }
                              : { filter: isEditing || isReplacing ? "blur(3px)" : "blur(0px)", opacity: isEditing || isReplacing ? 0.75 : 1 }
                          }
                          transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: "easeInOut" }}
                          className="h-20 w-20 flex-none overflow-hidden rounded-sm border border-zinc-800 bg-zinc-900/80"
                        >
                          {item.thumbnailUrl ? (
                            <img
                              src={item.thumbnailUrl}
                              alt={item.title || "Source preview"}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-zinc-500">
                              <Image
                                src={getSourceTypeIconPath(
                                  item.sourceMetadata?.source_type ?? getPendingSourceType(item.sourceUrl, item.fileFile)
                                )}
                                alt=""
                                aria-hidden
                                width={24}
                                height={24}
                                className="h-6 w-6 opacity-80"
                              />
                            </div>
                          )}
                        </motion.div>
                        <div className="flex min-h-20 min-w-0 flex-1 flex-col py-0.5">
                          <AnimatePresence initial={false} mode="wait">
                            {isEditing ? (
                              <motion.div
                                key="editing"
                                initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -3 }}
                                transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: EASE_OUT }}
                                className="flex min-h-20 flex-col"
                              >
                                {isFileSource ? (
                                  <div className="space-y-2">
                                    <input
                                      ref={editFileInputRef}
                                      type="file"
                                      accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml,image/bmp,image/tiff,application/pdf,audio/*,video/*"
                                      className="hidden"
                                      onChange={(event) => {
                                        const file = event.target.files?.[0] ?? null;
                                        if (!file) return;
                                        if (editingSourceError) setEditingSourceError("");
                                        void replaceQueuedItemFile(item.id, file);
                                      }}
                                    />
                                    <div
                                      role="button"
                                      tabIndex={0}
                                      onClick={() => editFileInputRef.current?.click()}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter" || event.key === " ") {
                                          event.preventDefault();
                                          editFileInputRef.current?.click();
                                        }
                                      }}
                                      onDragOver={(event) => event.preventDefault()}
                                      onDrop={(event) => {
                                        event.preventDefault();
                                        const file = event.dataTransfer.files?.[0] ?? null;
                                        if (!file) return;
                                        if (editingSourceError) setEditingSourceError("");
                                        void replaceQueuedItemFile(item.id, file);
                                      }}
                                      className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-300"
                                    >
                                      {isReplacing ? "Replacing file..." : "Drop file here or browse"}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    <p className="mt-0.5 text-xs text-zinc-500">We&apos;ll treat this as a fresh source.</p>
                                    <div className="relative">
                                      <input
                                        type="url"
                                        value={editingReplacementUrl}
                                        onChange={(event) => {
                                          setEditingReplacementUrl(event.target.value);
                                          if (editingSourceError) setEditingSourceError("");
                                        }}
                                        onKeyDown={(event) => {
                                          if (event.key === "Enter") {
                                            event.preventDefault();
                                            void replaceQueuedItemSource(item.id);
                                          }
                                        }}
                                        placeholder="Paste new URL"
                                        aria-invalid={!!editingSourceError}
                                        className={`${inputCx} pr-10 text-xs`}
                                      />
                                      <button
                                        type="button"
                                        aria-label="Apply replacement URL"
                                        onClick={() => void replaceQueuedItemSource(item.id)}
                                        disabled={fetching}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500 transition-colors hover:text-zinc-200 disabled:opacity-40"
                                      >
                                        ↵
                                      </button>
                                    </div>
                                  </div>
                                )}
                                {editingSourceError && <p className="mt-1 text-[11px] text-red-500">{editingSourceError}</p>}
                                <div className="mt-auto flex items-center gap-3 pt-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingQueueItemId(null);
                                      setEditingReplacementUrl("");
                                      setEditingSourceError("");
                                    }}
                                    className="font-sans text-[11px] text-zinc-300 transition-colors duration-150 ease-[ease] hover:text-zinc-100"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setQueuedItems((prev) => prev.filter((queuedItem) => queuedItem.id !== item.id));
                                      if (editingQueueItemId === item.id) setEditingQueueItemId(null);
                                    }}
                                    className="font-sans text-[11px] text-zinc-500 transition-colors duration-150 ease-[ease] hover:text-red-400"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </motion.div>
                            ) : (
                              <motion.div
                                key="default"
                                initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -3 }}
                                transition={{ duration: shouldReduceMotion ? 0 : 0.2, ease: EASE_OUT }}
                                className="flex min-h-20 flex-col"
                              >
                                <p className="truncate font-lector text-sm text-zinc-100">{item.title}</p>
                                {creatorLine && <p className="mt-1 truncate font-lector text-[11px] text-zinc-500">{creatorLine}</p>}
                                <div className="mt-auto flex items-center gap-3 pt-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingQueueItemId(item.id);
                                      setEditingReplacementUrl("");
                                      setEditingSourceError("");
                                    }}
                                    className="font-sans text-[11px] text-zinc-400 transition-colors duration-150 ease-[ease] hover:text-zinc-200"
                                  >
                                    {isFileSource ? "Replace" : "Edit"}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setQueuedItems((prev) => prev.filter((queuedItem) => queuedItem.id !== item.id))}
                                    className="font-sans text-[11px] text-zinc-500 transition-colors duration-150 ease-[ease] hover:text-red-400"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </motion.div>
                    </motion.div>
                  );
                })}
                  </AnimatePresence>
                </motion.div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-auto space-y-3 border-t border-zinc-900 pb-3 pt-5">
              {hasPendingDuplicateDecision && (
                <p className="text-[11px] text-zinc-500">Resolve duplicate warning to continue adding records.</p>
              )}
              <motion.div className="relative" animate={urlInputControls}>
                <input
                  type="url"
                  value={draft.url}
                  onChange={(e) => {
                    patch({ url: e.target.value });
                    if (sourceError) setSourceError("");
                    if (duplicatePrompt) setDuplicatePrompt(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      if (hasPendingDuplicateDecision) return;
                      void addSourceToQueue();
                    }
                  }}
                  placeholder="Paste URL and press Enter"
                  aria-invalid={!!sourceError}
                  disabled={hasPendingDuplicateDecision}
                  className={`${inputCx} pr-10 ${hasPendingDuplicateDecision ? "cursor-not-allowed opacity-60" : ""}`}
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500"
                >
                  ↵
                </span>
              </motion.div>
              {sourceError && <p className="text-xs text-red-500">{sourceError}</p>}
              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (hasPendingDuplicateDecision) return;
                  fileInputRef.current?.click();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    if (hasPendingDuplicateDecision) return;
                    fileInputRef.current?.click();
                  }
                }}
                onDragOver={(event) => {
                  if (hasPendingDuplicateDecision) return;
                  event.preventDefault();
                  setIsDragActive(true);
                }}
                onDragEnter={(event) => {
                  if (hasPendingDuplicateDecision) return;
                  event.preventDefault();
                  setIsDragActive(true);
                }}
                onDragLeave={(event) => {
                  if (hasPendingDuplicateDecision) return;
                  event.preventDefault();
                  setIsDragActive(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDragActive(false);
                  if (hasPendingDuplicateDecision) return;
                  void handleDroppedFiles(event.dataTransfer.files);
                }}
                className={`flex min-h-24 w-full cursor-pointer items-center justify-center rounded-md border px-4 py-4 text-center transition-colors duration-150 ease-[ease] ${
                  hasPendingDuplicateDecision
                    ? "cursor-not-allowed border-zinc-900 bg-zinc-950/70 text-zinc-700"
                    : isDragActive
                    ? "border-zinc-500 bg-zinc-900 text-zinc-200"
                    : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300"
                }`}
              >
                <div className="space-y-1">
                  <p className="font-lector text-sm">Upload file</p>
                  <p className="text-xs text-zinc-600">Drag and drop image/PDF here, or click to browse.</p>
                </div>
              </div>

              <div className="pt-1">
                <button
                  type="button"
                  disabled={!canContinueFromSource || fetching || pendingSourceCards.length > 0 || hasPendingDuplicateDecision}
                  onClick={() => {
                    const firstQueued = queuedItems[0];
                    if (!firstQueued) return;
                    setDetailsIndex(0);
                    loadQueuedItemIntoDraft(firstQueued);
                    setStep("details");
                  }}
                  className={sourceActionPrimaryBtn}
                >
                  Confirm details
                </button>
              </div>
            </div>
          </motion.section>
        )}

        {step === "details" && (
          <motion.section
            key="add-step-details"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: shouldReduceMotion ? 0 : MOTION_DURATION.standard, ease: EASE_OUT }}
            className="space-y-5"
          >
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
                          Create &quot;{normalizedDraftType}&quot;
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
                            id: item.id,
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
          </motion.section>
        )}

        {step === "record" && (
          <motion.section
            key="add-step-record"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: shouldReduceMotion ? 0 : MOTION_DURATION.standard, ease: EASE_OUT }}
            className="space-y-5"
          >
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
          </motion.section>
        )}
        </AnimatePresence>

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
