/**
 * Social media oEmbed handlers — Instagram, TikTok, Twitter/X.
 *
 * TikTok & Twitter work without credentials.
 * Instagram requires INSTAGRAM_ACCESS_TOKEN (Meta Graph API token).
 */

import type { CanonItemMetadata, SourceMetadata } from "../types";

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

export async function fetchTikTokMetadata(url: string): Promise<CanonItemMetadata> {
  const endpoint = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
  const res = await fetch(endpoint, { headers: { "User-Agent": "Kanon/1.0" } });

  if (!res.ok) throw new Error(`TikTok oEmbed failed (${res.status})`);

  const data: TikTokOEmbed = await res.json();

  const sourceMetadata: SourceMetadata = {
    source_type: "tiktok",
    author_url: data.author_url,
    description: data.title,
    site_name: "TikTok",
    raw: data as unknown as Record<string, unknown>,
  };

  return {
    title: data.title || "TikTok Video",
    type: "other",
    creator: data.author_name || "Unknown",
    link: url,
    tags: [],
    thumbnail_url: data.thumbnail_url,
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

export async function fetchTwitterMetadata(url: string): Promise<CanonItemMetadata> {
  // Normalize x.com → twitter.com for oEmbed compatibility
  const normalizedUrl = url.replace(/^(https?:\/\/)x\.com/, "$1twitter.com");
  const endpoint = `https://publish.twitter.com/oembed?url=${encodeURIComponent(normalizedUrl)}&omit_script=true`;
  const res = await fetch(endpoint, { headers: { "User-Agent": "Kanon/1.0" } });

  if (!res.ok) throw new Error(`Twitter oEmbed failed (${res.status})`);

  const data: TwitterOEmbed = await res.json();

  // Extract tweet text from the HTML embed (strip tags)
  const tweetText = data.html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 280);

  const sourceMetadata: SourceMetadata = {
    source_type: "twitter",
    author_url: data.author_url,
    description: tweetText,
    site_name: "Twitter / X",
    raw: data as unknown as Record<string, unknown>,
  };

  return {
    // Use the first ~80 chars of the tweet text as the title
    title: tweetText.slice(0, 80) + (tweetText.length > 80 ? "…" : ""),
    type: "other",
    creator: data.author_name || "Unknown",
    link: data.url || url,
    tags: [],
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

export async function fetchInstagramMetadata(url: string): Promise<CanonItemMetadata> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;

  if (token) {
    try {
      const endpoint =
        `https://graph.facebook.com/v18.0/instagram_oembed` +
        `?url=${encodeURIComponent(url)}&access_token=${encodeURIComponent(token)}`;
      const res = await fetch(endpoint, { headers: { "User-Agent": "Kanon/1.0" } });

      if (res.ok) {
        const data: InstagramOEmbed = await res.json();

        const sourceMetadata: SourceMetadata = {
          source_type: "instagram",
          site_name: "Instagram",
          raw: data as unknown as Record<string, unknown>,
        };

        return {
          title: data.title || "Instagram Post",
          type: "other",
          creator: data.author_name || "Unknown",
          link: url,
          tags: [],
          thumbnail_url: data.thumbnail_url,
          source_metadata: sourceMetadata,
        };
      }
    } catch (err) {
      console.warn("[instagram] oEmbed failed, falling back to OG scrape:", err);
    }
  }

  // Fallback: OG scraping (works for public posts without login)
  const { fetchUrlMetadata } = await import("./url");
  const ogData = await fetchUrlMetadata(url);
  return {
    ...ogData,
    source_metadata: { ...ogData.source_metadata, source_type: "instagram" },
  };
}
