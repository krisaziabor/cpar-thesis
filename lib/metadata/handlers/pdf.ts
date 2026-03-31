import type { CanonItemMetadata, SourceMetadata } from "../types";

interface RawPdfInfo {
  Title?: string;
  Author?: string;
  Creator?: string;
  Subject?: string;
  Keywords?: string;
  [key: string]: unknown;
}

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
    extractPdfText(buffer),
    generatePdfThumbnail(buffer),
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

async function extractPdfText(buffer: Buffer): Promise<PdfData> {
  // pdf.js may transfer `data` into a worker. Use a dedicated copy so (1) we don't race with
  // `generatePdfThumbnail(buffer)` on the same backing ArrayBuffer, and (2) Node is less likely
  // to reject `Buffer` in transfer lists on newer runtimes.
  const data = new Uint8Array(buffer.length);
  data.set(buffer);

  // pdf-parse v2+ exports PDFParse (class); v1 was a single function — default is absent in v2 CJS.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PDFParse } = require("pdf-parse") as typeof import("pdf-parse");

  const parser = new PDFParse({ data });
  try {
    // Do not run getInfo + getText in parallel: both touch worker transfer/load and race →
    // "Cannot transfer object of unsupported type" (Node worker_threads / pdf.js).
    const infoResult = await parser.getInfo();
    const textResult = await parser.getText();
    const info: RawPdfInfo = (infoResult.info ?? {}) as RawPdfInfo;

    const title = (info.Title ?? info.title) as string | undefined;
    const author = (info.Author ?? info.author) as string | undefined;
    const creator = (info.Creator ?? info.creator) as string | undefined;
    const subject = (info.Subject ?? info.subject) as string | undefined;
    const keywords = (info.Keywords ?? info.keywords) as string | undefined;

    return {
      title: title || undefined,
      author: author || creator || undefined,
      subject: subject || undefined,
      keywords: typeof keywords === "string" ? keywords : undefined,
      pageCount: textResult.total,
      fullText: textResult.text ?? "",
    };
  } finally {
    await parser.destroy();
  }
}

async function generatePdfThumbnail(buffer: Buffer): Promise<string | undefined> {
  try {
    // mupdf is WASM-based — no native bindings, no canvas/Path2D compatibility
    // issues. It renders directly from the PDF data to a pixmap, then PNG.
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
