import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/transcribe-words
 * Accepts multipart/form-data with a "file" field.
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

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return NextResponse.json(
        { error: "multipart form must include 'file'" },
        { status: 400 }
      );
    }

    const filename =
      typeof (file as File).name === "string" && (file as File).name
        ? (file as File).name
        : "audio.webm";

    const elevenForm = new FormData();
    elevenForm.append("file", file, filename);
    elevenForm.append("model_id", "scribe_v1");

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
