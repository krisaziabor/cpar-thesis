import { createHash } from "crypto";
import {
  doc,
  getDoc,
  setDoc,
  addDoc,
  collection,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { CanonItemMetadata } from "./types";

const CACHE_COLLECTION = "metadataCache";
const LOG_COLLECTION = "metadataEnrichmentLogs";
const CACHE_TTL_DAYS = 30;

// Tracking/noise params to strip before caching
const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "msclkid",
  "_ga",
  "_gl",
  "ref",
];

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");
    for (const p of TRACKING_PARAMS) u.searchParams.delete(p);
    if (u.pathname.endsWith("/") && u.pathname.length > 1) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return url.toLowerCase().trim();
  }
}

export function urlCacheKey(url: string): string {
  return createHash("sha256").update(normalizeUrl(url)).digest("hex").slice(0, 40);
}

interface CacheEntry {
  url: string;
  metadata: CanonItemMetadata;
  resolvedAt: Timestamp;
  aiEnriched: boolean;
  confidenceScore: number;
}

export async function getCachedMetadata(url: string): Promise<CanonItemMetadata | null> {
  if (!db) return null;
  try {
    const ref = doc(db, CACHE_COLLECTION, urlCacheKey(url));
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;

    const entry = snap.data() as CacheEntry;
    const ageDays =
      (Date.now() - entry.resolvedAt.toMillis()) / (1000 * 60 * 60 * 24);

    // Stale but usable as fallback — caller decides; here we return null for
    // stale entries so fresh fetch is attempted first
    if (ageDays > CACHE_TTL_DAYS) return null;

    const metadata = entry.metadata;
    const sourceType = metadata.source_metadata?.source_type;
    const publishedDate = metadata.source_metadata?.published_date?.trim();

    // Backfill path: old YouTube cache entries may predate published_date support.
    // Force a refresh once so the date can be recovered and recached.
    if (sourceType === "youtube" && !publishedDate) {
      return null;
    }

    return metadata;
  } catch {
    return null;
  }
}

// Firestore rejects undefined values — strip them recursively before writing
function stripUndefined<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map(stripUndefined) as unknown as T;
  }
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, stripUndefined(v)])
    ) as T;
  }
  return obj;
}

export async function setCachedMetadata(
  url: string,
  metadata: CanonItemMetadata,
  aiEnriched: boolean,
  confidenceScore: number
): Promise<void> {
  if (!db) return;
  try {
    const entry: CacheEntry = stripUndefined({
      url: normalizeUrl(url),
      metadata,
      resolvedAt: Timestamp.now(),
      aiEnriched,
      confidenceScore,
    });
    await setDoc(doc(db, CACHE_COLLECTION, urlCacheKey(url)), entry);
  } catch (err) {
    console.warn("[metadata-cache] write failed:", err);
  }
}

export interface EnrichmentLogEntry {
  url: string;
  scoreBeforeAI: number;
  scoreAfterAI: number;
  aiUsed: boolean;
  aiImproved: boolean;
  latencyMs: number;
  model: string;
}

export async function logEnrichment(entry: EnrichmentLogEntry): Promise<void> {
  if (!db) {
    console.log("[metadata-enrichment-log]", JSON.stringify(entry));
    return;
  }
  try {
    await addDoc(collection(db, LOG_COLLECTION), {
      ...entry,
      timestamp: Timestamp.now(),
    });
  } catch {
    // Log failures are non-fatal — fall back to console
    console.log("[metadata-enrichment-log]", JSON.stringify(entry));
  }
}
