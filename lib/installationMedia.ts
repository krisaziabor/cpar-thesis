/**
 * installationMedia.ts
 *
 * Helpers for managing installation-specific media overrides on Item records.
 * Files live at:
 *   installation-media/{recordId}/file/{filename}
 *   installation-media/{recordId}/thumbnail/{filename}
 *   installation-media/{recordId}/pdf-pages/page-{n}.jpg
 *
 * Ownership rule: only delete Storage objects where isOwnedFile === true.
 * PDF page images are always owned regardless of whether the source PDF was
 * uploaded or linked.
 */

import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  ref,
  uploadBytesResumable,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { db, storage } from "./firebase";
import type {
  Item,
  InstallationMedia,
  InstallationMediaFile,
  InstallationMediaThumbnail,
  InstallationPdfPage,
} from "./types";

// ── Constants ─────────────────────────────────────────────────────────────────

const ACCEPTED_FILE_TYPES = new Set([
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "image/jpeg",
  "image/png",
]);

const ACCEPTED_THUMBNAIL_TYPES = new Set(["image/jpeg", "image/png"]);

export const MAX_FILE_BYTES = 500 * 1024 * 1024; // 500 MB
export const MAX_THUMBNAIL_BYTES = 50 * 1024 * 1024; // 50 MB

export const ACCEPTED_FILE_EXTS = "audio/mpeg,.mp3,audio/wav,.wav,video/mp4,.mp4,video/quicktime,.mov,video/webm,.webm,image/jpeg,.jpg,image/png,.png";
export const ACCEPTED_THUMBNAIL_EXTS = "image/jpeg,.jpg,image/png,.png";

// ── Internal helpers ──────────────────────────────────────────────────────────

function fileTypeFromMime(mime: string): "audio" | "video" | "image" {
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "image";
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function extractFileName(url: string): string {
  try {
    const decoded = decodeURIComponent(new URL(url).pathname);
    const part = decoded.split("/").pop() ?? "";
    // Firebase Storage paths encode as "files%2Fitems%2Fid.pdf" — strip after last /
    return part.split("?")[0] || "";
  } catch {
    return "";
  }
}

async function safeDeletePath(storagePath: string): Promise<void> {
  if (!storage || !storagePath) return;
  try {
    await deleteObject(ref(storage, storagePath));
  } catch {
    // Non-fatal — file may not exist or already deleted
  }
}

async function cleanupInstallationFile(file: InstallationMediaFile): Promise<void> {
  if (file.isOwnedFile && file.storagePath) {
    await safeDeletePath(file.storagePath);
  }
  // PDF page images are always owned; always clean them up
  if (file.pdfData?.pages) {
    await Promise.all(file.pdfData.pages.map((p) => safeDeletePath(p.storagePath)));
  }
}

async function getCurrentInstallationMedia(recordId: string): Promise<InstallationMedia | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, "items", recordId));
  return (snap.data() as { installationMedia?: InstallationMedia | null })?.installationMedia ?? null;
}

function resumableUpload(
  storagePath: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<string> {
  if (!storage) return Promise.reject(new Error("Storage not initialised"));
  const storageRef = ref(storage, storagePath);
  const task = uploadBytesResumable(storageRef, file, { contentType: file.type });
  return new Promise((resolve, reject) => {
    task.on(
      "state_changed",
      (snapshot) => {
        onProgress?.(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
      },
      reject,
      async () => {
        try {
          resolve(await getDownloadURL(task.snapshot.ref));
        } catch (err) {
          reject(err);
        }
      },
    );
  });
}

// ── Native file detection ─────────────────────────────────────────────────────

export interface NativeFileInfo {
  url: string;
  fileType: "audio" | "video" | "image" | "pdf";
  fileName: string;
}

/**
 * Returns the native media file URL for this record if one exists, along with
 * its type and a derived filename. Returns null if no usable file URL is found.
 *
 * Priority:
 *   1. media_url (uploaded/mirrored file stored in Firebase Storage)
 *   2. link — only for PDF records where the link is the source PDF
 */
export function getNativeFileInfo(item: Item): NativeFileInfo | null {
  const sourceType = item.source_metadata?.source_type;
  const recordType = (item.type ?? "").toLowerCase();

  if (item.media_url) {
    const url = item.media_url;
    const lower = url.toLowerCase();

    // Uploaded PDF (stored at files/items/{id}.pdf)
    if (sourceType === "pdf" || lower.includes(".pdf")) {
      return {
        url,
        fileType: "pdf",
        fileName: extractFileName(url) || `${item.title}.pdf`,
      };
    }

    // Mirrored video from social/YouTube
    if (
      ["video", "instagram", "tiktok", "twitter", "youtube"].includes(sourceType ?? "") ||
      lower.includes(".mp4") || lower.includes(".mov") || lower.includes(".webm")
    ) {
      return {
        url,
        fileType: "video",
        fileName: extractFileName(url) || `${item.title}.mp4`,
      };
    }

    // Image / artwork
    if (["image", "photo", "photograph", "artwork"].includes(recordType)) {
      const ext = lower.includes(".png") ? "png" : "jpg";
      return {
        url,
        fileType: "image",
        fileName: extractFileName(url) || `${item.title}.${ext}`,
      };
    }

    // Fallback: treat any media_url as an image if it looks like one
    if (lower.includes(".jpg") || lower.includes(".jpeg") || lower.includes(".png") || lower.includes(".webp")) {
      return {
        url,
        fileType: "image",
        fileName: extractFileName(url) || `${item.title}.jpg`,
      };
    }
  }

  // PDF linked by URL (not uploaded to Storage)
  if (item.link && (sourceType === "pdf" || item.link.toLowerCase().endsWith(".pdf"))) {
    return {
      url: item.link,
      fileType: "pdf",
      fileName: extractFileName(item.link) || `${item.title}.pdf`,
    };
  }

  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Upload a media file for the installation. Replaces any existing file.
 * Cleans up orphan Storage objects on Firestore failure.
 */
export async function uploadInstallationFile(
  recordId: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<void> {
  if (!db) throw new Error("Firestore not initialised");
  if (!storage) throw new Error("Storage not initialised");

  if (!ACCEPTED_FILE_TYPES.has(file.type)) {
    throw new Error("File type not accepted. Allowed: mp3, wav, mp4, mov, webm, jpg, png.");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`File too large. Maximum size is 500 MB (yours: ${(file.size / 1024 / 1024).toFixed(1)} MB).`);
  }

  // Clean up the previous file (respects ownership)
  const current = await getCurrentInstallationMedia(recordId);
  if (current?.file) {
    await cleanupInstallationFile(current.file);
  }

  const storagePath = `installation-media/${recordId}/file/${sanitizeFilename(file.name)}`;
  const fileUrl = await resumableUpload(storagePath, file, onProgress);

  const fileData: Omit<InstallationMediaFile, "uploadedAt"> & { uploadedAt: unknown } = {
    fileUrl,
    fileType: fileTypeFromMime(file.type),
    fileName: file.name,
    fileSize: file.size,
    storagePath,
    isOwnedFile: true,
    uploadedAt: serverTimestamp(),
  };

  try {
    await updateDoc(doc(db, "items", recordId), {
      "installationMedia.file": fileData,
    });
  } catch (err) {
    await safeDeletePath(storagePath);
    throw err;
  }
}

/**
 * Link an existing non-PDF file URL as the installation media file.
 * Does not upload anything. Sets isOwnedFile: false so removal never
 * touches the original file in Storage.
 */
export async function linkExistingFile(
  recordId: string,
  url: string,
  fileType: "audio" | "video" | "image",
  fileName: string,
): Promise<void> {
  if (!db) throw new Error("Firestore not initialised");

  const current = await getCurrentInstallationMedia(recordId);
  if (current?.file) {
    await cleanupInstallationFile(current.file);
  }

  const fileData: Omit<InstallationMediaFile, "uploadedAt"> & { uploadedAt: unknown } = {
    fileUrl: url,
    fileType,
    fileName,
    fileSize: 0,
    storagePath: null,
    isOwnedFile: false,
    uploadedAt: serverTimestamp(),
  };

  await updateDoc(doc(db, "items", recordId), {
    "installationMedia.file": fileData,
  });
}

/**
 * Process a referenced PDF without re-uploading it:
 *   1. Fetch the PDF as ArrayBuffer
 *   2. Render each page to JPEG via PDF.js
 *   3. Upload rendered pages to Storage (these ARE owned)
 *   4. Write installationMedia.file with pdfData
 *
 * onProgress receives (stage, 0–100) where stage is a short label.
 */
export async function processAndLinkPdf(
  recordId: string,
  pdfUrl: string,
  fileName: string,
  onProgress?: (stage: string, pct: number) => void,
): Promise<void> {
  if (!db) throw new Error("Firestore not initialised");
  if (!storage) throw new Error("Storage not initialised");

  // Clean up previous file
  const current = await getCurrentInstallationMedia(recordId);
  if (current?.file) {
    await cleanupInstallationFile(current.file);
  }

  // 1. Fetch the PDF
  onProgress?.("Fetching PDF…", 0);
  let pdfBuffer: ArrayBuffer;
  try {
    const response = await fetch(pdfUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch PDF (HTTP ${response.status}).`);
    }
    pdfBuffer = await response.arrayBuffer();
  } catch (err) {
    throw new Error(
      `Could not fetch PDF: ${err instanceof Error ? err.message : String(err)}. ` +
      "If this is a CORS issue, try downloading and re-uploading the file directly."
    );
  }
  onProgress?.("Fetching PDF…", 10);

  // 2. Load with PDF.js (dynamic import to keep bundle size down)
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

  const pdf = await pdfjs.getDocument({ data: pdfBuffer }).promise;
  const pageCount = pdf.numPages;

  // 3. Render pages + count words
  const pages: InstallationPdfPage[] = [];
  const pageStoragePaths: string[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const renderPct = 10 + Math.round(((i - 1) / pageCount) * 70);
    onProgress?.(`Rendering page ${i} of ${pageCount}…`, renderPct);

    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 1.5 });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvasContext: ctx, canvas, viewport }).promise;

    // Word count from text layer
    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((item) => ("str" in item ? (item as { str: string }).str : ""))
      .join(" ");
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

    // Convert canvas to JPEG blob
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob failed"))),
        "image/jpeg",
        0.85,
      );
    });

    // Upload to Storage
    const storagePath = `installation-media/${recordId}/pdf-pages/page-${i}.jpg`;
    pageStoragePaths.push(storagePath);
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, blob, { contentType: "image/jpeg" });
    const imageUrl = await getDownloadURL(storageRef);

    pages.push({ pageIndex: i - 1, imageUrl, storagePath, wordCount });
    onProgress?.(`Rendering page ${i} of ${pageCount}…`, renderPct + Math.round(70 / pageCount));
  }

  onProgress?.("Saving…", 80);

  const totalWordCount = pages.reduce((sum, p) => sum + p.wordCount, 0);

  const fileData: Omit<InstallationMediaFile, "uploadedAt" | "pdfData"> & {
    uploadedAt: unknown;
    pdfData: Omit<InstallationPdfPage extends never ? never : object, never> & {
      sourceUrl: string;
      pageCount: number;
      totalWordCount: number;
      pages: InstallationPdfPage[];
      renderedAt: unknown;
    };
  } = {
    fileUrl: pdfUrl,
    fileType: "pdf",
    fileName,
    fileSize: pdfBuffer.byteLength,
    storagePath: null,
    isOwnedFile: false,
    uploadedAt: serverTimestamp(),
    pdfData: {
      sourceUrl: pdfUrl,
      pageCount,
      totalWordCount,
      pages,
      renderedAt: serverTimestamp(),
    },
  };

  try {
    await updateDoc(doc(db, "items", recordId), {
      "installationMedia.file": fileData,
    });
  } catch (err) {
    // Clean up the page images we uploaded
    await Promise.all(pageStoragePaths.map(safeDeletePath));
    throw err;
  }

  onProgress?.("Done", 100);
}

/**
 * Upload a custom thumbnail for the installation. Replaces any existing
 * custom thumbnail. Sets thumbnail.source to 'custom'.
 */
export async function uploadInstallationThumbnail(
  recordId: string,
  file: File,
  onProgress?: (pct: number) => void,
): Promise<void> {
  if (!db) throw new Error("Firestore not initialised");
  if (!storage) throw new Error("Storage not initialised");

  if (!ACCEPTED_THUMBNAIL_TYPES.has(file.type)) {
    throw new Error("Thumbnail type not accepted. Allowed: jpg, png.");
  }
  if (file.size > MAX_THUMBNAIL_BYTES) {
    throw new Error(`Thumbnail too large. Maximum size is 50 MB (yours: ${(file.size / 1024 / 1024).toFixed(1)} MB).`);
  }

  const current = await getCurrentInstallationMedia(recordId);
  if (current?.thumbnail?.storagePath) {
    await safeDeletePath(current.thumbnail.storagePath);
  }

  const storagePath = `installation-media/${recordId}/thumbnail/${sanitizeFilename(file.name)}`;
  const fileUrl = await resumableUpload(storagePath, file, onProgress);

  const thumbData: Omit<InstallationMediaThumbnail, "uploadedAt"> & { uploadedAt: unknown } = {
    source: "custom",
    fileUrl,
    storagePath,
    fileName: file.name,
    uploadedAt: serverTimestamp(),
  };

  try {
    await updateDoc(doc(db, "items", recordId), {
      "installationMedia.thumbnail": thumbData,
    });
  } catch (err) {
    await safeDeletePath(storagePath);
    throw err;
  }
}

/** Delete the installation file and clear the Firestore field. */
export async function removeInstallationFile(recordId: string): Promise<void> {
  if (!db) throw new Error("Firestore not initialised");
  const current = await getCurrentInstallationMedia(recordId);
  if (current?.file) {
    await cleanupInstallationFile(current.file);
  }
  await updateDoc(doc(db, "items", recordId), {
    "installationMedia.file": null,
  });
}

/** Delete the custom thumbnail and clear the Firestore field. */
export async function removeInstallationThumbnail(recordId: string): Promise<void> {
  if (!db) throw new Error("Firestore not initialised");
  const current = await getCurrentInstallationMedia(recordId);
  if (current?.thumbnail?.storagePath) {
    await safeDeletePath(current.thumbnail.storagePath);
  }
  await updateDoc(doc(db, "items", recordId), {
    "installationMedia.thumbnail": null,
  });
}

/**
 * Switch thumbnail source without uploading a file.
 * Use 'native' to defer to the record's own thumbnail.
 * Use 'none' to explicitly show no thumbnail (full-bleed video / blank panel).
 */
export async function setThumbnailSource(
  recordId: string,
  source: "native" | "none",
): Promise<void> {
  if (!db) throw new Error("Firestore not initialised");

  if (source === "none") {
    const current = await getCurrentInstallationMedia(recordId);
    if (current?.thumbnail?.storagePath) {
      await safeDeletePath(current.thumbnail.storagePath);
    }
    await updateDoc(doc(db, "items", recordId), {
      "installationMedia.thumbnail": null,
    });
  } else {
    await updateDoc(doc(db, "items", recordId), {
      "installationMedia.thumbnail": { source: "native" },
    });
  }
}

/**
 * Resolve the URL to display as the visual anchor for this record in the
 * installation. Returns null if no thumbnail should be shown.
 *
 * Resolution order:
 *   1. installationMedia.thumbnail.source === 'custom' → custom fileUrl
 *   2. installationMedia.thumbnail.source === 'native' → fall through to native
 *   3. installationMedia.thumbnail === null  → no thumbnail
 *   4. installationMedia absent              → fall through to native
 *
 * Native fallback by type:
 *   image/photo/artwork → item.media_url ?? item.thumbnail_url
 *   everything else     → item.thumbnail_url
 */
export function getDisplayThumbnail(item: Item): string | null {
  const im = item.installationMedia;

  if (im !== undefined && im !== null) {
    if (im.thumbnail === null) return null; // explicitly none

    if (im.thumbnail?.source === "custom" && im.thumbnail.fileUrl) {
      return im.thumbnail.fileUrl;
    }
    // source === 'native' falls through to native logic below
  }

  return getNativeThumbnail(item);
}

function getNativeThumbnail(item: Item): string | null {
  const type = (item.type ?? "").toLowerCase();
  if (["image", "photo", "photograph", "artwork"].includes(type)) {
    return item.media_url ?? item.thumbnail_url ?? null;
  }
  return item.thumbnail_url ?? null;
}

// ── Assignment status helper ──────────────────────────────────────────────────

export type AssignmentStatus = "unassigned" | "partial" | "full";

export function getAssignmentStatus(item: Item): AssignmentStatus {
  const im = item.installationMedia;
  if (!im) return "unassigned";
  const hasFile = !!im.file;
  const hasThumbnail = im.thumbnail !== undefined && im.thumbnail !== null;
  if (hasFile && hasThumbnail) return "full";
  if (hasFile || hasThumbnail) return "partial";
  return "unassigned";
}
