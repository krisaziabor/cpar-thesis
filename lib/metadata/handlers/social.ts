/**
 * Social media oEmbed handlers — Instagram, TikTok, Twitter/X.
 *
 * TikTok & Twitter work without credentials.
 * Instagram requires INSTAGRAM_ACCESS_TOKEN (Meta Graph API token).
 *
 * TikTok, Instagram, and Twitter/X run `yt-dlp --dump-single-json` in parallel with oEmbed/OG
 * where useful — dates, stats, thumbnails, and multi-media counts (carousels).
 */

import { parseHTML } from "linkedom";
import type { CanonItemMetadata, SourceMetadata } from "../types";
import {
  splitTitleAndHashtags,
  stripCreatorSuffix,
  truncateAtWord,
} from "../text";
import { fetchPublicImage } from "../fetch-public-image";
import {
  fetchThumbnailBytesViaYtDlp,
  probeMediaPageWithYtDlp,
  type YtDlpMediaProbe,
} from "../video-extract";

const FETCH_TIMEOUT_MS = 20_000;

function fetchSocial(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
}

async function dataUriThumbnailFromYtDlp(pageUrl: string): Promise<string | undefined> {
  const got = await fetchThumbnailBytesViaYtDlp(pageUrl);
  if (!got) return undefined;
  return `data:${got.mimeType};base64,${got.buffer.toString("base64")}`;
}

async function probeThumbnailToDataUri(thumbnailUrl: string | undefined): Promise<string | undefined> {
  if (!thumbnailUrl) return undefined;
  const img = await fetchPublicImage(thumbnailUrl);
  if (!img) return undefined;
  return `data:${img.mimeType};base64,${img.buffer.toString("base64")}`;
}

function mediaItemCountFromProbe(probe: YtDlpMediaProbe | null | undefined): number | undefined {
  const n = probe?.playlist_count;
  return typeof n === "number" && n > 1 ? n : undefined;
}

/** Photo tweets: first pbs.twimg.com/media image in oEmbed HTML, as data URI when fetch works. */
async function twitterPhotoFromOembedHtml(html: string): Promise<string | undefined> {
  try {
    const { document } = parseHTML(html);
    const imgs = document.querySelectorAll("img[src]");
    for (const img of imgs) {
      const src = img.getAttribute("src")?.replace(/&amp;/g, "&") ?? "";
      if (!/pbs\.twimg\.com\/media\//i.test(src)) continue;
      const dataUri = await probeThumbnailToDataUri(src);
      if (dataUri) return dataUri;
    }
  } catch {
    const re = /<img[^>]+src=["']([^"']+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const src = m[1].replace(/&amp;/g, "&");
      if (!/pbs\.twimg\.com\/media\//i.test(src)) continue;
      const dataUri = await probeThumbnailToDataUri(src);
      if (dataUri) return dataUri;
    }
  }
  return undefined;
}

function tweetPlainTextFromOembedHtml(html: string): string {
  try {
    const { document } = parseHTML(html);
    const text = (document.body?.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text.length > 0) return text.slice(0, 280);
  } catch {
    /* fall through */
  }
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);
}

// ─── TikTok ───────────────────────────────────────────────────────────────────
// https://developers.tiktok.com/doc/embed-content/

interface TikTokOEmbed {
  title: string;
  author_name: string;
  author_url: string;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
  html?: string;
  provider_name: string;
}

async function buildTikTokFromProbeOnly(
  pageUrl: string,
  probe: YtDlpMediaProbe
): Promise<CanonItemMetadata> {
  const caption = probe.description?.trim() || probe.title?.trim() || "";
  const { title, tags, fullCaption } = splitTitleAndHashtags(caption, 120);
  const probeThumb = await probeThumbnailToDataUri(probe.thumbnailUrl);

  return {
    title: title || "TikTok Video",
    type: "other",
    creator: stripCreatorSuffix(probe.uploader || "Unknown"),
    link: pageUrl,
    tags,
    thumbnail_url: probeThumb ? undefined : probe.thumbnailUrl,
    thumbnail_base64: probeThumb,
    source_metadata: {
      source_type: "tiktok",
      author_url: probe.uploaderUrl,
      description: fullCaption.slice(0, 500) || caption.slice(0, 500),
      site_name: "TikTok",
      published_date: probe.published_date,
      duration_seconds: probe.duration_seconds,
      view_count: probe.view_count,
      like_count: probe.like_count,
      media_item_count: mediaItemCountFromProbe(probe),
      raw: { ytdlp: probe.raw, oembed_failed: true },
    },
  };
}

export async function fetchTikTokMetadata(url: string): Promise<CanonItemMetadata> {
  const endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
  const [res, probe] = await Promise.all([
    fetchSocial(endpoint, { headers: { "User-Agent": "Kanon/1.0" } }),
    probeMediaPageWithYtDlp(url),
  ]);

  if (!res.ok) {
    if (probe && (probe.title || probe.description || probe.id)) {
      return buildTikTokFromProbeOnly(url, probe);
    }
    throw new Error(`TikTok oEmbed failed (${res.status})`);
  }

  const data: TikTokOEmbed = await res.json();

  const captionSource =
    probe?.description?.trim() ||
    probe?.title?.trim() ||
    data.title ||
    "";
  const { title, tags, fullCaption } = splitTitleAndHashtags(captionSource, 120);

  let thumbnail_url = data.thumbnail_url;
  let thumbnail_base64: string | undefined;
  const probeThumb = await probeThumbnailToDataUri(probe?.thumbnailUrl);
  if (probeThumb) {
    thumbnail_base64 = probeThumb;
    thumbnail_url = undefined;
  }

  const sourceMetadata: SourceMetadata = {
    source_type: "tiktok",
    author_url: data.author_url || probe?.uploaderUrl,
    description: fullCaption.slice(0, 500) || captionSource.slice(0, 500),
    site_name: "TikTok",
    published_date: probe?.published_date,
    duration_seconds: probe?.duration_seconds,
    view_count: probe?.view_count,
    like_count: probe?.like_count,
    media_item_count: mediaItemCountFromProbe(probe),
    raw: {
      oembed: data as unknown as Record<string, unknown>,
      ...(probe ? { ytdlp: probe.raw } : {}),
    },
  };

  return {
    title: title || "TikTok Video",
    type: "other",
    creator: stripCreatorSuffix(
      data.author_name?.trim() || probe?.uploader?.trim() || "Unknown"
    ),
    link: url,
    tags,
    thumbnail_url,
    thumbnail_base64,
    source_metadata: sourceMetadata,
  };
}

// ─── Twitter / X ─────────────────────────────────────────────────────────────
// https://developer.twitter.com/en/docs/twitter-for-websites/oembed-api

interface TwitterOEmbed {
  url: string;
  author_name: string;
  author_url: string;
  html: string;
  provider_name: string;
  provider_url: string;
}

async function buildTwitterFromProbeOnly(
  pageUrl: string,
  probe: YtDlpMediaProbe
): Promise<CanonItemMetadata> {
  const caption = probe.description?.trim() || probe.title?.trim() || "";
  const { title: titleRaw, tags, fullCaption } = splitTitleAndHashtags(caption, 200);
  const title = truncateAtWord(titleRaw, 80);
  const probeThumb = await probeThumbnailToDataUri(probe.thumbnailUrl);

  return {
    title: title || "Post on X",
    type: "other",
    creator: stripCreatorSuffix(probe.uploader || "Unknown"),
    link: pageUrl,
    tags,
    thumbnail_url: probeThumb ? undefined : probe.thumbnailUrl,
    thumbnail_base64: probeThumb,
    source_metadata: {
      source_type: "twitter",
      author_url: probe.uploaderUrl,
      description: fullCaption.slice(0, 500) || caption.slice(0, 500),
      site_name: "Twitter / X",
      published_date: probe.published_date,
      duration_seconds: probe.duration_seconds,
      view_count: probe.view_count,
      like_count: probe.like_count,
      media_item_count: mediaItemCountFromProbe(probe),
      raw: { ytdlp: probe.raw, oembed_failed: true },
    },
  };
}

export async function fetchTwitterMetadata(url: string): Promise<CanonItemMetadata> {
  const normalizedUrl = url.replace(/^(https?:\/\/)x\.com/, "$1twitter.com");
  const endpoint = `https://publish.twitter.com/oembed?url=${encodeURIComponent(normalizedUrl)}&omit_script=true`;
  const [res, probe] = await Promise.all([
    fetchSocial(endpoint, { headers: { "User-Agent": "Kanon/1.0" } }),
    probeMediaPageWithYtDlp(normalizedUrl),
  ]);

  if (!res.ok) {
    if (probe && (probe.title || probe.description || probe.id)) {
      return buildTwitterFromProbeOnly(normalizedUrl, probe);
    }
    throw new Error(`Twitter oEmbed failed (${res.status})`);
  }

  const data: TwitterOEmbed = await res.json();

  const tweetText = tweetPlainTextFromOembedHtml(data.html);

  const captionForTags =
    probe?.description?.trim() || probe?.title?.trim() || tweetText;
  const { title: titleRaw, tags } = splitTitleAndHashtags(captionForTags, 200);
  const title = truncateAtWord(titleRaw, 80);

  let thumbnail_url: string | undefined;
  let thumbnail_base64: string | undefined;
  const probeThumb = await probeThumbnailToDataUri(probe?.thumbnailUrl);
  if (probeThumb) {
    thumbnail_base64 = probeThumb;
  } else {
    const fromOembed = await twitterPhotoFromOembedHtml(data.html);
    if (fromOembed) thumbnail_base64 = fromOembed;
  }

  const sourceMetadata: SourceMetadata = {
    source_type: "twitter",
    author_url: data.author_url || probe?.uploaderUrl,
    description: tweetText,
    site_name: "Twitter / X",
    published_date: probe?.published_date,
    duration_seconds: probe?.duration_seconds,
    view_count: probe?.view_count,
    like_count: probe?.like_count,
    media_item_count: mediaItemCountFromProbe(probe),
    raw: {
      oembed: data as unknown as Record<string, unknown>,
      ...(probe ? { ytdlp: probe.raw } : {}),
    },
  };

  return {
    title: title || tweetText.slice(0, 80) + (tweetText.length > 80 ? "…" : ""),
    type: "other",
    creator: stripCreatorSuffix(
      data.author_name?.trim() || probe?.uploader?.trim() || "Unknown"
    ),
    link: data.url || url,
    tags,
    thumbnail_url,
    thumbnail_base64,
    source_metadata: sourceMetadata,
  };
}

// ─── Instagram ────────────────────────────────────────────────────────────────
// Requires INSTAGRAM_ACCESS_TOKEN (Meta Graph API basic display token).
// Without a token, falls back to OG scraping via the generic URL handler.

interface InstagramOEmbed {
  title?: string;
  author_name: string;
  provider_name: string;
  thumbnail_url?: string;
  html?: string;
}

function buildInstagramMetadata(
  caption: string,
  authorName: string,
  link: string,
  thumbnailUrl: string | undefined,
  raw: Record<string, unknown>
): CanonItemMetadata {
  const { title, tags, fullCaption } = splitTitleAndHashtags(caption || "", 120);

  const sourceMetadata: SourceMetadata = {
    source_type: "instagram",
    site_name: "Instagram",
    description: fullCaption.slice(0, 500) || caption || undefined,
    raw,
  };

  return {
    title: title || "Instagram Post",
    type: "other",
    creator: stripCreatorSuffix(authorName || "Unknown"),
    link,
    tags,
    thumbnail_url: thumbnailUrl,
    source_metadata: sourceMetadata,
  };
}

async function instagramOgFallback(url: string): Promise<CanonItemMetadata> {
  const { fetchUrlMetadata } = await import("./url");
  const ogData = await fetchUrlMetadata(url);
  const caption =
    ogData.title && ogData.title !== url
      ? ogData.title
      : ogData.source_metadata.description ?? "";

  let meta = buildInstagramMetadata(
    caption,
    ogData.creator,
    ogData.link ?? url,
    ogData.thumbnail_url,
    { ...(ogData.source_metadata.raw as Record<string, unknown>), instagram_og_fallback: true }
  );
  meta.tags = [...new Set([...meta.tags, ...ogData.tags])];
  return meta;
}

async function attachInstagramProbeAndThumbnail(
  pageUrl: string,
  meta: CanonItemMetadata,
  probe: YtDlpMediaProbe | null
): Promise<CanonItemMetadata> {
  let out: CanonItemMetadata = {
    ...meta,
    source_metadata: {
      ...meta.source_metadata,
      raw: { ...(meta.source_metadata.raw ?? {}) },
    },
  };

  if (probe) {
    out.source_metadata.published_date =
      out.source_metadata.published_date ?? probe.published_date;
    if (probe.duration_seconds != null) {
      out.source_metadata.duration_seconds =
        out.source_metadata.duration_seconds ?? probe.duration_seconds;
    }
    out.source_metadata.view_count = out.source_metadata.view_count ?? probe.view_count;
    out.source_metadata.like_count = out.source_metadata.like_count ?? probe.like_count;
    out.source_metadata.media_item_count =
      out.source_metadata.media_item_count ?? mediaItemCountFromProbe(probe);
    out.source_metadata.author_url =
      out.source_metadata.author_url ?? probe.uploaderUrl;
    (out.source_metadata.raw as Record<string, unknown>).ytdlp = probe.raw;

    const cap = probe.description?.trim() || probe.title?.trim() || "";
    const descLen = out.source_metadata.description?.length ?? 0;
    if (cap.length > descLen) {
      const { title, tags, fullCaption } = splitTitleAndHashtags(cap, 120);
      if (title) {
        out.title = title;
        out.tags = [...new Set([...tags, ...out.tags])];
        out.source_metadata.description = fullCaption.slice(0, 500);
      }
    }

    if (!out.thumbnail_base64 && probe.thumbnailUrl) {
      const thumbData = await probeThumbnailToDataUri(probe.thumbnailUrl);
      if (thumbData) {
        out.thumbnail_url = undefined;
        out.thumbnail_base64 = thumbData;
        (out.source_metadata.raw as Record<string, unknown>).thumbnail_source = "yt-dlp-json";
      }
    }
  }

  if (!out.thumbnail_base64) {
    const clean = await dataUriThumbnailFromYtDlp(pageUrl);
    if (clean) {
      out = {
        ...out,
        thumbnail_url: undefined,
        thumbnail_base64: clean,
        source_metadata: {
          ...out.source_metadata,
          raw: {
            ...(out.source_metadata.raw ?? {}),
            thumbnail_source: "yt-dlp-write-thumbnail",
          },
        },
      };
    }
  }

  return out;
}

export async function fetchInstagramMetadata(url: string): Promise<CanonItemMetadata> {
  const probePromise = probeMediaPageWithYtDlp(url);
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  let meta: CanonItemMetadata;

  if (token) {
    try {
      const endpoint =
        `https://graph.facebook.com/v18.0/instagram_oembed` +
        `?url=${encodeURIComponent(url)}&access_token=${encodeURIComponent(token)}`;
      const res = await fetchSocial(endpoint, { headers: { "User-Agent": "Kanon/1.0" } });

      if (res.ok) {
        const data: InstagramOEmbed = await res.json();
        meta = buildInstagramMetadata(
          data.title ?? "",
          data.author_name,
          url,
          data.thumbnail_url,
          data as unknown as Record<string, unknown>
        );
      } else {
        meta = await instagramOgFallback(url);
      }
    } catch (err) {
      console.warn("[instagram] oEmbed failed, falling back to OG scrape:", err);
      meta = await instagramOgFallback(url);
    }
  } else {
    meta = await instagramOgFallback(url);
  }

  const probe = await probePromise;
  return attachInstagramProbeAndThumbnail(url, meta, probe);
}
