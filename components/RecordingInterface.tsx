"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import RecordingWave from "@/components/RecordingWave";

/* ── helpers ──────────────────────────────────────────────────────────────── */

function fmt(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function getSupportedMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  if (typeof MediaRecorder === "undefined") return "";
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return "";
}

/* ── types ────────────────────────────────────────────────────────────────── */

export interface RecordingItemInfo {
  title: string;
  creator: string;
  mediaDate: string;
  thumbnailUrl: string | null;
  index: number;
  total: number;
}

export type RecordingStackItem = {
  title: string;
  thumbnailUrl: string | null;
  creator?: string;
  mediaDate?: string;
};

interface RecordingInterfaceProps {
  item: RecordingItemInfo;
  colors: [string, string, string];
  /**
   * When set (e.g. connect flow), shows a bottom-left row of thumbnail+meta tiles
   * that wrap when space is tight.
   */
  stackItems?: RecordingStackItem[];
  /** Main heading above the record step (default: “Record narrative”). */
  heading?: string;
  /** Override heading typography (default: Lector lg, zinc-100). */
  headingClassName?: string;
  /** When false, the visible title is omitted (screen readers still get an sr-only heading). */
  showHeading?: boolean;
  onRecorded: (blob: Blob) => void;
  onReRecord: () => void;
  hasRecording: boolean;
  destination: "holding" | "library";
  isLast: boolean;
  canAdvance: boolean;
  onSkip: () => void;
  onNext: () => void;
  onSubmit: () => void;
}

type RecordState = "idle" | "recording" | "done";

/* ── component ────────────────────────────────────────────────────────────── */

const DEFAULT_HEADING_CLASS =
  "font-lector text-lg tracking-tight text-zinc-100";

export default function RecordingInterface({
  item,
  colors,
  stackItems,
  heading = "Record narrative",
  headingClassName = DEFAULT_HEADING_CLASS,
  showHeading = true,
  onRecorded,
  onReRecord,
  hasRecording,
  destination,
  isLast,
  canAdvance,
  onSkip,
  onNext,
  onSubmit,
}: RecordingInterfaceProps) {
  const shouldReduceMotion = useReducedMotion();

  const [state, setState] = useState<RecordState>(hasRecording ? "done" : "idle");
  const [seconds, setSeconds] = useState(0);
  const [waveVisible, setWaveVisible] = useState(false);
  const [waveActive, setWaveActive] = useState(false);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [micError, setMicError] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    setState(hasRecording ? "done" : "idle");
    setWaveVisible(false);
    setWaveActive(false);
    setSeconds(0);
    setMicError("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.index]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void audioCtxRef.current?.close().catch(() => {});
    };
  }, []);

  async function startRecording() {
    setMicError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const node = audioCtx.createAnalyser();
      node.fftSize = 256;
      node.smoothingTimeConstant = 0.8;
      source.connect(node);

      const mimeType = getSupportedMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      const usedMime = recorder.mimeType || mimeType || "audio/webm";
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: usedMime });
        onRecorded(blob);
        streamRef.current?.getTracks().forEach((t) => t.stop());
        void audioCtxRef.current?.close().catch(() => {});
        setAnalyser(null);
      };

      /* Sync point: gradient + timer both fire on MediaRecorder `start` */
      recorder.addEventListener(
        "start",
        () => {
          setAnalyser(node);
          setWaveVisible(true);
          setWaveActive(true);
          setState("recording");
          setSeconds(0);
          timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
        },
        { once: true }
      );

      recorder.start();
      mediaRecorderRef.current = recorder;
    } catch {
      setMicError("Microphone access is required. Check browser permissions.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    setWaveActive(false);
    setTimeout(() => setWaveVisible(false), 400);
    setState("done");
  }

  function reRecord() {
    setSeconds(0);
    setWaveVisible(false);
    setWaveActive(false);
    setState("idle");
    onReRecord();
  }

  return (
    <div className="relative h-full overflow-hidden bg-black">

      {/* Wave — full background, behind all content */}
      <AnimatePresence>
        {waveVisible && (
          <motion.div
            key="wave"
            className="absolute inset-0"
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.35, ease: [0.215, 0.61, 0.355, 1] }}
          >
            <RecordingWave analyser={analyser} colors={colors} active={waveActive} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content layer */}
      <div className="relative z-10 flex h-full flex-col p-6">

        {/* Top-left heading — add flow shows Lector title; respond flow hides (context lives in parent). */}
        {showHeading ? (
          <h1 className={headingClassName}>{heading}</h1>
        ) : (
          <h1 className="sr-only">{heading}</h1>
        )}

        {/* Spacer — wave fills this area visually */}
        <div className="flex-1" />

        {/* Bottom: metadata row + controls */}
        <div className="flex flex-col gap-4">

          {/* Thumbnail + title/meta — single item or stacked connect preview */}
          {stackItems && stackItems.length > 0 ? (
            <div className="flex w-full max-h-[min(42vh,320px)] flex-row flex-wrap items-end justify-start gap-x-6 gap-y-4 overflow-y-auto pr-1 scrollbar-hide">
              {stackItems.map((row, idx) => (
                <div
                  key={`${row.title}-${idx}`}
                  className="flex max-w-[min(100%,24rem)] min-w-0 items-end gap-3 sm:max-w-[min(100%,28rem)]"
                >
                  {row.thumbnailUrl ? (
                    <img
                      src={row.thumbnailUrl}
                      alt={row.title}
                      className="h-20 w-auto max-w-[6.25rem] bg-zinc-900 object-cover shrink-0 sm:h-24 sm:max-w-[7.25rem]"
                      draggable={false}
                    />
                  ) : (
                    <div className="flex h-20 w-14 shrink-0 items-center justify-center bg-zinc-900 text-[10px] text-zinc-600 sm:h-24 sm:w-16">
                      —
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h2 className="font-lector text-base leading-tight tracking-tight text-zinc-100 sm:text-lg">
                      {row.title}
                    </h2>
                    {(row.creator || row.mediaDate) && (
                      <p className="mt-0.5 font-sans text-xs text-white/55">
                        {[row.creator, row.mediaDate].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-end gap-4">
              {item.thumbnailUrl && (
                <img
                  src={item.thumbnailUrl}
                  alt={item.title}
                  className="h-48 w-auto bg-zinc-900 object-cover shrink-0"
                  draggable={false}
                />
              )}
              <div>
                <h2 className="font-lector text-lg leading-tight tracking-tight text-zinc-100">
                  {item.title}
                </h2>
                {(item.creator || item.mediaDate) && (
                  <p className="mt-0.5 font-sans text-xs text-white/55">
                    {[item.creator, item.mediaDate].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Record controls */}
          <AnimatePresence mode="wait">
            {state === "idle" && (
              <motion.div
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col gap-1"
              >
                <button
                  type="button"
                  onClick={() => void startRecording()}
                  className="self-start font-sans text-sm text-zinc-400 transition-colors hover:text-zinc-100"
                >
                  Record
                </button>
                {micError && <p className="text-xs text-red-500">{micError}</p>}
              </motion.div>
            )}

            {state === "recording" && (
              <motion.div
                key="recording"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-baseline gap-4"
              >
                <span className="font-sans text-sm tabular-nums text-zinc-200">
                  {fmt(seconds)}
                </span>
                <button
                  type="button"
                  onClick={stopRecording}
                  className="font-sans text-sm text-zinc-400 transition-colors hover:text-zinc-100"
                >
                  Stop
                </button>
              </motion.div>
            )}

            {state === "done" && (
              <motion.div
                key="done"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex items-baseline gap-4"
              >
                <span className="font-sans text-sm tabular-nums text-zinc-400">
                  {fmt(seconds)}
                </span>
                <button
                  type="button"
                  onClick={reRecord}
                  className="font-sans text-sm text-zinc-400 transition-colors hover:text-zinc-100"
                >
                  Start again
                </button>
                {destination === "holding" && (
                  <button
                    type="button"
                    onClick={onSkip}
                    className="font-sans text-sm text-zinc-500 transition-colors hover:text-zinc-300"
                  >
                    Skip
                  </button>
                )}
                {isLast ? (
                  <button
                    type="button"
                    onClick={onSubmit}
                    disabled={destination === "library" ? !canAdvance : false}
                    className="font-sans text-sm text-zinc-100 transition-colors hover:text-white disabled:opacity-40"
                  >
                    Submit
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onNext}
                    disabled={destination === "library" ? !canAdvance : false}
                    className="font-sans text-sm text-zinc-100 transition-colors hover:text-white disabled:opacity-40"
                  >
                    Next recording
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </div>
    </div>
  );
}
