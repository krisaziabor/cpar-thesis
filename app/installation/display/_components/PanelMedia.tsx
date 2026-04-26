"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
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
  title: string;
  creator: string;
  addedBy: string;
  panelIndex: 0 | 1 | 2;
  audio: InstallationAudio | null;
  dimmed?: boolean;
  onEnded: () => void;
  onError: () => void;
}

// ── PDF page cycler ───────────────────────────────────────────────────────────

function PdfDisplay({ file, onEnded }: { file: InstallationMediaFile; onEnded: () => void }) {
  const pages = useMemo(() => file.pdfData?.pages ?? [], [file]);
  const [pageIdx, setPageIdx] = useState(0);
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  useEffect(() => {
    if (pages.length === 0) { onEndedRef.current(); return; }
    const dwell = pdfPageDwellMs(pages[pageIdx]?.wordCount ?? 0);
    console.log(`[Kanon] PDF page ${pageIdx + 1}/${pages.length} | wordCount=${pages[pageIdx]?.wordCount ?? 0} | dwell=${dwell}ms`);
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

// ── Audio text display (replaces thumbnail for mp3 files) ─────────────────────

function firstNameFallback(nameOrEmail: string): string {
  if (nameOrEmail.includes("@")) {
    const local = nameOrEmail.split("@")[0];
    const first = local.split(/[._-]/)[0];
    return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  }
  return nameOrEmail.split(/\s+/)[0];
}

function AudioTextDisplay({
  src,
  title,
  creator,
  addedBy,
  autoPlay = true,
  onEnded,
  onError,
}: {
  src: string;
  title: string;
  creator: string;
  addedBy: string;
  autoPlay?: boolean;
  onEnded: () => void;
  onError: () => void;
}) {
  const onEndedRef = useRef(onEnded);
  const onErrorRef = useRef(onError);
  onEndedRef.current = onEnded;
  onErrorRef.current = onError;

  const [resolvedName, setResolvedName] = useState(() => firstNameFallback(addedBy));

  useEffect(() => {
    if (!db || !addedBy) return;
    let cancelled = false;
    async function resolve() {
      if (!db) return;
      try {
        if (addedBy.includes("@")) {
          const snap = await getDocs(query(collection(db, "users"), where("email", "==", addedBy)));
          if (!cancelled && !snap.empty) {
            const name = snap.docs[0].data().name as string | undefined;
            if (name) setResolvedName(name.split(/\s+/)[0]);
          }
        } else {
          const snap = await getDoc(doc(db, "users", addedBy));
          if (!cancelled && snap.exists()) {
            const name = snap.data().name as string | undefined;
            if (name) setResolvedName(name.split(/\s+/)[0]);
          }
        }
      } catch { /* keep fallback */ }
    }
    void resolve();
    return () => { cancelled = true; };
  }, [addedBy]);

  // Random non-overlapping positions for title, creator, name — computed once on mount
  const positions = useMemo(() => {
    const placed: Array<[number, number]> = [];
    return [title, creator, resolvedName].map(() => {
      let top: number, left: number, att = 0;
      do {
        top = 14 + Math.random() * 58;
        left = 8 + Math.random() * 55;
        att++;
      } while (att < 30 && placed.some(([t, l]) => Math.abs(t - top) < 22 && Math.abs(l - left) < 22));
      placed.push([top, left]);
      return { top: `${top.toFixed(1)}%`, left: `${left.toFixed(1)}%` };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // computed once on mount

  const textStyle: React.CSSProperties = {
    fontFamily: '"DieGrotesk", sans-serif',
    fontSize: "clamp(1.1rem, 2vw, 1.6rem)",
    letterSpacing: "-0.03em",
    color: "black",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "86%",
    display: "block",
  };

  return (
    <div className="relative w-full h-full">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        src={src}
        autoPlay={autoPlay}
        onEnded={autoPlay ? () => onEndedRef.current() : undefined}
        onError={() => onErrorRef.current()}
        className="hidden"
      />
      {[title, creator, resolvedName].map((text, i) => (
        <div key={i} className="absolute" style={positions[i]}>
          <span style={textStyle}>{text}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function PanelMedia({ file, thumbnailUrl, title, creator, addedBy, panelIndex, audio, dimmed, onEnded, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onEndedRef = useRef(onEnded);
  const onErrorRef = useRef(onError);
  onEndedRef.current = onEnded;
  onErrorRef.current = onError;

  // ── No media: thumbnail hold ──
  if (!file) {
    if (thumbnailUrl) {
      return <ThumbnailHold thumbnailUrl={thumbnailUrl} holdMs={dimmed ? 86_400_000 : THUMBNAIL_ONLY_HOLD_MS} onEnded={dimmed ? () => {} : onEnded} />;
    }
    if (!dimmed) setTimeout(onEnded, 100);
    return null;
  }

  if (file.fileType === "pdf") {
    return <PdfDisplay file={file} onEnded={dimmed ? () => {} : onEnded} />;
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
          loop={!!dimmed}
          muted={!!dimmed}
          onEnded={dimmed ? undefined : () => onEndedRef.current()}
          onError={dimmed ? undefined : () => onErrorRef.current()}
        />
      </div>
    );
  }

  if (file.fileType === "audio") {
    return (
      <AudioTextDisplay
        src={file.fileUrl}
        title={title}
        creator={creator}
        addedBy={addedBy}
        autoPlay={!dimmed}
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
          onLoad={dimmed ? undefined : () => {
            const t = setTimeout(onEnded, IMAGE_HOLD_DURATION_MS);
            return () => clearTimeout(t);
          }}
          onError={dimmed ? undefined : () => onErrorRef.current()}
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
