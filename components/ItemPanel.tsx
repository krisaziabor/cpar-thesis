"use client";

import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  Fragment,
  type MutableRefObject,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  addAudioVersion,
  subscribeToItem,
  subscribeToItemResponses,
  subscribeToItems,
  subscribeToItemConnections,
  updateItem,
} from "@/lib/items";
import ReRecordModal from "@/components/ReRecordModal";
import {
  saveToKanon,
  removeFromKanon,
  subscribeToKanonSaveStatus,
} from "@/lib/kanon";
import { useNavStatus } from "@/lib/nav-status-context";
import type { Item, Connection, ItemResponse, MusicPlatform } from "@/lib/types";
import type { SourceMetadata } from "@/lib/metadata/types";
import MusicPlayer from "@/components/MusicPlayer";
import AudioPlayer from "@/components/AudioPlayer";
import MinimalPdfViewer from "@/components/MinimalPdfViewer";
import { getUserProfile } from "@/lib/users";
import { usePanelHistory } from "@/lib/panel-history-context";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import SyncedTranscript, { type SyncedTranscriptHandle } from "@/components/SyncedTranscript";
import ConnectionItemsPreview, {
  type ConnectionPreviewItem,
} from "@/components/ConnectionItemsPreview";

const DEFAULT_GRADIENT_COLORS: [string, string, string] = ["#C73C28", "#2A86A2", "#7238A0"];

function connectionItemIdsToPreview(
  itemIds: string[],
  allItems: Item[]
): ConnectionPreviewItem[] {
  return itemIds.map((id) => {
    const row = allItems.find((i) => i.id === id);
    return {
      id,
      title: row?.title ?? id,
      thumbnailUrl: row?.thumbnail_url,
    };
  });
}

type ActiveListening =
  | { kind: "narrative" }
  | { kind: "response"; response: ItemResponse };

function formatDurationSec(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

type SourceDetailRow = { label: string; value: string; href?: string };

/** Minimal per–source-type rows (songs: album only). */
function buildSourceMetadataRows(
  sm: SourceMetadata,
  item?: Pick<Item, "type">
): SourceDetailRow[] {
  const st = sm.source_type;
  const isSong = item?.type === "song" || st === "music";
  if (isSong) {
    const album = sm.album?.trim();
    return album ? [{ label: "Album", value: album }] : [];
  }

  const rows: SourceDetailRow[] = [];
  const push = (label: string, value: string | undefined | null, href?: string) => {
    const v = value != null ? String(value).trim() : "";
    if (!v) return;
    rows.push(href ? { label, value: v, href } : { label, value: v });
  };

  if (st === "doi") {
    push("Journal", sm.journal);
    push("DOI", sm.doi);
    if (sm.year != null) push("Year", String(sm.year));
    push("Pages", sm.pages);
    return rows;
  }
  if (st === "youtube") {
    if (sm.duration_seconds != null) {
      push("Duration", formatDurationSec(sm.duration_seconds));
    }
    return rows;
  }
  if (st === "instagram" || st === "tiktok" || st === "twitter") {
    push("Published", sm.published_date);
    if (sm.view_count != null) push("Views", sm.view_count.toLocaleString());
    if (sm.like_count != null) push("Likes", sm.like_count.toLocaleString());
    return rows;
  }
  if (st === "news") {
    push("Site", sm.site_name);
    const raw = sm.raw as Record<string, unknown> | undefined;
    if (typeof raw?.readingTime === "number") {
      push("Reading time", `~${raw.readingTime} min`);
    }
    return rows;
  }
  if (st === "pdf") {
    return [];
  }
  if (st === "url") {
    push("Site", sm.site_name);
    return rows;
  }

  push("Site", sm.site_name);
  if (sm.duration_seconds != null) {
    push("Duration", formatDurationSec(sm.duration_seconds));
  }
  push("Published", sm.published_date);
  return rows;
}

/**
 * Discovery first, label above value (full width for narrative). Then compact metadata in a 2-col grid.
 */
function ItemSourceDetails({
  item,
  variant,
  density = "compact",
}: {
  item: Item;
  variant: "sidebar" | "normal";
  density?: "compact" | "comfortable";
}) {
  const metaRows = item.source_metadata
    ? buildSourceMetadataRows(item.source_metadata, item)
    : [];
  const discovery = item.encountered_source?.trim();
  if (!discovery && metaRows.length === 0) return null;

  const labelCls =
    variant === "sidebar" ? "shrink-0 text-white/25" : "shrink-0 text-zinc-600";
  const valueCls = variant === "sidebar" ? "text-white/45" : "text-zinc-400";
  const linkCls =
    variant === "sidebar"
      ? "text-white/45 underline underline-offset-2 hover:text-white/70"
      : "text-zinc-400 underline underline-offset-2 hover:text-zinc-300";

  const sizeCls = density === "comfortable" ? "text-sm" : "text-xs";

  return (
    <div
      className={`space-y-3 font-sans ${sizeCls} ${variant === "sidebar" ? "pt-0.5" : ""}`}
    >
      {discovery ? (
        <div className="space-y-1">
          <p className={labelCls}>Discovery</p>
          <p className={`${valueCls} leading-relaxed`}>{discovery}</p>
        </div>
      ) : null}

      {metaRows.length > 0 ? (
        <div className="grid [grid-template-columns:max-content_minmax(0,1fr)] items-baseline gap-x-2 gap-y-1 [line-height:1.25]">
          {metaRows.map((row, idx) => (
            <Fragment key={`${row.label}-${idx}`}>
              <span className={labelCls}>{row.label}</span>
              {row.href ? (
                <a
                  href={row.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`min-w-0 break-all ${linkCls}`}
                >
                  {row.value}
                </a>
              ) : (
                <span className={`min-w-0 ${valueCls}`}>{row.value}</span>
              )}
            </Fragment>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Narrative right rail vs full pane: same structure; `fullPane` uses larger type scale + zinc palette. */
type ItemRecordInfoMode = "narrativeSide" | "fullPane";

const ITEM_RECORD_STYLES: Record<
  ItemRecordInfoMode,
  {
    title: string;
    description: string;
    meta: string;
    link: string;
    tag: string;
    tagWrap: string;
    sourceVariant: "sidebar" | "normal";
    sourceDensity: "compact" | "comfortable";
  }
> = {
  narrativeSide: {
    title: "font-lector text-base leading-tight tracking-tight text-zinc-50",
    description: "text-xs leading-relaxed text-white/50",
    meta: "flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-white/35",
    link: "block text-xs text-white/30 transition-colors hover:text-white/60",
    tag: "border border-white/10 px-2 py-0.5 text-xs text-white/35",
    tagWrap: "flex flex-wrap gap-1 pt-0.5",
    sourceVariant: "sidebar",
    sourceDensity: "compact",
  },
  fullPane: {
    title: "font-lector text-xl leading-tight tracking-tight text-zinc-50",
    description: "text-sm leading-relaxed text-zinc-400",
    meta: "flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-zinc-500",
    link: "block text-sm text-zinc-500 transition-colors hover:text-zinc-300",
    tag: "border border-zinc-800 px-2 py-0.5 text-sm text-zinc-500",
    tagWrap: "flex flex-wrap gap-1 pt-0.5",
    sourceVariant: "normal",
    sourceDensity: "comfortable",
  },
};

function ItemRecordInfo({
  item,
  tagsDisplay,
  mode,
}: {
  item: Item;
  tagsDisplay: string[];
  mode: ItemRecordInfoMode;
}) {
  const s = ITEM_RECORD_STYLES[mode];
  return (
    <div className="space-y-2">
      <h2 className={s.title}>{item.title}</h2>
      {item.description ? <p className={s.description}>{item.description}</p> : null}
      <div className={s.meta}>
        {item.type ? <span className="capitalize">{item.type}</span> : null}
        {item.type && item.creator ? <span>·</span> : null}
        <span>{item.creator}</span>
        {item.media_date ? (
          <>
            <span>·</span>
            <span>{item.media_date}</span>
          </>
        ) : null}
      </div>
      <ItemSourceDetails
        item={item}
        variant={s.sourceVariant}
        density={s.sourceDensity}
      />
      {item.link ? (
        <a
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          className={s.link}
        >
          Original source ↗
        </a>
      ) : null}
      {tagsDisplay.length > 0 ? (
        <div className={s.tagWrap}>
          {tagsDisplay.map((tag) => (
            <span key={tag} className={s.tag}>
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Month + day; includes year only when it differs from the current year. */
function formatDateShort(ts: unknown): string {
  if (!ts) return "—";
  if (typeof ts === "object" && ts !== null && "toDate" in ts) {
    const date = (ts as { toDate: () => Date }).toDate();
    const sameYear = date.getFullYear() === new Date().getFullYear();
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      ...(sameYear ? {} : { year: "numeric" }),
    });
  }
  return String(ts);
}

function YouTubeEmbed({ videoId, title }: { videoId: string; title: string }) {
  const src = `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`;
  return (
    <div className="relative aspect-[16/9] w-full overflow-hidden bg-black">
      <iframe
        src={src}
        title={title}
        className="absolute inset-0 h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        loading="lazy"
      />
    </div>
  );
}

function guessMediaType(url: string): "image" | "pdf" | "video" {
  try {
    const path = decodeURIComponent(new URL(url).pathname.split("/o/")[1] ?? "");
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "image";
    if (ext === "pdf") return "pdf";
    if (["mp4", "webm", "mov", "ogg"].includes(ext)) return "video";
  } catch {}
  return "image";
}

function formatMediaTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "00:00";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function SimpleAudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const sync = () => {
      setCurrentTime(audio.currentTime || 0);
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      setIsPlaying(!audio.paused && !audio.ended);
    };
    audio.addEventListener("timeupdate", sync);
    audio.addEventListener("loadedmetadata", sync);
    audio.addEventListener("play", sync);
    audio.addEventListener("pause", sync);
    audio.addEventListener("ended", sync);
    return () => {
      audio.removeEventListener("timeupdate", sync);
      audio.removeEventListener("loadedmetadata", sync);
      audio.removeEventListener("play", sync);
      audio.removeEventListener("pause", sync);
      audio.removeEventListener("ended", sync);
    };
  }, []);

  async function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused || audio.ended) {
      try { await audio.play(); } catch { /* blocked */ }
    } else {
      audio.pause();
    }
  }

  async function restart() {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    try { await audio.play(); } catch { /* blocked */ }
  }

  return (
    <div className="font-sans text-sm text-zinc-500">
      <audio ref={audioRef} src={src} preload="metadata" />
      <p className="mb-1">{formatMediaTime(currentTime)} of {formatMediaTime(duration)}</p>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => void toggle()} className="transition-colors hover:text-zinc-300">
          {isPlaying ? "Pause" : "Play"}
        </button>
        <button type="button" onClick={() => void restart()} className="transition-colors hover:text-zinc-300">
          Restart
        </button>
      </div>
    </div>
  );
}

function VideoMediaPlayer({ url, title, videoHandleRef }: { url: string; title: string; videoHandleRef?: React.MutableRefObject<HTMLVideoElement | null> }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (videoHandleRef) videoHandleRef.current = video;

    const syncState = () => {
      setCurrentTime(video.currentTime || 0);
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      setIsPlaying(!video.paused && !video.ended);
      setIsMuted(video.muted);
    };

    syncState();
    video.addEventListener("timeupdate", syncState);
    video.addEventListener("loadedmetadata", syncState);
    video.addEventListener("durationchange", syncState);
    video.addEventListener("play", syncState);
    video.addEventListener("pause", syncState);
    video.addEventListener("ended", syncState);
    video.addEventListener("volumechange", syncState);

    const attemptAutoplay = () => {
      void video.play().catch(() => {});
    };
    if (video.readyState >= 1) {
      attemptAutoplay();
    } else {
      video.addEventListener("loadedmetadata", attemptAutoplay, { once: true });
      video.addEventListener("canplay", attemptAutoplay, { once: true });
    }

    return () => {
      video.removeEventListener("timeupdate", syncState);
      video.removeEventListener("loadedmetadata", syncState);
      video.removeEventListener("durationchange", syncState);
      video.removeEventListener("play", syncState);
      video.removeEventListener("pause", syncState);
      video.removeEventListener("ended", syncState);
      video.removeEventListener("volumechange", syncState);
      video.removeEventListener("loadedmetadata", attemptAutoplay);
      video.removeEventListener("canplay", attemptAutoplay);
      if (videoHandleRef) videoHandleRef.current = null;
    };
  }, [videoHandleRef, url]);

  async function togglePlayPause() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused || video.ended) {
      try {
        await video.play();
      } catch {
        // Ignore blocked autoplay/playback exceptions.
      }
      return;
    }
    video.pause();
  }

  async function restartVideo() {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    try {
      await video.play();
    } catch {
      // Ignore blocked autoplay/playback exceptions.
    }
  }

  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  }

  return (
    <div className="flex flex-col gap-2">
      <div
        className="relative"
        onClick={() => void togglePlayPause()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            void togglePlayPause();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={isPlaying ? "Pause video" : "Play video"}
      >
        <video
          ref={videoRef}
          src={url}
          aria-label={title}
          className="w-full block bg-zinc-900 cursor-pointer"
          preload="auto"
          autoPlay
          muted
          playsInline
        />
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 bg-black transition-opacity duration-200 ${
            isPlaying ? "opacity-0" : "opacity-25"
          }`}
        />
      </div>
      <div className="px-6 py-3 font-sans text-sm text-zinc-500">
        <p>
          {formatMediaTime(currentTime)} of {formatMediaTime(duration)}
        </p>
        <div className="mt-1 flex items-center gap-3">
          <button
            type="button"
            onClick={() => void togglePlayPause()}
            className="transition-colors hover:text-zinc-300"
          >
            {isPlaying ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            onClick={() => void restartVideo()}
            className="transition-colors hover:text-zinc-300"
          >
            Restart
          </button>
          <button
            type="button"
            onClick={toggleMute}
            className="transition-colors hover:text-zinc-300"
          >
            {isMuted ? "Unmute" : "Mute"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ExpandedVideoPlayer({
  src,
  title,
  initialTime,
  onUnmount,
  playbackTimeRef,
  playingRef,
}: {
  src: string;
  title: string;
  initialTime?: number;
  onUnmount?: (finalTime: number) => void;
  /** Kept in sync while fullscreen so the panel can resume before this component unmounts. */
  playbackTimeRef?: MutableRefObject<number>;
  /** Last known playing state in fullscreen (used when handing off back to the panel). */
  playingRef?: MutableRefObject<boolean>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onUnmountRef = useRef(onUnmount);
  onUnmountRef.current = onUnmount;
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;

    const startPlayback = () => {
      if (initialTime != null && initialTime > 0 && Number.isFinite(initialTime)) {
        try {
          video.currentTime = initialTime;
        } catch {
          /* seek may throw if no data */
        }
      }
      if (playbackTimeRef) playbackTimeRef.current = video.currentTime;
      void video.play().catch(() => {});
    };

    if (video.readyState >= 1) startPlayback();
    else video.addEventListener("loadedmetadata", startPlayback, { once: true });

    const sync = () => {
      const t = video.currentTime || 0;
      setCurrentTime(t);
      setDuration(Number.isFinite(video.duration) ? video.duration : 0);
      setIsPlaying(!video.paused && !video.ended);
      setIsMuted(video.muted);
      // Avoid pushing 0 into the panel handoff ref before metadata / initial seek.
      if (video.readyState >= 1) {
        if (playbackTimeRef) playbackTimeRef.current = t;
        if (playingRef) playingRef.current = !video.paused && !video.ended;
      }
    };
    sync();
    video.addEventListener("timeupdate", sync);
    video.addEventListener("loadedmetadata", sync);
    video.addEventListener("play", sync);
    video.addEventListener("pause", sync);
    video.addEventListener("ended", sync);
    video.addEventListener("volumechange", sync);
    return () => {
      video.removeEventListener("timeupdate", sync);
      video.removeEventListener("loadedmetadata", sync);
      video.removeEventListener("play", sync);
      video.removeEventListener("pause", sync);
      video.removeEventListener("ended", sync);
      video.removeEventListener("volumechange", sync);
      video.removeEventListener("loadedmetadata", startPlayback);
      // Save position for panel video to resume from
      onUnmountRef.current?.(video.currentTime);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused || video.ended) {
      try { await video.play(); } catch { /* blocked */ }
    } else {
      video.pause();
    }
  }

  async function restart() {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    try { await video.play(); } catch { /* blocked */ }
  }

  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  }

  return (
    <div className="flex flex-col gap-3">
      <video
        ref={videoRef}
        src={src}
        aria-label={title}
        className="block max-w-[88vw] max-h-[76vh] bg-black cursor-pointer"
        autoPlay
        muted
        playsInline
        onClick={() => void togglePlay()}
      />
      <div className="font-sans text-sm text-white/50">
        <p className="mb-1.5">
          {formatMediaTime(currentTime)} of {formatMediaTime(duration)}
        </p>
        <div className="flex items-center gap-5">
          <button type="button" onClick={() => void togglePlay()} className="transition-colors hover:text-white/90">
            {isPlaying ? "Pause" : "Play"}
          </button>
          <button type="button" onClick={() => void restart()} className="transition-colors hover:text-white/90">
            Restart
          </button>
          <button type="button" onClick={toggleMute} className="transition-colors hover:text-white/90">
            {isMuted ? "Unmute" : "Mute"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ItemPanel({
  itemId,
  onListeningChange,
  onFullScreenReady,
  onMediaFullscreenChange,
}: {
  itemId: string;
  onListeningChange?: (playing: boolean) => void;
  onFullScreenReady?: (trigger: () => void) => void;
  /** Fired when the media lightbox opens or closes so the shell can adjust Escape behavior. */
  onMediaFullscreenChange?: (expanded: boolean) => void;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { startProgress: startNavProgress } = useNavStatus();
  const shouldReduceMotion = useReducedMotion();
  const { navigatePanel } = usePanelHistory();
  const goToRespond = useCallback(() => {
    navigatePanel(`/?item=${encodeURIComponent(itemId)}&panel=respond`, "Narrative");
  }, [navigatePanel, itemId]);
  const [isMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 900
  );
  const [item, setItem] = useState<Item | null | undefined>(undefined);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [connections, setConnections] = useState<Array<Connection & { itemIds: string[] }>>([]);
  const [itemResponses, setItemResponses] = useState<ItemResponse[]>([]);
  const [kanonSaveId, setKanonSaveId] = useState<string | null>(null);
  const [savingKanon, setSavingKanon] = useState(false);
  const [preferredPlatform, setPreferredPlatform] = useState<MusicPlatform | undefined>(undefined);
  const [addedByName, setAddedByName] = useState<string | null>(null);
  const [addedByColors, setAddedByColors] = useState<[string, string, string] | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [narrativePlaying, setNarrativePlaying] = useState(false);
  const transcriptRef = useRef<SyncedTranscriptHandle>(null);
  const audioDurationRef = useRef(0);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);
  const [mediaExpanded, setMediaExpanded] = useState(false);
  const [reRecordOpen, setReRecordOpen] = useState(false);

  // Video sync: refs for panel <-> expanded handoff
  const inPanelVideoRef = useRef<HTMLVideoElement | null>(null);
  const expandWasPlayingRef = useRef(false);
  const expandStartTimeRef = useRef(0);
  const expandedVideoFinalTimeRef = useRef(0);

  const openFullScreen = useCallback(() => {
    if (inPanelVideoRef.current) {
      const el = inPanelVideoRef.current;
      expandStartTimeRef.current = el.currentTime;
      expandWasPlayingRef.current = !el.paused && !el.ended;
      el.pause();
    } else {
      expandStartTimeRef.current = 0;
    }
    expandedVideoFinalTimeRef.current = expandStartTimeRef.current;
    onMediaFullscreenChange?.(true);
    setMediaExpanded(true);
  }, [onMediaFullscreenChange]);

  const closeFullScreen = useCallback(() => {
    onMediaFullscreenChange?.(false);
    const panel = inPanelVideoRef.current;
    const resumeTime = expandedVideoFinalTimeRef.current;
    const resumePlay = expandWasPlayingRef.current;
    setMediaExpanded(false);
    if (!panel) return;
    try {
      panel.currentTime = resumeTime;
    } catch {
      /* ignore seek errors */
    }
    if (resumePlay) void panel.play().catch(() => {});
  }, [onMediaFullscreenChange]);

  // Register before paint so the header fullscreen control never calls a stale / null ref.
  useLayoutEffect(() => {
    onFullScreenReady?.(openFullScreen);
    return () => {
      onFullScreenReady?.(() => {});
    };
  }, [openFullScreen, onFullScreenReady]);

  useLayoutEffect(() => {
    return () => {
      onMediaFullscreenChange?.(false);
    };
  }, [onMediaFullscreenChange]);

  // Close expanded media on Escape (panel shell skips its own Escape while this is open)
  useEffect(() => {
    if (!mediaExpanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      closeFullScreen();
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mediaExpanded, closeFullScreen]);

  /** Opaque portion of transcript mask (bottom fade starts after this fraction of viewport height). */
  const TRANSCRIPT_MASK_OPAQUE_FRAC = 0.6;
  /** Top edge fade (viewport %) when scrolled — avoids a hard clip on the first visible line. */
  const TRANSCRIPT_MASK_TOP_FADE_FRAC = 0.13;
  const TRANSCRIPT_MASK_INITIAL = `linear-gradient(to bottom, black 0%, black ${TRANSCRIPT_MASK_OPAQUE_FRAC * 100}%, transparent 100%)`;

  const updateTranscriptMask = useCallback(() => {
    const el = transcriptScrollRef.current;
    if (!el) return;
    const ε = 3;
    const atTop = el.scrollTop <= ε;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - ε;
    const topP = TRANSCRIPT_MASK_TOP_FADE_FRAC * 100;
    const botP = TRANSCRIPT_MASK_OPAQUE_FRAC * 100;

    let mask: string;
    if (atTop && atBottom) {
      mask = "none";
    } else if (atTop && !atBottom) {
      mask = `linear-gradient(to bottom, black 0%, black ${botP}%, transparent 100%)`;
    } else if (!atTop && atBottom) {
      mask = `linear-gradient(to bottom, transparent 0%, black ${topP}%, black 100%)`;
    } else {
      mask = `linear-gradient(to bottom, transparent 0%, black ${topP}%, black ${botP}%, transparent 100%)`;
    }
    el.style.webkitMaskImage = mask;
    el.style.maskImage = mask;
  }, []);

  // Mask when listening opens or transcript length changes; timeout catches layout after paint.
  useEffect(() => {
    if (!isListening) return;
    const timer = window.setTimeout(updateTranscriptMask, 80);
    return () => window.clearTimeout(timer);
  }, [isListening, item?.timed_transcript?.length, updateTranscriptMask]);

  function toggleListening() {
    const next = !isListening;
    setIsListening(next);
    onListeningChange?.(next);
    if (!next) {
      setNarrativePlaying(false);
      audioDurationRef.current = 0;
    }
  }

  const handleNarrativePlay = useCallback(() => {
    setNarrativePlaying(true);
  }, []);

  const handleNarrativePause = useCallback(() => {
    setNarrativePlaying(false);
  }, []);

  const [activeListening, setActiveListening] = useState<ActiveListening>({ kind: "narrative" });

  useEffect(() => {
    if (!isListening) setActiveListening({ kind: "narrative" });
  }, [isListening]);

  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState({
    title: "",
    description: "",
    mediaDate: "",
    type: "",
    creator: "",
    link: "",
    tags: "",
  });
  const [saveEditError, setSaveEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => subscribeToItem(itemId, setItem), [itemId]);
  useEffect(() => subscribeToItems(setAllItems), []);
  useEffect(() => subscribeToItemConnections(itemId, setConnections), [itemId]);
  useEffect(() => subscribeToItemResponses(itemId, setItemResponses), [itemId]);

  useEffect(() => {
    if (!user?.email) return;
    return subscribeToKanonSaveStatus(user.email, "item", itemId, setKanonSaveId);
  }, [user?.email, itemId]);
  useEffect(() => {
    if (!user?.email) return;
    getUserProfile(user.email).then((p) => {
      if (p?.preferred_music_platform) setPreferredPlatform(p.preferred_music_platform);
    });
  }, [user?.email]);

  useEffect(() => {
    if (!item?.added_by) {
      setAddedByName(null);
      setAddedByColors(null);
      return;
    }
    getUserProfile(item.added_by).then((profile) => {
      setAddedByName(profile?.name ?? null);
      setAddedByColors(profile?.avatar_colors ?? null);
    });
  }, [item?.added_by]);

  /** Per connection author: display name + gradient (connection cards use filer’s colors, not the record author’s). */
  const [connectionCreatorFirstNames, setConnectionCreatorFirstNames] = useState<
    Record<string, string>
  >({});
  const [connectionCreatorGradients, setConnectionCreatorGradients] = useState<
    Record<string, [string, string, string]>
  >({});
  useEffect(() => {
    const emails = [...new Set(connections.map((c) => c.created_by).filter(Boolean))];
    if (emails.length === 0) {
      setConnectionCreatorFirstNames({});
      setConnectionCreatorGradients({});
      return;
    }
    let cancelled = false;
    void Promise.all(
      emails.map(async (email) => {
        const profile = await getUserProfile(email);
        const first = profile?.name?.trim()
          ? profile.name.trim().split(/\s+/)[0]!
          : email.split("@")[0]!;
        const gradient = (profile?.avatar_colors ?? DEFAULT_GRADIENT_COLORS) as [
          string,
          string,
          string,
        ];
        return [email, { first, gradient }] as const;
      })
    ).then((entries) => {
      if (cancelled) return;
      const names: Record<string, string> = {};
      const grads: Record<string, [string, string, string]> = {};
      for (const [email, { first, gradient }] of entries) {
        names[email] = first;
        grads[email] = gradient;
      }
      setConnectionCreatorFirstNames(names);
      setConnectionCreatorGradients(grads);
    });
    return () => {
      cancelled = true;
    };
  }, [connections]);

  const isEditRequested = searchParams.get("itemEdit") === "1";
  const itemEditAction = searchParams.get("itemEditAction");
  const isOwner = !!user?.email && !!item && user.email === item.added_by;

  useEffect(() => {
    if (isEditRequested && isOwner && !isEditing) {
      startEditing();
    }
    if (!isEditRequested && isEditing) {
      setIsEditing(false);
      setSaveEditError("");
    }
  }, [isEditRequested, isOwner, isEditing]);

  useEffect(() => {
    if (itemEditAction !== "save") return;
    if (!isEditing) return;
    void handleSaveEdit();
  }, [itemEditAction, isEditing]);

  if (item === undefined) {
    return (
      <div className="flex h-40 items-center justify-center">
        <span className="text-xs text-zinc-500">loading…</span>
      </div>
    );
  }
  if (item === null) {
    return (
      <div className="flex h-40 items-center justify-center">
        <span className="text-xs text-zinc-500">item not found</span>
      </div>
    );
  }

  const tagsDisplay = Array.isArray(item.tags) ? item.tags : [];
  const [nc1, nc2, nc3] = addedByColors ?? DEFAULT_GRADIENT_COLORS;
  const mediaType = item.media_url ? guessMediaType(item.media_url) : null;

  // YouTube items are embedded via iframe rather than a <video> element — the
  // video_id on source_metadata is populated by the youtube metadata handler.
  const youtubeVideoId =
    item.source_metadata?.source_type === "youtube"
      ? item.source_metadata.video_id
      : undefined;
  const topIsYoutube = !!youtubeVideoId;

  // Determine top media: YouTube iframe first, then video/PDF, then thumbnail/image
  const topIsVideo = !topIsYoutube && mediaType === "video" && !!item.media_url;
  const topIsPdf = mediaType === "pdf" && !!item.media_url;
  const topThumbnail =
    !topIsYoutube &&
    !topIsVideo &&
    !topIsPdf &&
    (item.thumbnail_url ?? (mediaType === "image" ? item.media_url : null));

  function clearEditParam() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("itemEdit");
    params.delete("itemEditAction");
    router.push(params.toString() ? `/?${params.toString()}` : "/");
  }

  function clearEditActionParam() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("itemEditAction");
    router.push(params.toString() ? `/?${params.toString()}` : "/");
  }

  function startEditing() {
    if (!item) return;
    setEditDraft({
      title: item.title ?? "",
      description: item.description ?? "",
      mediaDate: item.media_date ?? "",
      type: item.type ?? "",
      creator: item.creator ?? "",
      link: item.link ?? "",
      tags: Array.isArray(item.tags) ? item.tags.join(", ") : "",
    });
    setSaveEditError("");
    setIsEditing(true);
  }

  async function handleSaveEdit() {
    if (!isOwner) return;
    if (!editDraft.title.trim() || !editDraft.creator.trim() || !editDraft.mediaDate.trim()) {
      setSaveEditError("Title, creator, and original media date are required.");
      return;
    }
    setSavingEdit(true);
    setSaveEditError("");
    try {
      await updateItem(itemId, {
        title: editDraft.title.trim(),
        description: editDraft.description.trim(),
        media_date: editDraft.mediaDate.trim(),
        type: editDraft.type.trim().toLowerCase(),
        creator: editDraft.creator.trim(),
        ...(editDraft.link.trim() ? { link: editDraft.link.trim() } : {}),
        tags: editDraft.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      setIsEditing(false);
      clearEditParam();
    } catch (err) {
      setSaveEditError(err instanceof Error ? err.message : "Failed to save.");
      clearEditActionParam();
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <>
    <AnimatePresence mode="wait" initial={false}>
      {isListening ? (
        /* ── LISTENING LAYOUT ── */
        <motion.div
          key="listening"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.215, 0.61, 0.355, 1] }}
          className="relative flex h-full overflow-hidden"
        >
          {/* ── Left pane — record metadata + connections + actions ── */}
          <div className="relative z-10 flex flex-1 min-w-0 flex-col overflow-hidden">

            {/* Scrollable content */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {/* Media — full bleed */}
              {topIsYoutube && (
                <YouTubeEmbed videoId={youtubeVideoId!} title={item.title} />
              )}
              {topIsVideo && (
                <VideoMediaPlayer url={item.media_url!} title={item.title} videoHandleRef={inPanelVideoRef} />
              )}
              {topIsPdf && (
                <MinimalPdfViewer url={item.media_url!} title={item.title} />
              )}
              {!topIsYoutube && !topIsVideo && !topIsPdf && topThumbnail && (
                <div className="relative aspect-[16/9] w-full overflow-hidden bg-zinc-900">
                  <img
                    src={topThumbnail}
                    alt={item.title}
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                </div>
              )}

              <div className="flex flex-col gap-3 px-6 py-6">
                <ItemRecordInfo item={item} tagsDisplay={tagsDisplay} mode="narrativeSide" />

                {/* Connections */}
                {connections.length > 0 && (
                  <>
                    <div className="border-t border-white/10 pt-1" />
                    <div className="space-y-2">
                      <p className="font-lector text-xs tracking-tight text-white/45">Connections</p>
                      {connections.map((conn) => (
                        <button
                          key={conn.id}
                          type="button"
                          onClick={() =>
                            navigatePanel(
                              `/?connection=${encodeURIComponent(conn.id)}`,
                              "Narrative"
                            )
                          }
                          className="relative w-full overflow-hidden rounded-lg border border-white/10 text-left transition-colors duration-150 ease-out hover:border-white/20 hover:bg-zinc-900/30"
                        >
                          <ConnectionItemsPreview
                            items={connectionItemIdsToPreview(conn.itemIds, allItems)}
                            colors={
                              connectionCreatorGradients[conn.created_by] ??
                              DEFAULT_GRADIENT_COLORS
                            }
                            size="sm"
                            className="rounded-none border-0"
                            byline={{
                              name:
                                connectionCreatorFirstNames[conn.created_by] ??
                                conn.created_by.split("@")[0],
                              date: formatDateShort(conn.created_at),
                            }}
                          />
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Connect + Add to Hold — pinned at bottom of left pane */}
            <div className="shrink-0 border-t border-white/10 px-6 pb-6 pt-4">
              <div className="flex items-center gap-2">
                <Link
                  href={`/?panel=connect&connectPanel=1&connectSelect=1&connectIds=${encodeURIComponent(itemId)}&connectReturnItem=${encodeURIComponent(itemId)}`}
                  className="flex items-center rounded-full bg-zinc-100 px-4 py-1.5 font-sans text-xs text-zinc-900 transition-colors hover:bg-white"
                >
                  Connect
                </Link>
                <button
                  disabled={savingKanon}
                  onClick={async () => {
                    if (!user?.email) return;
                    setSavingKanon(true);
                    if (kanonSaveId) {
                      try {
                        await removeFromKanon(kanonSaveId);
                      } finally {
                        setSavingKanon(false);
                      }
                    } else {
                      const thumbs = item?.thumbnail_url ? [item.thumbnail_url] : [];
                      const { resolve, reject } = startNavProgress({
                        id: `hold-${Date.now()}`,
                        text: "Adding to Hold",
                        thumbnails: thumbs.length > 0 ? thumbs : undefined,
                        showProgress: true,
                        durationMs: 2000,
                      });
                      try {
                        await saveToKanon(user.email, "item", itemId);
                        resolve("Added to Hold");
                      } catch (err) {
                        reject(err instanceof Error ? err.message : "Something went wrong, try again");
                      } finally {
                        setSavingKanon(false);
                      }
                    }
                  }}
                  className={`flex items-center gap-1.5 rounded-full border bg-zinc-950 px-4 py-1.5 font-sans text-xs transition-colors disabled:opacity-60 ${
                    kanonSaveId
                      ? "border-zinc-500 text-zinc-200 hover:border-zinc-400 hover:text-zinc-100"
                      : "border-zinc-700 text-zinc-300 hover:border-zinc-600 hover:text-zinc-100"
                  }`}
                >
                  <span>{kanonSaveId ? "×" : "+"}</span>
                  {kanonSaveId ? "In Hold" : "Add to Hold"}
                </button>
              </div>
            </div>
          </div>

          {/* ── Right pane — "record added by" strap + transcript + respond ── */}
          <div className="relative z-10 flex w-[420px] shrink-0 flex-col overflow-hidden border-l border-white/10 bg-black">

            {/* Back button — mobile only */}
            {isMobile && (
              <div className="shrink-0 border-b border-white/10 px-6 py-2.5">
                <button
                  type="button"
                  onClick={toggleListening}
                  className="font-sans text-xs text-white/40 transition-colors hover:text-white/80"
                >
                  ← Back
                </button>
              </div>
            )}

            {/* Creator strap */}
            <div className="shrink-0 px-6 pt-6">
              <p className="font-sans text-[11px] uppercase tracking-wide text-white/35">
                Record added by
              </p>
              <p className="mt-1 font-lector text-base tracking-tight text-white/95">
                {addedByName ? addedByName.split(" ")[0] : item.added_by.split("@")[0]}
                <span className="text-white/45">
                  {", "}
                  {formatDateShort(item.created_at)}
                </span>
              </p>
            </div>

            {/* Transcript / response viewer — flex-1 centered */}
            <div className="relative min-h-0 flex-1">
              <div className="absolute inset-0 flex items-center justify-center px-10">
                <div className="w-full max-w-sm">
                  <AnimatePresence mode="wait" initial={false}>
                    {activeListening.kind === "narrative" ? (
                      <motion.div
                        key="narrative"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.2, ease: [0.215, 0.61, 0.355, 1] }}
                      >
                        <div
                          ref={transcriptScrollRef}
                          onScroll={updateTranscriptMask}
                          className="max-h-[52vh] overflow-y-auto scrollbar-hide"
                          style={{
                            WebkitMaskImage: TRANSCRIPT_MASK_INITIAL,
                            maskImage: TRANSCRIPT_MASK_INITIAL,
                          }}
                        >
                          {item.timed_transcript?.length ? (
                            <SyncedTranscript
                              ref={transcriptRef}
                              scrollParentRef={transcriptScrollRef}
                              scrollOpaqueBottomRatio={TRANSCRIPT_MASK_OPAQUE_FRAC - 0.04}
                              audioUrl={item.voice_recording_url}
                              words={item.timed_transcript}
                              autoPlay
                              compact
                              hideControls
                              textSize="text-sm"
                              onPlayStart={handleNarrativePlay}
                              onPause={handleNarrativePause}
                              onDurationLoaded={(d) => {
                                audioDurationRef.current = d;
                                window.requestAnimationFrame(() => updateTranscriptMask());
                              }}
                            />
                          ) : item.voice_recording_url ? (
                            <div className="flex flex-col gap-5">
                              {item.transcript && (
                                <p className="font-lector text-sm leading-relaxed text-zinc-300">
                                  {item.transcript}
                                </p>
                              )}
                              <SimpleAudioPlayer src={item.voice_recording_url} />
                            </div>
                          ) : (
                            <p className="text-xs text-zinc-600">No recording.</p>
                          )}
                        </div>

                        {item.timed_transcript?.length && item.voice_recording_url && (
                          <div className="mt-5 flex gap-4">
                            <button
                              type="button"
                              onClick={() => {
                                if (narrativePlaying) transcriptRef.current?.pause();
                                else transcriptRef.current?.play();
                              }}
                              className="font-sans text-xs text-white/50 transition-colors duration-150 ease-out hover:text-white/90"
                            >
                              {narrativePlaying ? "Pause" : "Play"}
                            </button>
                            <button
                              type="button"
                              onClick={() => transcriptRef.current?.restart()}
                              className="font-sans text-xs text-white/50 transition-colors duration-150 ease-out hover:text-white/90"
                            >
                              Restart
                            </button>
                            {user?.email && item.added_by === user.email && (
                              <button
                                type="button"
                                onClick={() => {
                                  transcriptRef.current?.pause();
                                  setReRecordOpen(true);
                                }}
                                className="font-sans text-xs text-white/50 transition-colors duration-150 ease-out hover:text-white/90"
                              >
                                Re-record
                              </button>
                            )}
                          </div>
                        )}
                      </motion.div>
                    ) : (
                      <motion.div
                        key={`response-${activeListening.response.id}`}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.2, ease: [0.215, 0.61, 0.355, 1] }}
                        className="flex flex-col gap-4"
                      >
                        <button
                          type="button"
                          onClick={() => setActiveListening({ kind: "narrative" })}
                          className="self-start font-sans text-xs text-white/40 transition-colors hover:text-white/80"
                        >
                          ← Narrative
                        </button>
                        <p className="font-sans text-xs text-white/40">{activeListening.response.created_by}</p>
                        <AudioPlayer src={activeListening.response.audio_url} />
                        {activeListening.response.transcript && (
                          <p className="font-lector text-sm leading-relaxed text-zinc-300">
                            {activeListening.response.transcript}
                          </p>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {/* Respond + responses list */}
            <div className="shrink-0 border-t border-white/10 px-6 pb-6 pt-5">
              <button
                type="button"
                onClick={goToRespond}
                className="inline-flex items-center rounded-full bg-zinc-100 px-4 py-1.5 font-sans text-xs text-zinc-900 transition-colors duration-150 ease-out hover:bg-white"
              >
                Respond
              </button>

              {itemResponses.length > 0 && (
                <div className="mt-5 space-y-2">
                  <p className="font-lector text-xs tracking-tight text-white/45">
                    {itemResponses.length === 1 ? "1 response" : `${itemResponses.length} responses`}
                  </p>
                  <div className="flex max-h-[22vh] flex-col gap-2 overflow-y-auto pr-1">
                    {itemResponses.map((resp) => (
                      <button
                        key={resp.id}
                        type="button"
                        onClick={() => setActiveListening({ kind: "response", response: resp })}
                        className={`relative w-full overflow-hidden rounded-lg border py-2.5 pl-3.5 pr-3 text-left transition-colors ${
                          activeListening.kind === "response" && activeListening.response.id === resp.id
                            ? "border-white/20 bg-zinc-900/60"
                            : "border-white/10 hover:border-white/20 hover:bg-zinc-900/30"
                        }`}
                      >
                        <span
                          aria-hidden
                          className="absolute bottom-1 left-0 top-1 w-1 rounded-full opacity-90"
                          style={{
                            background: `linear-gradient(to bottom, ${nc1}, ${nc2}, ${nc3})`,
                          }}
                        />
                        <p className="font-sans text-xs text-white/50">{resp.created_by}</p>
                        {resp.transcript && (
                          <p className="mt-0.5 line-clamp-2 font-lector text-xs text-white/30">
                            {resp.transcript}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

        </motion.div>
      ) : (
        /* ── NORMAL LAYOUT ── */
        <motion.div
          key="normal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.215, 0.61, 0.355, 1] }}
        >
          {/* ─── Top media — full bleed ──────────────────────────── */}
          {topIsYoutube && (
            <YouTubeEmbed videoId={youtubeVideoId!} title={item.title} />
          )}
          {topIsVideo && (
            <VideoMediaPlayer url={item.media_url!} title={item.title} videoHandleRef={inPanelVideoRef} />
          )}
          {topIsPdf && (
            <MinimalPdfViewer url={item.media_url!} title={item.title} />
          )}
          {!topIsYoutube && !topIsVideo && topThumbnail && (
            <img
              src={topThumbnail}
              alt={item.title}
              className="w-full block bg-zinc-900"
              draggable={false}
            />
          )}

          {/* ─── Content ─────────────────────────────────────────── */}
          <div className="space-y-5 px-6 py-6">

            {/* Title + meta */}
            <div>
              {!isEditing ? (
                <ItemRecordInfo item={item} tagsDisplay={tagsDisplay} mode="fullPane" />
              ) : (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={editDraft.title}
                    onChange={(e) => setEditDraft((prev) => ({ ...prev, title: e.target.value }))}
                    className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none"
                    placeholder="Title"
                  />
                  <textarea
                    rows={3}
                    value={editDraft.description}
                    onChange={(e) => setEditDraft((prev) => ({ ...prev, description: e.target.value }))}
                    className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none"
                    placeholder="Description"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={editDraft.type}
                      onChange={(e) => setEditDraft((prev) => ({ ...prev, type: e.target.value }))}
                      className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none"
                      placeholder="Type"
                    />
                    <input
                      type="text"
                      value={editDraft.creator}
                      onChange={(e) => setEditDraft((prev) => ({ ...prev, creator: e.target.value }))}
                      className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none"
                      placeholder="Creator"
                    />
                  </div>
                  <input
                    type="text"
                    value={editDraft.mediaDate}
                    onChange={(e) => setEditDraft((prev) => ({ ...prev, mediaDate: e.target.value }))}
                    className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none"
                    placeholder="Original media date (required)"
                  />
                  <input
                    type="url"
                    value={editDraft.link}
                    onChange={(e) => setEditDraft((prev) => ({ ...prev, link: e.target.value }))}
                    className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none"
                    placeholder="External link"
                  />
                  <input
                    type="text"
                    value={editDraft.tags}
                    onChange={(e) => setEditDraft((prev) => ({ ...prev, tags: e.target.value }))}
                    className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none"
                    placeholder="Tags (comma separated)"
                  />
                  {saveEditError && <p className="text-xs text-red-400">{saveEditError}</p>}
                </div>
              )}
            </div>

            {!isEditing && (
              <>
                {/* Listen button */}
                {item.voice_recording_url && (
                  <button
                    type="button"
                    onClick={toggleListening}
                    className="relative w-full overflow-hidden rounded-xl"
                    style={{ height: 88 }}
                    aria-label="Play narrative"
                  >
                    {/* User gradient — darkened and blurred as background */}
                    <div
                      className="absolute inset-0 scale-110"
                      style={{
                        background: `radial-gradient(ellipse at center, ${nc1} 0%, ${nc2} 50%, ${nc3} 100%)`,
                        filter: "blur(24px) brightness(0.22)",
                      }}
                    />
                    <div className="absolute inset-0 flex items-center">
                      <div className="flex flex-col items-start gap-1 px-5">
                        <span className="font-sans text-xs text-white/40">Play narrative</span>
                        <span className="font-lector text-sm tracking-tight text-white/90">
                          {addedByName ? addedByName.split(" ")[0] : item.added_by.split("@")[0]}
                          {", "}
                          <span className="text-white/45">{formatDateShort(item.created_at)}</span>
                        </span>
                      </div>
                    </div>
                  </button>
                )}

                {/* Actions */}
                {item.voice_recording_url ? (
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/?panel=connect&connectPanel=1&connectSelect=1&connectIds=${encodeURIComponent(itemId)}&connectReturnItem=${encodeURIComponent(itemId)}`}
                      className="flex items-center rounded-full bg-zinc-100 px-4 py-1.5 font-sans text-xs text-zinc-900 transition-colors hover:bg-white"
                    >
                      Connect
                    </Link>
                    <button
                      type="button"
                      onClick={goToRespond}
                      className="flex items-center gap-1.5 rounded-full border border-zinc-600 bg-zinc-900 px-4 py-1.5 font-sans text-xs text-zinc-100 transition-colors hover:border-zinc-500 hover:bg-zinc-800"
                    >
                      Respond
                    </button>
                    <button
                      disabled={savingKanon}
                      onClick={async () => {
                        if (!user?.email) return;
                        setSavingKanon(true);
                        if (kanonSaveId) {
                          try {
                            await removeFromKanon(kanonSaveId);
                          } finally {
                            setSavingKanon(false);
                          }
                        } else {
                          const thumbs = item?.thumbnail_url ? [item.thumbnail_url] : [];
                          const { resolve, reject } = startNavProgress({
                            id: `hold-${Date.now()}`,
                            text: "Adding to Hold",
                            thumbnails: thumbs.length > 0 ? thumbs : undefined,
                            showProgress: true,
                            durationMs: 2000,
                          });
                          try {
                            await saveToKanon(user.email, "item", itemId);
                            resolve("Added to Hold");
                          } catch (err) {
                            reject(err instanceof Error ? err.message : "Something went wrong, try again");
                          } finally {
                            setSavingKanon(false);
                          }
                        }
                      }}
                      className={`flex items-center gap-1.5 rounded-full border bg-zinc-950 px-4 py-1.5 font-sans text-xs transition-colors disabled:opacity-60 ${
                        kanonSaveId
                          ? "border-zinc-500 text-zinc-200 hover:border-zinc-400 hover:text-zinc-100"
                          : "border-zinc-700 text-zinc-300 hover:border-zinc-600 hover:text-zinc-100"
                      }`}
                    >
                      <span>{kanonSaveId ? "×" : "+"}</span>
                      {kanonSaveId ? "In Hold" : "Add to Hold"}
                    </button>
                  </div>
                ) : kanonSaveId ? (
                  <p className="text-xs text-zinc-500">
                    <span className="text-zinc-300">In your hold.</span> Record audio to make this available in the library.
                  </p>
                ) : null}

              </>
            )}

            {/* Music player — songs only */}
            {item.type === "song" && item.source_metadata && (
              <>
                <MusicPlayer
                  previewUrl={item.source_metadata.preview_url}
                  platformLinks={item.source_metadata.platform_links}
                  songLinkUrl={item.source_metadata.song_link_url}
                  preferredPlatform={preferredPlatform}
                />
                <div className="border-t border-zinc-800" />
              </>
            )}

            {!isEditing && (
              <>
                {/* Responses */}
                {itemResponses.length > 0 && (
                  <>
                    <div className="border-t border-zinc-800" />
                    <div className="space-y-3">
                      <p className="font-lector text-sm tracking-tight text-zinc-400">Responses</p>
                      <div className="flex flex-col gap-2">
                        {itemResponses.map((resp) => (
                          <div
                            key={resp.id}
                            className="relative space-y-1.5 overflow-hidden rounded-md border border-zinc-800 py-3 pl-4 pr-4"
                          >
                            <span
                              aria-hidden
                              className="absolute bottom-2 left-0 top-2 w-1 rounded-full opacity-90"
                              style={{
                                background: `linear-gradient(to bottom, ${nc1}, ${nc2}, ${nc3})`,
                              }}
                            />
                            <p className="text-xs text-zinc-600">{resp.created_by}</p>
                            <AudioPlayer src={resp.audio_url} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Connections */}
                {connections.length > 0 && (
                  <>
                    <div className="border-t border-zinc-800" />
                    <div className="space-y-3">
                      <p className="font-lector text-sm tracking-tight text-zinc-400">Connections</p>
                      <div className="flex flex-col gap-2">
                        {connections.map((conn) => {
                          return (
                            <button
                              key={conn.id}
                              type="button"
                              onClick={() =>
                                navigatePanel(
                                  `/?connection=${encodeURIComponent(conn.id)}`,
                                  item.title
                                )
                              }
                              className="relative block w-full overflow-hidden rounded-xl text-left transition-opacity duration-150 ease-out hover:opacity-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25"
                            >
                              <ConnectionItemsPreview
                                items={connectionItemIdsToPreview(conn.itemIds, allItems)}
                                colors={
                                  connectionCreatorGradients[conn.created_by] ??
                                  DEFAULT_GRADIENT_COLORS
                                }
                                size="sm"
                                className="rounded-none border-0"
                                byline={{
                                  name:
                                    connectionCreatorFirstNames[conn.created_by] ??
                                    conn.created_by.split("@")[0],
                                  date: formatDateShort(conn.created_at),
                                }}
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}

            {/* Bottom padding for floating nav clearance */}
            <div className="h-16" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* ── Expanded media lightbox — AnimatePresence lives inside the portal so FM tracks the motion tree correctly ── */}
    {typeof document !== "undefined" &&
      createPortal(
        <AnimatePresence>
          {mediaExpanded && (
            <motion.div
              key="item-media-lightbox"
              className="fixed inset-0 z-[200] flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: shouldReduceMotion ? 0 : 0.18, ease: [0.215, 0.61, 0.355, 1] }}
              onClick={closeFullScreen}
            >
              <div className="absolute inset-0 bg-black/96" />
              <motion.div
                className="relative z-10 flex flex-col"
                initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
                transition={{ duration: shouldReduceMotion ? 0 : 0.22, ease: [0.215, 0.61, 0.355, 1] }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={closeFullScreen}
                  className="absolute -top-9 right-0 font-sans text-xs text-white/40 transition-colors hover:text-white/90"
                >
                  Close ✕
                </button>
                {topIsVideo && (
                  <ExpandedVideoPlayer
                    src={item.media_url!}
                    title={item.title}
                    initialTime={expandStartTimeRef.current}
                    playbackTimeRef={expandedVideoFinalTimeRef}
                    playingRef={expandWasPlayingRef}
                    onUnmount={(t) => {
                      expandedVideoFinalTimeRef.current = t;
                    }}
                  />
                )}
                {topIsPdf && (
                  <MinimalPdfViewer
                    url={item.media_url!}
                    title={item.title}
                    maxCanvasHeight={typeof window !== "undefined" ? Math.floor(window.innerHeight * 0.78) : undefined}
                    maxWidth={typeof window !== "undefined" ? Math.floor(window.innerWidth * 0.8) : undefined}
                  />
                )}
                {!topIsVideo && !topIsPdf && topThumbnail && (
                  <img
                    src={topThumbnail}
                    alt={item.title}
                    className="max-h-[88vh] max-w-[88vw] object-contain"
                    draggable={false}
                  />
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
      <ReRecordModal
        open={reRecordOpen}
        title="narrative"
        onClose={() => setReRecordOpen(false)}
        onSave={async (blob) => {
          if (!user?.email) throw new Error("Not signed in");
          await addAudioVersion(itemId, blob, user.email);
        }}
      />
    </>
  );
}
