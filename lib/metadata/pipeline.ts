import { classifyUrl, classifyFile } from "./classify";
import { fetchPdfMetadata } from "./handlers/pdf";
import { fetchDoiMetadata } from "./handlers/doi";
import { fetchYouTubeMetadata } from "./handlers/youtube";
import { fetchMusicMetadata } from "./handlers/music";
import { fetchInstagramMetadata, fetchTikTokMetadata, fetchTwitterMetadata } from "./handlers/social";
import { fetchUrlMetadata } from "./handlers/url";
import { fetchImageMetadata } from "./handlers/image";
import { fetchNewsMetadata } from "./handlers/news";
import { scoreMetadata, AI_CONFIDENCE_THRESHOLD } from "./score";
import { getCachedMetadata, setCachedMetadata, logEnrichment } from "./cache";
import { aiEnrichMetadata, mergeMetadata } from "./ai-enrich";
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

      // ── Cache check (all URL-based handlers) ─────────────────────────────
      const cached = await getCachedMetadata(input.url);
      if (cached) {
        return { success: true, data: cached, source_type: sourceType };
      }

      // ── Handler dispatch ──────────────────────────────────────────────────
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
        case "news":
          metadata = await fetchNewsMetadata(input.url);
          break;
        case "url":
        default: {
          const scraped = await fetchUrlMetadata(input.url);
          const scoreBeforeAI = scoreMetadata(scraped);
          const creatorUnknown =
            scraped.creator === "Unknown" ||
            scraped.creator === scraped.source_metadata.site_name ||
            scraped.creator.trim() === "";

          if (scoreBeforeAI >= AI_CONFIDENCE_THRESHOLD && !creatorUnknown) {
            // Confident enough — skip AI
            metadata = scraped;
            metadata.source_metadata.confidence_score = scoreBeforeAI;
          } else {
            // Low confidence — attempt AI enrichment
            const t0 = Date.now();
            const aiResult = await aiEnrichMetadata(input.url, scraped);
            const latencyMs = Date.now() - t0;
            const hasAIData = Object.keys(aiResult).length > 0;

            if (hasAIData) {
              const merged = mergeMetadata(scraped, aiResult, input.url);
              const scoreAfterAI = scoreMetadata(merged);
              merged.source_metadata.confidence_score = scoreAfterAI;

              // Fire-and-forget enrichment log
              logEnrichment({
                url: input.url,
                scoreBeforeAI,
                scoreAfterAI,
                aiUsed: true,
                aiImproved: scoreAfterAI > scoreBeforeAI,
                latencyMs,
                model: "claude-haiku-4-5-20251001",
              }).catch(() => {});

              metadata = merged;
            } else {
              // AI returned nothing — use scraped as-is
              metadata = scraped;
              metadata.source_metadata.confidence_score = scoreBeforeAI;

              logEnrichment({
                url: input.url,
                scoreBeforeAI,
                scoreAfterAI: scoreBeforeAI,
                aiUsed: false,
                aiImproved: false,
                latencyMs,
                model: "claude-haiku-4-5-20251001",
              }).catch(() => {});
            }
          }
          break;
        }
      }

      // ── Cache write (URL-based handlers only) ────────────────────────────
      const finalScore = metadata.source_metadata.confidence_score ?? scoreMetadata(metadata);
      const aiEnriched = metadata.source_metadata.ai_enriched ?? false;
      setCachedMetadata(input.url, metadata, aiEnriched, finalScore).catch(() => {});
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
