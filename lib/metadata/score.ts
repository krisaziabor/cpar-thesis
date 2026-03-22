import type { CanonItemMetadata } from "./types";

// Confidence threshold below which AI enrichment fires.
// Override via METADATA_AI_THRESHOLD env var (0–1).
export const AI_CONFIDENCE_THRESHOLD = parseFloat(
  process.env.METADATA_AI_THRESHOLD ?? "0.5"
);

/**
 * Returns a confidence score between 0 and 1 for scraped metadata.
 * Scoring:
 *   title (good, not garbage)  +0.30
 *   creator (non-empty, not "Unknown") +0.20
 *   description (>20 chars)            +0.20
 *   thumbnail present                  +0.15
 *   published date present             +0.15
 */
export function scoreMetadata(metadata: CanonItemMetadata): number {
  let score = 0;

  if (metadata.title && isGoodTitle(metadata.title)) {
    score += 0.3;
  }

  if (
    metadata.creator &&
    metadata.creator !== "Unknown" &&
    metadata.creator.trim().length > 0
  ) {
    score += 0.2;
  }

  if (
    metadata.source_metadata.description &&
    metadata.source_metadata.description.length > 20
  ) {
    score += 0.2;
  }

  if (metadata.thumbnail_url || metadata.thumbnail_base64) {
    score += 0.15;
  }

  if (
    metadata.source_metadata.year ||
    metadata.source_metadata.published_date
  ) {
    score += 0.15;
  }

  return Math.min(1, score);
}

function isGoodTitle(title: string): boolean {
  const t = title.trim().toLowerCase();
  if (t.length < 5) return false;
  if (t.startsWith("http") || t.startsWith("www.")) return false;
  const BAD = [
    "untitled",
    "untitled document",
    "home",
    "index",
    "page not found",
    "404",
    "403",
    "error",
    "loading...",
    "welcome",
  ];
  return !BAD.includes(t);
}
