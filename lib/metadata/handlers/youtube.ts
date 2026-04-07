import type { CanonItemMetadata, SourceMetadata } from "../types";

// ─── Video ID extraction ──────────────────────────────────────────────────────

export function extractYouTubeVideoId(url: string): string | null {
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,         // youtube.com/watch?v=
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,     // youtu.be/
    /\/embed\/([a-zA-Z0-9_-]{11})/,        // /embed/
    /\/shorts\/([a-zA-Z0-9_-]{11})/,       // /shorts/
    /\/live\/([a-zA-Z0-9_-]{11})/,         // /live/
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

// ─── Metadata fetch ───────────────────────────────────────────────────────────

interface OEmbedResponse {
  title: string;
  author_name: string;
  author_url: string;
  thumbnail_url: string;
  provider_name: string;
}

interface YouTubeApiVideo {
  snippet?: {
    title?: string;
    description?: string;
    channelTitle?: string;
    channelId?: string;
    publishedAt?: string;
    tags?: string[];
    thumbnails?: {
      maxres?: { url: string };
      high?: { url: string };
      medium?: { url: string };
    };
  };
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string };
}

export async function fetchYouTubeMetadata(url: string): Promise<CanonItemMetadata> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) throw new Error(`Cannot extract video ID from URL: ${url}`);

  // oEmbed — always available, no key required
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  const oembedRes = await fetch(oembedUrl);
  if (!oembedRes.ok) throw new Error(`YouTube oEmbed failed (${oembedRes.status})`);
  const oembed: OEmbedResponse = await oembedRes.json();

  let sourceMetadata: SourceMetadata = {
    source_type: "youtube",
    video_id: videoId,
    channel: oembed.author_name,
    raw: { oembed } as Record<string, unknown>,
  };

  let title = oembed.title;
  let channel = oembed.author_name;
  let thumbnailUrl: string = oembed.thumbnail_url;
  let publishedDate: string | undefined;
  let tags: string[] = [];

  // YouTube Data API v3 — optional, unlocks description / tags / duration / stats
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (apiKey) {
    try {
      const apiUrl =
        `https://www.googleapis.com/youtube/v3/videos` +
        `?id=${videoId}&key=${encodeURIComponent(apiKey)}&part=snippet,contentDetails,statistics`;
      const apiRes = await fetch(apiUrl);
      const apiData = await apiRes.json();
      const video: YouTubeApiVideo | undefined = apiData.items?.[0];

      if (video?.snippet) {
        const s = video.snippet;
        title = s.title ?? title;
        channel = s.channelTitle ?? channel;
        publishedDate = normalizeYouTubeDate(s.publishedAt) ?? publishedDate;
        thumbnailUrl =
          s.thumbnails?.maxres?.url ??
          s.thumbnails?.high?.url ??
          s.thumbnails?.medium?.url ??
          thumbnailUrl;
        tags = (s.tags ?? []).slice(0, 10);

        sourceMetadata = {
          ...sourceMetadata,
          channel,
          channel_id: s.channelId,
          published_date: publishedDate,
          description: s.description?.slice(0, 500),
          duration_seconds: parseDuration(video.contentDetails?.duration),
          view_count: video.statistics?.viewCount
            ? parseInt(video.statistics.viewCount, 10)
            : undefined,
          raw: { oembed, api: video } as Record<string, unknown>,
        };
      }
    } catch (err) {
      console.warn("[youtube] Data API enrichment failed, using oEmbed only:", err);
    }
  }

  // Get direct video download URL via ytdl-core (no API key needed)
  let videoDownloadUrl: string | undefined;
  try {
    const directInfo = await getDirectVideoInfo(url);
    videoDownloadUrl = directInfo.url;
    if (!publishedDate && directInfo.publishedDate) {
      publishedDate = directInfo.publishedDate;
    }
  } catch (err) {
    console.warn("[youtube] Could not get direct video URL:", err);
  }

  // Final fallback for cases where APIs and ytdl cannot provide the date.
  if (!publishedDate) {
    publishedDate = await fetchYouTubePublishedDateFromWatchPage(videoId);
  }

  sourceMetadata = {
    ...sourceMetadata,
    channel,
    published_date: publishedDate,
  };

  return {
    title,
    type: "other",
    creator: channel,
    link: `https://www.youtube.com/watch?v=${videoId}`,
    tags,
    thumbnail_url: thumbnailUrl,
    video_download_url: videoDownloadUrl,
    source_metadata: sourceMetadata,
  };
}

// ─── Video download ───────────────────────────────────────────────────────────

/** Returns the highest-quality direct video URL (temporary YouTube CDN link). */
async function getDirectVideoInfo(
  url: string
): Promise<{ url?: string; publishedDate?: string }> {
  const ytdl = await import("@distube/ytdl-core");
  const info = await ytdl.default.getInfo(url);

  const videoDetails = info.videoDetails as { publishDate?: string; uploadDate?: string };
  const playerResponse = info.player_response as {
    microformat?: {
      playerMicroformatRenderer?: {
        publishDate?: string;
        uploadDate?: string;
      };
    };
  };

  const publishedDate =
    normalizeYouTubeDate(videoDetails.publishDate) ??
    normalizeYouTubeDate(videoDetails.uploadDate) ??
    normalizeYouTubeDate(playerResponse.microformat?.playerMicroformatRenderer?.publishDate) ??
    normalizeYouTubeDate(playerResponse.microformat?.playerMicroformatRenderer?.uploadDate);
  let urlResult: string | undefined;
  try {
    const format = ytdl.default.chooseFormat(info.formats, {
      quality: "highestvideo",
      filter: "audioandvideo",
    });
    urlResult = format.url;
  } catch {
    // Keep published date even if we cannot derive a direct stream URL.
  }

  return { url: urlResult, publishedDate };
}

/**
 * Download a YouTube video as a Buffer.
 * Suitable for small videos; for large ones prefer streaming to Firebase Storage directly.
 */
export async function downloadYouTubeVideoBuffer(
  url: string,
  onProgress?: (percent: number) => void
): Promise<{ buffer: Buffer; contentType: string }> {
  const ytdl = await import("@distube/ytdl-core");

  const info = await ytdl.default.getInfo(url);
  const format = ytdl.default.chooseFormat(info.formats, {
    quality: "highestvideo",
    filter: "audioandvideo",
  });

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    const stream = ytdl.default(url, { format });

    stream.on("progress", (_chunk, downloaded, total) => {
      if (onProgress && total > 0) {
        onProgress(Math.round((downloaded / total) * 100));
      }
    });

    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () =>
      resolve({
        buffer: Buffer.concat(chunks),
        contentType: format.mimeType?.split(";")[0] ?? "video/mp4",
      })
    );
    stream.on("error", reject);
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** ISO 8601 duration → seconds (e.g. "PT4M13S" → 253) */
function parseDuration(iso?: string): number | undefined {
  if (!iso) return undefined;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return undefined;
  return (
    (parseInt(m[1] ?? "0", 10) * 3600) +
    (parseInt(m[2] ?? "0", 10) * 60) +
    parseInt(m[3] ?? "0", 10)
  );
}

function normalizeYouTubeDate(raw?: string): string | undefined {
  if (!raw) return undefined;
  const value = raw.trim();
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value;
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

async function fetchYouTubePublishedDateFromWatchPage(videoId: string): Promise<string | undefined> {
  try {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const res = await fetch(watchUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; kanon-metadata/1.0)" },
    });
    if (!res.ok) return undefined;

    const html = await res.text();
    const match =
      html.match(/itemprop="datePublished"\s+content="([^"]+)"/i) ??
      html.match(/"uploadDate":"([^"]+)"/i) ??
      html.match(/"datePublished":"([^"]+)"/i);

    return normalizeYouTubeDate(match?.[1]);
  } catch {
    return undefined;
  }
}
