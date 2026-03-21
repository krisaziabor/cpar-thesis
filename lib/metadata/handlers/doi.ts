import type { CanonItemMetadata, ItemType, SourceMetadata } from "../types";

const DOI_PATTERN = /10\.\d{4,9}\/[^\s"<>]+/i;

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

async function fetchCrossRefMetadata(doi: string): Promise<CanonItemMetadata> {
  const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
  const res = await fetch(url, {
    headers: {
      // CrossRef asks for a polite pool identifier
      "User-Agent": "Kanon/1.0 (mailto:contact@kanon.app)",
    },
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

  return {
    title,
    type,
    creator: creators,
    link: work.URL ?? `https://doi.org/${doi}`,
    tags: (work.subject ?? []).slice(0, 8),
    source_metadata: sourceMetadata,
  };
}

// ─── OpenAlex ────────────────────────────────────────────────────────────────

interface OpenAlexAuthorship {
  author?: { display_name?: string };
}

interface OpenAlexConcept {
  display_name?: string;
  score?: number;
}

interface OpenAlexWork {
  title?: string;
  abstract?: string;
  publication_year?: number;
  doi?: string;
  landing_page_url?: string;
  authorships?: OpenAlexAuthorship[];
  concepts?: OpenAlexConcept[];
  primary_location?: {
    source?: {
      display_name?: string;
      host_organization_name?: string;
    };
  };
}

async function fetchOpenAlexMetadata(doi: string): Promise<CanonItemMetadata> {
  const url = `https://api.openalex.org/works/doi:${encodeURIComponent(doi)}`;
  const res = await fetch(url, { headers: { "User-Agent": "Kanon/1.0" } });

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

  return {
    title: work.title ?? "Untitled",
    type: "article",
    creator: creators,
    link: work.doi ? `https://doi.org/${doi}` : work.landing_page_url,
    tags,
    source_metadata: sourceMetadata,
  };
}

// ─── arXiv ───────────────────────────────────────────────────────────────────

async function fetchArxivMetadata(arxivId: string): Promise<CanonItemMetadata> {
  const url = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}&max_results=1`;
  const res = await fetch(url);
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

  return {
    title,
    type: "article",
    creator: authors,
    link: `https://arxiv.org/abs/${arxivId}`,
    tags: categories,
    source_metadata: sourceMetadata,
  };
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
