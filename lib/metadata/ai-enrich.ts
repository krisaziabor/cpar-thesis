import { GoogleGenerativeAI } from "@google/generative-ai";
import type { CanonItemMetadata, ItemType } from "./types";

const MODEL = "gemini-2.0-flash-lite";

// Max page text fed to the model (~3000 tokens at ~4 chars/token)
const MAX_PAGE_CHARS = 12_000;

const SYSTEM_INSTRUCTION = `You are a metadata extraction tool. Given the URL and text content of a web page, extract structured metadata. Respond with ONLY a JSON object, no other text. If you cannot confidently determine a field, omit it entirely — do not guess.

JSON schema:
{
  "title": "string — the title of the content (not the site name)",
  "authors": ["string array — author name(s)"],
  "description": "string — one-sentence summary of what this content is about",
  "publishedDate": "string — ISO date if identifiable",
  "sourceType": "string — one of: news-article, essay-blog, video, music, social-post, generic-link",
  "language": "string — two-letter language code"
}`;

export interface AIEnrichmentResult {
  title?: string;
  authors?: string[];
  description?: string;
  publishedDate?: string;
  sourceType?: string;
  language?: string;
}

// ─── Page text extraction ────────────────────────────────────────────────────

function extractPageText(html: string): string {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ");
  text = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.slice(0, MAX_PAGE_CHARS);
}

// ─── AI call ─────────────────────────────────────────────────────────────────

export async function aiEnrichMetadata(
  url: string,
  existingMetadata: CanonItemMetadata
): Promise<AIEnrichmentResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return {};

  // Fetch page for text extraction
  let pageText = "";
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Kanon/1.0)" },
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) pageText = extractPageText(await res.text());
  } catch {
    // Couldn't fetch — proceed with URL + existing metadata only
  }

  // If behind a login wall with no content, skip
  if (pageText.length < 50 && !existingMetadata.title) return {};

  // Build prompt with only non-empty existing fields
  const known: Record<string, unknown> = {};
  if (existingMetadata.title && existingMetadata.title !== url)
    known.title = existingMetadata.title;
  if (existingMetadata.creator && existingMetadata.creator !== "Unknown")
    known.creator = existingMetadata.creator;
  if (existingMetadata.source_metadata.description)
    known.description = existingMetadata.source_metadata.description;

  const parts: string[] = [`URL: ${url}`];
  if (Object.keys(known).length > 0)
    parts.push(`\nExisting metadata we already have:\n${JSON.stringify(known, null, 2)}`);
  if (pageText.length > 0)
    parts.push(`\nPage content:\n${pageText}`);

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: SYSTEM_INSTRUCTION,
  });

  try {
    const resultPromise = model.generateContent({
      contents: [{ role: "user", parts: [{ text: parts.join("") }] }],
      generationConfig: { maxOutputTokens: 500 },
    });

    const result = await Promise.race([
      resultPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("AI enrichment timeout")), 5_000)
      ),
    ]);

    const text = result.response.text();

    try {
      const cleaned = text
        .replace(/^```json\n?/, "")
        .replace(/\n?```$/, "")
        .trim();
      return JSON.parse(cleaned) as AIEnrichmentResult;
    } catch {
      console.warn("[ai-enrich] malformed JSON:", text.slice(0, 200));
      return {};
    }
  } catch (err) {
    console.warn("[ai-enrich] failed:", (err as Error).message);
    return {};
  }
}

// ─── Merge ───────────────────────────────────────────────────────────────────

function aiSourceTypeToItemType(sourceType: string | undefined): ItemType | undefined {
  switch (sourceType) {
    case "news-article":
      return "article";
    case "essay-blog":
      return "essay";
    case "music":
      return "song";
    default:
      return undefined;
  }
}

function looksLikeSiteName(title: string, url: string): boolean {
  const t = title.trim().toLowerCase();
  if (t.length < 5) return true;
  if (t.startsWith("http") || t.startsWith("www.")) return true;
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    const domainBase = hostname.split(".")[0].toLowerCase();
    if (domainBase.length > 2 && t.includes(domainBase)) return true;
  } catch {
    // ignore
  }
  const BAD = [
    "home",
    "untitled",
    "index",
    "page not found",
    "404",
    "403",
    "error",
    "loading...",
    "welcome",
  ];
  return BAD.includes(t);
}

export function mergeMetadata(
  scraped: CanonItemMetadata,
  ai: AIEnrichmentResult,
  url: string
): CanonItemMetadata {
  const merged: CanonItemMetadata = {
    ...scraped,
    source_metadata: { ...scraped.source_metadata },
  };

  // Title: prefer AI if scraped looks like a site name or generic garbage
  if (ai.title && looksLikeSiteName(scraped.title, url)) {
    merged.title = ai.title;
  }

  // Creator: prefer AI if scraped is "Unknown" or equal to site_name
  if (ai.authors && ai.authors.length > 0) {
    const isUnknown =
      scraped.creator === "Unknown" ||
      scraped.creator === scraped.source_metadata.site_name ||
      scraped.creator.trim() === "";
    if (isUnknown) {
      merged.creator = ai.authors.join(", ");
    }
  }

  // Description: prefer AI if scraped is absent or too short
  if (ai.description) {
    const existing = scraped.source_metadata.description;
    if (!existing || existing.length < 20) {
      merged.source_metadata.description = ai.description;
    }
  }

  // Published date: fall back to AI if scraped has nothing
  if (
    !scraped.source_metadata.year &&
    !scraped.source_metadata.published_date &&
    ai.publishedDate
  ) {
    const year = parseInt(ai.publishedDate.slice(0, 4), 10);
    merged.source_metadata.published_date = ai.publishedDate;
    if (!isNaN(year)) merged.source_metadata.year = year;
  }

  // Item type: prefer AI classification
  const aiType = aiSourceTypeToItemType(ai.sourceType);
  if (aiType) merged.type = aiType;

  // Mark enriched
  merged.source_metadata.ai_enriched = true;

  return merged;
}
