"use client";

import type { InstallationMediaFile } from "@/lib/types";

type Props = {
  file: InstallationMediaFile;
  onReplace: () => void;
  onRemove: () => void;
  removing?: boolean;
};

function formatBytes(b: number) {
  if (b <= 0) return null;
  if (b >= 1024 * 1024 * 1024) return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (b >= 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024).toFixed(0)} KB`;
}

function formatDate(ts: unknown): string {
  if (!ts) return "";
  if (typeof ts === "object" && ts !== null && "toDate" in ts) {
    return (ts as { toDate: () => Date }).toDate().toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  }
  return "";
}

export function FilePreview({ file, onReplace, onRemove, removing }: Props) {
  const sizeLabel = formatBytes(file.fileSize);
  const dateLabel = formatDate(file.uploadedAt);
  const ownershipLabel = file.isOwnedFile ? "Uploaded" : "Linked from record";

  return (
    <div className="space-y-3">
      {/* Media preview */}
      <div className="rounded-lg overflow-hidden bg-zinc-900 border border-zinc-800">
        {file.fileType === "audio" && (
          <div className="p-4">
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio controls src={file.fileUrl} className="w-full h-10" />
          </div>
        )}
        {file.fileType === "video" && (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video controls src={file.fileUrl} className="w-full max-h-48 object-contain" />
        )}
        {file.fileType === "image" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={file.fileUrl} alt={file.fileName} className="w-full max-h-48 object-contain" />
        )}
        {file.fileType === "pdf" && (
          <div className="p-4 space-y-2">
            {/* Show first page image if pdfData is available */}
            {file.pdfData?.pages?.[0]?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={file.pdfData.pages[0].imageUrl}
                alt="Page 1"
                className="w-full max-h-48 object-contain"
              />
            ) : (
              <div className="flex items-center justify-center h-24 text-zinc-600 text-sm">
                PDF
              </div>
            )}
            {file.pdfData && (
              <p className="text-xs text-zinc-500 text-center">
                {file.pdfData.pageCount} {file.pdfData.pageCount === 1 ? "page" : "pages"} ·{" "}
                {file.pdfData.totalWordCount.toLocaleString()} words
              </p>
            )}
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="text-xs text-zinc-500 space-y-0.5">
        <div className="truncate text-zinc-300">{file.fileName}</div>
        <div className="flex items-center gap-2 flex-wrap">
          {sizeLabel && <span>{sizeLabel}</span>}
          {sizeLabel && <span>·</span>}
          <span>{file.fileType}</span>
          {dateLabel && <><span>·</span><span>linked {dateLabel}</span></>}
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <span className={[
            "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
            file.isOwnedFile
              ? "bg-zinc-800 text-zinc-400"
              : "bg-blue-950/60 text-blue-400",
          ].join(" ")}>
            {ownershipLabel}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onReplace}
          className="flex-1 rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
        >
          Replace
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          className="flex-1 rounded border border-red-900/60 px-3 py-1.5 text-xs text-red-400 hover:border-red-700 hover:text-red-300 transition-colors disabled:opacity-50"
        >
          {removing ? "Removing…" : "Remove"}
        </button>
      </div>
    </div>
  );
}
