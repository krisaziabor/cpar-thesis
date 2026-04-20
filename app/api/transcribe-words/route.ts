import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

function isSafeUrl(raw: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const h = parsed.hostname.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1" || h === "::1") return false;
  if (/^10\./.test(h)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  if (/^192\.168\./.test(h)) return false;
  return true;
}

async function fetchAudioFromUrl(audioUrl: string): Promise<{ blob: Blob; filename: string }> {
  const upstream = await fetch(audioUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Kanon/1.0)", Accept: "audio/*,*/*;q=0.8" },
    redirect: "follow",
  });
  if (!upstream.ok) throw new Error(`Audio URL responded with ${upstream.status}`);
  const bytes = await upstream.arrayBuffer();
  const contentType = upstream.headers.get("content-type")?.split(";")[0]?.trim() || "audio/webm";
  const ext = contentType.includes("mpeg") ? "mp3" : contentType.includes("mp4") ? "m4a" : contentType.includes("ogg") ? "ogg" : "webm";
  return { blob: new Blob([bytes], { type: contentType }), filename: `audio.${ext}` };
}

/**
 * POST /api/transcribe-words
 * Accepts multipart/form-data with a "file" field OR JSON { audioUrl }.
 * Returns word-level timestamps from ElevenLabs scribe_v1:
 *   { words: [{ word, start, end }] }
 */
export async function POST(request: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ELEVENLABS_API_KEY not configured" },
      { status: 503 }
    );
  }

  const contentType = request.headers.get("content-type") ?? "";

  try {
    let file: Blob;
    let filename: string;

    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { audioUrl?: string };
      if (!body.audioUrl || typeof body.audioUrl !== "string") {
        return NextResponse.json({ error: "audioUrl is required" }, { status: 400 });
      }
      if (!isSafeUrl(body.audioUrl)) {
        return NextResponse.json({ error: "Audio URL not allowed" }, { status: 400 });
      }
      ({ blob: file, filename } = await fetchAudioFromUrl(body.audioUrl));
    } else if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const f = form.get("file");
      if (!(f instanceof Blob)) {
        return NextResponse.json(
          { error: "multipart form must include 'file'" },
          { status: 400 }
        );
      }
      file = f;
      filename =
        typeof (f as File).name === "string" && (f as File).name
          ? (f as File).name
          : "audio.webm";
    } else {
      return NextResponse.json(
        { error: "Expected application/json or multipart/form-data" },
        { status: 400 }
      );
    }

    const elevenForm = new FormData();
    elevenForm.append("file", file, filename);
    elevenForm.append("model_id", "scribe_v1");
    elevenForm.append("timestamps_granularity", "word");

    const elevenRes = await fetch(
      "https://api.elevenlabs.io/v1/speech-to-text",
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          Accept: "application/json",
        },
        body: elevenForm,
      }
    );

    if (!elevenRes.ok) {
      const errText = await elevenRes.text().catch(() => "");
      return NextResponse.json(
        {
          error: `ElevenLabs error ${elevenRes.status}${errText ? `: ${errText}` : ""}`,
        },
        { status: 502 }
      );
    }

    const data = (await elevenRes.json()) as {
      words?: Array<{ text: string; start: number; end: number; type: string }>;
    };

    // Proper nouns the STT model won't know — case-insensitive match,
    // preserves surrounding punctuation (e.g. "Canon," → "Kanon,")
    const WORD_REPLACEMENTS: Record<string, string> = {
      canon: "Kanon",
      cannon: "Kanon",
    };

    const words = (data.words || [])
      .filter((w) => w.type === "word")
      .map((w) => {
        const bare = w.text.replace(/[^a-zA-Z]/g, "").toLowerCase();
        const replacement = WORD_REPLACEMENTS[bare];
        return {
          word: replacement
            ? w.text.replace(new RegExp(bare, "i"), replacement)
            : w.text,
          start: Math.round(w.start * 1000) / 1000,
          end: Math.round(w.end * 1000) / 1000,
        };
      });

    return NextResponse.json({ words });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Transcription failed",
      },
      { status: 502 }
    );
  }
}
