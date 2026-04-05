"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import {
  subscribeToItem,
  subscribeToItems,
  subscribeToItemConnections,
} from "@/lib/items";
import { saveToKanon, removeFromKanon, subscribeToKanonSaveStatus } from "@/lib/kanon";
import type { Item, Connection, MusicPlatform } from "@/lib/types";
import MusicPlayer from "@/components/MusicPlayer";
import AudioPlayer from "@/components/AudioPlayer";
import MinimalPdfViewer from "@/components/MinimalPdfViewer";
import { getUserProfile } from "@/lib/users";

function formatDate(ts: unknown): string {
  if (!ts) return "—";
  if (typeof ts === "object" && ts !== null && "toDate" in ts) {
    return (ts as { toDate: () => Date }).toDate().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  return String(ts);
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

function VideoMediaPlayer({ url, title }: { url: string; title: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

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

    return () => {
      video.removeEventListener("timeupdate", syncState);
      video.removeEventListener("loadedmetadata", syncState);
      video.removeEventListener("durationchange", syncState);
      video.removeEventListener("play", syncState);
      video.removeEventListener("pause", syncState);
      video.removeEventListener("ended", syncState);
      video.removeEventListener("volumechange", syncState);
    };
  }, []);

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
          preload="metadata"
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

export default function ItemPanel({ itemId }: { itemId: string }) {
  const { user } = useAuth();
  const [item, setItem] = useState<Item | null | undefined>(undefined);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [connections, setConnections] = useState<Array<Connection & { itemIds: string[] }>>([]);
  const [kanonSaveId, setKanonSaveId] = useState<string | null>(null);
  const [savingKanon, setSavingKanon] = useState(false);
  const [preferredPlatform, setPreferredPlatform] = useState<MusicPlatform | undefined>(undefined);

  useEffect(() => subscribeToItem(itemId, setItem), [itemId]);
  useEffect(() => subscribeToItems(setAllItems), []);
  useEffect(() => subscribeToItemConnections(itemId, setConnections), [itemId]);

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
  const mediaType = item.media_url ? guessMediaType(item.media_url) : null;

  // Determine top media: video/PDF take priority, then thumbnail, then image
  const topIsVideo = mediaType === "video" && !!item.media_url;
  const topIsPdf = mediaType === "pdf" && !!item.media_url;
  const topThumbnail =
    !topIsVideo &&
    !topIsPdf &&
    (item.thumbnail_url ?? (mediaType === "image" ? item.media_url : null));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.215, 0.61, 0.355, 1] }}
    >
      {/* ─── Top media — full bleed ──────────────────────────── */}
      {topIsVideo && (
        <VideoMediaPlayer url={item.media_url!} title={item.title} />
      )}
      {topIsPdf && (
        <MinimalPdfViewer url={item.media_url!} title={item.title} />
      )}
      {!topIsVideo && topThumbnail && (
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
          <h2 className="font-lector text-xl leading-tight text-zinc-50">
            {item.title}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
            <span>{item.creator}</span>
            {item.source_metadata?.song_link_url && (
              <>
                <span>·</span>
                <a
                  href={item.source_metadata.song_link_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-zinc-300"
                >
                  Stream song ↗
                </a>
              </>
            )}
          </div>
          {tagsDisplay.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {tagsDisplay.map((tag) => (
                <span
                  key={tag}
                  className="border border-zinc-800 px-2 py-0.5 text-xs text-zinc-500"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Link
            href={`/connect?itemId=${itemId}`}
            className="flex items-center gap-1.5 rounded-full bg-zinc-100 px-4 py-1.5 text-xs text-zinc-900 transition-colors hover:bg-white"
          >
            <span className="text-zinc-500">↔</span>
            Connect
          </Link>
          <button
            disabled={savingKanon}
            onClick={async () => {
              if (!user?.email) return;
              setSavingKanon(true);
              try {
                if (kanonSaveId) await removeFromKanon(kanonSaveId);
                else await saveToKanon(user.email, "item", itemId);
              } finally {
                setSavingKanon(false);
              }
            }}
            className={`flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-xs transition-colors disabled:opacity-40 ${
              kanonSaveId
                ? "border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300"
                : "border-zinc-800 text-zinc-600 hover:border-zinc-700 hover:text-zinc-400"
            }`}
          >
            <span>{kanonSaveId ? "✓" : "+"}</span>
            {kanonSaveId ? "In Holding" : "Add to Holding"}
          </button>
        </div>

        <div className="border-t border-zinc-800" />

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

        {/* Narrative */}
        <div className="space-y-3">
          <p className="font-lector text-sm text-zinc-400">Narrative</p>
          {item.voice_recording_url ? (
            <AudioPlayer src={item.voice_recording_url} />
          ) : (
            <p className="text-xs text-zinc-600">No audio recorded.</p>
          )}
          <p className="text-xs text-zinc-600">
            {item.added_by} · {formatDate(item.created_at)}
          </p>
        </div>

        <div className="border-t border-zinc-800" />

        {/* Connections */}
        <div className="space-y-3">
          <p className="font-lector text-sm text-zinc-400">Connections</p>
          {connections.length === 0 ? (
            <p className="text-xs text-zinc-600">
              No connections yet.{" "}
              <Link href={`/connect?itemId=${itemId}`} className="underline underline-offset-2 hover:text-zinc-300">
                Add one
              </Link>
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {connections.map((conn) => {
                const otherIds = conn.itemIds.filter((id) => id !== itemId);
                const otherTitles = otherIds.map(
                  (id) => allItems.find((i) => i.id === id)?.title ?? id
                );
                return (
                  <Link
                    key={conn.id}
                    href={`/connections/${conn.id}`}
                    className="flex items-center justify-between border border-zinc-800 px-4 py-3 hover:border-zinc-700 hover:bg-zinc-900"
                  >
                    <div className="min-w-0 flex flex-col gap-0.5">
                      <p className="truncate text-sm text-zinc-200">
                        {otherTitles.length > 0 ? otherTitles.join(" ↔ ") : "connection"}
                      </p>
                      <p className="text-xs text-zinc-600">
                        {conn.created_by} · {formatDate(conn.created_at)}
                      </p>
                    </div>
                    {conn.audio_url && (
                      <span className="ml-2 shrink-0 text-xs text-zinc-600">♪</span>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom padding for floating nav clearance */}
        <div className="h-16" />
      </div>
    </motion.div>
  );
}
