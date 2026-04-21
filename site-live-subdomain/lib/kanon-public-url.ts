/**
 * Where “Open Kanon” should send people (main app), since this deploy only hosts the note.
 * Set in `.env` / Vercel: `NEXT_PUBLIC_KANON_URL=https://kanon.krisaziabor.com`
 */
export function getKanonPublicUrl(): string {
  const raw = process.env.NEXT_PUBLIC_KANON_URL?.trim();
  if (raw) return raw.replace(/\/$/, "");
  return "https://kanon.krisaziabor.com";
}
