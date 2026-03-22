"use client";

import { useState, useRef } from "react";
import type { MetadataResult, SourceType } from "@/lib/metadata/types";

// ─── Source type badge ────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<SourceType, string> = {
  pdf: "PDF",
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
  const [tab, setTab] = useState<"url" | "file">("url");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MetadataResult | null>(null);
  const [rawOpen, setRawOpen] = useState(false);
  const [sourceMetaOpen, setSourceMetaOpen] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    setRawOpen(false);

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
          body: JSON.stringify({ url }),
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
                    <h2 className="text-base font-semibold text-gray-900 leading-snug">
                      {result.data.title}
                    </h2>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                      <Field label="Creator" value={result.data.creator} />
                      <Field label="Type" value={result.data.type} />
                      {result.data.source_metadata.confidence_score != null && (
                        <Field
                          label="Confidence"
                          value={`${Math.round(result.data.source_metadata.confidence_score * 100)}%${result.data.source_metadata.ai_enriched ? " (AI enriched)" : ""}`}
                        />
                      )}
                      {result.data.source_metadata.year && (
                        <Field label="Year" value={String(result.data.source_metadata.year)} />
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
                        <Field label="Album" value={result.data.source_metadata.album} />
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

                {/* Description / abstract */}
                {result.data.source_metadata.description && (
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
                      {result.data.source_metadata.doi ? "Abstract" : "Description"}
                    </p>
                    <p className="text-sm text-gray-700 leading-relaxed line-clamp-5">
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
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <span className="text-xs text-gray-400">{label}: </span>
      <span className={`text-xs text-gray-700 ${mono ? "font-mono" : ""}`}>
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
