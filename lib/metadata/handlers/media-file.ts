import type { CanonItemMetadata, SourceType } from "../types";

interface MediaFileInput {
  name: string;
  type: string;
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

export async function fetchMediaFileMetadata(
  file: MediaFileInput,
  sourceType: "audio" | "video"
): Promise<CanonItemMetadata> {
  return {
    title: titleFromFileName(file.name),
    type: sourceTypeToItemType(sourceType),
    creator: "Unknown creator",
    tags: [],
    source_metadata: {
      source_type: sourceType,
      raw: {
        file_name: file.name,
        file_type: file.type,
      },
    },
  };
}
