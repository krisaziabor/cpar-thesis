import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const ALLOWED_MIME_PREFIXES = ["image/", "audio/", "application/pdf"];
const PDF_LIKE_MIME_TYPES = ["application/octet-stream", "binary/octet-stream"];

/** SSRF prevention: reject localhost, private RFC-1918 ranges, and non-HTTPS. */
function isSafeUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const h = parsed.hostname.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1" || h === "::1") return false;
  if (/^10\./.test(h)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  if (/^192\.168\./.test(h)) return false;
  return true;
}

function looksLikePdfUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    const pathname = decodeURIComponent(parsed.pathname).toLowerCase();
    if (pathname.endsWith(".pdf")) return true;
    // Firebase Storage often encodes the original filename in query params.
    const tokenized = `${parsed.search}${parsed.hash}`.toLowerCase();
    return tokenized.includes(".pdf");
  } catch {
    return false;
  }
}

/**
 * POST /api/media/proxy
 * Body: { url: string }
 *
 * Fetches the target URL server-side (bypassing browser CORS restrictions),
 * validates it is an image, audio, or PDF, and streams the bytes back to the
 * caller. Max 10 MB. Used by the add-item flow to mirror external media into
 * Firebase Storage under the authenticated user's upload.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { url?: string };
    const { url } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "url required" }, { status: 400 });
    }
    if (!isSafeUrl(url)) {
      return NextResponse.json({ error: "URL not allowed" }, { status: 400 });
    }

    const upstream = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Kanon/1.0)",
        Accept: "image/*,audio/*,application/pdf,*/*;q=0.8",
      },
      redirect: "follow",
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream responded with ${upstream.status}` },
        { status: 502 }
      );
    }

    const rawContentType = upstream.headers.get("content-type") ?? "";
    const contentType = rawContentType.split(";")[0].trim() || "application/octet-stream";

    const isKnownAllowedType = ALLOWED_MIME_PREFIXES.some((p) => contentType.startsWith(p));
    const isPdfLikeFallbackType =
      PDF_LIKE_MIME_TYPES.includes(contentType) && looksLikePdfUrl(url);

    if (!isKnownAllowedType && !isPdfLikeFallbackType) {
      return NextResponse.json(
        { error: `Content type not proxiable: ${contentType}` },
        { status: 415 }
      );
    }

    const buffer = await upstream.arrayBuffer();

    // PDFs are frequently larger than thumbnails/audio previews.
    const MAX_BYTES = (isKnownAllowedType && contentType.startsWith("application/pdf")) || isPdfLikeFallbackType
      ? 50 * 1024 * 1024 // 50 MB
      : 10 * 1024 * 1024; // 10 MB
    if (buffer.byteLength > MAX_BYTES) {
      return NextResponse.json(
        { error: `File exceeds ${Math.floor(MAX_BYTES / (1024 * 1024))} MB limit` },
        { status: 413 }
      );
    }

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Proxy error" },
      { status: 502 }
    );
  }
}
