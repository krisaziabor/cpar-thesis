import type { CanonItemMetadata, ItemType } from "../types";
import { fetchUrlMetadata } from "./url";

// JSON-LD types that map to articles/essays
const ARTICLE_TYPES = new Set([
  "Article",
  "NewsArticle",
  "BlogPosting",
  "ScholarlyArticle",
  "TechArticle",
  "OpinionNewsArticle",
  "AnalysisNewsArticle",
  "Report",
]);

function extractMeta(html: string, name: string): string | undefined {
  // Handles both name= and property= (OG), both attribute orderings
  const pattern = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']` +
    `|<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`,
    "i"
  );
  const m = html.match(pattern);
  return m ? (m[1] || m[2]) : undefined;
}

function extractAllMeta(html: string, name: string): string[] {
  const pattern = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']` +
    `|<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`,
    "gi"
  );
  const results: string[] = [];
  let m;
  while ((m = pattern.exec(html)) !== null) {
    results.push(m[1] || m[2]);
  }
  return results;
}

function parseJsonLd(html: string): Record<string, unknown> | null {
  const pattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = pattern.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1].trim());
      const items: unknown[] = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (typeof item !== "object" || item === null) continue;
        const typed = item as Record<string, unknown>;
        const type = typed["@type"] as string | string[] | undefined;
        const typeStr = Array.isArray(type) ? type[0] : type ?? "";
        if (ARTICLE_TYPES.has(typeStr)) return typed;
      }
    } catch {
      // malformed JSON-LD — skip
    }
  }
  return null;
}

function estimateReadingTime(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200)); // ~200 wpm
}

function detectPlatform(hostname: string): string | undefined {
  if (hostname.endsWith("substack.com")) return "Substack";
  if (hostname === "medium.com" || hostname.endsWith(".medium.com")) return "Medium";
  if (hostname.endsWith("ghost.io")) return "Ghost";
  return undefined;
}

function extractAuthorName(
  authorField: unknown
): string {
  if (!authorField) return "Unknown";
  if (typeof authorField === "string") return authorField;
  if (Array.isArray(authorField)) {
    const first = authorField[0];
    if (typeof first === "string") return first;
    if (typeof first === "object" && first !== null) {
      return (first as Record<string, unknown>).name as string ?? "Unknown";
    }
  }
  if (typeof authorField === "object" && authorField !== null) {
    return (authorField as Record<string, unknown>).name as string ?? "Unknown";
  }
  return "Unknown";
}

export async function fetchNewsMetadata(url: string): Promise<CanonItemMetadata> {
  // Start with base URL metadata for OG/Twitter Card fields
  const base = await fetchUrlMetadata(url);

  let hostname = "";
  try {
    hostname = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return base;
  }

  // Fetch raw HTML for JSON-LD + article:* meta tags
  let html = "";
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Kanon/1.0)" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return base;
    html = await res.text();
  } catch {
    return base;
  }

  // Detect platform
  const platform = detectPlatform(hostname) ??
    (extractMeta(html, "generator")?.toLowerCase().includes("ghost") ? "Ghost" : undefined);

  // JSON-LD article data
  const ld = parseJsonLd(html);

  // Article Open Graph meta
  const articleAuthor = extractMeta(html, "article:author");
  const articlePublished = extractMeta(html, "article:published_time");
  const articleModified = extractMeta(html, "article:modified_time");
  const articleSection = extractMeta(html, "article:section");
  const articleTags = extractAllMeta(html, "article:tag");

  // Resolve fields with priority: JSON-LD > article:* OG > base OG
  const title =
    (ld?.headline as string | undefined) ||
    (ld?.name as string | undefined) ||
    base.title;

  const creator =
    extractAuthorName(ld?.author) !== "Unknown"
      ? extractAuthorName(ld?.author)
      : articleAuthor || base.creator;

  const description =
    (ld?.description as string | undefined) ||
    base.source_metadata.description;

  const publishedStr =
    (ld?.datePublished as string | undefined) ||
    articlePublished;
  const year = publishedStr
    ? parseInt(publishedStr.slice(0, 4), 10) || undefined
    : undefined;

  // Tags: article:tag > JSON-LD keywords > article section
  let tags: string[] = base.tags;
  if (articleTags.length > 0) {
    tags = articleTags;
  } else if (ld?.keywords) {
    const kw = ld.keywords as string | string[];
    tags = Array.isArray(kw)
      ? kw
      : kw.split(/,\s*/).filter(Boolean);
  }
  if (articleSection && !tags.includes(articleSection)) {
    tags = [articleSection, ...tags];
  }
  if (platform && !tags.includes(platform)) {
    tags = [platform, ...tags];
  }

  // Estimate reading time from body text (rough heuristic via article body in ld)
  let readingTime: number | undefined;
  const articleBody = ld?.articleBody as string | undefined;
  if (articleBody) {
    readingTime = estimateReadingTime(articleBody);
  }

  const type: ItemType = "essay";

  return {
    ...base,
    title,
    type,
    creator,
    tags,
    source_metadata: {
      ...base.source_metadata,
      source_type: "news",
      description,
      year,
      platform,
      raw: {
        ...(base.source_metadata.raw as Record<string, unknown> | undefined),
        jsonLd: ld,
        articlePublished,
        articleModified,
        articleSection,
        articleTags,
        readingTime,
      },
    },
  };
}
