import type { CanonItemMetadata, SourceMetadata } from "../types";

interface OGData {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: string;
  siteName?: string;
  author?: string;
}

export async function fetchUrlMetadata(url: string): Promise<CanonItemMetadata> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Kanon/1.0; +https://kanon.app)",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });

  if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`);

  const html = await res.text();
  const og = parseMetaTags(html);

  const sourceMetadata: SourceMetadata = {
    source_type: "url",
    description: og.description,
    site_name: og.siteName,
    raw: og as unknown as Record<string, unknown>,
  };

  return {
    title: og.title ?? url,
    type: "article",
    creator: og.author ?? og.siteName ?? "Unknown",
    link: og.url ?? url,
    tags: [],
    thumbnail_url: og.image,
    source_metadata: sourceMetadata,
  };
}

// ─── Meta-tag parser (no external dependency) ────────────────────────────────

function parseMetaTags(html: string): OGData {
  const data: OGData = {};

  // Matches both attribute orders: property/name before content, or content first
  function extractMeta(selector: string): string | undefined {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(
        `<meta[^>]*(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']+)["']`,
        "i"
      ),
      new RegExp(
        `<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${escaped}["']`,
        "i"
      ),
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m) return decodeEntities(m[1]);
    }
    return undefined;
  }

  // Open Graph
  data.title = extractMeta("og:title");
  data.description = extractMeta("og:description");
  data.image = extractMeta("og:image");
  data.url = extractMeta("og:url");
  data.type = extractMeta("og:type");
  data.siteName = extractMeta("og:site_name");

  // Twitter Card fallbacks
  if (!data.title) data.title = extractMeta("twitter:title");
  if (!data.description) data.description = extractMeta("twitter:description");
  if (!data.image) data.image = extractMeta("twitter:image");

  // Standard meta fallbacks
  if (!data.description) data.description = extractMeta("description");
  if (!data.siteName) data.siteName = extractMeta("application-name");

  // Author
  data.author =
    extractMeta("author") ??
    extractMeta("article:author") ??
    extractMeta("dc.creator");

  // <title> tag fallback
  if (!data.title) {
    const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (m) data.title = decodeEntities(m[1].trim());
  }

  return data;
}

function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}
