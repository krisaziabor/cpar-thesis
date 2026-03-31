import type { CanonItemMetadata, SourceMetadata } from "../types";

// ─── Odesli / song.link API ───────────────────────────────────────────────────
// Free, no API key required. Rate limit: ~10 req/s.

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

// Maps Odesli platform keys → our MusicPlatform slugs
const ODESLI_TO_PLATFORM: Record<string, string> = {
  spotify: "spotify",
  appleMusic: "apple_music",
  itunes: "apple_music",
  youtube: "youtube",
  youtubeMusic: "youtube",
  soundcloud: "soundcloud",
  tidal: "tidal",
  amazonMusic: "amazon_music",
  deezer: "deezer",
};

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

// ─── Spotify preview (client credentials) ────────────────────────────────────

// Module-level token cache — survives across requests in the same process
let cachedSpotifyToken: { token: string; expiresAt: number } | null = null;

async function getSpotifyToken(): Promise<string | null> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  // Return cached token if still valid (60s buffer)
  if (cachedSpotifyToken && Date.now() < cachedSpotifyToken.expiresAt - 60_000) {
    return cachedSpotifyToken.token;
  }

  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) return null;
    const data = await res.json() as { access_token: string; expires_in: number };
    cachedSpotifyToken = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    return cachedSpotifyToken.token;
  } catch {
    return null;
  }
}

async function fetchSpotifyPreviewUrl(spotifyUrl: string): Promise<string | null> {
  const token = await getSpotifyToken();
  if (!token) return null;

  const match = spotifyUrl.match(/track\/([A-Za-z0-9]+)/);
  if (!match) return null;

  try {
    const res = await fetch(`https://api.spotify.com/v1/tracks/${match[1]}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json() as { preview_url: string | null };
    return data.preview_url ?? null;
  } catch {
    return null;
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function fetchMusicMetadata(url: string): Promise<CanonItemMetadata> {
  const apiUrl = `${ODESLI_BASE}?url=${encodeURIComponent(url)}&userCountry=US`;

  const res = await fetch(apiUrl, {
    headers: { "User-Agent": "Kanon/1.0 (https://kanon.app)" },
  });

  if (!res.ok) {
    throw new Error(`Odesli API error ${res.status} for URL: ${url}`);
  }

  const data: OdesliResponse = await res.json();
  const entity = data.entitiesByUniqueId[data.entityUniqueId];

  if (!entity) {
    throw new Error("Odesli returned no entity data");
  }

  const platform = detectPlatform(url);

  // Build normalised platform_links (our MusicPlatform slugs → URL)
  const platform_links: Record<string, string> = {};
  for (const [key, val] of Object.entries(data.linksByPlatform)) {
    const slug = ODESLI_TO_PLATFORM[key];
    if (slug && !platform_links[slug]) {
      platform_links[slug] = val.url;
    }
  }

  // Tags from recognisable platform names
  const platformTags = Object.keys(data.linksByPlatform)
    .map((p) => PLATFORM_LABELS[p])
    .filter((label): label is string => Boolean(label));

  // Try to fetch 30s Spotify preview (silent fail)
  const spotifyUrl = data.linksByPlatform.spotify?.url;
  const preview_url = spotifyUrl
    ? (await fetchSpotifyPreviewUrl(spotifyUrl)) ?? undefined
    : undefined;

  const sourceMetadata: SourceMetadata = {
    source_type: "music",
    platform,
    album: entity.type === "album" ? entity.title : undefined,
    platforms: Object.keys(data.linksByPlatform),
    song_link_url: data.pageUrl,
    preview_url,
    platform_links,
    raw: data as unknown as Record<string, unknown>,
  };

  return {
    title: entity.title ?? "Unknown Track",
    type: "song",
    creator: entity.artistName ?? "Unknown Artist",
    link: data.pageUrl,
    tags: platformTags.slice(0, 6),
    thumbnail_url: entity.thumbnailUrl,
    source_metadata: sourceMetadata,
  };
}
