export type SourceType =
  | "pdf"
  | "audio"
  | "video"
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
  | "essay"
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
  platform?: string;              // originating platform slug (e.g. "spotify")
  album?: string;
  release_date?: string;
  platforms?: string[];           // all platforms the track is available on
  song_link_url?: string;         // cross-platform song.link aggregator URL
  preview_url?: string;           // 30s Spotify preview MP3 URL (null if unavailable)
  platform_links?: Record<string, string>; // MusicPlatform slug → stream URL

  // Social (Instagram / TikTok / Twitter)
  author_url?: string;        // profile URL of the post author
  like_count?: number;
  media_item_count?: number;

  // PDF
  page_count?: number;
  full_text?: string;

  // AI enrichment
  published_date?: string;       // ISO date string (e.g. "2024-03-15")
  ai_enriched?: boolean;         // true when AI enrichment layer was applied
  ai_enriched_fields?: string[]; // which fields the AI filled in
  confidence_score?: number;     // final confidence score after enrichment

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
  /**
   * URL pipeline only. `hit` = within normal TTL; `stale` = past TTL but within grace
   * (stale-while-revalidate — a background refresh was scheduled); `miss` = full fetch.
   */
  cache_status?: "hit" | "stale" | "miss";
}
