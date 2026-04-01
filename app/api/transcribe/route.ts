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

async function fetchAudioFromUrl(audioUrl: string): Promise<Blob> {
  const upstream = await fetch(audioUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Kanon/1.0)",
      Accept: "audio/*,*/*;q=0.8",
    },
    redirect: "follow",
  });
  if (!upstream.ok) {
    throw new Error(`Audio URL responded with ${upstream.status}`);
  }
  const bytes = await upstream.arrayBuffer();
  const contentType = upstream.headers.get("content-type")?.split(";")[0]?.trim() || "audio/webm";
  return new Blob([bytes], { type: contentType });
}

function parseTranscript(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;

  const direct = obj.text ?? obj.transcript ?? obj.normalized_text;
  if (typeof direct === "string" && direct.trim()) return direct.trim();

  const nested = obj.data as Record<string, unknown> | undefined;
  if (nested) {
    const nestedText = nested.text ?? nested.transcript ?? nested.normalized_text;
    if (typeof nestedText === "string" && nestedText.trim()) return nestedText.trim();
  }
  return null;
}

/**
 * POST /api/transcribe
 * JSON body:
 *   { audioUrl: string } OR multipart/form-data with "file"
 * Returns:
 *   { text: string }
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
    let audioBlob: Blob | null = null;
    let filename = "audio.webm";

    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { audioUrl?: string };
      if (!body.audioUrl || typeof body.audioUrl !== "string") {
        return NextResponse.json({ error: "audioUrl is required" }, { status: 400 });
      }
      if (!isSafeUrl(body.audioUrl)) {
        return NextResponse.json({ error: "Audio URL not allowed" }, { status: 400 });
      }
      audioBlob = await fetchAudioFromUrl(body.audioUrl);
      const extGuess = audioBlob.type.includes("mpeg")
        ? "mp3"
        : audioBlob.type.includes("mp4")
          ? "m4a"
          : audioBlob.type.includes("ogg")
            ? "ogg"
            : "webm";
      filename = `audio.${extGuess}`;
    } else if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof Blob)) {
        return NextResponse.json({ error: "multipart form must include 'file'" }, { status: 400 });
      }
      audioBlob = file;
      if (typeof (file as File).name === "string" && (file as File).name) {
        filename = (file as File).name;
      }
    } else {
      return NextResponse.json(
        { error: "Expected application/json or multipart/form-data" },
        { status: 400 }
      );
    }

    const elevenForm = new FormData();
    elevenForm.append("file", audioBlob, filename);
    elevenForm.append("model_id", "scribe_v1");

    const elevenRes = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        Accept: "application/json",
      },
      body: elevenForm,
    });

    if (!elevenRes.ok) {
      const errText = await elevenRes.text().catch(() => "");
      return NextResponse.json(
        { error: `ElevenLabs error ${elevenRes.status}${errText ? `: ${errText}` : ""}` },
        { status: 502 }
      );
    }

    const payload = (await elevenRes.json()) as unknown;
    const text = parseTranscript(payload);
    if (!text) {
      return NextResponse.json({ error: "No transcript text returned" }, { status: 502 });
    }

    return NextResponse.json({ text });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Transcription failed" },
      { status: 502 }
    );
  }
}
