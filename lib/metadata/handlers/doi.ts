import type { CanonItemMetadata, ItemType, SourceMetadata } from "../types";
import { isSafePublicHttpsUrl, fetchPublicImage } from "../fetch-public-image";
import { renderPdfFirstPageDataUri } from "./pdf";
import { fetchUrlMetadata } from "./url";

const DOI_PATTERN = /10\.\d{4,9}\/[^\s"<>]+/i;
const DOI_FETCH_TIMEOUT_MS = 25_000;
const MAX_PDF_BYTES_FOR_THUMB = 25 * 1024 * 1024;

// ─── DOI extraction ──────────────────────────────────────────────────────────

export function extractDoi(input: string): string | null {
  // doi.org resolver URL
  const doiOrgMatch = input.match(/doi\.org\/(.+)/i);
  if (doiOrgMatch) return decodeURIComponent(doiOrgMatch[1].split("?")[0]);

  // arXiv abs URL  →  returned as "arxiv:<id>"
  const arxivMatch = input.match(/arxiv\.org\/abs\/([^\s?#]+)/i);
  if (arxivMatch) return `arxiv:${arxivMatch[1]}`;

  // Raw DOI pattern anywhere in the string
  const rawMatch = input.match(DOI_PATTERN);
  if (rawMatch) return rawMatch[0].replace(/[.)]+$/, ""); // strip trailing punctuation

  return null;
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function fetchDoiMetadata(input: string): Promise<CanonItemMetadata> {
  const doi = extractDoi(input);

  // arXiv
  if (
    input.includes("arxiv.org") ||
    (doi && doi.startsWith("arxiv:"))
  ) {
    const arxivId =
      doi?.replace("arxiv:", "") ??
      input.match(/arxiv\.org\/abs\/([^\s?#]+)/i)?.[1];
    if (arxivId) return fetchArxivMetadata(arxivId);
  }

  if (!doi) {
    throw new Error(`Could not extract a DOI from: ${input}`);
  }

  // CrossRef first, OpenAlex as fallback
  try {
    return await fetchCrossRefMetadata(doi);
  } catch (primaryErr) {
    console.warn("[doi] CrossRef failed, trying OpenAlex:", primaryErr);
    try {
      return await fetchOpenAlexMetadata(doi);
    } catch (fallbackErr) {
      console.error("[doi] OpenAlex also failed:", fallbackErr);
      throw new Error(`Could not fetch metadata for DOI: ${doi}`);
    }
  }
}

// ─── CrossRef ────────────────────────────────────────────────────────────────

interface CrossRefAuthor {
  given?: string;
  family?: string;
}

interface CrossRefDateParts {
  "date-parts"?: number[][];
}

interface CrossRefLink {
  URL?: string;
  "content-type"?: string;
}

interface CrossRefWork {
  title?: string | string[];
  author?: CrossRefAuthor[];
  type?: string;
  URL?: string;
  publisher?: string;
  "container-title"?: string[];
  volume?: string;
  issue?: string;
  page?: string;
  published?: CrossRefDateParts;
  "published-print"?: CrossRefDateParts;
  "published-online"?: CrossRefDateParts;
  abstract?: string;
  subject?: string[];
  ISBN?: string[];
  link?: CrossRefLink[];
}

const CROSSREF_TYPE_MAP: Record<string, ItemType> = {
  "journal-article": "article",
  "book": "book",
  "book-chapter": "book",
  "monograph": "book",
  "proceedings-article": "article",
  "report": "article",
  "dissertation": "article",
  "posted-content": "article",
};

function crossRefPdfCandidates(work: CrossRefWork): string[] {
  const links = work.link;
  if (!Array.isArray(links)) return [];
  const out: string[] = [];
  for (const L of links) {
    const u = typeof L.URL === "string" ? L.URL.trim() : "";
    if (!u || !isSafePublicHttpsUrl(u)) continue;
    const ct = (L["content-type"] ?? "").toLowerCase();
    if (ct.includes("pdf") || u.toLowerCase().includes(".pdf")) out.push(u);
  }
  return [...new Set(out)];
}

function openAlexPdfCandidates(work: OpenAlexWork): string[] {
  const out: string[] = [];
  const take = (u: string | undefined) => {
    const t = u?.trim();
    if (t && isSafePublicHttpsUrl(t)) out.push(t);
  };
  take(work.best_oa_location?.pdf_url);
  take(work.primary_location?.pdf_url);
  return [...new Set(out)];
}

async function fetchHttpsPdfBuffer(url: string): Promise<Buffer | null> {
  if (!isSafePublicHttpsUrl(url)) return null;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(DOI_FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Kanon/1.0; +https://kanon.app)",
        Accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
      },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength < 8 || buf.byteLength > MAX_PDF_BYTES_FOR_THUMB) return null;
    if (buf.slice(0, 5).toString("latin1") !== "%PDF-") return null;
    return buf;
  } catch {
    return null;
  }
}

/**
 * Prefer the first page of an OA PDF when CrossRef / OpenAlex expose `application/pdf` links;
 * otherwise use og:image from the resolved landing page (journal HTML).
 */
async function attachDoiArticleThumbnail(
  meta: CanonItemMetadata,
  pdfCandidates: string[]
): Promise<CanonItemMetadata> {
  const seen = new Set<string>();
  for (const raw of pdfCandidates) {
    const u = raw.trim();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    const buf = await fetchHttpsPdfBuffer(u);
    if (!buf) continue;
    const thumb = await renderPdfFirstPageDataUri(buf);
    if (!thumb) continue;
    const prevRaw =
      typeof meta.source_metadata.raw === "object" && meta.source_metadata.raw
        ? meta.source_metadata.raw
        : {};
    return {
      ...meta,
      thumbnail_url: undefined,
      thumbnail_base64: thumb,
      source_metadata: {
        ...meta.source_metadata,
        raw: {
          ...prevRaw,
          doi_thumbnail_source: "pdf-first-page",
          doi_thumbnail_pdf_url: u,
        },
      },
    };
  }

  const landing = meta.link?.trim();
  if (landing && isSafePublicHttpsUrl(landing)) {
    try {
      const og = await fetchUrlMetadata(landing);
      const img = og.thumbnail_url;
      if (img && isSafePublicHttpsUrl(img)) {
        const got = await fetchPublicImage(img, 12 * 1024 * 1024);
        if (got) {
          const prevRaw =
            typeof meta.source_metadata.raw === "object" && meta.source_metadata.raw
              ? meta.source_metadata.raw
              : {};
          return {
            ...meta,
            thumbnail_url: undefined,
            thumbnail_base64: `data:${got.mimeType};base64,${got.buffer.toString("base64")}`,
            source_metadata: {
              ...meta.source_metadata,
              raw: {
                ...prevRaw,
                doi_thumbnail_source: "landing-page-og-image",
              },
            },
          };
        }
      }
    } catch {
      /* no landing-page preview */
    }
  }

  return meta;
}

async function fetchCrossRefMetadata(doi: string): Promise<CanonItemMetadata> {
  const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
  const res = await fetch(url, {
    headers: {
      // CrossRef asks for a polite pool identifier
      "User-Agent": "Kanon/1.0 (mailto:contact@kanon.app)",
    },
    signal: AbortSignal.timeout(DOI_FETCH_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`CrossRef ${res.status}: ${url}`);

  const json = await res.json();
  const work: CrossRefWork = json.message;

  const rawTitle = Array.isArray(work.title) ? work.title[0] : work.title;
  const title = rawTitle ? stripHtml(rawTitle) : "Untitled";

  const creators = (work.author ?? [])
    .map((a) => [a.given, a.family].filter(Boolean).join(" "))
    .slice(0, 3)
    .join(", ") || "Unknown";

  const type: ItemType = CROSSREF_TYPE_MAP[work.type ?? ""] ?? "article";

  const year =
    work.published?.["date-parts"]?.[0]?.[0] ??
    work["published-print"]?.["date-parts"]?.[0]?.[0] ??
    work["published-online"]?.["date-parts"]?.[0]?.[0];

  const sourceMetadata: SourceMetadata = {
    source_type: "doi",
    doi,
    abstract: work.abstract ? stripHtml(work.abstract) : undefined,
    journal: work["container-title"]?.[0],
    volume: work.volume,
    issue: work.issue,
    pages: work.page,
    publisher: work.publisher,
    year,
    isbn: work.ISBN?.[0],
    description: work.abstract ? stripHtml(work.abstract).slice(0, 500) : undefined,
    raw: work as unknown as Record<string, unknown>,
  };

  const meta: CanonItemMetadata = {
    title,
    type,
    creator: creators,
    link: work.URL ?? `https://doi.org/${doi}`,
    tags: (work.subject ?? []).slice(0, 8),
    source_metadata: sourceMetadata,
  };

  return attachDoiArticleThumbnail(meta, crossRefPdfCandidates(work));
}

// ─── OpenAlex ────────────────────────────────────────────────────────────────

interface OpenAlexAuthorship {
  author?: { display_name?: string };
}

interface OpenAlexConcept {
  display_name?: string;
  score?: number;
}

interface OpenAlexLocation {
  pdf_url?: string;
  source?: {
    display_name?: string;
    host_organization_name?: string;
  };
}

interface OpenAlexWork {
  title?: string;
  abstract?: string;
  publication_year?: number;
  doi?: string;
  landing_page_url?: string;
  authorships?: OpenAlexAuthorship[];
  concepts?: OpenAlexConcept[];
  primary_location?: OpenAlexLocation;
  best_oa_location?: OpenAlexLocation;
}

async function fetchOpenAlexMetadata(doi: string): Promise<CanonItemMetadata> {
  const url = `https://api.openalex.org/works/doi:${encodeURIComponent(doi)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Kanon/1.0" },
    signal: AbortSignal.timeout(DOI_FETCH_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`OpenAlex ${res.status}: ${url}`);

  const work: OpenAlexWork = await res.json();

  const creators = (work.authorships ?? [])
    .map((a) => a.author?.display_name)
    .filter((n): n is string => Boolean(n))
    .slice(0, 3)
    .join(", ") || "Unknown";

  const tags = (work.concepts ?? [])
    .filter((c) => (c.score ?? 0) > 0.3)
    .map((c) => c.display_name)
    .filter((n): n is string => Boolean(n))
    .slice(0, 8);

  const sourceMetadata: SourceMetadata = {
    source_type: "doi",
    doi,
    abstract: work.abstract,
    journal: work.primary_location?.source?.display_name,
    publisher: work.primary_location?.source?.host_organization_name,
    year: work.publication_year,
    description: work.abstract?.slice(0, 500),
    raw: work as unknown as Record<string, unknown>,
  };

  const link =
    work.doi != null && String(work.doi).trim() !== ""
      ? `https://doi.org/${doi}`
      : (work.landing_page_url?.trim() || `https://doi.org/${doi}`);

  const meta: CanonItemMetadata = {
    title: work.title ?? "Untitled",
    type: "article",
    creator: creators,
    link,
    tags,
    source_metadata: sourceMetadata,
  };

  return attachDoiArticleThumbnail(meta, openAlexPdfCandidates(work));
}

// ─── arXiv ───────────────────────────────────────────────────────────────────

async function fetchArxivMetadata(arxivId: string): Promise<CanonItemMetadata> {
  const url = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}&max_results=1`;
  const res = await fetch(url, { signal: AbortSignal.timeout(DOI_FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`arXiv ${res.status}: ${url}`);

  const xml = await res.text();

  const title = xmlTag(xml, "title", 1) // skip the feed <title>
    .replace(/\n/g, " ")
    .trim();
  const summary = xmlTag(xml, "summary").replace(/\n/g, " ").trim();
  const authors = xmlAllTags(xml, "name").slice(0, 3).join(", ") || "Unknown";
  const categories = xmlAttrs(xml, "category", "term").slice(0, 8);
  const published = xmlTag(xml, "published").slice(0, 4); // year

  const sourceMetadata: SourceMetadata = {
    source_type: "doi",
    doi: `arxiv:${arxivId}`,
    abstract: summary,
    description: summary.slice(0, 500),
    year: published ? parseInt(published, 10) : undefined,
    raw: { arxiv_id: arxivId },
  };

  const meta: CanonItemMetadata = {
    title,
    type: "article",
    creator: authors,
    link: `https://arxiv.org/abs/${arxivId}`,
    tags: categories,
    source_metadata: sourceMetadata,
  };

  return attachDoiArticleThumbnail(meta, [`https://arxiv.org/pdf/${arxivId}.pdf`]);
}

// ─── XML helpers (no extra dependency needed for arXiv Atom feed) ─────────────

function xmlTag(xml: string, tag: string, occurrence = 0): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    if (i === occurrence) return m[1].trim();
    i++;
  }
  return "";
}

function xmlAllTags(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) results.push(m[1].trim());
  return results;
}

function xmlAttrs(xml: string, tag: string, attr: string): string[] {
  const re = new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"`, "gi");
  const results: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) results.push(m[1]);
  return results;
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}
