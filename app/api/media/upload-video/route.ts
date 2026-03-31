import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
// Allow up to 5 minutes: video download + Firebase Storage upload can be slow
export const maxDuration = 300;

const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // 500 MB

function videoExtFromContentType(ct: string): string {
  if (ct.includes("webm")) return "webm";
  if (ct.includes("quicktime") || ct.includes("mov")) return "mov";
  return "mp4";
}

/**
 * Upload a video to Firebase Storage server-side, using the caller's Firebase
 * ID token so Storage security rules are enforced identically to client uploads.
 *
 * Returns: { downloadUrl: string, storagePath: string }
 *
 * POST /api/media/upload-video
 * Body: { url: string, itemId: string, idToken: string }
 *
 * - For YouTube URLs, uses @distube/ytdl-core (audio+video combined stream).
 * - For all other URLs, uses yt-dlp-exec (Instagram, TikTok, Twitter, etc.).
 *
 * Notes:
 * - Instagram requires the Reel/post to be public.
 * - TikTok: works for most public videos.
 * - Large videos (>500 MB) are rejected before download begins.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { url?: string; itemId?: string; idToken?: string };
    const { url, itemId, idToken } = body;

    if (!url || !itemId || !idToken) {
      return NextResponse.json({ error: "url, itemId, and idToken are required" }, { status: 400 });
    }

    const bucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    if (!bucket) {
      return NextResponse.json({ error: "Storage bucket not configured" }, { status: 500 });
    }

    let videoBuffer: Buffer;
    let contentType: string;
    let ext: string;
    let totalMediaCount: number | undefined;

    const isYouTube = /youtu(?:be\.com|\.be)/.test(url);

    if (isYouTube) {
      // YouTube: use ytdl-core which handles audio+video merge without ffmpeg
      const ytdl = await import("@distube/ytdl-core");
      const info = await ytdl.default.getInfo(url);
      const format = ytdl.default.chooseFormat(info.formats, {
        quality: "highestvideo",
        filter: "audioandvideo",
      });

      // Check size before downloading
      const sizeBytes = parseInt(format.contentLength ?? "0", 10);
      if (sizeBytes > MAX_VIDEO_BYTES) {
        return NextResponse.json(
          { error: `Video too large: ${Math.round(sizeBytes / 1024 / 1024)} MB (max 500 MB)` },
          { status: 413 }
        );
      }

      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        const stream = ytdl.default(url, { format });
        stream.on("data", (chunk: Buffer) => chunks.push(chunk));
        stream.on("end", resolve);
        stream.on("error", reject);
      });
      videoBuffer = Buffer.concat(chunks);
      contentType = format.mimeType?.split(";")[0] ?? "video/mp4";
      ext = videoExtFromContentType(contentType);
    } else {
      // Instagram, TikTok, Twitter, etc.: let yt-dlp download to a temp file.
      // Re-fetching the CDN URL separately fails on TikTok (session cookies required).
      const { downloadVideo } = await import("@/lib/metadata/video-extract");
      const downloaded = await downloadVideo(url);
      videoBuffer = downloaded.buffer;
      contentType = downloaded.contentType;
      ext = downloaded.ext;
      if (downloaded.totalMediaCount) totalMediaCount = downloaded.totalMediaCount;
    }

    // ── Upload to Firebase Storage (same wire format as @firebase/storage) ─────
    // Simple POST + uploadType=media often omits object metadata that Security
    // Rules read (e.g. contentType), so rules like video/.* fail with 403. The
    // official SDK uses multipart/related + X-Goog-Upload-Protocol: multipart.
    const storagePath = `media/items/${itemId}.${ext}`;
    const enc = encodeURIComponent;
    const uploadUrl =
      `https://firebasestorage.googleapis.com/v0/b/${enc(bucket)}/o?name=${enc(storagePath)}`;

    const boundary = `kanon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    const metaJson = JSON.stringify({
      name: storagePath,
      contentType,
    });
    const crlf = "\r\n";
    const prefix =
      `--${boundary}${crlf}` +
      `Content-Type: application/json; charset=utf-8${crlf}${crlf}` +
      metaJson +
      `${crlf}--${boundary}${crlf}` +
      `Content-Type: ${contentType}${crlf}${crlf}`;
    const suffix = `${crlf}--${boundary}--${crlf}`;
    const uploadBody = Buffer.concat([
      Buffer.from(prefix, "utf8"),
      videoBuffer,
      Buffer.from(suffix, "utf8"),
    ]);

    const uploadHeaders: Record<string, string> = {
      Authorization: `Bearer ${idToken}`,
      "X-Goog-Upload-Protocol": "multipart",
      "Content-Type": `multipart/related; boundary=${boundary}`,
    };
    const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
    if (appId) uploadHeaders["X-Firebase-GMPID"] = appId;
    uploadHeaders["X-Firebase-Storage-Version"] = "webjs/12";

    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: uploadHeaders,
      body: uploadBody,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text().catch(() => uploadRes.statusText);
      return NextResponse.json(
        { error: `Storage upload failed (${uploadRes.status}): ${errText}` },
        { status: 502 }
      );
    }

    const uploadData = (await uploadRes.json()) as Record<string, unknown>;

    /** Firebase may return several comma-separated tokens; use the first. Browser <video> GET has no Firebase auth — needs ?token= for public-style access. */
    function firstDownloadToken(data: Record<string, unknown>): string | undefined {
      const raw = data.downloadTokens;
      if (typeof raw !== "string" || !raw.trim()) return undefined;
      return raw.split(",")[0]?.trim() || undefined;
    }

    let token = firstDownloadToken(uploadData);
    if (!token) {
      const metaUrl = `https://firebasestorage.googleapis.com/v0/b/${enc(bucket)}/o/${enc(storagePath)}`;
      const metaRes = await fetch(metaUrl, {
        headers: { Authorization: `Firebase ${idToken}` },
      });
      if (metaRes.ok) {
        token = firstDownloadToken((await metaRes.json()) as Record<string, unknown>);
      }
    }

    const baseObjectUrl = `https://firebasestorage.googleapis.com/v0/b/${enc(bucket)}/o/${enc(storagePath)}`;
    const downloadUrl = token
      ? `${baseObjectUrl}?alt=media&token=${encodeURIComponent(token)}`
      : baseObjectUrl;

    if (!token) {
      return NextResponse.json(
        {
          error:
            "Upload succeeded but no download token was returned. " +
            "Without a token, browsers cannot read the file (Storage rules require auth). " +
            "Check the upload response / retry, or open the file in Firebase Console → Storage.",
          storagePath,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      downloadUrl,
      storagePath,
      ...(totalMediaCount && totalMediaCount > 1 ? { totalMediaCount } : {}),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
