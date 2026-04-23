import Anthropic from "@anthropic-ai/sdk";
import type { CanonItemMetadata, SourceMetadata } from "../types";

interface PdfData {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  pageCount: number;
  fullText: string;
}

interface LLMExtracted {
  title?: string;
  author?: string;
}

async function extractMetadataWithLLM(
  fullText: string,
  filename: string
): Promise<LLMExtracted> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return {};

  const snippet = fullText.slice(0, 4_000).trim();
  if (!snippet) return {};

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      system:
        "You are a bibliographic metadata extractor. Given the opening text of a document, identify its title and author/creator. Respond with ONLY a JSON object — no prose. Omit a field entirely if you cannot determine it confidently. Schema: { \"title\": \"string\", \"author\": \"string\" }",
      messages: [
        {
          role: "user",
          content: `Filename: ${filename}\n\nDocument text (first ~4000 chars):\n${snippet}`,
        },
      ],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    return {
      title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim().slice(0, 300) : undefined,
      author: typeof parsed.author === "string" && parsed.author.trim() ? parsed.author.trim().slice(0, 200) : undefined,
    };
  } catch {
    return {};
  }
}

function looksLikeGarbageTitle(title: string | undefined): boolean {
  if (!title) return true;
  if (title.includes("%") || title.includes("firebasestorage") || title.includes("scratch/")) return true;
  if (title.length > 250) return true;
  return false;
}

export async function fetchPdfMetadata(
  buffer: Buffer,
  filename: string
): Promise<CanonItemMetadata> {
  const [pdfData, thumbnailBase64] = await Promise.all([
    extractPdfData(buffer),
    renderPdfFirstPageDataUri(buffer),
  ]);

  const rawTitle = looksLikeGarbageTitle(pdfData.title) ? undefined : pdfData.title;
  const rawAuthor = pdfData.author;

  // Use LLM to fill in missing title/author from the document body text.
  let llm: LLMExtracted = {};
  if (!rawTitle || !rawAuthor) {
    llm = await extractMetadataWithLLM(pdfData.fullText, filename);
  }

  const filenameTitle = filename.replace(/\.pdf$/i, "").replace(/[-_]/g, " ");
  const title = rawTitle || llm.title || filenameTitle || "Untitled PDF";
  const creator = rawAuthor || llm.author || "Unknown";

  const tags = pdfData.keywords
    ? pdfData.keywords
        .split(/[,;|]/)
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 10)
    : [];

  const sourceMetadata: SourceMetadata = {
    source_type: "pdf",
    description: pdfData.subject,
    page_count: pdfData.pageCount,
    full_text: pdfData.fullText.slice(0, 50_000),
  };

  return {
    title,
    type: "article",
    creator,
    tags,
    thumbnail_base64: thumbnailBase64,
    full_text: pdfData.fullText.slice(0, 50_000),
    source_metadata: sourceMetadata,
  };
}

// mupdf (WASM) handles both metadata/text extraction and thumbnailing without
// requiring browser globals like DOMMatrix (which pdf.js / pdf-parse v2 need
// and which aren't present in Node / Vercel runtimes).
async function extractPdfData(buffer: Buffer): Promise<PdfData> {
  const mupdf = (await import("mupdf")).default;
  const doc = mupdf.Document.openDocument(buffer, "application/pdf");

  const title = safeGetMeta(doc, "info:Title");
  const author = safeGetMeta(doc, "info:Author");
  const subject = safeGetMeta(doc, "info:Subject");
  const keywords = safeGetMeta(doc, "info:Keywords");
  const creator = safeGetMeta(doc, "info:Creator");

  const pageCount = doc.countPages();

  // Cap text extraction to avoid blowing the 60s function timeout on huge PDFs.
  // 50k-char slice downstream means reading ~200 pages is plenty.
  const MAX_PAGES_FOR_TEXT = 200;
  const pagesToRead = Math.min(pageCount, MAX_PAGES_FOR_TEXT);

  const chunks: string[] = [];
  for (let i = 0; i < pagesToRead; i++) {
    try {
      const page = doc.loadPage(i);
      const text = page.toStructuredText().asText();
      if (text) chunks.push(text);
    } catch {
      /* skip unreadable page */
    }
  }

  return {
    title: title || undefined,
    author: author || creator || undefined,
    subject: subject || undefined,
    keywords: keywords || undefined,
    pageCount,
    fullText: chunks.join("\n"),
  };
}

function safeGetMeta(doc: { getMetaData: (k: string) => string | undefined }, key: string): string | undefined {
  try {
    const v = doc.getMetaData(key);
    return typeof v === "string" && v.length > 0 ? v : undefined;
  } catch {
    return undefined;
  }
}

/** Renders page 1 of a PDF to a PNG data URI (~800px wide). Shared with DOI OA PDF thumbnails. */
export async function renderPdfFirstPageDataUri(buffer: Buffer): Promise<string | undefined> {
  try {
    const mupdf = (await import("mupdf")).default;

    const doc = mupdf.Document.openDocument(buffer, "application/pdf");
    const page = doc.loadPage(0); // 0-indexed

    // Scale to ~800px wide for a readable thumbnail
    const bounds = page.getBounds();
    const scale = 800 / (bounds[2] - bounds[0]);
    const matrix = mupdf.Matrix.scale(scale, scale);

    const pixmap = page.toPixmap(
      matrix,
      mupdf.ColorSpace.DeviceRGB,
      false, // no alpha
      true   // annots
    );

    const pngBytes = pixmap.asPNG();
    return `data:image/png;base64,${Buffer.from(pngBytes).toString("base64")}`;
  } catch (err) {
    console.warn("[pdf-thumbnail] Failed to generate thumbnail:", err);
    return undefined;
  }
}
