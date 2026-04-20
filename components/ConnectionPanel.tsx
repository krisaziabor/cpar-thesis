"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import {
  getConnectionItemIds,
  subscribeToConnection,
  subscribeToItems,
  subscribeToResponses,
} from "@/lib/items";
import { getUserProfile } from "@/lib/users";
import { usePanelHistory } from "@/lib/panel-history-context";
import {
  subscribeToKanonSaveStatus,
  saveToKanon,
  removeFromKanon,
} from "@/lib/kanon";
import type {
  Connection,
  Item,
  Response as ConnectionResponse,
  TimedWord,
} from "@/lib/types";
import AudioPlayer from "@/components/AudioPlayer";
import SyncedTranscript, {
  type SyncedTranscriptHandle,
} from "@/components/SyncedTranscript";
import { EASE_OUT, MOTION_DURATION } from "@/lib/motion";

const DEFAULT_GRADIENT_COLORS: [string, string, string] = [
  "#C73C28",
  "#2A86A2",
  "#7238A0",
];

const PANE_BLUR_MASK_BOTTOM = `linear-gradient(to bottom, hsla(0,0%,100%,0) 0%, hsla(0,0%,100%,0) 10%, hsla(0,0%,100%,0.06) 24%, hsla(0,0%,100%,0.28) 44%, hsla(0,0%,100%,0.62) 64%, hsla(0,0%,100%,0.9) 82%, hsl(0,0%,100%) 100%)`;
const PANE_DIM_MASK_BOTTOM = `linear-gradient(to bottom, hsla(0,0%,100%,0) 0%, hsla(0,0%,100%,0) 6%, hsla(0,0%,100%,0.18) 32%, hsla(0,0%,100%,0.55) 58%, hsla(0,0%,100%,0.92) 80%, hsl(0,0%,100%) 100%)`;
const PANE_BLUR_MASK_TOP = `linear-gradient(to bottom, hsl(0,0%,100%) 0%, hsla(0,0%,100%,0.9) 18%, hsla(0,0%,100%,0.62) 36%, hsla(0,0%,100%,0.28) 56%, hsla(0,0%,100%,0.06) 76%, hsla(0,0%,100%,0) 90%, hsla(0,0%,100%,0) 100%)`;
const PANE_DIM_MASK_TOP = `linear-gradient(to bottom, hsl(0,0%,100%) 0%, hsla(0,0%,100%,0.92) 20%, hsla(0,0%,100%,0.55) 42%, hsla(0,0%,100%,0.18) 68%, hsla(0,0%,100%,0) 94%, hsla(0,0%,100%,0) 100%)`;

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

type RecordMetaRow = { label: string; value: string };

function buildRecordMeta(item: Item): RecordMetaRow[] {
  const rows: RecordMetaRow[] = [];
  const push = (label: string, value: string | undefined | null) => {
    const v = value != null ? String(value).trim() : "";
    if (v) rows.push({ label, value: v });
  };
  push("Type", item.type);
  push("By", item.creator);
  push("Date", item.media_date);
  return rows;
}

/**
 * Split a plain transcript into pseudo-TimedWord entries by distributing
 * word boundaries uniformly across `duration`. Connections don't currently
 * carry word-level timings, so this gives SyncedTranscript something to drive
 * the spoken/active blur animation in lockstep with audio playback.
 */
function buildPseudoTimedWords(transcript: string, duration: number): TimedWord[] {
  const tokens = transcript
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
  if (tokens.length === 0 || !Number.isFinite(duration) || duration <= 0) {
    return [];
  }
  const per = duration / tokens.length;
  return tokens.map((word, i) => ({
    word,
    start: i * per,
    end: (i + 1) * per,
  }));
}

export default function ConnectionPanel({
  connectionId,
}: {
  connectionId: string;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { navigatePanel } = usePanelHistory();
  const shouldReduceMotion = useReducedMotion();

  const [connection, setConnection] = useState<Connection | null | undefined>(
    undefined
  );
  const [itemIds, setItemIds] = useState<string[]>([]);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [responses, setResponses] = useState<ConnectionResponse[]>([]);
  const [creatorName, setCreatorName] = useState<string | null>(null);
  const [creatorColors, setCreatorColors] = useState<
    [string, string, string] | null
  >(null);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [kanonSaveId, setKanonSaveId] = useState<string | null>(null);
  const [savingKanon, setSavingKanon] = useState(false);

  const transcriptRef = useRef<SyncedTranscriptHandle>(null);
  const transcriptScrollRef = useRef<HTMLDivElement>(null);
  const [narrativePlaying, setNarrativePlaying] = useState(false);

  const leftPaneRef = useRef<HTMLDivElement>(null);
  const leftPaneContentRef = useRef<HTMLDivElement>(null);
  const [leftAtTop, setLeftAtTop] = useState(true);
  const [leftAtBottom, setLeftAtBottom] = useState(false);

  const updateLeftPaneFades = useCallback(() => {
    const el = leftPaneRef.current;
    if (!el) return;
    const ε = 3;
    setLeftAtTop(el.scrollTop <= ε);
    setLeftAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - ε);
  }, []);

  // Scroll-driven mask on the transcript — mirrors ItemPanel listening.
  const TRANSCRIPT_MASK_OPAQUE_FRAC = 0.6;
  const TRANSCRIPT_MASK_TOP_FADE_FRAC = 0.13;
  const TRANSCRIPT_MASK_INITIAL = `linear-gradient(to bottom, black 0%, black ${
    TRANSCRIPT_MASK_OPAQUE_FRAC * 100
  }%, transparent 100%)`;

  const updateTranscriptMask = useCallback(() => {
    const el = transcriptScrollRef.current;
    if (!el) return;
    const ε = 3;
    const atTop = el.scrollTop <= ε;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - ε;
    const topP = TRANSCRIPT_MASK_TOP_FADE_FRAC * 100;
    const botP = TRANSCRIPT_MASK_OPAQUE_FRAC * 100;
    let mask: string;
    if (atTop && atBottom) mask = "none";
    else if (atTop && !atBottom)
      mask = `linear-gradient(to bottom, black 0%, black ${botP}%, transparent 100%)`;
    else if (!atTop && atBottom)
      mask = `linear-gradient(to bottom, transparent 0%, black ${topP}%, black 100%)`;
    else
      mask = `linear-gradient(to bottom, transparent 0%, black ${topP}%, black ${botP}%, transparent 100%)`;
    el.style.webkitMaskImage = mask;
    el.style.maskImage = mask;
  }, []);

  useEffect(() => subscribeToConnection(connectionId, setConnection), [connectionId]);
  useEffect(() => {
    getConnectionItemIds(connectionId).then(setItemIds);
  }, [connectionId]);
  useEffect(() => subscribeToItems(setAllItems), []);
  useEffect(() => subscribeToResponses(connectionId, setResponses), [connectionId]);
  useEffect(() => {
    if (!user?.email) return;
    return subscribeToKanonSaveStatus(user.email, "connection", connectionId, setKanonSaveId);
  }, [user?.email, connectionId]);

  useEffect(() => {
    if (!connection?.created_by) {
      setCreatorName(null);
      setCreatorColors(null);
      return;
    }
    let cancelled = false;
    void getUserProfile(connection.created_by).then((p) => {
      if (cancelled) return;
      setCreatorName(p?.name ?? null);
      setCreatorColors(p?.avatar_colors ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [connection?.created_by]);

  // Probe audio duration independently so we can synthesize word timings even
  // before SyncedTranscript mounts.
  useEffect(() => {
    const url = connection?.audio_url;
    if (!url) {
      setAudioDuration(null);
      return;
    }
    const probe = new Audio();
    probe.preload = "metadata";
    const onMeta = () => {
      if (Number.isFinite(probe.duration) && probe.duration > 0) {
        setAudioDuration(probe.duration);
      }
    };
    probe.addEventListener("loadedmetadata", onMeta);
    probe.src = url;
    return () => {
      probe.removeEventListener("loadedmetadata", onMeta);
      probe.src = "";
    };
  }, [connection?.audio_url]);

  // Refresh mask once transcript lays out.
  useEffect(() => {
    const timer = window.setTimeout(updateTranscriptMask, 80);
    return () => window.clearTimeout(timer);
  }, [connection?.transcript, audioDuration, updateTranscriptMask]);

  const connectedItems = useMemo(
    () =>
      itemIds
        .map((id) => allItems.find((i) => i.id === id))
        .filter(Boolean) as Item[],
    [itemIds, allItems]
  );

  // Re-check left pane fades when the inner content grows/shrinks (e.g. items load).
  useEffect(() => {
    const el = leftPaneContentRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateLeftPaneFades);
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateLeftPaneFades]);

  const goToItem = useCallback(
    (itemId: string) => {
      navigatePanel(`/?item=${encodeURIComponent(itemId)}`, "Connection");
    },
    [navigatePanel]
  );

  const goToRespond = useCallback(() => {
    const p = new URLSearchParams(searchParams.toString());
    p.delete("item");
    p.set("panel", "respondConnection");
    p.set("connection", connectionId);
    navigatePanel(`/?${p.toString()}`, "Connection");
  }, [searchParams, connectionId, navigatePanel]);

  const timedWords = useMemo(
    () =>
      connection?.transcript && audioDuration
        ? buildPseudoTimedWords(connection.transcript, audioDuration)
        : [],
    [connection?.transcript, audioDuration]
  );

  if (connection === undefined) {
    return (
      <div className="flex h-40 items-center justify-center">
        <span className="text-xs text-zinc-500">loading…</span>
      </div>
    );
  }
  if (connection === null) {
    return (
      <div className="flex h-40 items-center justify-center">
        <span className="text-xs text-zinc-500">connection not found</span>
      </div>
    );
  }

  const [nc1, nc2, nc3] = creatorColors ?? DEFAULT_GRADIENT_COLORS;
  const firstName = creatorName
    ? creatorName.split(/\s+/)[0]
    : connection.created_by.split("@")[0];

  const stagger = shouldReduceMotion ? 0 : 0.06;
  const baseDelay = shouldReduceMotion ? 0 : 0.08;

  return (
    <div className="relative flex h-full overflow-hidden">
      {/* ── Left pane — connected records ─────────────────────────── */}
      <div className="relative z-10 flex-1 min-w-0">
        <div
          ref={leftPaneRef}
          onScroll={updateLeftPaneFades}
          className="absolute inset-0 overflow-y-auto scrollbar-hide"
        >
        <div ref={leftPaneContentRef} className="flex flex-col gap-3 px-6 py-6">
          <div className="flex flex-col gap-1">
            {connection.title && (
              <motion.h2
                className="font-lector text-xl tracking-tight text-white"
                initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: MOTION_DURATION.standard, ease: EASE_OUT }}
              >
                {connection.title}
              </motion.h2>
            )}
            <motion.p
              className="font-lector text-sm tracking-tight text-white/50"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: MOTION_DURATION.standard, ease: EASE_OUT }}
            >
              {connectedItems.length > 0
                ? `${connectedItems.length} connected record${
                    connectedItems.length === 1 ? "" : "s"
                  }`
                : "Connected records"}
            </motion.p>
          </div>

          <div className="flex flex-col gap-3">
            <AnimatePresence initial={false}>
              {connectedItems.map((item, idx) => (
                <motion.button
                  key={item.id}
                  type="button"
                  onClick={() => goToItem(item.id)}
                  layout={!shouldReduceMotion}
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{
                    duration: MOTION_DURATION.standard,
                    ease: EASE_OUT,
                    delay: baseDelay + idx * stagger,
                  }}
                  whileHover={shouldReduceMotion ? undefined : { y: -1 }}
                  whileTap={shouldReduceMotion ? undefined : { scale: 0.99 }}
                  className="group relative flex w-full flex-col overflow-hidden rounded-xl border border-white/10 bg-black/20 text-left transition-colors duration-150 ease-out hover:border-white/20 hover:bg-zinc-900/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/25"
                >
                  {item.thumbnail_url ? (
                    <div className="relative aspect-[16/9] w-full overflow-hidden bg-zinc-900">
                      <img
                        src={item.thumbnail_url}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]"
                        draggable={false}
                      />
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-2 px-4 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-lector text-base leading-tight tracking-tight text-white/95">
                        {item.title}
                      </h3>
                      <span
                        aria-hidden
                        className="mt-0.5 shrink-0 font-sans text-xs text-white/30 transition-colors group-hover:text-white/70"
                      >
                        Open →
                      </span>
                    </div>

                    {item.description && (
                      <p className="line-clamp-2 font-sans text-xs leading-relaxed text-white/45">
                        {item.description}
                      </p>
                    )}

                    <div className="grid [grid-template-columns:max-content_minmax(0,1fr)] items-baseline gap-x-2 gap-y-0.5 font-sans text-xs [line-height:1.3]">
                      {buildRecordMeta(item).map((row, rIdx) => (
                        <Fragment key={`${row.label}-${rIdx}`}>
                          <span className="shrink-0 text-white/25">
                            {row.label}
                          </span>
                          <span className="min-w-0 truncate text-white/50">
                            {row.value}
                          </span>
                        </Fragment>
                      ))}
                    </div>
                  </div>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>

          {/* Responses — sit beneath the connected-records list */}
          {responses.length > 0 && (
            <motion.div
              className="mt-4 space-y-2"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: MOTION_DURATION.standard,
                ease: EASE_OUT,
                delay:
                  baseDelay + connectedItems.length * stagger + 0.05,
              }}
            >
              <p className="font-lector text-xs tracking-tight text-white/45">
                {responses.length === 1
                  ? "1 response"
                  : `${responses.length} responses`}
              </p>
              <div className="flex flex-col gap-2">
                <AnimatePresence initial={false}>
                  {responses.map((resp, idx) => (
                    <motion.div
                      key={resp.id}
                      layout={!shouldReduceMotion}
                      initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{
                        duration: MOTION_DURATION.standard,
                        ease: EASE_OUT,
                        delay: shouldReduceMotion ? 0 : idx * 0.04,
                      }}
                      className="relative space-y-1.5 overflow-hidden rounded-lg border border-white/10 py-2.5 pl-4 pr-3"
                    >
                      <span
                        aria-hidden
                        className="absolute bottom-1 left-0 top-1 w-1 rounded-full opacity-90"
                        style={{
                          background: `linear-gradient(to bottom, ${nc1}, ${nc2}, ${nc3})`,
                        }}
                      />
                      <p className="font-sans text-xs text-white/50">
                        {resp.created_by}
                      </p>
                      {resp.audio_url && <AudioPlayer src={resp.audio_url} />}
                      {resp.transcript && (
                        <p className="font-lector text-xs leading-relaxed text-white/60">
                          {resp.transcript}
                        </p>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          <div className="h-12" />
        </div>
        </div>

        {/* Top fade — visible once user scrolls down */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-20 h-20 transition-opacity duration-200"
          style={{ opacity: leftAtTop ? 0 : 1 }}
        >
          <div
            className="absolute inset-0 bg-white/[0.03] [-webkit-backdrop-filter:blur(14px)] [backdrop-filter:blur(14px)]"
            style={{ maskImage: PANE_BLUR_MASK_TOP, WebkitMaskImage: PANE_BLUR_MASK_TOP }}
          />
          <div
            className="absolute inset-0 bg-gradient-to-b from-black via-black/35 to-transparent"
            style={{ maskImage: PANE_DIM_MASK_TOP, WebkitMaskImage: PANE_DIM_MASK_TOP }}
          />
        </div>

        {/* Bottom fade — visible when more content lies below */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-20 transition-opacity duration-200"
          style={{ opacity: leftAtBottom ? 0 : 1 }}
        >
          <div
            className="absolute inset-0 bg-white/[0.03] [-webkit-backdrop-filter:blur(14px)] [backdrop-filter:blur(14px)]"
            style={{ maskImage: PANE_BLUR_MASK_BOTTOM, WebkitMaskImage: PANE_BLUR_MASK_BOTTOM }}
          />
          <div
            className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent"
            style={{ maskImage: PANE_DIM_MASK_BOTTOM, WebkitMaskImage: PANE_DIM_MASK_BOTTOM }}
          />
        </div>
      </div>

      {/* ── Right pane — transcript + Respond ─────────────────────── */}
      <motion.div
        className="relative z-10 flex w-[420px] shrink-0 flex-col overflow-hidden border-l border-white/10 bg-black"
        initial={shouldReduceMotion ? false : { opacity: 0, x: 8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{
          duration: MOTION_DURATION.panel,
          ease: EASE_OUT,
          delay: shouldReduceMotion ? 0 : 0.04,
        }}
      >
        {/* Creator strap */}
        <div className="shrink-0 px-6 pt-6">
          <p className="font-sans text-[11px] uppercase tracking-wide text-white/35">
            Connection by
          </p>
          <p className="mt-1 font-lector text-base tracking-tight text-white/95">
            {firstName}
            <span className="text-white/45">
              {", "}
              {formatDateShort(connection.created_at)}
            </span>
          </p>
        </div>

        {/* Transcript — vertically centered, masked, word-by-word animated */}
        <div className="relative min-h-0 flex-1">
          <div className="absolute inset-0 flex items-center justify-center px-8">
            <div className="w-full max-w-sm">
              <div
                ref={transcriptScrollRef}
                onScroll={updateTranscriptMask}
                className="max-h-[52vh] overflow-y-auto scrollbar-hide"
                style={{
                  WebkitMaskImage: TRANSCRIPT_MASK_INITIAL,
                  maskImage: TRANSCRIPT_MASK_INITIAL,
                }}
              >
                {connection.audio_url && timedWords.length > 0 ? (
                  <SyncedTranscript
                    ref={transcriptRef}
                    scrollParentRef={transcriptScrollRef}
                    scrollOpaqueBottomRatio={TRANSCRIPT_MASK_OPAQUE_FRAC - 0.04}
                    audioUrl={connection.audio_url}
                    words={timedWords}
                    autoPlay
                    compact
                    hideControls
                    textSize="text-sm"
                    onPlayStart={() => setNarrativePlaying(true)}
                    onPause={() => setNarrativePlaying(false)}
                    onDurationLoaded={(d) => {
                      if (Number.isFinite(d) && d > 0) setAudioDuration(d);
                      window.requestAnimationFrame(() => updateTranscriptMask());
                    }}
                  />
                ) : connection.audio_url && connection.transcript ? (
                  // Placeholder while audio duration probes: render the
                  // transcript pre-dimmed so it matches the synced-word
                  // "pending" opacity. Prevents a bright flash before
                  // SyncedTranscript swaps in.
                  <p
                    className="font-lector text-sm leading-relaxed text-zinc-300"
                    style={{ opacity: 0.28 }}
                  >
                    {connection.transcript}
                  </p>
                ) : connection.transcript ? (
                  <p className="font-lector text-sm leading-relaxed text-white/70">
                    {connection.transcript}
                  </p>
                ) : connection.audio_url ? (
                  <AudioPlayer src={connection.audio_url} />
                ) : (
                  <p className="font-sans text-xs text-white/35">
                    No narrative recorded.
                  </p>
                )}
              </div>

              {connection.audio_url && timedWords.length > 0 && (
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
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Respond + Hold */}
        <div className="shrink-0 border-t border-white/10 px-6 pb-6 pt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={goToRespond}
            className="inline-flex items-center rounded-full bg-zinc-100 px-4 py-1.5 font-sans text-xs text-zinc-900 transition-colors duration-150 ease-out hover:bg-white"
          >
            Respond
          </button>
          <button
            type="button"
            disabled={savingKanon}
            onClick={async () => {
              if (!user?.email) return;
              setSavingKanon(true);
              try {
                if (kanonSaveId) {
                  await removeFromKanon(kanonSaveId);
                } else {
                  await saveToKanon(user.email, "connection", connectionId);
                }
              } finally {
                setSavingKanon(false);
              }
            }}
            className={`inline-flex items-center gap-1.5 rounded-full border bg-zinc-950 px-4 py-1.5 font-sans text-xs transition-colors duration-150 ease-out disabled:opacity-60 ${
              kanonSaveId
                ? "border-zinc-500 text-zinc-200 hover:border-zinc-400 hover:text-zinc-100"
                : "border-zinc-700 text-zinc-300 hover:border-zinc-600 hover:text-zinc-100"
            }`}
          >
            <span>{kanonSaveId ? "×" : "+"}</span>
            {kanonSaveId ? "In Hold" : "Add to Hold"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
