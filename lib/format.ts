/**
 * Shared formatting helpers for Firestore timestamps, media types, and
 * playback durations. Centralizes patterns that were previously duplicated
 * across pages and components.
 */

/** True for a Firestore Timestamp-like object (has `.toDate()`). */
function isFirestoreTs(value: unknown): value is { toDate: () => Date } {
  return (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate: unknown }).toDate === "function"
  );
}

/** Convert a Firestore Timestamp-like value to epoch milliseconds (or 0). */
export function tsMillis(ts: unknown): number {
  if (isFirestoreTs(ts)) return ts.toDate().getTime();
  return 0;
}

/** Convert a Firestore Timestamp-like value to a Date, or null. */
export function tsToDate(ts: unknown): Date | null {
  if (isFirestoreTs(ts)) return ts.toDate();
  return null;
}

/**
 * Format a Firestore Timestamp as "Mon D, YYYY".
 *
 * - Returns `fallback` when `ts` is falsy.
 * - Falls back to `String(ts)` when `ts` is not a Firestore Timestamp.
 */
export function formatFirestoreDate(
  ts: unknown,
  fallback: string = "—"
): string {
  if (!ts) return fallback;
  const date = tsToDate(ts);
  if (!date) return String(ts);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format a Firestore Timestamp as "Mon D, YYYY h:mm AM".
 */
export function formatFirestoreDateTime(
  ts: unknown,
  fallback: string = "—"
): string {
  if (!ts) return fallback;
  const date = tsToDate(ts);
  if (!date) return String(ts);
  const day = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${day} ${time}`;
}

/**
 * Human relative date — "today", "yesterday", "3 days ago", "2 weeks ago",
 * falling back to `formatFirestoreDate` for anything ≥ 30 days old or not a
 * recognizable Timestamp.
 */
export function formatRelativeDate(ts: unknown, fallback: string = ""): string {
  if (!ts) return fallback;
  const date = tsToDate(ts);
  if (!date) return formatFirestoreDate(ts, fallback);
  const diff = Date.now() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const weeks = Math.floor(days / 7);
    return `${weeks} week${weeks !== 1 ? "s" : ""} ago`;
  }
  return formatFirestoreDate(ts, fallback);
}

/**
 * Guess a media type from a storage URL. Used by ItemPanel / add flow when
 * the server didn't tag the upload explicitly.
 */
export function guessMediaType(url: string): "image" | "pdf" | "video" {
  try {
    const path = decodeURIComponent(new URL(url).pathname.split("/o/")[1] ?? "");
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "image";
    if (ext === "pdf") return "pdf";
    if (["mp4", "webm", "mov", "ogg"].includes(ext)) return "video";
  } catch {
    // Malformed URL — fall through to the default.
  }
  return "image";
}

/** Format seconds as MM:SS (e.g. "03:42"). Returns "00:00" for invalid input. */
export function formatMediaTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "00:00";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}
