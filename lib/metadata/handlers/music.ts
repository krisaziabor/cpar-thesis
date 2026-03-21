import type { CanonItemMetadata, SourceMetadata } from "../types";

// ─── Odesli / song.link API ───────────────────────────────────────────────────
// Free, no API key required. Rate limit: ~10 req/s.
// Docs: https://odesli.co/

const ODESLI_BASE = "https://api.song.link/v1-alpha.1/links";

interface OdesliEntity {
  id: string;
  type: "song" | "album";
  title?: string;
  artistName?: string;
  thumbnailUrl?: string;
  thumbnailWidth?: number;
  thumbnailHeight?: number;
  apiProvider?: string;
  platforms?: string[];
}

interface OdesliResponse {
  entityUniqueId: string;
  userCountry: string;
  pageUrl: string;
  entitiesByUniqueId: Record<string, OdesliEntity>;
  linksByPlatform: Record<string, { url: string; nativeAppUriMobile?: string }>;
}

// Mapping from Odesli platform slug → human-readable name used as tags
const PLATFORM_LABELS: Record<string, string> = {
  spotify: "Spotify",
  itunes: "Apple Music",
  appleMusic: "Apple Music",
  youtube: "YouTube",
  youtubeMusic: "YouTube Music",
  soundcloud: "SoundCloud",
  tidal: "Tidal",
  deezer: "Deezer",
  amazonMusic: "Amazon Music",
  pandora: "Pandora",
  napster: "Napster",
};

// Detect which platform a URL belongs to (returned as source_metadata.platform)
function detectPlatform(url: string): string {
  const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  if (hostname.includes("spotify")) return "spotify";
  if (hostname.includes("apple.com") || hostname.includes("itunes")) return "apple_music";
  if (hostname.includes("music.youtube")) return "youtube_music";
  if (hostname.includes("soundcloud")) return "soundcloud";
  if (hostname.includes("bandcamp")) return "bandcamp";
  if (hostname.includes("tidal")) return "tidal";
  if (hostname.includes("deezer")) return "deezer";
  if (hostname.includes("amazon")) return "amazon_music";
  if (hostname.includes("song.link") || hostname.includes("odesli")) return "song_link";
  return "music";
}

export async function fetchMusicMetadata(url: string): Promise<CanonItemMetadata> {
  const apiUrl = `${ODESLI_BASE}?url=${encodeURIComponent(url)}&userCountry=US`;

  const res = await fetch(apiUrl, {
    headers: { "User-Agent": "Kanon/1.0 (https://kanon.app)" },
  });

  if (!res.ok) {
    throw new Error(`Odesli API error ${res.status} for URL: ${url}`);
  }

  const data: OdesliResponse = await res.json();

  // The "root" entity is the one matching the submitted URL
  const entity = data.entitiesByUniqueId[data.entityUniqueId];

  if (!entity) {
    throw new Error("Odesli returned no entity data");
  }

  const platform = detectPlatform(url);

  // Build cross-platform URL list as tags (recognizable platform names)
  const platformTags = Object.keys(data.linksByPlatform)
    .map((p) => PLATFORM_LABELS[p])
    .filter((label): label is string => Boolean(label));

  const sourceMetadata: SourceMetadata = {
    source_type: "music",
    platform,
    album: entity.type === "album" ? entity.title : undefined,
    platforms: Object.keys(data.linksByPlatform),
    song_link_url: data.pageUrl,
    raw: data as unknown as Record<string, unknown>,
  };

  return {
    title: entity.title ?? "Unknown Track",
    type: "song",
    creator: entity.artistName ?? "Unknown Artist",
    // Prefer song.link as the canonical link — works across all platforms
    link: data.pageUrl,
    tags: platformTags.slice(0, 6),
    thumbnail_url: entity.thumbnailUrl,
    source_metadata: sourceMetadata,
  };
}
