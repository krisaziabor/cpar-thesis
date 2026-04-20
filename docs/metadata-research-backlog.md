# Metadata & graph — research and product depth backlog

This document expands on directions that are **not** fully implemented in code today: scholarly metadata, graph UX, and production operations. Use it for thesis write-ups, roadmap planning, and handoff to future contributors.

---

## 1. OpenAlex and scholarly abstracts (`abstract_inverted_index`)

### Problem

DOI and Crossref-style pipelines often return bibliographic fields (title, authors, journal, year) but omit a plain-text abstract, or ship it in OpenAlex’s **inverted index** form: a map from each token to the positions where it appears in the reconstructed abstract.

### Why it matters

- **Search and previews**: Users expect a short abstract in the item panel and in graph tooltips.
- **AI enrichment**: Models work better with real abstract text than with title-only context.
- **Consistency**: OpenAlex is a stable, open API; it complements Crossref and publisher pages.

### Technical approach

1. **Resolve work**
  Given a DOI, call OpenAlex `https://api.openalex.org/works/https://doi.org/{doi}` (or search by external ID). Store `openalex_id` in `source_metadata.raw` for idempotent refreshes.
2. **Reconstruct abstract**
  If `abstract_inverted_index` is present and `abstract` string is missing:
  - Build an array of `(position, token)` pairs from the index.
  - Sort by position, join tokens with spaces, normalize whitespace.
  - Handle edge cases: empty index, non-contiguous positions (rare), punctuation glued to words.
3. **Fallbacks**
  - Publisher landing page `og:description` or citation_meta.
  - Unpaywall / PMC XML `<abstract>` when the item is open access (policy and rate limits apply).
4. **Caching**
  Scholarly entries already use long TTLs; store reconstructed abstract in cache so reconstruction runs once per schema version.

### Risks and constraints

- OpenAlex rate limits and attribution requirements — follow [their guidelines](https://docs.openalex.org).
- Some works have no abstract in OpenAlex; never block the pipeline on abstract fetch.

### Acceptance criteria (when implemented)

- Items with DOI show `source_metadata.description` or a dedicated `abstract` field populated from OpenAlex when available.
- Unit tests for inverted-index reconstruction using a fixed fixture from the API.

---

## 2. Richer knowledge graph (avatars, identity, link-only nodes)

### Current behavior (summary)

- Nodes may show **type** and **host badges** for link-only or thumbnail-less items.
- Edges and layout are driven by stored items and connections; visual richness is intentionally minimal.

### Product directions

1. **Avatars instead of initials**
  - Pull profile images from metadata when `author_url` or platform oEmbed exposes them.
  - Cache images (Firebase Storage or proxy) to avoid hotlink expiry (Twitter/Instagram CDN URLs rot).
2. **Stable entity IDs**
  - Normalize creators across items: e.g. same Spotify artist ID, same YouTube channel ID, same ORCID for scholars.
  - Enables “merge nodes” or aggregated views without duplicate people.
3. **Link-only and low-metadata items**
  - Tooltip: hostname, fetched title, age of cache, `cache_status` if exposed client-side.
  - Optional user override: custom label / cover image stored on the item.
4. **Temporal and topical layout**
  - Experimental: position by `published_date`, cluster by shared tags or embedding similarity (requires backend jobs and consent for AI).

### Engineering notes

- **Privacy**: Do not fetch third-party avatars without a clear UX purpose; respect platform ToS.
- **Performance**: Graph libraries (e.g. React Flow) degrade with large images; prefer small WebP thumbnails and lazy loading.

---

## 3. Observability, queues, and long-running work

### Observability

- **Structured logs** per handler: `source_type`, `url_host`, `latency_ms`, `cache_status`, `yt_dlp_exit`, `error_code`.
- **Metrics**: cache hit / stale / miss rates; p95 latency for `/api/metadata`; AI enrichment success rate.
- **Tracing**: optional OpenTelemetry on `runMetadataPipeline` for slow-request debugging.

### Queues and long video jobs

- **Problem**: `yt-dlp` + upload + poster extraction can exceed HTTP timeouts for huge files even with high `maxDuration`.
- **Pattern**: enqueue `{ itemId, url, userId }` on a durable queue (Vercel Queues, Cloud Tasks, or Workflow DevKit). Worker performs download → Storage → Firestore update → client subscribes via realtime or polling.
- **User UX**: show “processing” state on the item; retry with backoff on transient CDN failures.

### Storage deduplication

- **Idea**: hash canonical video URL + content fingerprint; if the same asset exists, reference the existing Storage path instead of re-uploading.
- **Tradeoff**: complexity vs Storage cost; start with “dedupe by normalized URL” only.

### Background cache refresh (beyond current SWR)

- Today: stale-while-revalidate **on the next request** schedules `runMetadataPipeline({ refresh: true })`.
- **Extension**: cron or queue worker periodically refreshes high-traffic URLs or items about to expire, so users rarely see `stale` at all.

### Security and abuse

- Rate-limit `/api/metadata` by IP and user.
- SSRF protections on image fetches and URL handlers should stay centralized (as with `fetch-public-image`).

---

## 4. Related environment variables (implemented surfaces)


| Variable                      | Purpose                                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| `YT_DLP_COOKIES_FILE`         | Path to Netscape cookies file passed to yt-dlp (`--cookies`). Checked first.                             |
| `YOUTUBE_DL_PATH`             | Override path to `yt-dlp` binary (see `video-extract.ts`).                                               |
| `YT_DLP_COOKIES_FROM_BROWSER` | e.g. `chrome` — passed as `--cookies-from-browser`. Often unavailable in serverless; prefer file export. |


---

## 5. Suggested reading order for implementers

1. `lib/metadata/pipeline.ts` — orchestration and cache integration.
2. `lib/metadata/cache.ts` — TTL tables and stale-while-revalidate window (`2×` soft TTL).
3. `lib/metadata/handlers/*.ts` — per-source behavior.
4. `lib/metadata/video-extract.ts` — yt-dlp probes, downloads, cookies.
5. This document — scope for OpenAlex, graph, and ops work that extends the pipeline without blocking core URL classification.