"use client";

import type { Item } from "@/lib/types";
import { getDisplayThumbnail } from "@/lib/installationMedia";

type Props = { item: Item };

export function PreviewStrip({ item }: Props) {
  const thumbnailUrl = getDisplayThumbnail(item);
  const hasFile = !!item.installationMedia?.file;
  const fileType = item.installationMedia?.file?.fileType;

  const typeIcon =
    fileType === "audio" ? "♫" :
    fileType === "video" ? "▶" :
    fileType === "image" ? "⬛" : null;

  return (
    <div className="flex items-center gap-4 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
      <div className="text-xs text-zinc-500 shrink-0">Installation preview</div>

      {/* Panel mockup */}
      <div className="relative h-16 w-28 shrink-0 rounded border border-zinc-700 bg-zinc-900 overflow-hidden">
        {thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-zinc-700 text-xs">
            no thumbnail
          </div>
        )}
        {typeIcon && (
          <div className="absolute bottom-1 right-1 rounded bg-black/70 px-1 py-0.5 text-[10px] text-white/70">
            {typeIcon}
          </div>
        )}
      </div>

      {/* Status summary */}
      <div className="min-w-0 space-y-0.5">
        <div className="truncate text-sm text-zinc-200">{item.title}</div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-500">
          <span>
            Media:{" "}
            <span className={hasFile ? "text-green-400" : "text-zinc-600"}>
              {hasFile
                ? `${item.installationMedia!.file!.fileType} · ${item.installationMedia!.file!.fileName}`
                : "none (uses testimony)"}
            </span>
          </span>
          <span>
            Thumbnail:{" "}
            <span className={thumbnailUrl ? "text-green-400" : "text-zinc-600"}>
              {item.installationMedia?.thumbnail?.source === "custom"
                ? "custom"
                : item.installationMedia?.thumbnail?.source === "native"
                ? "native"
                : item.installationMedia?.thumbnail === null
                ? "none"
                : thumbnailUrl
                ? "native (fallback)"
                : "none"}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
