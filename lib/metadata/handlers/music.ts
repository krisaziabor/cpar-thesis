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

interface SpotifyTrackDetails {
  title: string | null;
  creator: string | null;
  thumbnailUrl: string | null;
  spotifyUrl: string | null;
  previewUrl: string | null;
  albumTitle: string | null;
  year: number | null;
  releaseDate: string | null;
}

interface ItunesTrackDetails {
  albumTitle: string | null;
  year: number | null;
  releaseDate: string | null;
}

async function fetchSpotifyTrackDetails(spotifyUrl: string): Promise<SpotifyTrackDetails> {
  const token = await getSpotifyToken();
  if (!token) {
    return {
      title: null,
      creator: null,
      thumbnailUrl: null,
      spotifyUrl: null,
      previewUrl: null,
      albumTitle: null,
      year: null,
      releaseDate: null,
    };
  }

  const match = spotifyUrl.match(/track\/([A-Za-z0-9]+)/);
  if (!match) {
    return {
      title: null,
      creator: null,
      thumbnailUrl: null,
      spotifyUrl: null,
      previewUrl: null,
      albumTitle: null,
      year: null,
      releaseDate: null,
    };
  }

  try {
    const res = await fetch(`https://api.spotify.com/v1/tracks/${match[1]}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return {
        title: null,
        creator: null,
        thumbnailUrl: null,
        spotifyUrl: null,
        previewUrl: null,
        albumTitle: null,
        year: null,
        releaseDate: null,
      };
    }
    const data = await res.json() as {
      name?: string;
      artists?: Array<{ name?: string }>;
      external_urls?: { spotify?: string };
      preview_url: string | null;
      album?: { name?: string; release_date?: string; images?: Array<{ url?: string }> };
    };

    const albumTitle =
      typeof data.album?.name === "string" && data.album.name.trim()
        ? data.album.name.trim()
        : null;

    const releaseDate = data.album?.release_date ?? "";
    const parsedYear = Number.parseInt(releaseDate.slice(0, 4), 10);
    const year = Number.isFinite(parsedYear) ? parsedYear : null;

    return {
      title: data.name?.trim() || null,
      creator: data.artists?.map((artist) => artist.name?.trim()).filter(Boolean).join(", ") || null,
      thumbnailUrl: data.album?.images?.[0]?.url?.trim() || null,
      spotifyUrl: data.external_urls?.spotify?.trim() || null,
      previewUrl: data.preview_url ?? null,
      albumTitle,
      year,
      releaseDate: releaseDate || null,
    };
  } catch {
    return {
      title: null,
      creator: null,
      thumbnailUrl: null,
      spotifyUrl: null,
      previewUrl: null,
      albumTitle: null,
      year: null,
      releaseDate: null,
    };
  }
}

function buildFallbackMusicMetadata(url: string, platform: string): CanonItemMetadata {
  const sourceMetadata: SourceMetadata = {
    source_type: "music",
    platform,
    platforms: [],
    platform_links: platform ? { [platform]: url } : {},
  };

  return {
    title: "Unknown Track",
    type: "song",
    creator: "Unknown Artist",
    link: url,
    tags: [],
    source_metadata: sourceMetadata,
  };
}

async function fallbackFromSpotifyUrl(url: string, platform: string): Promise<CanonItemMetadata> {
  const spotifyDetails = await fetchSpotifyTrackDetails(url);
  if (!spotifyDetails.title && !spotifyDetails.creator) {
    return buildFallbackMusicMetadata(url, platform);
  }

  const sourceMetadata: SourceMetadata = {
    source_type: "music",
    platform,
    album: spotifyDetails.albumTitle ?? undefined,
    release_date: spotifyDetails.releaseDate ?? undefined,
    year: spotifyDetails.year ?? undefined,
    published_date: spotifyDetails.releaseDate ?? undefined,
    preview_url: spotifyDetails.previewUrl ?? undefined,
    platforms: ["spotify"],
    platform_links: { spotify: spotifyDetails.spotifyUrl ?? url },
  };

  return {
    title: spotifyDetails.title ?? "Unknown Track",
    type: "song",
    creator: spotifyDetails.creator ?? "Unknown Artist",
    link: spotifyDetails.spotifyUrl ?? url,
    tags: [],
    thumbnail_url: spotifyDetails.thumbnailUrl ?? undefined,
    source_metadata: sourceMetadata,
  };
}

function extractItunesTrackId(itunesUrl: string): string | null {
  try {
    const parsed = new URL(itunesUrl);
    const fromParam = parsed.searchParams.get("i");
    if (fromParam && /^\d+$/.test(fromParam)) return fromParam;
    const fromPath = parsed.pathname.match(/\/id(\d+)/i);
    if (fromPath?.[1]) return fromPath[1];
    return null;
  } catch {
    return null;
  }
}

async function fetchItunesTrackDetails(trackId: string): Promise<ItunesTrackDetails> {
  if (!trackId) return { albumTitle: null, year: null, releaseDate: null };
  try {
    const res = await fetch(`https://itunes.apple.com/lookup?id=${encodeURIComponent(trackId)}`, {
      headers: { "User-Agent": "Kanon/1.0 (https://kanon.app)" },
    });
    if (!res.ok) return { albumTitle: null, year: null, releaseDate: null };

    const data = await res.json() as {
      results?: Array<{ collectionName?: string; releaseDate?: string }>;
    };
    const first = data.results?.[0];
    if (!first) return { albumTitle: null, year: null, releaseDate: null };

    const albumTitle =
      typeof first.collectionName === "string" && first.collectionName.trim()
        ? first.collectionName.trim()
        : null;
    const parsedYear = Number.parseInt((first.releaseDate ?? "").slice(0, 4), 10);
    const year = Number.isFinite(parsedYear) ? parsedYear : null;

    return { albumTitle, year, releaseDate: first.releaseDate ?? null };
  } catch {
    return { albumTitle: null, year: null, releaseDate: null };
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function fetchMusicMetadata(url: string): Promise<CanonItemMetadata> {
  const platform = detectPlatform(url);
  const apiUrl = `${ODESLI_BASE}?url=${encodeURIComponent(url)}&userCountry=US`;

  const res = await fetch(apiUrl, {
    headers: { "User-Agent": "Kanon/1.0 (https://kanon.app)" },
  });

  if (!res.ok) {
    // Odesli can rate-limit aggressively. Fallback to direct Spotify lookup (if possible)
    // or return minimal music metadata so add flow can continue.
    if (res.status === 429 || res.status >= 500) {
      if (platform === "spotify") {
        return fallbackFromSpotifyUrl(url, platform);
      }
      return buildFallbackMusicMetadata(url, platform);
    }
    throw new Error(`Odesli API error ${res.status} for URL: ${url}`);
  }

  const data: OdesliResponse = await res.json();
  const entity = data.entitiesByUniqueId[data.entityUniqueId];

  if (!entity) {
    throw new Error("Odesli returned no entity data");
  }

  // Build normalised platform_links (our MusicPlatform slugs → URL)
  const platform_links: Record<string, string> = {};
  for (const [key, val] of Object.entries(data.linksByPlatform)) {
    const slug = ODESLI_TO_PLATFORM[key];
    if (slug && !platform_links[slug]) {
      platform_links[slug] = val.url;
    }
  }

  // Try to fetch Spotify details (silent fail): preview, album, release year.
  const spotifyUrl = data.linksByPlatform.spotify?.url;
  const spotifyDetails = spotifyUrl
    ? await fetchSpotifyTrackDetails(spotifyUrl)
    : {
        title: null,
        creator: null,
        thumbnailUrl: null,
        spotifyUrl: null,
        previewUrl: null,
        albumTitle: null,
        year: null,
        releaseDate: null,
      };
  const preview_url = spotifyDetails.previewUrl ?? undefined;

  const itunesUrl = data.linksByPlatform.itunes?.url ?? data.linksByPlatform.appleMusic?.url;
  const itunesTrackId =
    (itunesUrl ? extractItunesTrackId(itunesUrl) : null) ??
    (data.entityUniqueId.startsWith("ITUNES_SONG::")
      ? data.entityUniqueId.split("ITUNES_SONG::")[1] ?? null
      : null);
  const itunesDetails = itunesTrackId
    ? await fetchItunesTrackDetails(itunesTrackId)
    : { albumTitle: null, year: null, releaseDate: null };

  const albumTitle =
    spotifyDetails.albumTitle ??
    itunesDetails.albumTitle ??
    (entity.type === "album" ? entity.title : undefined);
  const releaseYear = spotifyDetails.year ?? itunesDetails.year ?? undefined;
  const releaseDate = spotifyDetails.releaseDate ?? itunesDetails.releaseDate ?? undefined;

  const sourceMetadata: SourceMetadata = {
    source_type: "music",
    platform,
    album: albumTitle,
    release_date: releaseDate,
    year: releaseYear,
    published_date: releaseDate,
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
    tags: [],
    thumbnail_url: entity.thumbnailUrl,
    source_metadata: sourceMetadata,
  };
}
