/**
 * Fetch image bytes from a public HTTPS URL (SSRF-safe subset matching /api/media/proxy).
 */

export function isSafePublicHttpsUrl(raw: string): boolean {
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

export async function fetchPublicImage(
  url: string,
  maxBytes = 10 * 1024 * 1024
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  if (!isSafePublicHttpsUrl(url)) return null;

  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Kanon/1.0)",
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    },
  });

  if (!res.ok) return null;

  const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!mime.startsWith("image/")) return null;

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength < 64 || buf.byteLength > maxBytes) return null;

  return { buffer: buf, mimeType: mime || "image/jpeg" };
}
