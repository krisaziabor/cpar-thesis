/**
 * When Odesli omits a YouTube link, optionally resolve one using:
 * 1) Claude Haiku → short, high-signal YouTube *search query* (never a URL from the model)
 * 2) YouTube Data API search → first video id → watch URL
 *
 * Requires ANTHROPIC_API_KEY and YOUTUBE_API_KEY. Set DISABLE_MUSIC_YOUTUBE_HAIKU_FALLBACK=1 to skip.
 */

import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5-20251001";
const HAIKU_TIMEOUT_MS = 8_000;
const YT_SEARCH_TIMEOUT_MS = 12_000;

export interface TrackForYoutubeResolve {
  title: string;
  artist: string;
  album?: string;
}

function norm(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

function isDisabled(): boolean {
  return process.env.DISABLE_MUSIC_YOUTUBE_HAIKU_FALLBACK === "1";
}

async function haikuSuggestSearchQuery(track: TrackForYoutubeResolve): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const payload = {
    title: norm(track.title),
    artist: norm(track.artist),
    ...(track.album?.trim() ? { album: norm(track.album) } : {}),
  };

  const client = new Anthropic({ apiKey });

  try {
    const message = await Promise.race([
      client.messages.create({
        model: MODEL,
        max_tokens: 120,
        system: `You help find music on YouTube. Reply with ONLY valid JSON: {"q":"search string"}.
The string must be a short YouTube search query (artist + song title; you may add "official audio" if it helps).
Do not include URLs, channel handles, or video IDs. Do not invent facts.
If you cannot form a reasonable query, reply with {}.`,
        messages: [{ role: "user", content: JSON.stringify(payload) }],
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("haiku timeout")), HAIKU_TIMEOUT_MS)
      ),
    ]);

    const text =
      message.content[0].type === "text" ? message.content[0].text.trim() : "";
    const cleaned = text
      .replace(/^```json\n?/, "")
      .replace(/\n?```$/, "")
      .trim();
    const parsed: unknown = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const q = (parsed as Record<string, unknown>).q;
    if (typeof q !== "string") return null;
    const out = norm(q).slice(0, 200);
    return out || null;
  } catch (err) {
    console.warn("[youtube-track-resolve] Haiku query failed:", err);
    return null;
  }
}

async function youtubeSearchFirstVideoId(query: string, apiKey: string): Promise<string | null> {
  try {
    const u = new URL("https://www.googleapis.com/youtube/v3/search");
    u.searchParams.set("part", "snippet");
    u.searchParams.set("type", "video");
    u.searchParams.set("maxResults", "5");
    u.searchParams.set("q", query);
    u.searchParams.set("key", apiKey);

    const res = await fetch(u.toString(), {
      signal: AbortSignal.timeout(YT_SEARCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      items?: Array<{ id?: { videoId?: string } }>;
    };
    const id = data.items?.[0]?.id?.videoId;
    return typeof id === "string" && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
  } catch (err) {
    console.warn("[youtube-track-resolve] YouTube search failed:", err);
    return null;
  }
}

/**
 * Returns a https://www.youtube.com/watch?v=… URL or undefined.
 */
export async function tryResolveYoutubeUrlViaHaikuSearch(
  track: TrackForYoutubeResolve
): Promise<string | undefined> {
  if (isDisabled()) return undefined;

  const ytKey = process.env.YOUTUBE_API_KEY;
  if (!process.env.ANTHROPIC_API_KEY || !ytKey) return undefined;

  const title = norm(track.title);
  const artist = norm(track.artist);
  if (title.length < 2 || artist.length < 2) return undefined;

  const fromHaiku = await haikuSuggestSearchQuery(track);
  const query = (fromHaiku?.trim() || `${artist} ${title}`).slice(0, 200);

  const videoId = await youtubeSearchFirstVideoId(query, ytKey);
  if (!videoId) return undefined;

  return `https://www.youtube.com/watch?v=${videoId}`;
}
