"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import type { TimedWord } from "@/lib/types";

interface SyncedTranscriptProps {
  audioUrl: string;
  words: TimedWord[];
  onFinished?: () => void;
  className?: string;
}

export default function SyncedTranscript({
  audioUrl,
  words,
  onFinished,
  className,
}: SyncedTranscriptProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const rafRef = useRef(0);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  const [playing, setPlaying] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);

  /* Sync refs array length with words */
  wordRefs.current.length = words.length;

  /* ── rAF loop — reads currentTime, sets data-state on each span ────────── */

  const tick = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || audio.paused) return;

    const t = audio.currentTime;

    for (let i = 0; i < words.length; i++) {
      const el = wordRefs.current[i];
      if (!el) continue;

      const { start, end } = words[i];

      if (t >= start && t < end) {
        if (el.dataset.state !== "active") el.dataset.state = "active";
      } else if (t >= start) {
        if (el.dataset.state !== "spoken") el.dataset.state = "spoken";
      } else {
        if (el.dataset.state !== "pending") el.dataset.state = "pending";
      }
    }

    rafRef.current = requestAnimationFrame(tick);
  }, [words]);

  /* ── Audio event listeners ─────────────────────────────────────────────── */

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onEnded = () => {
      setPlaying(false);
      cancelAnimationFrame(rafRef.current);
      onFinishedRef.current?.();
    };

    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("ended", onEnded);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  /* ── Play / pause ──────────────────────────────────────────────────────── */

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      void audio.play();
      setPlaying(true);
      setHasPlayed(true);
      rafRef.current = requestAnimationFrame(tick);
    } else {
      audio.pause();
      setPlaying(false);
      cancelAnimationFrame(rafRef.current);
    }
  }, [tick]);

  /* ── Restart ────────────────────────────────────────────────────────────── */

  const restart = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    audio.currentTime = 0;
    cancelAnimationFrame(rafRef.current);
    setPlaying(false);

    // Reset all word states
    for (const el of wordRefs.current) {
      if (el) el.dataset.state = "pending";
    }

    void audio.play();
    setPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  /* ── Render ────────────────────────────────────────────────────────────── */

  return (
    <div className={className}>
      <audio ref={audioRef} src={audioUrl} preload="auto" />

      <p className="font-lector text-sm leading-relaxed text-zinc-300">
        {words.map((w, i) => (
          <span
            key={`${i}-${w.start}`}
            ref={(el) => {
              wordRefs.current[i] = el;
            }}
            data-state="pending"
            className="synced-word"
          >
            {w.word}{" "}
          </span>
        ))}
      </p>

      <div className="mt-3 flex gap-3">
        <button
          onClick={togglePlay}
          className="font-sans text-xs text-zinc-500 transition-colors hover:text-zinc-300"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <button
          onClick={restart}
          className="font-sans text-xs text-zinc-500 transition-colors hover:text-zinc-300"
          aria-label="Restart"
        >
          Restart
        </button>
      </div>
    </div>
  );
}
