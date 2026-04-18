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
 * Public HTTPS base for images/fonts embedded in outbound email.
 * Inboxes cannot load `http://localhost` — when testing magic links locally, set this to your
 * deployed origin (e.g. https://kanon.krisaziabor.com) so `/KAKA-email-logo.png` and fonts resolve.
 */
export function getEmailAssetOrigin(): string {
  const emailOrigin = process.env.EMAIL_ASSET_ORIGIN?.trim().replace(/\/$/, "");
  if (emailOrigin) return emailOrigin;
  return getAppOrigin();
}
