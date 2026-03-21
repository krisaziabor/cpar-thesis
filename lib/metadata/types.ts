export type SourceType =
  | "pdf"
  | "doi"
  | "youtube"
  | "music"
  | "url"
  | "image"
  | "news"
  | "instagram"
  | "tiktok"
  | "twitter"
  | "unknown";

export type ItemType =
  | "book"
  | "film"
  | "article"
  | "song"
  | "podcast"
  | "other";

/** Extended metadata stored as source_metadata on an Item document */
export interface SourceMetadata {
  source_type: SourceType;

  // Common
  description?: string;
  site_name?: string;

  // Scholarly (DOI)
  doi?: string;
  abstract?: string;
  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  publisher?: string;
  year?: number;
  isbn?: string;

  // YouTube
  video_id?: string;
  channel?: string;
  channel_id?: string;
  duration_seconds?: number;
  view_count?: number;

  // Music (Odesli/song.link)
  platform?: string;          // originating platform slug (e.g. "spotify")
  album?: string;
  platforms?: string[];       // all platforms the track is available on
  song_link_url?: string;     // cross-platform song.link aggregator URL

  // Social (Instagram / TikTok / Twitter)
  author_url?: string;        // profile URL of the post author

  // PDF
  page_count?: number;
  full_text?: string;

  // Raw API response for debugging / future use
  raw?: Record<string, unknown>;
}

/** Normalized metadata returned by the pipeline before Firestore write */
export interface CanonItemMetadata {
  title: string;
  type: ItemType;
  creator: string;
  link?: string;
  tags: string[];

  /** External image URL (OG image, YouTube thumbnail, etc.) */
  thumbnail_url?: string;
  /** Base64 data-URL for generated thumbnails (e.g. PDF first page) */
  thumbnail_base64?: string;

  /** For PDF: direct video URL from ytdl-core (YouTube) */
  video_download_url?: string;

  /** Full text extracted from PDF */
  full_text?: string;

  source_metadata: SourceMetadata;
}

export interface MetadataResult {
  success: boolean;
  data?: CanonItemMetadata;
  error?: string;
  source_type?: SourceType;
}
