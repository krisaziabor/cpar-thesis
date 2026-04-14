"use client";

import { useState, useRef } from "react";
import type { MetadataResult, SourceType } from "@/lib/metadata/types";
import MusicPlayer from "@/components/MusicPlayer";
import { useAuth } from "@/lib/auth-context";
import { ref as storageRef, deleteObject } from "firebase/storage";
import { storage } from "@/lib/firebase";

function isDownloadableUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return /(?:^|\.)(?:tiktok\.com|twitter\.com|x\.com|instagram\.com)$/.test(hostname);
  } catch {
    return false;
  }
}

type MediaStatus = "idle" | "loading" | "success" | "error";

// ─── Source type badge ────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<SourceType, string> = {
  pdf: "PDF",
  audio: "Audio",
  video: "Video",
  doi: "DOI / Scholarly",
  youtube: "YouTube",
  music: "Music",
  url: "Generic URL",
  image: "Image",
  news: "News",
  instagram: "Instagram",
  tiktok: "TikTok",
  twitter: "Twitter / X",
  unknown: "Unknown",
};

const SOURCE_COLORS: Record<SourceType, string> = {
  pdf: "bg-red-100 text-red-800",
  audio: "bg-indigo-100 text-indigo-800",
  video: "bg-violet-100 text-violet-800",
  doi: "bg-blue-100 text-blue-800",
  youtube: "bg-rose-100 text-rose-800",
  music: "bg-green-100 text-green-800",
  url: "bg-gray-100 text-gray-700",
  image: "bg-purple-100 text-purple-800",
  news: "bg-amber-100 text-amber-800",
  instagram: "bg-pink-100 text-pink-800",
  tiktok: "bg-cyan-100 text-cyan-800",
  twitter: "bg-sky-100 text-sky-800",
  unknown: "bg-gray-100 text-gray-500",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function MetadataLab() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"url" | "file">("url");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MetadataResult | null>(null);
  const [rawOpen, setRawOpen] = useState(false);
  const [sourceMetaOpen, setSourceMetaOpen] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Media download state
  const [mediaStatus, setMediaStatus] = useState<MediaStatus>("idle");
  const [mediaFileUrl, setMediaFileUrl] = useState<string | null>(null);
  const [mediaStoragePath, setMediaStoragePath] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [mediaRemoving, setMediaRemoving] = useState(false);
  const [mediaTotalCount, setMediaTotalCount] = useState<number | null>(null);

  async function handleDownloadMedia() {
    if (!user) return;
    setMediaStatus("loading");
    setMediaFileUrl(null);
    setMediaStoragePath(null);
    setMediaError(null);
    setMediaTotalCount(null);
    try {
      const idToken = await user.getIdToken();
      const itemId = `lab-${Date.now()}`;
      const res = await fetch("/api/media/upload-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, itemId, idToken }),
      });
      const data = await res.json() as { downloadUrl?: string; storagePath?: string; error?: string; totalMediaCount?: number };
      if (!res.ok || data.error) {
        setMediaError(data.error ?? `HTTP ${res.status}`);
        setMediaStatus("error");
      } else {
        setMediaFileUrl(data.downloadUrl ?? null);
        setMediaStoragePath(data.storagePath ?? null);
        if (data.totalMediaCount) setMediaTotalCount(data.totalMediaCount);
        setMediaStatus("success");
      }
    } catch (err) {
      setMediaError(err instanceof Error ? err.message : "Network error");
      setMediaStatus("error");
    }
  }

  async function handleRemoveMedia() {
    if (!mediaStoragePath || !storage) return;
    setMediaRemoving(true);
    try {
      await deleteObject(storageRef(storage, mediaStoragePath));
      setMediaStatus("idle");
      setMediaFileUrl(null);
      setMediaStoragePath(null);
    } catch (err) {
      setMediaError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setMediaRemoving(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setRawOpen(false);
    setMediaStatus("idle");
    setMediaFileUrl(null);
    setMediaStoragePath(null);
    setMediaError(null);
    setMediaTotalCount(null);

    try {
      let res: Response;

      if (tab === "file" && file) {
        const fd = new FormData();
        fd.append("file", file);
        res = await fetch("/api/metadata", {
          method: "POST",
          body: fd,
        });
      } else {
        res = await fetch("/api/metadata", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, refresh: true }),
        });
      }

      const data: MetadataResult = await res.json();
      setResult(data);
    } catch (err) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setLoading(false);
    }
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped) setFile(dropped);
  }

  function copyJson() {
    if (result) navigator.clipboard.writeText(JSON.stringify(result, null, 2));
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Metadata Lab</h1>
          <p className="mt-1 text-sm text-gray-500">
            Test the metadata extraction pipeline. Paste a URL or upload a PDF.
          </p>
        </div>

        {/* Pipeline documentation */}
        <details className="group bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <summary className="cursor-pointer px-5 py-4 flex items-center justify-between list-none select-none hover:bg-gray-50 transition-colors">
            <span className="text-sm font-medium text-gray-700">How the pipeline works</span>
            <span className="text-gray-400 transition-transform group-open:rotate-180 text-xs">▼</span>
          </summary>
          <div className="px-5 pb-5 pt-1 space-y-5 text-sm text-gray-600 border-t border-gray-100">

            {/* Handler routing */}
            <div>
              <p className="font-medium text-gray-800 mb-2">Handler routing</p>
              <p className="text-xs text-gray-500 mb-2">
                URLs are classified before any fetch. Specific handlers run for known source types;
                everything else falls through to the generic OG scraper.
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                {[
                  ["PDF", "File upload or direct .pdf URL"],
                  ["DOI / Scholarly", "doi.org, arxiv.org, major academic publishers"],
                  ["YouTube", "youtube.com, youtu.be"],
                  ["Music", "Spotify, Apple Music, SoundCloud, Bandcamp, etc."],
                  ["Instagram / TikTok / Twitter", "Platform oEmbed endpoints"],
                  ["News / Essay", "Substack, Medium, Ghost — JSON-LD + article:* OG tags"],
                  ["Image", "Uploaded image file — EXIF + sharp thumbnail"],
                  ["Generic URL", "Everything else — Open Graph scraper + AI fallback"],
                ].map(([label, desc]) => (
                  <div key={label} className="contents">
                    <span className="text-gray-700 font-medium">{label}</span>
                    <span className="text-gray-400">{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Confidence scoring */}
            <div>
              <p className="font-medium text-gray-800 mb-2">Confidence scoring <span className="text-gray-400 font-normal">(generic URL only)</span></p>
              <p className="text-xs text-gray-500 mb-2">
                After the OG scrape, each result is scored 0–1. Scores below 0.5 trigger
                AI enrichment. Creator unknown also triggers AI regardless of score.
              </p>
              <div className="rounded-lg bg-gray-50 border border-gray-200 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left px-3 py-2 text-gray-500 font-medium">Signal</th>
                      <th className="text-left px-3 py-2 text-gray-500 font-medium">Condition</th>
                      <th className="text-right px-3 py-2 text-gray-500 font-medium">Score</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {[
                      ["Title", "Present, ≥ 5 chars, not a URL or generic bad title", "+0.30"],
                      ["Creator", 'Non-empty and not "Unknown"', "+0.20"],
                      ["Description", "Present and longer than 20 characters", "+0.20"],
                      ["Thumbnail", "Any thumbnail URL present", "+0.15"],
                      ["Date", "Published year or date present", "+0.15"],
                    ].map(([signal, condition, score]) => (
                      <tr key={signal}>
                        <td className="px-3 py-2 font-medium text-gray-700">{signal}</td>
                        <td className="px-3 py-2 text-gray-500">{condition}</td>
                        <td className="px-3 py-2 text-right font-mono text-gray-700">{score}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-100">
                      <td className="px-3 py-2 font-medium text-gray-700" colSpan={2}>Max</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-gray-900">1.00</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* AI enrichment */}
            <div>
              <p className="font-medium text-gray-800 mb-2">
                AI enrichment{" "}
                <span className="inline-block text-[10px] px-1 py-px rounded bg-violet-100 text-violet-600 font-medium leading-none align-middle">AI</span>
              </p>
              <p className="text-xs text-gray-500 mb-1.5">
                When triggered, the page HTML is fetched, stripped of nav/footer/script/style,
                truncated to ~3,000 tokens, and sent to <span className="font-mono">claude-haiku-4-5-20251001</span> with
                the existing scraped metadata for context. The model returns structured JSON;
                the pipeline merges it field-by-field.
              </p>
              <div className="text-xs space-y-1 text-gray-500">
                <p><span className="font-medium text-gray-700">Triggers:</span> confidence score &lt; 0.5, or creator is unknown</p>
                <p><span className="font-medium text-gray-700">Timeout:</span> 5 s — on failure, scraped result is used as-is</p>
                <p><span className="font-medium text-gray-700">Fields filled:</span> title, creator, description, published date, content type</p>
                <p><span className="font-medium text-gray-700">Merge rules:</span> AI wins on missing/garbage values; scraped wins on description length and thumbnail</p>
                <p><span className="font-medium text-gray-700">Caching:</span> all URL results cached in Firestore for 30 days keyed on normalised URL (tracking params stripped)</p>
              </div>
            </div>

          </div>
        </details>

        {/* Input card */}
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            {(["url", "file"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-5 py-3 text-sm font-medium transition-colors ${
                  tab === t
                    ? "border-b-2 border-gray-900 text-gray-900"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {t === "url" ? "URL" : "File Upload"}
              </button>
            ))}
          </div>

          <div className="p-5 space-y-4">
            {tab === "url" ? (
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://doi.org/10.1038/... or https://youtube.com/watch?v=... or any URL"
                className="w-full px-3 py-2.5 text-sm text-gray-900 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent placeholder-gray-400"
                autoFocus
              />
            ) : (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-gray-400 transition-colors"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf,image/*"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                {file ? (
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-gray-900">{file.name}</p>
                    <p className="text-xs text-gray-500">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-sm text-gray-600">
                      Drop a PDF here or click to browse
                    </p>
                    <p className="text-xs text-gray-400">PDF or image file</p>
                  </div>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || (tab === "url" ? !url.trim() : !file)}
              className="w-full py-2.5 text-sm font-medium bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Extracting metadata…" : "Extract Metadata"}
            </button>
          </div>
        </form>

        {/* Loading skeleton */}
        {loading && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-4 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-24" />
            <div className="flex gap-4">
              <div className="w-20 h-28 bg-gray-200 rounded" />
              <div className="flex-1 space-y-3">
                <div className="h-5 bg-gray-200 rounded w-3/4" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
                <div className="h-4 bg-gray-200 rounded w-1/3" />
                <div className="flex gap-2 mt-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-6 bg-gray-200 rounded-full w-16" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        {!loading && result && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Status bar */}
            <div
              className={`flex items-center justify-between px-5 py-3 border-b border-gray-100 ${
                result.success ? "bg-green-50" : "bg-red-50"
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    result.success ? "bg-green-500" : "bg-red-500"
                  }`}
                />
                <span className="text-sm font-medium text-gray-800">
                  {result.success ? "Success" : "Failed"}
                </span>
                {result.source_type && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${SOURCE_COLORS[result.source_type]}`}
                  >
                    {SOURCE_LABELS[result.source_type]}
                  </span>
                )}
              </div>
              <button
                onClick={copyJson}
                className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
              >
                Copy JSON
              </button>
            </div>

            {result.success && result.data ? (
              <div className="p-5 space-y-5">
                {/* Main metadata */}
                <div className="flex gap-4">
                  {/* Thumbnail */}
                  {(result.data.thumbnail_url || result.data.thumbnail_base64) && (
                    <div className="flex-shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={result.data.thumbnail_base64 ?? result.data.thumbnail_url}
                        alt="thumbnail"
                        className="w-24 h-32 object-cover rounded-lg border border-gray-200"
                      />
                    </div>
                  )}

                  {/* Fields */}
                  <div className="flex-1 min-w-0 space-y-2">
                    {(() => {
                      const aiFields = new Set(result.data.source_metadata.ai_enriched_fields ?? []);
                      const wasAI = (field: string) => aiFields.has(field);
                      return (<>
                    <h2 className="text-base font-semibold leading-snug flex items-center gap-1.5">
                      <span className={wasAI("title") ? "text-violet-900" : "text-gray-900"}>
                        {result.data.title}
                      </span>
                      {wasAI("title") && (
                        <span className="text-[10px] px-1 py-px rounded bg-violet-100 text-violet-600 font-medium leading-none shrink-0">
                          AI
                        </span>
                      )}
                    </h2>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                      <Field label="Creator" value={result.data.creator} ai={wasAI("creator")} />
                      <Field label="Type" value={result.data.type} ai={wasAI("type")} />
                      {result.data.source_metadata.confidence_score != null && (
                        <Field
                          label="Confidence"
                          value={`${Math.round(result.data.source_metadata.confidence_score * 100)}%`}
                        />
                      )}
                      {result.data.source_metadata.year && (
                        <Field
                          label={result.data.source_metadata.source_type === "music" ? "Release year" : "Year"}
                          value={String(result.data.source_metadata.year)}
                          ai={wasAI("year")}
                        />
                      )}
                      {result.data.source_metadata.doi && (
                        <Field label="DOI" value={result.data.source_metadata.doi} mono />
                      )}
                      {result.data.source_metadata.journal && (
                        <Field label="Journal" value={result.data.source_metadata.journal} />
                      )}
                      {result.data.source_metadata.publisher && (
                        <Field label="Publisher" value={result.data.source_metadata.publisher} />
                      )}
                      {result.data.source_metadata.page_count && (
                        <Field label="Pages" value={`${result.data.source_metadata.page_count} pages`} />
                      )}
                      {result.data.source_metadata.album && (
                        <Field label="Album title" value={result.data.source_metadata.album} />
                      )}
                      {result.data.source_metadata.platform && (
                        <Field label="Platform" value={result.data.source_metadata.platform} />
                      )}
                      {result.data.source_metadata.song_link_url && (
                        <Field label="song.link" value={result.data.source_metadata.song_link_url} />
                      )}
                      {result.data.source_metadata.channel && (
                        <Field label="Channel" value={result.data.source_metadata.channel} />
                      )}
                      {result.data.source_metadata.duration_seconds != null && (
                        <Field
                          label="Duration"
                          value={formatDuration(result.data.source_metadata.duration_seconds)}
                        />
                      )}
                      {result.data.source_metadata.view_count != null && (
                        <Field
                          label="Views"
                          value={result.data.source_metadata.view_count.toLocaleString()}
                        />
                      )}
                      {result.data.source_metadata.source_type === "news" &&
                        typeof (result.data.source_metadata.raw as Record<string, unknown> | undefined)?.readingTime === "number" && (
                          <Field
                            label="Reading time"
                            value={`~${(result.data.source_metadata.raw as Record<string, unknown>).readingTime} min`}
                          />
                        )}
                    </div>

                    {/* Tags */}
                    {result.data.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {result.data.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    </>);
                    })()}

                    {/* External link */}
                    {result.data.link && (
                      <a
                        href={result.data.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block text-xs text-blue-600 hover:underline truncate max-w-full"
                      >
                        {result.data.link}
                      </a>
                    )}
                  </div>
                </div>

                {/* Music player */}
                {result.data.source_metadata.source_type === "music" && (
                  <div className="border border-gray-200 rounded-lg p-4">
                    <MusicPlayer
                      previewUrl={result.data.source_metadata.preview_url}
                      platformLinks={result.data.source_metadata.platform_links}
                      songLinkUrl={result.data.source_metadata.song_link_url}
                    />
                  </div>
                )}

                {/* Description / abstract */}
                {result.data.source_metadata.description && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                      {result.data.source_metadata.doi ? "Abstract" : "Description"}
                      {result.data.source_metadata.ai_enriched_fields?.includes("description") && (
                        <span className="text-[10px] px-1 py-px rounded bg-violet-100 text-violet-600 font-medium leading-none">
                          AI
                        </span>
                      )}
                    </p>
                    <p className={`text-sm leading-relaxed line-clamp-5 ${result.data.source_metadata.ai_enriched_fields?.includes("description") ? "text-violet-800" : "text-gray-700"}`}>
                      {result.data.source_metadata.description}
                    </p>
                  </div>
                )}

                {/* YouTube download URL */}
                {result.data.video_download_url && (
                  <div className="p-3 bg-rose-50 rounded-lg border border-rose-100">
                    <p className="text-xs font-medium text-rose-700 mb-1">
                      Direct video URL (temporary CDN link)
                    </p>
                    <p className="text-xs text-rose-600 font-mono break-all line-clamp-2">
                      {result.data.video_download_url}
                    </p>
                    <p className="text-xs text-rose-500 mt-1">
                      Use this URL to upload the video to Firebase Storage.
                    </p>
                  </div>
                )}

                {/* Media download (TikTok / X / Instagram) */}
                {tab === "url" && isDownloadableUrl(url) && (
                  <div className="border border-gray-200 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-gray-700">Download media to Storage</p>
                      {mediaStatus === "idle" && (
                        <button
                          onClick={handleDownloadMedia}
                          disabled={!user}
                          className="text-xs px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          Download
                        </button>
                      )}
                      {mediaStatus === "loading" && (
                        <span className="text-xs text-gray-500 animate-pulse">Uploading…</span>
                      )}
                    </div>

                    {mediaStatus === "success" && mediaFileUrl && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                          <span className="text-xs font-medium text-green-700">Upload successful</span>
                        </div>
                        {mediaTotalCount && mediaTotalCount > 1 && (
                          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                            This post has {mediaTotalCount} media items — only the first was saved.
                          </p>
                        )}
                        <p className="text-xs text-gray-500 font-mono break-all bg-gray-50 rounded px-2 py-1.5 border border-gray-200">
                          {mediaFileUrl}
                        </p>
                        <button
                          onClick={handleRemoveMedia}
                          disabled={mediaRemoving}
                          className="text-xs px-3 py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          {mediaRemoving ? "Removing…" : "Remove from Storage"}
                        </button>
                      </div>
                    )}

                    {mediaStatus === "error" && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                          <span className="text-xs font-medium text-red-700">Upload failed</span>
                        </div>
                        <p className="text-xs text-red-600 font-mono break-all bg-red-50 rounded px-2 py-1.5 border border-red-100">
                          {mediaError}
                        </p>
                        <button
                          onClick={handleDownloadMedia}
                          className="text-xs px-3 py-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                        >
                          Retry
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* PDF full text preview */}
                {result.data.full_text && (
                  <details className="group">
                    <summary className="cursor-pointer text-sm font-medium text-gray-600 hover:text-gray-900 list-none flex items-center gap-1.5">
                      <span className="transition-transform group-open:rotate-90">▶</span>
                      Full text preview
                    </summary>
                    <div className="mt-2 max-h-40 overflow-y-auto rounded-lg bg-gray-50 p-3 text-xs text-gray-600 font-mono leading-relaxed border border-gray-200">
                      {result.data.full_text.slice(0, 2000)}
                      {result.data.full_text.length > 2000 && "…"}
                    </div>
                  </details>
                )}

                {/* Source metadata */}
                <details open={sourceMetaOpen} onToggle={(e) => setSourceMetaOpen((e.target as HTMLDetailsElement).open)}>
                  <summary className="cursor-pointer text-sm font-medium text-gray-600 hover:text-gray-900 list-none flex items-center gap-1.5">
                    <span className={`transition-transform ${sourceMetaOpen ? "rotate-90" : ""}`}>
                      ▶
                    </span>
                    Source metadata
                  </summary>
                  <div className="mt-2 rounded-lg bg-gray-50 border border-gray-200 divide-y divide-gray-100">
                    {Object.entries(result.data.source_metadata)
                      .filter(([k, v]) => k !== "raw" && k !== "full_text" && v != null)
                      .map(([k, v]) => (
                        <div key={k} className="flex gap-3 px-3 py-2">
                          <span className="text-xs font-medium text-gray-400 w-28 flex-shrink-0">
                            {k}
                          </span>
                          <span className="text-xs text-gray-700 font-mono break-all">
                            {typeof v === "object" ? JSON.stringify(v) : String(v)}
                          </span>
                        </div>
                      ))}
                  </div>
                </details>

                {/* Raw JSON */}
                <details open={rawOpen} onToggle={(e) => setRawOpen((e.target as HTMLDetailsElement).open)}>
                  <summary className="cursor-pointer text-sm font-medium text-gray-600 hover:text-gray-900 list-none flex items-center gap-1.5">
                    <span className={`transition-transform ${rawOpen ? "rotate-90" : ""}`}>▶</span>
                    Raw JSON
                  </summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-gray-900 text-green-400 text-xs p-4 leading-relaxed">
                    {JSON.stringify(
                      {
                        ...result,
                        data: {
                          ...result.data,
                          // truncate large fields for display
                          full_text: result.data?.full_text
                            ? result.data.full_text.slice(0, 500) + "…"
                            : undefined,
                          thumbnail_base64: result.data?.thumbnail_base64
                            ? "[base64 PNG — truncated]"
                            : undefined,
                          source_metadata: {
                            ...result.data?.source_metadata,
                            full_text: result.data?.source_metadata?.full_text
                              ? "[truncated]"
                              : undefined,
                            raw: result.data?.source_metadata?.raw
                              ? "[raw API response — see full JSON]"
                              : undefined,
                          },
                        },
                      },
                      null,
                      2
                    )}
                  </pre>
                </details>
              </div>
            ) : (
              // Error state
              <div className="p-5">
                <p className="text-sm text-red-600">{result.error}</p>
              </div>
            )}
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap gap-2">
          {(Object.entries(SOURCE_LABELS) as [SourceType, string][])
            .filter(([k]) => k !== "unknown")
            .map(([type, label]) => (
              <span
                key={type}
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${SOURCE_COLORS[type]}`}
              >
                {label}
              </span>
            ))}
        </div>
      </div>
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function Field({
  label,
  value,
  mono = false,
  ai = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  ai?: boolean;
}) {
  return (
    <div className="min-w-0">
      <span className="text-xs text-gray-400">
        {label}:{" "}
        {ai && (
          <span
            className="inline-block text-[10px] px-1 py-px rounded bg-violet-100 text-violet-600 font-medium leading-none align-middle mr-0.5"
            title="Filled in by AI"
          >
            AI
          </span>
        )}
      </span>
      <span className={`text-xs ${ai ? "text-violet-800" : "text-gray-700"} ${mono ? "font-mono" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
