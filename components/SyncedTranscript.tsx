"use client";

import { forwardRef, useRef, useCallback, useState, useEffect, useImperativeHandle, type RefObject } from "react";
import { useReducedMotion } from "framer-motion";
import type { TimedWord } from "@/lib/types";

/**
 * Each frame: ease scroll toward keeping the active word above the fade zone.
 * `opaqueBottomRatio` is the viewport fraction (from top) where full-opacity ends
 * (e.g. 0.6 matches `linear-gradient(... black 60%, transparent 100%)`).
 * Use a value slightly below that to start scrolling a little early.
 */
function dampScrollActiveWordIntoBand(
  child: HTMLElement,
  parent: HTMLElement,
  opts: {
    opaqueBottomRatio: number;
    topPad: number;
    bottomPad: number;
    /** 1 = snap (reduced motion); lower = smoother follow */
    damp: number;
  }
) {
  const maxScroll = Math.max(0, parent.scrollHeight - parent.clientHeight);
  const pr = parent.getBoundingClientRect();
  const cr = child.getBoundingClientRect();
  const fadeLine = pr.top + pr.height * opts.opaqueBottomRatio - opts.bottomPad;
  const topLine = pr.top + opts.topPad;

  let delta = 0;
  if (cr.bottom > fadeLine) delta = cr.bottom - fadeLine;
  else if (cr.top < topLine) delta = cr.top - topLine;

  if (Math.abs(delta) < 0.6) return;

  const next = Math.max(0, Math.min(maxScroll, parent.scrollTop + delta * opts.damp));
  parent.scrollTop = next;
}

export interface SyncedTranscriptHandle {
  play(): void;
  pause(): void;
  restart(): void;
  getCurrentTime(): number;
}

interface SyncedTranscriptProps {
  audioUrl: string;
  words: TimedWord[];
  onFinished?: () => void;
  onPlayStart?: () => void;
  onPause?: () => void;
  onDurationLoaded?: (duration: number) => void;
  onAnalyserReady?: (analyser: AnalyserNode | null) => void;
  className?: string;
  autoPlay?: boolean;
  /** When true, removes h-full so the component sits inline. */
  compact?: boolean;
  /** When true, hides the built-in Play/Pause and Restart buttons. */
  hideControls?: boolean;
  /** When true, renders Play/Restart as white at reduced opacity (for use on gradient/dark full-bleed backgrounds). */
  lightControls?: boolean;
  /** Tailwind text-size class applied to the transcript paragraph (default "text-sm"). */
  textSize?: string;
  /**
   * When set, active-word scrolling uses this overflow container so the transcript
   * stays in view (scrollIntoView alone often misses nested scroll regions).
   */
  scrollParentRef?: RefObject<HTMLElement | null>;
  /**
   * Bottom of the “fully clear” reading band, as a fraction of the scrollport height
   * from the top (0–1). Should match the mask’s opaque stop; slightly lower = scroll sooner.
   */
  scrollOpaqueBottomRatio?: number;
}

const SyncedTranscript = forwardRef<SyncedTranscriptHandle, SyncedTranscriptProps>(
  function SyncedTranscript(
    {
      audioUrl,
      words,
      onFinished,
      onPlayStart,
      onPause,
      onDurationLoaded,
      onAnalyserReady,
      className,
      autoPlay,
      compact,
      hideControls,
      lightControls,
      textSize = "text-sm",
      scrollParentRef,
      scrollOpaqueBottomRatio = 0.56,
    },
    ref
  ) {
    const shouldReduceMotion = useReducedMotion();
    const audioRef = useRef<HTMLAudioElement>(null);
    const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
    const rafRef = useRef(0);
    const lastActiveIndexRef = useRef(-1);
    const onFinishedRef = useRef(onFinished);
    onFinishedRef.current = onFinished;
    const onDurationLoadedRef = useRef(onDurationLoaded);
    onDurationLoadedRef.current = onDurationLoaded;
    const onAnalyserReadyRef = useRef(onAnalyserReady);
    onAnalyserReadyRef.current = onAnalyserReady;
    const audioCtxRef = useRef<AudioContext | null>(null);

    const [playing, setPlaying] = useState(false);

    wordRefs.current.length = words.length;

    /* ── AudioContext / AnalyserNode setup ────────────────────────────────── */

    const setupAnalyser = useCallback(async () => {
      const audio = audioRef.current;
      if (!audio || audioCtxRef.current) return;
      try {
        // captureStream reads audio data without hijacking the element's output.
        // createMediaElementSource would silence audio if the AudioContext suspends.
        const capture = (audio as HTMLAudioElement & { captureStream?: () => MediaStream }).captureStream;
        if (typeof capture !== "function") return;
        const stream = capture.call(audio);
        const ctx = new AudioContext();
        await ctx.resume();
        if (ctx.state !== "running") {
          void ctx.close().catch(() => {});
          return;
        }
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);
        // Not connected to ctx.destination — audio plays natively through the element.
        audioCtxRef.current = ctx;
        onAnalyserReadyRef.current?.(analyser);
      } catch {
        // Gradient disabled — audio plays natively unaffected.
      }
    }, []);

    /* ── rAF loop ──────────────────────────────────────────────────────────── */

    const tick = useCallback(() => {
      const audio = audioRef.current;
      if (!audio || audio.paused) return;
      const t = audio.currentTime;
      let activeEl: HTMLElement | null = null;
      for (let i = 0; i < words.length; i++) {
        const el = wordRefs.current[i];
        if (!el) continue;
        const { start, end } = words[i];
        if (t >= start && t < end) {
          if (el.dataset.state !== "active") {
            el.dataset.state = "active";
            if (!scrollParentRef?.current) {
              el.scrollIntoView({
                behavior: shouldReduceMotion ? "auto" : "smooth",
                block: "center",
                inline: "nearest",
              });
            }
            lastActiveIndexRef.current = i;
          }
          activeEl = el;
        } else if (t >= start) {
          if (el.dataset.state !== "spoken") el.dataset.state = "spoken";
        } else {
          if (el.dataset.state !== "pending") el.dataset.state = "pending";
        }
      }
      const parent = scrollParentRef?.current;
      if (activeEl && parent) {
        dampScrollActiveWordIntoBand(activeEl, parent, {
          opaqueBottomRatio: scrollOpaqueBottomRatio,
          topPad: 14,
          bottomPad: 10,
          damp: shouldReduceMotion ? 1 : 0.18,
        });
      }
      rafRef.current = requestAnimationFrame(tick);
    }, [words, scrollParentRef, scrollOpaqueBottomRatio, shouldReduceMotion]);

    /* ── Audio event listeners ─────────────────────────────────────────────── */

    useEffect(() => {
      const audio = audioRef.current;
      if (!audio) return;

      const onEnded = () => {
        setPlaying(false);
        cancelAnimationFrame(rafRef.current);
        onFinishedRef.current?.();
      };

      const onLoadedMetadata = () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          onDurationLoadedRef.current?.(audio.duration);
        }
      };

      audio.addEventListener("ended", onEnded);
      audio.addEventListener("loadedmetadata", onLoadedMetadata);
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        onDurationLoadedRef.current?.(audio.duration);
      }

      return () => {
        audio.removeEventListener("ended", onEnded);
        audio.removeEventListener("loadedmetadata", onLoadedMetadata);
        cancelAnimationFrame(rafRef.current);
        audioCtxRef.current?.close().catch(() => {});
        audioCtxRef.current = null;
        onAnalyserReadyRef.current?.(null);
      };
    }, []);

    /* ── AutoPlay on mount ─────────────────────────────────────────────────── */

    useEffect(() => {
      if (!autoPlay) return;
      const timer = setTimeout(() => {
        const audio = audioRef.current;
        if (!audio || !audio.paused) return;
        // Play immediately so audio is never blocked by AudioContext setup.
        // Analyser is wired up in background — gradient animates once ready.
        void audio.play().then(() => {
          setPlaying(true);
          onPlayStart?.();
          rafRef.current = requestAnimationFrame(tick);
          void setupAnalyser();
        }).catch(() => {});
      }, 80);
      return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* ── Imperative controls ───────────────────────────────────────────────── */

    const play = useCallback(() => {
      const audio = audioRef.current;
      if (!audio || !audio.paused) return;
      void audio.play().then(() => {
        setPlaying(true);
        onPlayStart?.();
        rafRef.current = requestAnimationFrame(tick);
        void setupAnalyser();
      }).catch(() => {});
    }, [tick, onPlayStart, setupAnalyser]);

    const pause = useCallback(() => {
      const audio = audioRef.current;
      if (!audio || audio.paused) return;
      audio.pause();
      setPlaying(false);
      cancelAnimationFrame(rafRef.current);
      onPause?.();
    }, [onPause]);

    const restart = useCallback(() => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.pause();
      audio.currentTime = 0;
      cancelAnimationFrame(rafRef.current);
      setPlaying(false);
      lastActiveIndexRef.current = -1;
      for (const el of wordRefs.current) {
        if (el) el.dataset.state = "pending";
      }
      void audio.play().then(() => {
        setPlaying(true);
        onPlayStart?.();
        rafRef.current = requestAnimationFrame(tick);
        void setupAnalyser();
      }).catch(() => {});
    }, [tick, onPlayStart, setupAnalyser]);

    const getCurrentTime = useCallback(() => audioRef.current?.currentTime ?? 0, []);

    useImperativeHandle(ref, () => ({ play, pause, restart, getCurrentTime }), [play, pause, restart, getCurrentTime]);

    const togglePlay = useCallback(() => {
      if (audioRef.current?.paused) play();
      else pause();
    }, [play, pause]);

    /* ── Render ────────────────────────────────────────────────────────────── */

    return (
      <div className={`${compact ? "flex flex-col" : "flex h-full flex-col"}${className ? ` ${className}` : ""}`}>
        <audio ref={audioRef} src={audioUrl} crossOrigin="anonymous" preload="auto" />

        <p className={`flex-1 font-lector ${textSize} leading-relaxed text-zinc-300`}>
          {words.map((w, i) => (
            <span
              key={`${i}-${w.start}`}
              ref={(el) => { wordRefs.current[i] = el; }}
              data-state="pending"
              className="synced-word"
            >
              {w.word}{" "}
            </span>
          ))}
        </p>

        {!hideControls && (
          <div className="mt-3 flex gap-3">
            <button
              onClick={togglePlay}
              className={`font-sans text-xs transition-colors ${lightControls ? "text-white/40 hover:text-white/70" : "text-zinc-500 hover:text-zinc-300"}`}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? "Pause" : "Play"}
            </button>
            <button
              onClick={restart}
              className={`font-sans text-xs transition-colors ${lightControls ? "text-white/40 hover:text-white/70" : "text-zinc-500 hover:text-zinc-300"}`}
              aria-label="Restart"
            >
              Restart
            </button>
          </div>
        )}
      </div>
    );
  }
);

export default SyncedTranscript;
