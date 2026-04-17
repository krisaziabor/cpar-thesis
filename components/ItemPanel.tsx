"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  addItemResponse,
  subscribeToItem,
  subscribeToItemResponses,
  subscribeToItems,
  subscribeToItemConnections,
  updateItem,
} from "@/lib/items";
import {
  saveToKanon,
  removeFromKanon,
  subscribeToKanonSaveStatus,
  subscribeToItemHolders,
} from "@/lib/kanon";
import { useNavStatus } from "@/lib/nav-status-context";
import type { Item, Connection, ItemResponse, MusicPlatform } from "@/lib/types";
import MusicPlayer from "@/components/MusicPlayer";
import AudioPlayer from "@/components/AudioPlayer";
import AudioRecorder from "@/components/AudioRecorder";
import MinimalPdfViewer from "@/components/MinimalPdfViewer";
import { getUserProfile } from "@/lib/users";
import { usePanelHistory } from "@/lib/panel-history-context";
import {
  formatFirestoreDate,
  formatMediaTime,
  guessMediaType,
} from "@/lib/format";
import FloatingNavClearance from "@/components/ui/FloatingNavClearance";

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const { startProgress: startNavProgress } = useNavStatus();
  const { navigatePanel } = usePanelHistory();
  const [item, setItem] = useState<Item | null | undefined>(undefined);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [connections, setConnections] = useState<Array<Connection & { itemIds: string[] }>>([]);
  const [itemResponses, setItemResponses] = useState<ItemResponse[]>([]);
  const [kanonSaveId, setKanonSaveId] = useState<string | null>(null);
  const [savingKanon, setSavingKanon] = useState(false);
  const [preferredPlatform, setPreferredPlatform] = useState<MusicPlatform | undefined>(undefined);
  const [addedByName, setAddedByName] = useState<string | null>(null);
  const [holdUsers, setHoldUsers] = useState<string[]>([]);
  const [activeHoldUserName, setActiveHoldUserName] = useState<string | null>(null);
  const [isResponding, setIsResponding] = useState(false);
  const [responseBlob, setResponseBlob] = useState<Blob | null>(null);
  const [savingResponse, setSavingResponse] = useState(false);
  const [responseError, setResponseError] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState({
    title: "",
    description: "",
    mediaDate: "",
    type: "",
    creator: "",
    link: "",
    tags: "",
  });
  const [saveEditError, setSaveEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => subscribeToItem(itemId, setItem), [itemId]);
  useEffect(() => subscribeToItems(setAllItems), []);
  useEffect(() => subscribeToItemConnections(itemId, setConnections), [itemId]);
  useEffect(() => subscribeToItemResponses(itemId, setItemResponses), [itemId]);

  useEffect(() => {
    if (!user?.email) return;
    return subscribeToKanonSaveStatus(user.email, "item", itemId, setKanonSaveId);
  }, [user?.email, itemId]);
  useEffect(() => subscribeToItemHolders(itemId, setHoldUsers), [itemId]);

  useEffect(() => {
    if (!user?.email) return;
    getUserProfile(user.email).then((p) => {
      if (p?.preferred_music_platform) setPreferredPlatform(p.preferred_music_platform);
    });
  }, [user?.email]);

  useEffect(() => {
    if (!item?.added_by) {
      setAddedByName(null);
      return;
    }
    getUserProfile(item.added_by).then((profile) => {
      setAddedByName(profile?.name ?? null);
    });
  }, [item?.added_by]);

  const isEditRequested = searchParams.get("itemEdit") === "1";
  const itemEditAction = searchParams.get("itemEditAction");
  const holdUserParam = searchParams.get("holdUser");
  const isOwner = !!user?.email && !!item && user.email === item.added_by;
  const activeHoldUser = holdUserParam || holdUsers[0] || null;
  const showHoldContextNarrative = !item?.voice_recording_url && !!activeHoldUser;

  useEffect(() => {
    if (!activeHoldUser) {
      setActiveHoldUserName(null);
      return;
    }
    getUserProfile(activeHoldUser).then((profile) => {
      setActiveHoldUserName(profile?.name ?? null);
    });
  }, [activeHoldUser]);

  useEffect(() => {
    if (isEditRequested && isOwner && !isEditing) {
      startEditing();
    }
    if (!isEditRequested && isEditing) {
      setIsEditing(false);
      setSaveEditError("");
    }
  }, [isEditRequested, isOwner, isEditing]);

  useEffect(() => {
    if (itemEditAction !== "save") return;
    if (!isEditing) return;
    void handleSaveEdit();
  }, [itemEditAction, isEditing]);

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

  function clearEditParam() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("itemEdit");
    params.delete("itemEditAction");
    router.push(params.toString() ? `/?${params.toString()}` : "/");
  }

  function clearEditActionParam() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("itemEditAction");
    router.push(params.toString() ? `/?${params.toString()}` : "/");
  }

  async function handleSubmitItemResponse() {
    if (!user?.email || !responseBlob) return;
    setSavingResponse(true);
    setResponseError("");
    try {
      await addItemResponse(itemId, responseBlob, user.email);
      setResponseBlob(null);
      setIsResponding(false);
    } catch (err) {
      setResponseError(err instanceof Error ? err.message : "Failed to submit response.");
    } finally {
      setSavingResponse(false);
    }
  }

  function startEditing() {
    if (!item) return;
    setEditDraft({
      title: item.title ?? "",
      description: item.description ?? "",
      mediaDate: item.media_date ?? "",
      type: item.type ?? "",
      creator: item.creator ?? "",
      link: item.link ?? "",
      tags: Array.isArray(item.tags) ? item.tags.join(", ") : "",
    });
    setSaveEditError("");
    setIsEditing(true);
  }

  async function handleSaveEdit() {
    if (!isOwner) return;
    if (!editDraft.title.trim() || !editDraft.creator.trim() || !editDraft.mediaDate.trim()) {
      setSaveEditError("Title, creator, and original media date are required.");
      return;
    }
    setSavingEdit(true);
    setSaveEditError("");
    try {
      await updateItem(itemId, {
        title: editDraft.title.trim(),
        description: editDraft.description.trim(),
        media_date: editDraft.mediaDate.trim(),
        type: editDraft.type.trim().toLowerCase(),
        creator: editDraft.creator.trim(),
        ...(editDraft.link.trim() ? { link: editDraft.link.trim() } : {}),
        tags: editDraft.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      setIsEditing(false);
      clearEditParam();
    } catch (err) {
      setSaveEditError(err instanceof Error ? err.message : "Failed to save.");
      clearEditActionParam();
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div>
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
          {!isEditing ? (
            <>
              <h2 className="font-lector text-xl leading-tight text-zinc-50">
                {item.title}
              </h2>
              {item.description && (
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{item.description}</p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
                <span>{item.creator}</span>
                {item.media_date && (
                  <>
                    <span>·</span>
                    <span>{item.media_date}</span>
                  </>
                )}
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
            </>
          ) : (
            <div className="space-y-2">
              <input
                type="text"
                value={editDraft.title}
                onChange={(e) => setEditDraft((prev) => ({ ...prev, title: e.target.value }))}
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none"
                placeholder="Title"
              />
              <textarea
                rows={3}
                value={editDraft.description}
                onChange={(e) => setEditDraft((prev) => ({ ...prev, description: e.target.value }))}
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none"
                placeholder="Description"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={editDraft.type}
                  onChange={(e) => setEditDraft((prev) => ({ ...prev, type: e.target.value }))}
                  className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none"
                  placeholder="Type"
                />
                <input
                  type="text"
                  value={editDraft.creator}
                  onChange={(e) => setEditDraft((prev) => ({ ...prev, creator: e.target.value }))}
                  className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none"
                  placeholder="Creator"
                />
              </div>
              <input
                type="text"
                value={editDraft.mediaDate}
                onChange={(e) => setEditDraft((prev) => ({ ...prev, mediaDate: e.target.value }))}
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none"
                placeholder="Original media date (required)"
              />
              <input
                type="url"
                value={editDraft.link}
                onChange={(e) => setEditDraft((prev) => ({ ...prev, link: e.target.value }))}
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none"
                placeholder="External link"
              />
              <input
                type="text"
                value={editDraft.tags}
                onChange={(e) => setEditDraft((prev) => ({ ...prev, tags: e.target.value }))}
                className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none"
                placeholder="Tags (comma separated)"
              />
              {saveEditError && <p className="text-xs text-red-400">{saveEditError}</p>}
            </div>
          )}
        </div>

        {!isEditing && (
          <>
            {/* Actions */}
            <div className="flex items-center gap-2">
              <Link
                href={`/connect?itemId=${itemId}`}
            className="flex items-center rounded-full bg-zinc-100 px-4 py-1.5 font-lector text-xs text-zinc-900 transition-colors hover:bg-white"
              >
                Connect
              </Link>
              <button
                type="button"
                onClick={() => {
                  setIsResponding((prev) => !prev);
                  setResponseError("");
                }}
            className="flex items-center gap-1.5 rounded-full border border-zinc-600 bg-zinc-900 px-4 py-1.5 font-lector text-xs text-zinc-100 transition-colors hover:border-zinc-500 hover:bg-zinc-800"
              >
                Respond
              </button>
              <button
                disabled={savingKanon}
                onClick={async () => {
                  if (!user?.email) return;
                  setSavingKanon(true);
                  if (kanonSaveId) {
                    try {
                      await removeFromKanon(kanonSaveId);
                    } finally {
                      setSavingKanon(false);
                    }
                  } else {
                    const thumbs = item?.thumbnail_url ? [item.thumbnail_url] : [];
                    const { resolve, reject } = startNavProgress({
                      id: `hold-${Date.now()}`,
                      text: "Adding to Hold",
                      thumbnails: thumbs.length > 0 ? thumbs : undefined,
                      showProgress: true,
                      durationMs: 2000,
                    });
                    try {
                      await saveToKanon(user.email, "item", itemId);
                      resolve("Added to Hold");
                    } catch (err) {
                      reject(err instanceof Error ? err.message : "Something went wrong, try again");
                    } finally {
                      setSavingKanon(false);
                    }
                  }
                }}
            className={`flex items-center gap-1.5 rounded-full border bg-zinc-950 px-4 py-1.5 font-lector text-xs transition-colors disabled:opacity-60 ${
                  kanonSaveId
                    ? "border-zinc-500 text-zinc-200 hover:border-zinc-400 hover:text-zinc-100"
                    : "border-zinc-700 text-zinc-300 hover:border-zinc-600 hover:text-zinc-100"
                }`}
              >
                <span>{kanonSaveId ? "×" : "+"}</span>
                {kanonSaveId ? "In Hold" : "Add to Hold"}
              </button>
            </div>

            {isResponding && (
              <div className="space-y-3 rounded-md border border-zinc-800 px-3 py-3">
                <p className="font-lector text-sm text-zinc-300">Respond to this record</p>
                <AudioRecorder
                  onRecorded={(blob) => setResponseBlob(blob)}
                  prompt="What does this record bring up for you?"
                />
                {responseError && <p className="text-xs text-red-500">{responseError}</p>}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsResponding(false);
                      setResponseBlob(null);
                      setResponseError("");
                    }}
                    className="text-xs text-zinc-500 hover:text-zinc-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={!responseBlob || savingResponse}
                    onClick={() => void handleSubmitItemResponse()}
                    className="rounded-full border border-zinc-600 px-3 py-1.5 text-xs text-zinc-100 transition-colors hover:border-zinc-500 hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {savingResponse ? "Submitting…" : "Submit response"}
                  </button>
                </div>
              </div>
            )}

            <div className="border-t border-zinc-800" />
          </>
        )}

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

        {!isEditing && (
          <>
            {/* Narrative */}
            <div className="space-y-3">
              <p className="font-lector text-sm text-zinc-400">Narrative</p>
              {!showHoldContextNarrative && item.voice_recording_url ? (
                <AudioPlayer src={item.voice_recording_url} />
              ) : (
                <>
                  {showHoldContextNarrative ? (
                    <div className="space-y-2">
                      <p className="text-xs text-zinc-500">
                        {(activeHoldUserName ?? activeHoldUser)?.trim()} added this record to their Hold.
                      </p>
                      {activeHoldUser && (
                        <button
                          type="button"
                          onClick={() =>
                            navigatePanel(
                              `/?panel=holds&holdUser=${encodeURIComponent(activeHoldUser)}`,
                              item?.title ?? "Record"
                            )
                          }
                          className="inline-flex font-lector text-xs text-zinc-200 transition-colors hover:text-white"
                        >
                          View this person&apos;s hold
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-600">No audio recorded.</p>
                  )}
                </>
              )}
              <p className="text-xs text-zinc-600">
                {addedByName ?? item.added_by} · {formatFirestoreDate(item.created_at)}
              </p>
            </div>

            <div className="border-t border-zinc-800" />

            {/* Connections */}
            <div className="space-y-3">
              <p className="font-lector text-sm text-zinc-400">Connections</p>
              {connections.length === 0 ? (
                <div className="space-y-1">
                  <p className="text-xs text-zinc-600">No connections yet.</p>
                  <Link href={`/connect?itemId=${itemId}`} className="font-lector text-[12px] text-zinc-100 hover:text-white">
                    Add one
                  </Link>
                </div>
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
                            {otherTitles.length > 0 ? otherTitles.join(" · ") : "connection"}
                          </p>
                          <p className="text-xs text-zinc-600">
                            {conn.created_by} · {formatFirestoreDate(conn.created_at)}
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
          </>
        )}

        <FloatingNavClearance />
      </div>
    </div>
  );
}
