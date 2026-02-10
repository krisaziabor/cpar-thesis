import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/transcribe
 * Accepts an audio file (multipart or base64) and returns transcript text.
 * TODO: Wire to OpenAI Whisper API when OPENAI_API_KEY is set.
 * Keeps the API key server-side only.
 */
export async function POST(request: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured" },
      { status: 503 }
    );
  }

  // Stub: return placeholder until real Whisper integration is implemented.
  // TODO: Parse multipart/form-data or JSON body for audio file/URL,
  // call OpenAI Whisper API, return { text: string }.
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data") && !contentType.includes("application/json")) {
    return NextResponse.json(
      { error: "Expected multipart/form-data or application/json with audio" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    text: "[Transcription placeholder. Wire to OpenAI Whisper API.]",
  });
}
