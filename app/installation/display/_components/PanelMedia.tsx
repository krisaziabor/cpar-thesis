"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { InstallationMediaFile } from "@/lib/types";
import {
  IMAGE_HOLD_DURATION_MS,
  THUMBNAIL_ONLY_HOLD_MS,
  PDF_PAGE_CROSSFADE_MS,
  pdfPageDwellMs,
} from "@/lib/installation/playback";
import type { InstallationAudio } from "@/lib/installation/audio";

interface Props {
  file: InstallationMediaFile | null;
  thumbnailUrl: string | null;
  panelIndex: 0 | 1 | 2;
  audio: InstallationAudio | null;
  onEnded: () => void;
  onError: () => void;
}

// ── PDF page cycler ───────────────────────────────────────────────────────────

function PdfDisplay({ file, onEnded }: { file: InstallationMediaFile; onEnded: () => void }) {
  const pages = file.pdfData?.pages ?? [];
  const [pageIdx, setPageIdx] = useState(0);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  useEffect(() => {
    if (pages.length === 0) { onEndedRef.current(); return; }
    const dwell = pdfPageDwellMs(pages[pageIdx]?.wordCount ?? 0);
    const timer = setTimeout(() => {
      if (pageIdx < pages.length - 1) {
        setPageIdx((p) => p + 1);
      } else {
        onEndedRef.current();
      }
    }, dwell);
    return () => clearTimeout(timer);
  }, [pageIdx, pages]);

  if (pages.length === 0) return null;

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <AnimatePresence mode="sync">
        <motion.img
          key={pageIdx}
          src={pages[pageIdx]?.imageUrl}
          alt={`Page ${pageIdx + 1}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: PDF_PAGE_CROSSFADE_MS / 1000, ease: "linear" }}
          className="max-w-[70%] max-h-full object-contain"
        />
      </AnimatePresence>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function PanelMedia({ file, thumbnailUrl, panelIndex, audio, onEnded, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const onEndedRef = useRef(onEnded);
  const onErrorRef = useRef(onError);
  onEndedRef.current = onEnded;
  onErrorRef.current = onError;

  // ── No media: thumbnail hold ──
  if (!file) {
    if (thumbnailUrl) {
      return <ThumbnailHold thumbnailUrl={thumbnailUrl} holdMs={THUMBNAIL_ONLY_HOLD_MS} onEnded={onEnded} />;
    }
    // No thumbnail either — shouldn't reach PanelMedia in this case, but be safe
    setTimeout(onEnded, 100);
    return null;
  }

  if (file.fileType === "pdf") {
    return <PdfDisplay file={file} onEnded={onEnded} />;
  }

  if (file.fileType === "video") {
    return (
      <div className="w-full h-full flex items-center justify-center">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          src={file.fileUrl}
          className="max-w-[70%] max-h-full object-contain"
          autoPlay
          playsInline
          onEnded={() => onEndedRef.current()}
          onError={() => onErrorRef.current()}
        />
      </div>
    );
  }

  if (file.fileType === "audio") {
    return (
      <AudioWithThumbnail
        audioRef={audioRef}
        src={file.fileUrl}
        thumbnailUrl={thumbnailUrl}
        onEnded={onEnded}
        onError={onError}
      />
    );
  }

  if (file.fileType === "image") {
    return (
      <motion.div
        className="w-full h-full flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={file.fileUrl}
          alt=""
          className="max-w-[70%] max-h-full object-contain"
          onLoad={() => {
            const t = setTimeout(onEnded, IMAGE_HOLD_DURATION_MS);
            return () => clearTimeout(t);
          }}
          onError={() => onErrorRef.current()}
        />
      </motion.div>
    );
  }

  return null;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ThumbnailHold({ thumbnailUrl, holdMs, onEnded }: { thumbnailUrl: string; holdMs: number; onEnded: () => void }) {
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;
  useEffect(() => {
    const t = setTimeout(() => onEndedRef.current(), holdMs);
    return () => clearTimeout(t);
  }, [holdMs]);

  return (
    <motion.div
      className="w-full h-full flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumbnailUrl}
        alt=""
        className="max-w-[25%] object-contain"
      />
    </motion.div>
  );
}

function AudioWithThumbnail({
  audioRef,
  src,
  thumbnailUrl,
  onEnded,
  onError,
}: {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  src: string;
  thumbnailUrl: string | null;
  onEnded: () => void;
  onError: () => void;
}) {
  const onEndedRef = useRef(onEnded);
  const onErrorRef = useRef(onError);
  onEndedRef.current = onEnded;
  onErrorRef.current = onError;

  // Randomly position thumbnail in one of 4 cells within the panel
  const cellRef = useRef(Math.floor(Math.random() * 4));
  const cell = cellRef.current;
  // 2×2 grid: top-left, top-right, bottom-left, bottom-right
  const positions = [
    { top: "15%", left: "10%" },
    { top: "15%", right: "10%" },
    { bottom: "15%", left: "10%" },
    { bottom: "15%", right: "10%" },
  ] as const;
  const pos = positions[cell];

  return (
    <div className="relative w-full h-full">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={audioRef}
        src={src}
        autoPlay
        onEnded={() => onEndedRef.current()}
        onError={() => onErrorRef.current()}
        className="hidden"
      />
      {thumbnailUrl ? (
        <motion.div
          className="absolute"
          style={{ ...pos, maxWidth: "22%" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbnailUrl} alt="" className="w-full object-contain" />
        </motion.div>
      ) : (
        // No thumbnail: show title in a cell (handled by panel, this is just the audio)
        null
      )}
    </div>
  );
}
