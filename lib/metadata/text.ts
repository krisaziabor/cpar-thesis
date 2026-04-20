/**
 * Caption / title cleanup for social and similar sources — hashtags, trailing noise, length.
 */

const ZW_RE = /[\u200B-\u200D\uFEFF]/g;

/** Strip zero-width chars and trailing decorative punctuation / dash runs. */
export function stripTrailingNoise(s: string): string {
  return s
    .replace(ZW_RE, "")
    .replace(/[\s·•]+$/u, "")
    .replace(/[…\.]{2,}$/u, (m) => (m.length > 1 ? "…" : ""))
    .replace(/[—–\-~]+$/u, "")
    .trim();
}

export interface TitleAndHashtags {
  /** Display title without trailing hashtag spam */
  title: string;
  /** Distinct hashtags from the full caption (no # prefix in array) */
  tags: string[];
  /** Original caption after light normalization (newlines preserved where useful) */
  fullCaption: string;
}

/**
 * Split a caption into a short title and hashtag tags.
 * - Uses the first paragraph (before blank line) as the title source when present.
 * - Strips a trailing run of #hashtags from that segment.
 * - Collects all #tags from the full caption into `tags` (deduped, order preserved).
 */
export function splitTitleAndHashtags(raw: string, maxTitleLen = 120): TitleAndHashtags {
  const normalized = raw.replace(ZW_RE, "").replace(/\r\n/g, "\n").trim();
  const fullCaption = normalized;
  if (!fullCaption) {
    return { title: "", tags: [], fullCaption: "" };
  }

  const firstBlock = normalized.split(/\n\n+/)[0] ?? normalized;
  let titlePart = firstBlock.replace(/\n/g, " ").replace(/\s+/g, " ").trim();

  const tags: string[] = [];
  const seen = new Set<string>();
  for (const m of fullCaption.matchAll(/#([\p{L}\p{M}\p{N}_]+)/gu)) {
    const key = m[1].toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      tags.push(m[1]);
    }
  }

  titlePart = titlePart.replace(/(?:\s+#[\p{L}\p{M}\p{N}_]+)+$/gu, "").trim();
  titlePart = stripTrailingNoise(titlePart);

  if (!titlePart && tags.length > 0) {
    titlePart = truncateAtWord(
      fullCaption.replace(/#[\p{L}\p{M}\p{N}_]+/gu, "").replace(/\s+/g, " ").trim(),
      maxTitleLen
    );
  }
  if (!titlePart) {
    titlePart = truncateAtWord(fullCaption.replace(/\s+/g, " ").trim(), maxTitleLen);
  }

  titlePart = truncateAtWord(titlePart, maxTitleLen);

  return { title: titlePart, tags, fullCaption };
}

/** Truncate at last whitespace before max; append ellipsis if truncated. */
export function truncateAtWord(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  const slice = t.slice(0, max - 1);
  const cut = slice.lastIndexOf(" ");
  const out = (cut > max * 0.45 ? slice.slice(0, cut) : slice).trim();
  return out ? `${out}…` : `${t.slice(0, max - 1)}…`;
}

/** "Display Name • Paid partnership" → "Display Name" */
export function stripCreatorSuffix(creator: string): string {
  const t = creator.trim();
  if (!t.includes("•")) return t;
  return t.split(/\s*•\s*/)[0]?.trim() || t;
}
