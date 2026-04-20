import { parseHTML } from "linkedom";
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

const FETCH_TIMEOUT_MS = 25_000;

function absolutizeUrl(baseHref: string, ref: string | undefined): string | undefined {
  if (!ref) return undefined;
  try {
    return new URL(ref.trim(), baseHref).href;
  } catch {
    return ref;
  }
}

/** Decode HTML using Content-Type charset, <meta charset>, or http-equiv. */
async function readHtmlText(res: Response): Promise<string> {
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const headLen = Math.min(bytes.length, 48_000);
  const headAscii = new TextDecoder("latin1", { fatal: false }).decode(bytes.subarray(0, headLen));

  let enc =
    res.headers.get("content-type")?.match(/charset=["']?([^;"'\s]+)/i)?.[1]?.trim() ?? "";

  if (!enc) {
    const m1 = headAscii.match(/<meta\s+charset\s*=\s*["']?([^"'>\s/]+)/i);
    const m2 = headAscii.match(
      /<meta[^>]+http-equiv\s*=\s*["']content-type["'][^>]+content\s*=\s*["'][^"']*charset=([^"';>\s]+)/i
    );
    enc = (m1?.[1] ?? m2?.[1] ?? "").trim();
  }

  let normalized = enc.toLowerCase();
  if (normalized === "iso-8859-1") normalized = "windows-1252";
  if (!normalized) normalized = "utf-8";

  try {
    return new TextDecoder(normalized, { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
}

export async function fetchUrlMetadata(url: string): Promise<CanonItemMetadata> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Kanon/1.0; +https://kanon.app)",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`Failed to fetch ${url} (${res.status})`);

  const html = await readHtmlText(res);
  const finalUrl = res.url;
  const og = parseMetaTags(html, finalUrl);

  const image = absolutizeUrl(finalUrl, og.image);
  const canonical = absolutizeUrl(finalUrl, og.url);

  const sourceMetadata: SourceMetadata = {
    source_type: "url",
    description: og.description,
    site_name: og.siteName,
    raw: { ...og, resolved_base: finalUrl } as unknown as Record<string, unknown>,
  };

  return {
    title: og.title ?? url,
    type: "article",
    creator: og.author ?? og.siteName ?? "Unknown",
    link: canonical ?? finalUrl,
    tags: [],
    thumbnail_url: image,
    source_metadata: sourceMetadata,
  };
}

// ─── Meta-tag parser (linkedom + regex fallback) ────────────────────────────

function parseMetaTags(html: string, _baseUrlForFuture?: string): OGData {
  try {
    return parseMetaTagsWithLinkedom(html);
  } catch {
    return parseMetaTagsRegex(html);
  }
}

function metaContentFromDoc(
  document: Document,
  key: string,
  attr: "property" | "name"
): string | undefined {
  const direct = document.querySelector(`meta[${attr}="${key}"]`);
  if (direct) {
    const raw = direct.getAttribute("content");
    return raw ? decodeEntities(raw.trim()) : undefined;
  }
  if (attr === "property") {
    const byName = document.querySelector(`meta[name="${key}"]`);
    const raw = byName?.getAttribute("content");
    return raw ? decodeEntities(raw.trim()) : undefined;
  }
  return undefined;
}

function parseMetaTagsWithLinkedom(html: string): OGData {
  const { document } = parseHTML(html);
  const data: OGData = {};

  data.title = metaContentFromDoc(document, "og:title", "property");
  data.description = metaContentFromDoc(document, "og:description", "property");
  data.image = metaContentFromDoc(document, "og:image", "property");
  data.url = metaContentFromDoc(document, "og:url", "property");
  data.type = metaContentFromDoc(document, "og:type", "property");
  data.siteName = metaContentFromDoc(document, "og:site_name", "property");

  if (!data.title) data.title = metaContentFromDoc(document, "twitter:title", "name");
  if (!data.description) {
    data.description = metaContentFromDoc(document, "twitter:description", "name");
  }
  if (!data.image) {
    data.image =
      metaContentFromDoc(document, "twitter:image", "name") ??
      metaContentFromDoc(document, "twitter:image:src", "name");
  }

  if (!data.description) data.description = metaContentFromDoc(document, "description", "name");
  if (!data.siteName) data.siteName = metaContentFromDoc(document, "application-name", "name");

  data.author =
    metaContentFromDoc(document, "author", "name") ??
    metaContentFromDoc(document, "article:author", "property") ??
    metaContentFromDoc(document, "dc.creator", "name");

  if (!data.title) {
    const t = document.querySelector("title")?.textContent?.trim();
    if (t) data.title = decodeEntities(t);
  }

  return data;
}

function parseMetaTagsRegex(html: string): OGData {
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
