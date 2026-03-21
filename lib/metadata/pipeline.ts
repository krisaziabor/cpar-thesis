import { classifyUrl, classifyFile } from "./classify";
import { fetchPdfMetadata } from "./handlers/pdf";
import { fetchDoiMetadata } from "./handlers/doi";
import { fetchYouTubeMetadata } from "./handlers/youtube";
import { fetchMusicMetadata } from "./handlers/music";
import { fetchInstagramMetadata, fetchTikTokMetadata, fetchTwitterMetadata } from "./handlers/social";
import { fetchUrlMetadata } from "./handlers/url";
import { fetchImageMetadata } from "./handlers/stubs";
import type { CanonItemMetadata, MetadataResult, SourceType } from "./types";

interface PipelineInput {
  url?: string;
  file?: { buffer: Buffer; name: string; type: string };
}

export async function runMetadataPipeline(
  input: PipelineInput
): Promise<MetadataResult> {
  let sourceType: SourceType = "unknown";

  try {
    let metadata: CanonItemMetadata;

    if (input.file) {
      sourceType = classifyFile(input.file);

      switch (sourceType) {
        case "pdf":
          metadata = await fetchPdfMetadata(input.file.buffer, input.file.name);
          break;
        case "image":
          metadata = await fetchImageMetadata(input.file.buffer, input.file.name);
          break;
        default:
          throw new Error(`Unsupported file type: ${input.file.type}`);
      }
    } else if (input.url) {
      sourceType = classifyUrl(input.url);

      switch (sourceType) {
        case "pdf": {
          const res = await fetch(input.url);
          if (!res.ok) throw new Error(`Could not fetch PDF at ${input.url}`);
          const buf = Buffer.from(await res.arrayBuffer());
          const name = input.url.split("/").pop() ?? "document.pdf";
          metadata = await fetchPdfMetadata(buf, name);
          break;
        }
        case "doi":
          metadata = await fetchDoiMetadata(input.url);
          break;
        case "youtube":
          metadata = await fetchYouTubeMetadata(input.url);
          break;
        case "music":
          metadata = await fetchMusicMetadata(input.url);
          break;
        case "instagram":
          metadata = await fetchInstagramMetadata(input.url);
          break;
        case "tiktok":
          metadata = await fetchTikTokMetadata(input.url);
          break;
        case "twitter":
          metadata = await fetchTwitterMetadata(input.url);
          break;
        case "url":
        default:
          metadata = await fetchUrlMetadata(input.url);
          break;
      }
    } else {
      throw new Error("Either url or file must be provided");
    }

    return { success: true, data: metadata, source_type: sourceType };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
      source_type: sourceType,
    };
  }
}
