"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PanelMedia } from "./PanelMedia";
import { getDisplayThumbnail } from "@/lib/installationMedia";
import type { InstallationAudio } from "@/lib/installation/audio";
import type { PanelPhase, PanelState } from "@/lib/installation/playback";
import {
  CREATOR_REVEAL_MS,
  MEDIA_FLASH_DURATION_MS,
  OUTRO_DURATION_MS,
} from "@/lib/installation/playback";
import type { TimedWord } from "@/lib/types";

interface Props {
  panelState: PanelState;
  panelIndex: 0 | 1 | 2;
  audio: InstallationAudio | null;
  onPhaseComplete: (panelIndex: 0 | 1 | 2, phase: PanelPhase) => void;
}

const BG = "#F5F5F2";

// ── Testimony player (word-by-word, routes audio through Web Audio) ──────────

interface TestimonyPlayerProps {
  audioUrl: string;
  words: TimedWord[];
  transcript: string;
  panelIndex: 0 | 1 | 2;
  audio: InstallationAudio | null;
  onFinished: () => void;
  onError: () => void;
}

function TestimonyPlayer({
  audioUrl,
  words,
  transcript,
  panelIndex,
  audio,
  onFinished,
  onError,
}: TestimonyPlayerProps) {
  const audioElRef = useRef<HTMLAudioElement>(null);
  const rafRef = useRef(0);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const onFinishedRef = useRef(onFinished);
  const onErrorRef = useRef(onError);
  onFinishedRef.current = onFinished;
  onErrorRef.current = onError;
  wordRefs.current.length = words.length;

  // Keep latest words/transcript accessible inside the mount-only effect via refs
  const wordsRef = useRef(words);
  wordsRef.current = words;
  const transcriptRef = useRef(transcript);
  transcriptRef.current = transcript;

  // Log on mount so we can confirm testimony phase is reached
  useEffect(() => {
    console.log(`[Kanon] TestimonyPlayer mounted | url="${audioUrl}" | words=${words.length} | transcript length=${transcript.length}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // rAF word sync loop + audio playback — empty deps so this never restarts mid-play.
  // words/transcript are accessed via refs to stay current without re-running the effect.
  useEffect(() => {
    const el = audioElRef.current;
    if (!el) return;

    let disposed = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    function finish() {
      if (disposed) return;
      cancelAnimationFrame(rafRef.current);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      onFinishedRef.current();
    }

    function tick() {
      if (!el || el.paused) return;
      const t = el.currentTime;
      const ws = wordsRef.current;
      for (let i = 0; i < ws.length; i++) {
        const span = wordRefs.current[i];
        if (!span) continue;
        const { start, end } = ws[i];
        if (t >= start && t < end) {
          span.dataset.state = "active";
        } else if (t >= end) {
          span.dataset.state = "spoken";
        } else {
          span.dataset.state = "pending";
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    el.addEventListener("ended", () => {
      console.log(`[Kanon] Audio ended naturally | currentTime=${el.currentTime?.toFixed(1)}s | duration=${el.duration?.toFixed(1)}s`);
      finish();
    });
    el.addEventListener("pause", () => {
      if (!disposed && !el.ended) {
        console.log(`[Kanon] Audio paused | currentTime=${el.currentTime?.toFixed(1)}s`);
      }
    });
    el.addEventListener("stalled", () => {
      if (disposed) return;
      console.log(`[Kanon] Audio stalled | currentTime=${el.currentTime?.toFixed(1)}s — retrying play()`);
      void el.play().catch(() => {});
    });
    el.addEventListener("waiting", () => {
      if (!disposed) console.log(`[Kanon] Audio waiting (buffering) | currentTime=${el.currentTime?.toFixed(1)}s`);
    });
    el.addEventListener("error", (e) => {
      if (disposed) return;
      console.error("[Kanon] Audio element error:", e, `currentTime=${el.currentTime?.toFixed(1)}s`);
      cancelAnimationFrame(rafRef.current);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      const readMs = Math.max(12000, transcriptRef.current.length * 55);
      fallbackTimer = setTimeout(() => { if (!disposed) onFinishedRef.current(); }, readMs);
    });

    void el.play().then(() => {
      if (disposed) { el.pause(); return; }
      console.log("[Kanon] Audio play() succeeded");
      rafRef.current = requestAnimationFrame(tick);
    }).catch((err) => {
      if (disposed) return;
      console.error("[Kanon] Audio play() rejected:", err);
      const readMs = Math.max(12000, transcriptRef.current.length * 55);
      fallbackTimer = setTimeout(() => { if (!disposed) onFinishedRef.current(); }, readMs);
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(rafRef.current);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      el.pause();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasWords = words.length > 0;

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioElRef} src={audioUrl} preload="auto" className="hidden" />

      {/* Transcript display */}
      <div
        className="absolute inset-x-0 top-0 bottom-0 overflow-hidden flex flex-col items-center px-6"
        style={{
          maskImage: "linear-gradient(to bottom, transparent 2%, black 10%, black 76%, transparent 97%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 2%, black 10%, black 76%, transparent 97%)",
        }}
      >
        <div className="pt-20 pb-32 w-full max-w-[88%]">
          {hasWords ? (
            <p
              className="leading-relaxed text-zinc-800 text-left"
              style={{
                fontFamily: '"Lector", serif',
                fontSize: "clamp(0.72rem, 1.3vw, 0.92rem)",
              }}
            >
              {words.map((w, i) => (
                <span
                  key={i}
                  ref={(el) => { wordRefs.current[i] = el; }}
                  data-state="pending"
                  className="transition-none"
                >
                  {w.word}{" "}
                </span>
              ))}
            </p>
          ) : (
            <motion.p
              className="text-zinc-800 leading-relaxed text-center"
              style={{
                fontFamily: '"Lector", serif',
                fontSize: "clamp(0.72rem, 1.3vw, 0.92rem)",
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8 }}
            >
              {transcript}
            </motion.p>
          )}
        </div>
      </div>

      {/* Word state styling */}
      <style>{`
        span[data-state="pending"] { opacity: 0.22; }
        span[data-state="active"]  { opacity: 1; }
        span[data-state="spoken"]  { opacity: 0.82; }
      `}</style>
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function Panel({ panelState, panelIndex, audio, onPhaseComplete }: Props) {
  const { phase, record, phaseKey } = panelState;
  const [mediaError, setMediaError] = useState(false);
  const onPhaseCompleteRef = useRef(onPhaseComplete);
  onPhaseCompleteRef.current = onPhaseComplete;

  // Reset error state when record/phase changes
  useEffect(() => { setMediaError(false); }, [phaseKey]);

  // Time-driven phase transitions
  useEffect(() => {
    if (phase === "creatorReveal") {
      const t = setTimeout(() => onPhaseCompleteRef.current(panelIndex, "creatorReveal"), CREATOR_REVEAL_MS);
      return () => clearTimeout(t);
    }
    if (phase === "mediaFlash") {
      const t = setTimeout(() => onPhaseCompleteRef.current(panelIndex, "mediaFlash"), MEDIA_FLASH_DURATION_MS);
      return () => clearTimeout(t);
    }
    if (phase === "outro") {
      const t = setTimeout(() => onPhaseCompleteRef.current(panelIndex, "outro"), OUTRO_DURATION_MS);
      return () => clearTimeout(t);
    }
  }, [phase, phaseKey, panelIndex]);

  // Auto-advance testimony when the record has no audio (static transcript)
  useEffect(() => {
    if (phase !== "testimony" || !record || record.voice_recording_url) return;
    const readMs = Math.max(8000, (record.transcript?.length ?? 0) * 50);
    const t = setTimeout(() => onPhaseCompleteRef.current(panelIndex, "testimony"), readMs);
    return () => clearTimeout(t);
  }, [phase, phaseKey, panelIndex]);

  const thumbnailUrl = record ? getDisplayThumbnail(record) : null;
  const hasMedia = !!(record?.installationMedia?.file);
  const hasThumbnailOnly = !hasMedia && !!thumbnailUrl;

  // ── Blank states ──
  if (phase === "idle" || phase === "synergyHolding") {
    return <div className="w-full h-full" style={{ background: BG }} />;
  }

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: BG }}>
      <AnimatePresence mode="wait">

        {/* CREATOR REVEAL */}
        {phase === "creatorReveal" && record && (
          <motion.div
            key={`creator-${phaseKey}`}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {(() => {
              const seed = record.id.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
              const layouts = [
                { title: { top: "10%", left: "8%" },    creator: { bottom: "16%", right: "8%" } },
                { title: { bottom: "12%", left: "8%" }, creator: { top: "8%",     right: "8%" } },
                { title: { top: "10%", right: "8%" },   creator: { bottom: "16%", left: "8%" } },
                { title: { bottom: "12%", right: "8%" },creator: { top: "8%",     left: "8%" } },
              ] as const;
              const l = layouts[seed % 4];
              return (
                <>
                  <p
                    className="absolute max-w-[85%]"
                    style={{
                      ...l.title,
                      fontFamily: '"LectorBold", serif',
                      fontSize: "clamp(0.8rem, 1.6vw, 1.25rem)",
                      letterSpacing: "-0.04em",
                      lineHeight: 1.0,
                      color: "black",
                    }}
                  >
                    {record.title}
                  </p>
                  <p
                    className="absolute max-w-[85%]"
                    style={{
                      ...l.creator,
                      fontFamily: '"LectorBold", serif',
                      fontSize: "clamp(0.8rem, 1.6vw, 1.25rem)",
                      letterSpacing: "-0.04em",
                      lineHeight: 1.0,
                      color: "black",
                    }}
                  >
                    {record.creator}
                  </p>
                </>
              );
            })()}
          </motion.div>
        )}

        {/* TESTIMONY */}
        {phase === "testimony" && record && (
          <motion.div
            key={`testimony-${phaseKey}`}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Transcript */}
            {record.voice_recording_url ? (
              <div className="absolute inset-0">
                <TestimonyPlayer
                  audioUrl={record.voice_recording_url}
                  words={record.timed_transcript ?? []}
                  transcript={record.transcript}
                  panelIndex={panelIndex}
                  audio={audio}
                  onFinished={() => onPhaseCompleteRef.current(panelIndex, "testimony")}
                  onError={() => onPhaseCompleteRef.current(panelIndex, "testimony")}
                />
              </div>
            ) : (
              // No audio — show static transcript and advance after a brief delay
              <div className="absolute inset-0 p-8 overflow-hidden">
                <p className="text-zinc-800 leading-relaxed" style={{ fontFamily: '"Lector", serif', fontSize: "clamp(0.95rem, 1.8vw, 1.35rem)" }}>
                  {record.transcript}
                </p>
              </div>
            )}
          </motion.div>
        )}

        {/* MEDIA */}
        {phase === "media" && record && (
          <motion.div
            key={`media-${phaseKey}`}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          >
            {mediaError ? (
              // Graceful degradation: skip to outro
              <MediaErrorFallback onComplete={() => onPhaseCompleteRef.current(panelIndex, "media")} />
            ) : (
              <PanelMedia
                file={record.installationMedia?.file ?? null}
                thumbnailUrl={thumbnailUrl}
                title={record.title}
                creator={record.creator}
                addedBy={record.added_by ?? ""}
                panelIndex={panelIndex}
                audio={audio}
                onEnded={() => onPhaseCompleteRef.current(panelIndex, "media")}
                onError={() => setMediaError(true)}
              />
            )}
          </motion.div>
        )}

        {/* SYNERGY MEDIA HOLD — dimmed media persists while next panel plays */}
        {phase === "synergyMediaHold" && record && (
          <motion.div
            key={`synergyhold-${phaseKey}`}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.28 }}
            transition={{ duration: 0.8 }}
          >
            <PanelMedia
              file={record.installationMedia?.file ?? null}
              thumbnailUrl={thumbnailUrl}
              title={record.title}
              creator={record.creator}
              addedBy={record.added_by ?? ""}
              panelIndex={panelIndex}
              audio={audio}
              dimmed
              onEnded={() => {}}
              onError={() => {}}
            />
          </motion.div>
        )}

        {/* OUTRO */}
        {phase === "outro" && (
          <motion.div
            key={`outro-${phaseKey}`}
            className="absolute inset-0"
            style={{ background: BG }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
          />
        )}

      </AnimatePresence>
    </div>
  );
}

function MediaErrorFallback({ onComplete }: { onComplete: () => void }) {
  const ref = useRef(onComplete);
  ref.current = onComplete;
  useEffect(() => {
    const t = setTimeout(() => ref.current(), 1000);
    return () => clearTimeout(t);
  }, []);
  return null;
}
