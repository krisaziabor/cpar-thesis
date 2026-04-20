import type { CanonItemMetadata, SourceType } from "../types";
import { ffprobeBuffer } from "../ffprobe";

interface MediaFileInput {
  name: string;
  type: string;
  buffer: Buffer;
}

function titleFromFileName(name: string): string {
  const withoutExt = name.replace(/\.[^/.]+$/, "").trim();
  if (!withoutExt) return "Untitled record";
  return withoutExt.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function sourceTypeToItemType(sourceType: SourceType): CanonItemMetadata["type"] {
  if (sourceType === "audio") return "song";
  if (sourceType === "video") return "film";
  return "other";
}

function extFromFileName(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "bin";
}

export async function fetchMediaFileMetadata(
  file: MediaFileInput,
  sourceType: "audio" | "video"
): Promise<CanonItemMetadata> {
  const probe = await ffprobeBuffer(file.buffer, extFromFileName(file.name));

  const tags: string[] = [];
  if (probe?.video_codec) tags.push(probe.video_codec);
  if (probe?.audio_codec) tags.push(probe.audio_codec);
  if (probe?.width && probe?.height) tags.push(`${probe.width}×${probe.height}`);

  return {
    title: titleFromFileName(file.name),
    type: sourceTypeToItemType(sourceType),
    creator: "Unknown creator",
    tags: tags.slice(0, 8),
    source_metadata: {
      source_type: sourceType,
      duration_seconds: probe?.duration_seconds,
      raw: {
        file_name: file.name,
        file_type: file.type,
        ffprobe: probe,
      },
    },
  };
}
