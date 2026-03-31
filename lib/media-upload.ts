import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";

/**
 * Fetch bytes from an external URL via the server-side CORS proxy, then upload
 * them to Firebase Storage at `storagePath`. Returns the Firebase download URL.
 */
async function uploadFromProxy(externalUrl: string, storagePath: string): Promise<string> {
  if (!storage) throw new Error("Storage not initialised");

  const res = await fetch("/api/media/proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: externalUrl }),
  });

  if (!res.ok) {
    let errMsg = res.statusText;
    try {
      const body = await res.json() as { error?: string };
      if (body.error) errMsg = body.error;
    } catch { /* ignore */ }
    throw new Error(`Media proxy failed (${res.status}): ${errMsg}`);
  }

  const headerCt =
    res.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";

  /** Storage rules require image/* for thumbnails — align metadata even if header is odd. */
  let contentType = headerCt || "application/octet-stream";
  if (storagePath.startsWith("thumbnails/")) {
    const ext = storagePath.split(".").pop()?.toLowerCase() ?? "jpg";
    const byExt: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      gif: "image/gif",
    };
    const fallback = byExt[ext] ?? "image/jpeg";
    if (!contentType.startsWith("image/")) {
      contentType = fallback;
    }
  }

  const buffer = await res.arrayBuffer();
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, buffer, { contentType });
  return getDownloadURL(storageRef);
}

/**
 * Download an external thumbnail image and upload it to Firebase Storage.
 * Path: `thumbnails/items/{itemId}.{ext}`
 */
export async function mirrorThumbnail(externalUrl: string, itemId: string): Promise<string> {
  const ext = externalUrl.match(/\.(png|webp|gif|jpg|jpeg)(?:[?#]|$)/i)?.[1]?.toLowerCase() ?? "jpg";
  return uploadFromProxy(externalUrl, `thumbnails/items/${itemId}.${ext}`);
}

/**
 * Download a Spotify (or other platform) 30-second preview MP3 and upload it
 * to Firebase Storage.
 * Path: `previews/items/{itemId}.mp3`
 */
export async function mirrorPreviewAudio(externalUrl: string, itemId: string): Promise<string> {
  return uploadFromProxy(externalUrl, `previews/items/${itemId}.mp3`);
}

/**
 * Download the actual video file for a URL (Instagram Reel, TikTok video,
 * YouTube video, Twitter video, etc.) and upload it to Firebase Storage.
 *
 * This call hits the server-side `/api/media/upload-video` route which uses
 * yt-dlp (Instagram/TikTok/Twitter) or ytdl-core (YouTube) to extract and
 * download the video, then uploads directly to Storage using the caller's
 * Firebase ID token.
 *
 * Path: `media/items/{itemId}.{ext}`
 * Sets: `media_url` on the item document.
 *
 * @param sourceUrl  The original page URL (e.g. https://www.instagram.com/reel/…)
 * @param itemId     Firestore item ID (used as filename)
 * @param idToken    Firebase Auth ID token from `auth.currentUser.getIdToken()`
 */
/**
 * Upload a base64 data URI thumbnail directly to Firebase Storage (client-side).
 * Used when the metadata pipeline returns `thumbnail_base64` for image/PDF uploads —
 * storing raw base64 in Firestore would exceed the 1 MB field limit.
 * Path: `thumbnails/items/{itemId}.{ext}`
 */
export async function uploadBase64Thumbnail(dataUri: string, itemId: string): Promise<string> {
  if (!storage) throw new Error("Storage not initialised");
  const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid base64 data URI");
  const [, mimeType, b64] = match;
  const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const storageRef = ref(storage, `thumbnails/items/${itemId}.${ext}`);
  await uploadBytes(storageRef, bytes, { contentType: mimeType });
  return getDownloadURL(storageRef);
}

export interface MirrorVideoResult {
  downloadUrl: string;
  /** Set when the source post contained more than one media item; only the first was saved. */
  totalMediaCount?: number;
}

export async function mirrorVideo(
  sourceUrl: string,
  itemId: string,
  idToken: string
): Promise<MirrorVideoResult> {
  const res = await fetch("/api/media/upload-video", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: sourceUrl, itemId, idToken }),
  });

  if (!res.ok) {
    let errMsg = res.statusText;
    try {
      const body = await res.json() as { error?: string };
      if (body.error) errMsg = body.error;
    } catch { /* ignore */ }
    throw new Error(`Video upload failed (${res.status}): ${errMsg}`);
  }

  const data = await res.json() as { downloadUrl: string; totalMediaCount?: number };
  return { downloadUrl: data.downloadUrl, totalMediaCount: data.totalMediaCount };
}
