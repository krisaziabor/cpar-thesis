"use client";

import { useState, useRef, useEffect } from "react";

interface AudioRecorderProps {
  onRecorded: (blob: Blob, url: string) => void;
  /** Called when the user chooses to re-record over a pre-existing audio URL. */
  onClearedInitial?: () => void;
  prompt?: string;
  /** Pre-existing audio URL (e.g. from a saved draft). Shows in recorded state immediately. */
  initialUrl?: string;
}

type RecordState = "idle" | "recording" | "recorded";

function fmt(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Pick the first MIME type the browser's MediaRecorder actually supports. */
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

export default function AudioRecorder({
  onRecorded,
  onClearedInitial,
  prompt,
  initialUrl,
}: AudioRecorderProps) {
  const [state, setState] = useState<RecordState>(initialUrl ? "recorded" : "idle");
  const [seconds, setSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(initialUrl ?? null);
  const [micError, setMicError] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function startRecording() {
    setMicError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError("Audio recording is not available. Please open this page in Safari.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (typeof MediaRecorder === "undefined") {
        stream.getTracks().forEach((t) => t.stop());
        setMicError("Audio recording is not supported in this browser. Please update Safari.");
        return;
      }
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
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        onRecorded(blob, url);
        stream.getTracks().forEach((t) => t.stop());
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setState("recording");
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (err: unknown) {
      const errName = err instanceof Error ? err.name : "";
      if (errName === "NotAllowedError" || errName === "PermissionDeniedError") {
        setMicError("Microphone blocked. On iPhone: Settings → Privacy & Security → Microphone → enable Safari. Then reload and try again.");
      } else if (errName === "NotFoundError" || errName === "DevicesNotFoundError") {
        setMicError("No microphone found on this device.");
      } else {
        setMicError("Could not access microphone. Check your browser permissions.");
      }
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    setState("recorded");
  }

  function reRecord() {
    if (audioUrl === initialUrl) {
      onClearedInitial?.();
    }
    setAudioUrl(null);
    setSeconds(0);
    setState("idle");
  }

  return (
    <div className="flex flex-col items-center gap-5 rounded-none border border-zinc-300 bg-white p-8 dark:border-zinc-700 dark:bg-zinc-950">
      {prompt && (
        <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
          {prompt}
        </p>
      )}

      {state === "idle" && (
        <div className="flex flex-col items-center gap-3">
          <button
            onClick={startRecording}
            aria-label="Start recording"
            className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-zinc-900 text-zinc-900 transition-colors hover:bg-zinc-900 hover:text-white dark:border-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-100 dark:hover:text-zinc-900"
          >
            <MicIcon />
          </button>
          <span className="text-xs text-zinc-400">tap to record</span>
          {micError && <p className="text-xs text-red-500">{micError}</p>}
        </div>
      )}

      {state === "recording" && (
        <div className="flex flex-col items-center gap-4">
          <div className="relative flex h-20 w-20 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-zinc-300 opacity-50 dark:bg-zinc-600" />
            <button
              onClick={stopRecording}
              aria-label="Stop recording"
              className="relative flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              <StopIcon />
            </button>
          </div>
          <span className="font-mono text-sm text-zinc-500">{fmt(seconds)}</span>
          <span className="text-xs text-zinc-400">recording — tap to stop</span>
        </div>
      )}

      {state === "recorded" && audioUrl && (
        <div className="flex w-full flex-col items-center gap-3">
          {audioUrl === initialUrl && (
            <p className="font-mono text-xs text-zinc-400">saved recording</p>
          )}
          <audio src={audioUrl} controls className="w-full" />
          <button
            onClick={reRecord}
            className="-mx-2 px-2 py-2 text-xs text-zinc-400 underline underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            re-record
          </button>
        </div>
      )}
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 19v3M9 22h6" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
      <rect x="5" y="5" width="14" height="14" rx="1" />
    </svg>
  );
}
