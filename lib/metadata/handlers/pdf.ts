import type { CanonItemMetadata, SourceMetadata } from "../types";

interface PdfData {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  pageCount: number;
  fullText: string;
}

export async function fetchPdfMetadata(
  buffer: Buffer,
  filename: string
): Promise<CanonItemMetadata> {
  const [pdfData, thumbnailBase64] = await Promise.all([
    extractPdfData(buffer),
    renderPdfFirstPageDataUri(buffer),
  ]);

  const title =
    pdfData.title || filename.replace(/\.pdf$/i, "").replace(/[-_]/g, " ") || "Untitled PDF";
  const creator = pdfData.author || "Unknown";

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
