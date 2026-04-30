/**
 * Origin for magic-link `continueUrl`.
 * Set `NEXT_PUBLIC_APP_URL` in production (e.g. https://yourdomain.com).
 */
export function getAppOrigin(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

/**
 * Validate a client-supplied origin (from `window.location.origin`) for use as
 * the magic-link `continueUrl`. This lets local dev sessions receive links that
 * return to localhost instead of the production domain.
 *
 * Allowed:
 *   - http(s)://localhost[:port]
 *   - http(s)://127.0.0.1[:port]
 *   - The configured production origin (`NEXT_PUBLIC_APP_URL`)
 *   - The current Vercel deployment (`VERCEL_URL`)
 *
 * Anything else falls back to `getAppOrigin()`.
 */
export function resolveContinueOrigin(candidate: unknown): string {
  if (typeof candidate !== "string" || !candidate.trim()) return getAppOrigin();

  let parsed: URL;
  try {
    parsed = new URL(candidate.trim());
  } catch {
    return getAppOrigin();
  }

  const origin = `${parsed.protocol}//${parsed.host}`.replace(/\/$/, "");
  const hostname = parsed.hostname;

  const isLocal =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".localhost");

  if (isLocal && (parsed.protocol === "http:" || parsed.protocol === "https:")) {
    return origin;
  }

  const allowed = new Set<string>();
  const prod = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (prod) allowed.add(prod);
  if (process.env.VERCEL_URL) {
    allowed.add(`https://${process.env.VERCEL_URL.replace(/\/$/, "")}`);
  }

  if (allowed.has(origin)) return origin;
  return getAppOrigin();
}

/**
 * Public HTTPS base for images/fonts embedded in outbound email.
 * Inboxes cannot load `http://localhost` — when testing magic links locally, set this to your
 * deployed origin (e.g. https://kanon.krisaziabor.com) so `/KAKA-email-logo.png` and fonts resolve.
 */
export function getEmailAssetOrigin(): string {
  const emailOrigin = process.env.EMAIL_ASSET_ORIGIN?.trim().replace(/\/$/, "");
  if (emailOrigin) return emailOrigin;
  return getAppOrigin();
}
