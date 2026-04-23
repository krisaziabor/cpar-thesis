import { NextRequest, NextResponse } from "next/server";
import { firebaseStorageMultipartUpload } from "@/lib/server/firebase-storage-multipart";
import { extractVideoPosterJpeg } from "@/lib/metadata/video-poster";
import { VideoAuthError, probeMediaPageWithYtDlp } from "@/lib/metadata/video-extract";

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
      try {
        const downloaded = await downloadVideo(url);
        videoBuffer = downloaded.buffer;
        contentType = downloaded.contentType;
        ext = downloaded.ext;
        if (downloaded.totalMediaCount) totalMediaCount = downloaded.totalMediaCount;
      } catch (err) {
        // Graceful fallback: when the platform requires auth we can't provide
        // (expired operator cookies, IG rate-limit on datacenter IP, etc.),
        // save the item as a link with whatever thumbnail we can grab instead
        // of hard-failing the upload.
        if (err instanceof VideoAuthError) {
          const fallback = await saveAsLink({
            url,
            itemId,
            idToken,
            bucket,
            appId,
            reason: err.message,
          });
          return NextResponse.json(fallback);
        }
        throw err;
      }
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

/**
 * Fallback when we can't download the video: upload just a poster image
 * (from the page's public metadata / oEmbed) so the item still has a
 * thumbnail, and return the original URL as `sourceUrl`. The client stores
 * the item as a link card instead of a self-hosted file.
 */
async function saveAsLink(args: {
  url: string;
  itemId: string;
  idToken: string;
  bucket: string;
  appId: string | undefined;
  reason: string;
}): Promise<{
  fallback: true;
  sourceUrl: string;
  thumbnailUrl?: string;
  reason: string;
}> {
  const { url, itemId, idToken, bucket, appId, reason } = args;

  let thumbnailUrl: string | undefined;
  try {
    const probe = await probeMediaPageWithYtDlp(url);
    const remoteThumb = probe?.thumbnailUrl;
    if (remoteThumb) {
      const res = await fetch(remoteThumb);
      if (res.ok) {
        const bytes = Buffer.from(await res.arrayBuffer());
        const ct = res.headers.get("content-type") ?? "image/jpeg";
        const thumbPath = `thumbnails/items/${itemId}.jpg`;
        const upload = await firebaseStorageMultipartUpload({
          bucket,
          idToken,
          storagePath: thumbPath,
          bytes,
          contentType: ct,
          appId,
        });
        thumbnailUrl = upload.downloadUrl;
      }
    }
  } catch (err) {
    console.warn("[upload-video] link-fallback thumbnail skipped:", err);
  }

  return {
    fallback: true,
    sourceUrl: url,
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    reason,
  };
}
