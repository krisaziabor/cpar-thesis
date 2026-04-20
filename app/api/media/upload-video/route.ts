import { NextRequest, NextResponse } from "next/server";
import { firebaseStorageMultipartUpload } from "@/lib/server/firebase-storage-multipart";
import { extractVideoPosterJpeg } from "@/lib/metadata/video-poster";

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
 * Returns: { downloadUrl, storagePath, thumbnailUrl? }
 *
 * POST /api/media/upload-video
 * Body: { url: string, itemId: string, idToken: string }
 *
 * - For YouTube URLs, uses @distube/ytdl-core (audio+video combined stream).
 * - For all other URLs, uses yt-dlp-exec (Instagram, TikTok, Twitter, etc.).
 * - After upload, best-effort JPEG poster at ~0.5s → thumbnails/items/{itemId}.jpg
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

    const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

    let videoBuffer: Buffer;
    let contentType: string;
    let ext: string;
    let totalMediaCount: number | undefined;

    const isYouTube = /youtu(?:be\.com|\.be)/.test(url);

    if (isYouTube) {
      const ytdl = await import("@distube/ytdl-core");
      const info = await ytdl.default.getInfo(url);
      const format = ytdl.default.chooseFormat(info.formats, {
        quality: "highestvideo",
        filter: "audioandvideo",
      });

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
      const { downloadVideo } = await import("@/lib/metadata/video-extract");
      const downloaded = await downloadVideo(url);
      videoBuffer = downloaded.buffer;
      contentType = downloaded.contentType;
      ext = downloaded.ext;
      if (downloaded.totalMediaCount) totalMediaCount = downloaded.totalMediaCount;
    }

    const storagePath = `media/items/${itemId}.${ext}`;
    const { downloadUrl } = await firebaseStorageMultipartUpload({
      bucket,
      idToken,
      storagePath,
      bytes: videoBuffer,
      contentType,
      appId,
    });

    let thumbnailUrl: string | undefined;
    try {
      const poster = await extractVideoPosterJpeg(videoBuffer, ext);
      if (poster) {
        const thumbPath = `thumbnails/items/${itemId}.jpg`;
        const thumb = await firebaseStorageMultipartUpload({
          bucket,
          idToken,
          storagePath: thumbPath,
          bytes: poster,
          contentType: "image/jpeg",
          appId,
        });
        thumbnailUrl = thumb.downloadUrl;
      }
    } catch (err) {
      console.warn("[upload-video] poster upload skipped:", err);
    }

    return NextResponse.json({
      downloadUrl,
      storagePath,
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
      ...(totalMediaCount && totalMediaCount > 1 ? { totalMediaCount } : {}),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed" },
      { status: 500 }
    );
  }
}
