"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { subscribeToItem } from "@/lib/items";
import {
  uploadInstallationFile,
  uploadInstallationThumbnail,
  removeInstallationFile,
  removeInstallationThumbnail,
  setThumbnailSource,
  getDisplayThumbnail,
  getNativeFileInfo,
  linkExistingFile,
  processAndLinkPdf,
  ACCEPTED_FILE_EXTS,
  ACCEPTED_THUMBNAIL_EXTS,
  MAX_FILE_BYTES,
  MAX_THUMBNAIL_BYTES,
} from "@/lib/installationMedia";
import type { Item } from "@/lib/types";
import { DropZone } from "../_components/DropZone";
import { FilePreview } from "../_components/FilePreview";
import { UploadProgress } from "../_components/UploadProgress";
import { ThumbnailSourceSelector } from "../_components/ThumbnailSourceSelector";
import { PreviewStrip } from "../_components/PreviewStrip";

type ThumbSource = "native" | "custom" | "none";

function formatDate(ts: unknown): string {
  if (!ts) return "—";
  if (typeof ts === "object" && ts !== null && "toDate" in ts) {
    return (ts as { toDate: () => Date }).toDate().toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  }
  return "—";
}

function getNativeThumbnail(item: Item): string | null {
  const type = (item.type ?? "").toLowerCase();
  if (["image", "photo", "photograph", "artwork"].includes(type)) {
    return item.media_url ?? item.thumbnail_url ?? null;
  }
  return item.thumbnail_url ?? null;
}

function resolveCurrentThumbSource(item: Item): ThumbSource {
  const im = item.installationMedia;
  if (!im) return "native";
  if (im.thumbnail === null) return "none";
  if (im.thumbnail?.source === "custom") return "custom";
  if (im.thumbnail?.source === "native") return "native";
  return "native";
}

export default function InstallationDetailPage() {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const recordId = params.recordId as string;

  const [item, setItem] = useState<Item | null>(null);
  const [itemLoading, setItemLoading] = useState(true);

  // File upload state
  const [fileUploading, setFileUploading] = useState(false);
  const [fileProgress, setFileProgress] = useState(0);
  const [filePendingName, setFilePendingName] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileRemoving, setFileRemoving] = useState(false);

  // Link-existing-file state (covers both instant link and PDF processing)
  const [linking, setLinking] = useState(false);
  const [linkStage, setLinkStage] = useState("");
  const [linkProgress, setLinkProgress] = useState(0);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Thumbnail upload state
  const [thumbUploading, setThumbUploading] = useState(false);
  const [thumbProgress, setThumbProgress] = useState(0);
  const [thumbPendingName, setThumbPendingName] = useState("");
  const [thumbError, setThumbError] = useState<string | null>(null);
  const [thumbSourceSaving, setThumbSourceSaving] = useState(false);

  // Local thumb source selector — kept in sync with item once loaded
  const [thumbSourceLocal, setThumbSourceLocal] = useState<ThumbSource>("native");
  const thumbSourceInitialized = useRef(false);

  const isAdmin = role === "admin";

  useEffect(() => {
    if (loading) return;
    if (!user || !isAdmin) { router.replace("/"); }
  }, [loading, user, isAdmin, router]);

  useEffect(() => {
    if (!isAdmin || !recordId) return;
    return subscribeToItem(recordId, (fetched) => {
      setItem(fetched);
      setItemLoading(false);
      if (!thumbSourceInitialized.current && fetched) {
        setThumbSourceLocal(resolveCurrentThumbSource(fetched));
        thumbSourceInitialized.current = true;
      }
    });
  }, [isAdmin, recordId]);

  if (loading || (!isAdmin && !loading)) return null;

  // ── File handlers ─────────────────────────────────────────────────────────

  async function handleFileUpload(file: File) {
    setFileError(null);
    setFileUploading(true);
    setFileProgress(0);
    setFilePendingName(file.name);
    try {
      await uploadInstallationFile(recordId, file, setFileProgress);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setFileUploading(false);
      setFilePendingName("");
    }
  }

  async function handleFileRemove() {
    setFileError(null);
    setFileRemoving(true);
    try {
      await removeInstallationFile(recordId);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Remove failed.");
    } finally {
      setFileRemoving(false);
    }
  }

  async function handleUseExisting() {
    if (!item) return;
    const native = getNativeFileInfo(item);
    if (!native) return;

    setLinkError(null);
    setLinking(true);
    setLinkStage("");
    setLinkProgress(0);

    try {
      if (native.fileType === "pdf") {
        await processAndLinkPdf(recordId, native.url, native.fileName, (stage, pct) => {
          setLinkStage(stage);
          setLinkProgress(pct);
        });
      } else {
        setLinkStage("Linking…");
        await linkExistingFile(recordId, native.url, native.fileType, native.fileName);
      }
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Failed to link file.");
    } finally {
      setLinking(false);
      setLinkStage("");
      setLinkProgress(0);
    }
  }

  // ── Thumbnail handlers ────────────────────────────────────────────────────

  async function handleThumbSourceChange(source: ThumbSource) {
    setThumbSourceLocal(source);
    if (source === "custom") return; // wait for file upload
    setThumbSourceSaving(true);
    try {
      await setThumbnailSource(recordId, source as "native" | "none");
    } catch (err) {
      setThumbError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setThumbSourceSaving(false);
    }
  }

  async function handleThumbUpload(file: File) {
    setThumbError(null);
    setThumbUploading(true);
    setThumbProgress(0);
    setThumbPendingName(file.name);
    try {
      await uploadInstallationThumbnail(recordId, file, setThumbProgress);
    } catch (err) {
      setThumbError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setThumbUploading(false);
      setThumbPendingName("");
    }
  }

  async function handleThumbRemove() {
    setThumbError(null);
    try {
      await removeInstallationThumbnail(recordId);
      setThumbSourceLocal("native");
    } catch (err) {
      setThumbError(err instanceof Error ? err.message : "Remove failed.");
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (itemLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <span className="text-sm text-zinc-500">Loading…</span>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-sm text-zinc-500">Record not found.</p>
          <Link href="/admin/installation" className="text-sm text-zinc-400 hover:text-white transition-colors">
            ← Back to list
          </Link>
        </div>
      </div>
    );
  }

  const nativeThumbnail = getNativeThumbnail(item);
  const installFile = item.installationMedia?.file ?? null;
  const customThumbFile = item.installationMedia?.thumbnail?.source === "custom"
    ? item.installationMedia.thumbnail
    : null;

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="border-b border-zinc-800 px-6 py-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-lg font-medium truncate">{item.title}</h1>
          <p className="text-sm text-zinc-500 mt-0.5 capitalize">{item.type} · {item.creator}</p>
        </div>
        <div className="shrink-0 flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!item.installationEligible}
              onChange={async (e) => {
                if (!db) return;
                await updateDoc(doc(db, "items", item.id), {
                  installationEligible: e.target.checked,
                });
              }}
              className="accent-white"
            />
            <span className="text-sm text-zinc-400">Include in installation</span>
          </label>
          <Link
            href="/admin/installation"
            className="text-sm text-zinc-500 hover:text-white transition-colors"
          >
            ← Installation
          </Link>
        </div>
      </div>

      {/* Preview strip */}
      <div className="px-6 pt-4">
        <PreviewStrip item={item} />
      </div>

      {/* Body */}
      <div className="flex gap-0 divide-x divide-zinc-800 mt-4">
        {/* ── Left: read-only record context ── */}
        <aside className="w-72 shrink-0 p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-200px)]">
          <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500">Record</h2>

          {/* Native thumbnail / media */}
          {nativeThumbnail ? (
            <div>
              <p className="text-xs text-zinc-600 mb-1.5">Native thumbnail</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={nativeThumbnail}
                alt=""
                className="w-full max-h-40 rounded object-cover border border-zinc-800"
              />
            </div>
          ) : (
            <div className="rounded border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-600">
              No native thumbnail
            </div>
          )}

          {/* Testimony audio */}
          {item.voice_recording_url && (
            <div>
              <p className="text-xs text-zinc-600 mb-1.5">Testimony audio</p>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio controls src={item.voice_recording_url} className="w-full h-9" />
            </div>
          )}

          {/* Transcript */}
          {item.transcript && (
            <div>
              <p className="text-xs text-zinc-600 mb-1.5">Transcript</p>
              <p className="text-xs text-zinc-400 leading-relaxed line-clamp-6">{item.transcript}</p>
            </div>
          )}

          {/* Metadata */}
          <div className="space-y-1.5">
            <p className="text-xs text-zinc-600 mb-1">Metadata</p>
            {[
              ["Type", item.type],
              ["Creator", item.creator],
              ["Date", item.media_date ?? "—"],
              ["Added", formatDate(item.created_at)],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-2 text-xs">
                <span className="text-zinc-600 w-14 shrink-0">{label}</span>
                <span className="text-zinc-300 truncate">{value}</span>
              </div>
            ))}
            {item.link && (
              <div className="flex gap-2 text-xs">
                <span className="text-zinc-600 w-14 shrink-0">URL</span>
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-400 hover:text-white truncate transition-colors"
                >
                  {item.link}
                </a>
              </div>
            )}
            {item.tags?.length > 0 && (
              <div className="flex gap-2 text-xs">
                <span className="text-zinc-600 w-14 shrink-0">Tags</span>
                <span className="text-zinc-300 leading-relaxed">{item.tags.join(", ")}</span>
              </div>
            )}
          </div>
        </aside>

        {/* ── Right: assignment panels ── */}
        <main className="flex-1 p-6 space-y-8 overflow-y-auto max-h-[calc(100vh-200px)]">
          {/* ── Section 1: Active media file ── */}
          <section>
            <div className="mb-3">
              <h2 className="text-sm font-medium text-zinc-200">Active media file</h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Plays after the voice testimony ends. Audio files play as the primary content (e.g. a song); video files play their visual track. Leave empty to end at the testimony.
              </p>
            </div>

            {(fileError || linkError) && (
              <p className="mb-3 rounded border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-400">
                {fileError || linkError}
              </p>
            )}

            {fileUploading ? (
              <UploadProgress fileName={filePendingName} progress={fileProgress} />
            ) : linking ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span className="truncate max-w-[70%]">{linkStage || "Processing…"}</span>
                  <span>{Math.round(linkProgress)}%</span>
                </div>
                <div className="h-1 w-full rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-150"
                    style={{ width: `${linkProgress}%` }}
                  />
                </div>
              </div>
            ) : installFile ? (
              <FilePreview
                file={installFile}
                onReplace={() => document.getElementById("file-replace-input")?.click()}
                onRemove={handleFileRemove}
                removing={fileRemoving}
              />
            ) : (
              <>
                <DropZone
                  accept={ACCEPTED_FILE_EXTS}
                  maxBytes={MAX_FILE_BYTES}
                  label="Drop media file here"
                  hint="Audio (mp3, wav) · Video (mp4, mov, webm) · Image (jpg, png)"
                  onFile={handleFileUpload}
                  onError={(msg) => setFileError(msg)}
                />
                {(() => {
                  const native = getNativeFileInfo(item);
                  if (!native) return null;
                  return (
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex-1 border-t border-zinc-800" />
                      <span className="text-xs text-zinc-600 shrink-0">or</span>
                      <div className="flex-1 border-t border-zinc-800" />
                    </div>
                  );
                })()}
                {(() => {
                  const native = getNativeFileInfo(item);
                  if (!native) return null;
                  const isPdf = native.fileType === "pdf";
                  return (
                    <button
                      type="button"
                      onClick={handleUseExisting}
                      className="mt-3 w-full rounded border border-zinc-700 px-3 py-2.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors text-left"
                    >
                      <span className="font-medium">Use this record&apos;s existing file</span>
                      <span className="block text-zinc-500 mt-0.5 truncate">
                        {native.fileName}
                        {isPdf && " · will render pages"}
                      </span>
                    </button>
                  );
                })()}
              </>
            )}

            {/* Hidden replace input — only needed when file exists */}
            {installFile && !fileUploading && !linking && (
              <input
                id="file-replace-input"
                type="file"
                accept={ACCEPTED_FILE_EXTS}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileUpload(f);
                  e.target.value = "";
                }}
              />
            )}
          </section>

          {/* ── Section 2: Visual anchor ── */}
          <section>
            <div className="mb-3">
              <h2 className="text-sm font-medium text-zinc-200">Visual anchor</h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                What&apos;s visible in the panel during this record&apos;s slot.
              </p>
            </div>

            {thumbError && (
              <p className="mb-3 rounded border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-400">
                {thumbError}
              </p>
            )}

            <ThumbnailSourceSelector
              value={thumbSourceLocal}
              onChange={handleThumbSourceChange}
              nativeUrl={nativeThumbnail}
              disabled={thumbSourceSaving || thumbUploading}
            />

            {thumbSourceSaving && (
              <p className="mt-2 text-xs text-zinc-500">Saving…</p>
            )}

            {/* Custom thumbnail upload / preview */}
            {thumbSourceLocal === "custom" && (
              <div className="mt-4 space-y-3">
                {thumbUploading ? (
                  <UploadProgress fileName={thumbPendingName} progress={thumbProgress} />
                ) : customThumbFile?.fileUrl ? (
                  <div className="space-y-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={customThumbFile.fileUrl}
                      alt=""
                      className="w-full max-h-40 rounded object-cover border border-zinc-800"
                    />
                    <div className="text-xs text-zinc-500">
                      {customThumbFile.fileName ?? "Custom thumbnail"} · uploaded {formatDate(customThumbFile.uploadedAt)}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => document.getElementById("thumb-replace-input")?.click()}
                        className="flex-1 rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        onClick={handleThumbRemove}
                        className="flex-1 rounded border border-red-900/60 px-3 py-1.5 text-xs text-red-400 hover:border-red-700 hover:text-red-300 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                    <input
                      id="thumb-replace-input"
                      type="file"
                      accept={ACCEPTED_THUMBNAIL_EXTS}
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleThumbUpload(f);
                        e.target.value = "";
                      }}
                    />
                  </div>
                ) : (
                  <DropZone
                    accept={ACCEPTED_THUMBNAIL_EXTS}
                    maxBytes={MAX_THUMBNAIL_BYTES}
                    label="Drop thumbnail image here"
                    hint="jpg or png · max 50 MB"
                    onFile={handleThumbUpload}
                    onError={(msg) => setThumbError(msg)}
                  />
                )}
              </div>
            )}

            {/* Show current display thumbnail if native or custom+uploaded */}
            {thumbSourceLocal !== "none" && !thumbUploading && (() => {
              const display = getDisplayThumbnail(item);
              if (!display || thumbSourceLocal === "custom") return null;
              return (
                <div className="mt-3 rounded border border-zinc-800 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={display} alt="" className="w-full max-h-32 object-cover" />
                </div>
              );
            })()}
          </section>
        </main>
      </div>
    </div>
  );
}
