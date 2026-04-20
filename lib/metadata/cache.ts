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
import type { CanonItemMetadata, SourceType } from "./types";

const CACHE_COLLECTION = "metadataCache";
const LOG_COLLECTION = "metadataEnrichmentLogs";

/** Bump when cache document shape or normalization rules change — forces refetch. */
export const METADATA_CACHE_SCHEMA_VERSION = 3;

const DEFAULT_CACHE_TTL_DAYS = 30;

/** Per-source freshness: news and generic URLs go stale faster than DOI / music. */
const CACHE_TTL_DAYS_BY_SOURCE: Partial<Record<SourceType, number>> = {
  news: 1,
  url: 7,
  instagram: 7,
  tiktok: 7,
  twitter: 7,
  music: 30,
  youtube: 30,
  doi: 365,
};

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
  schemaVersion?: number;
}

function cacheTtlDaysFor(entry: CacheEntry): number {
  const st = entry.metadata?.source_metadata?.source_type as SourceType | undefined;
  if (st && CACHE_TTL_DAYS_BY_SOURCE[st] != null) {
    return CACHE_TTL_DAYS_BY_SOURCE[st]!;
  }
  return DEFAULT_CACHE_TTL_DAYS;
}

/** Past soft TTL we still serve until soft × this factor, while revalidating in the background. */
const CACHE_STALE_GRACE_FACTOR = 2;

function hardTtlDaysFor(entry: CacheEntry): number {
  return cacheTtlDaysFor(entry) * CACHE_STALE_GRACE_FACTOR;
}

export type MetadataCacheResolution =
  | { kind: "miss" }
  | { kind: "hit"; metadata: CanonItemMetadata; revalidateInBackground: boolean };

/**
 * Resolve Firestore metadata cache: fresh hit, stale hit (schedule refresh), or miss.
 * Does not trigger background work by itself — callers must call `scheduleMetadataRefresh`
 * when `revalidateInBackground` is true.
 */
export async function resolveMetadataCache(url: string): Promise<MetadataCacheResolution> {
  if (!db) return { kind: "miss" };
  try {
    const ref = doc(db, CACHE_COLLECTION, urlCacheKey(url));
    const snap = await getDoc(ref);
    if (!snap.exists()) return { kind: "miss" };

    const entry = snap.data() as CacheEntry;
    const ageDays =
      (Date.now() - entry.resolvedAt.toMillis()) / (1000 * 60 * 60 * 24);

    if ((entry.schemaVersion ?? 0) < METADATA_CACHE_SCHEMA_VERSION) return { kind: "miss" };

    if (ageDays > hardTtlDaysFor(entry)) return { kind: "miss" };

    const metadata = entry.metadata;
    const sourceType = metadata.source_metadata?.source_type;
    const publishedDate = metadata.source_metadata?.published_date?.trim();

    // Backfill path: old YouTube cache entries may predate published_date support.
    if (sourceType === "youtube" && !publishedDate) {
      return { kind: "miss" };
    }

    const soft = cacheTtlDaysFor(entry);
    const revalidateInBackground = ageDays > soft;

    return { kind: "hit", metadata, revalidateInBackground };
  } catch {
    return { kind: "miss" };
  }
}

/** Fire-and-forget refresh (uses `refresh: true` — skips cache read, rewrites entry). */
export function scheduleMetadataRefresh(url: string): void {
  if (!url.trim()) return;
  void import("./pipeline")
    .then(({ runMetadataPipeline }) => runMetadataPipeline({ url, refresh: true }))
    .catch((err) => console.warn("[metadata-cache] background refresh failed:", err));
}

/** Read-through cache only — no background revalidation (for diagnostics or tooling). */
export async function getCachedMetadata(url: string): Promise<CanonItemMetadata | null> {
  const r = await resolveMetadataCache(url);
  return r.kind === "hit" ? r.metadata : null;
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
      schemaVersion: METADATA_CACHE_SCHEMA_VERSION,
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
