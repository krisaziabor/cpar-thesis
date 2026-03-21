/**
 * Tier 2 stub handlers — architecture is wired in, implementations pending.
 */

import type { CanonItemMetadata } from "../types";
import { fetchUrlMetadata } from "./url";

export async function fetchImageMetadata(
  _buffer: Buffer,
  filename: string
): Promise<CanonItemMetadata> {
  // TODO: EXIF extraction, multi-size thumbnails via sharp
  return {
    title: filename.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
    type: "other",
    creator: "Unknown",
    tags: [],
    source_metadata: {
      source_type: "image",
      raw: { filename },
    },
  };
}

export async function fetchNewsMetadata(url: string): Promise<CanonItemMetadata> {
  // TODO: enhanced scraping for major publications, Substack, Medium, Ghost
  return fetchUrlMetadata(url);
}
