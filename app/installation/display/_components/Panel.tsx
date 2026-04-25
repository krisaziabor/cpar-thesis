"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RecorderName } from "./RecorderName";
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

  // rAF word sync loop
  useEffect(() => {
    const el = audioElRef.current;
    if (!el) return;

    function tick() {
      if (!el || el.paused) return;
      const t = el.currentTime;
      for (let i = 0; i < words.length; i++) {
        const span = wordRefs.current[i];
        if (!span) continue;
        const { start, end } = words[i];
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
      cancelAnimationFrame(rafRef.current);
      onFinishedRef.current();
    });
    el.addEventListener("error", () => {
      cancelAnimationFrame(rafRef.current);
      onErrorRef.current();
    });

    void el.play().then(() => {
      rafRef.current = requestAnimationFrame(tick);
    }).catch(() => {
      onErrorRef.current();
    });

    return () => {
      cancelAnimationFrame(rafRef.current);
      el.pause();
    };
  }, [words]);

  const hasWords = words.length > 0;

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioElRef} src={audioUrl} preload="auto" className="hidden" />

      {/* Transcript display */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{
          maskImage: "linear-gradient(to bottom, black 55%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, black 55%, transparent 100%)",
        }}
      >
        <div className="p-8 pt-16">
          {hasWords ? (
            <p
              className="leading-relaxed text-zinc-800"
              style={{
                fontFamily: '"Lector", serif',
                fontSize: "clamp(0.95rem, 1.8vw, 1.35rem)",
              }}
            >
              {words.map((w, i) => (
                <span
                  key={i}
                  ref={(el) => { wordRefs.current[i] = el; }}
                  data-state="pending"
                  className="transition-none"
                  style={{
                    // CSS data-state driven opacity
                  }}
                >
                  {w.word}{" "}
                </span>
              ))}
            </p>
          ) : (
            <motion.p
              className="text-zinc-800 leading-relaxed"
              style={{
                fontFamily: '"Lector", serif',
                fontSize: "clamp(0.95rem, 1.8vw, 1.35rem)",
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
        span[data-state="pending"] { opacity: 0.15; }
        span[data-state="active"]  { opacity: 1; }
        span[data-state="spoken"]  { opacity: 0.45; }
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
                      fontSize: "clamp(1.4rem, 3.5vw, 3rem)",
                      letterSpacing: "-0.05em",
                      lineHeight: 0.95,
                      color: "black",
                    }}
                  >
                    {record.title}
                  </p>
                  <p
                    className="absolute max-w-[85%]"
                    style={{
                      ...l.creator,
                      fontFamily: '"DieGrotesk", sans-serif',
                      fontWeight: 700,
                      fontSize: "clamp(0.9rem, 2.2vw, 1.8rem)",
                      letterSpacing: "-0.05em",
                      lineHeight: 0.95,
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
            {/* Title */}
            <div className="absolute top-8 left-8 right-8">
              <p
                className="text-black leading-tight"
                style={{
                  fontFamily: '"LectorBold", serif',
                  fontSize: "clamp(1rem, 2.2vw, 1.8rem)",
                  letterSpacing: "-0.04em",
                  opacity: 0.7,
                }}
              >
                {record.title}
              </p>
            </div>

            {/* Transcript */}
            {record.voice_recording_url ? (
              <div className="absolute inset-0 pt-20">
                <TestimonyPlayer
                  audioUrl={record.voice_recording_url}
                  words={record.timed_transcript ?? []}
                  transcript={record.transcript}
                  panelIndex={panelIndex}
                  audio={audio}
                  onFinished={() => {
                    const go = hasThumbnailOnly || hasMedia ? "mediaFlash" : "outro";
                    onPhaseCompleteRef.current(panelIndex, "testimony");
                  }}
                  onError={() => onPhaseCompleteRef.current(panelIndex, "testimony")}
                />
              </div>
            ) : (
              // No audio — show static transcript and advance after a brief delay
              <div className="absolute inset-0 pt-20 p-8 overflow-hidden">
                <p className="text-zinc-800 leading-relaxed" style={{ fontFamily: '"Lector", serif', fontSize: "clamp(0.95rem, 1.8vw, 1.35rem)" }}>
                  {record.transcript}
                </p>
              </div>
            )}

            {/* Recorder name */}
            {record.added_by && (
              <div className="absolute bottom-8 left-8">
                <RecorderName name={record.added_by} />
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
                panelIndex={panelIndex}
                audio={audio}
                onEnded={() => onPhaseCompleteRef.current(panelIndex, "media")}
                onError={() => setMediaError(true)}
              />
            )}
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
