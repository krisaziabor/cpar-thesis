import { NextRequest, NextResponse } from "next/server";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const runtime = "nodejs";

/**
 * POST /api/save-onboarding-audio
 * Multipart form: "file" (audio) + "name" (slot name, e.g. "profile-setup") + "transcript" (JSON string)
 * Saves both to public/onboarding/{name}.{ext} and public/onboarding/{name}.json
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Dev only" }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const name = form.get("name");
  const transcriptStr = form.get("transcript");

  if (!(file instanceof Blob) || typeof name !== "string" || typeof transcriptStr !== "string") {
    return NextResponse.json({ error: "Missing file, name, or transcript" }, { status: 400 });
  }

  const ext = typeof (file as File).name === "string"
    ? (file as File).name.split(".").pop() || "m4a"
    : "m4a";

  const dir = resolve(process.cwd(), "public", "onboarding");
  const audioPath = resolve(dir, `${name}.${ext}`);
  const jsonPath = resolve(dir, `${name}.json`);

  // Write audio
  const buffer = Buffer.from(await file.arrayBuffer());
  writeFileSync(audioPath, buffer);

  // Update audio_url in transcript to match actual extension
  const transcript = JSON.parse(transcriptStr);
  transcript.audio_url = `/onboarding/${name}.${ext}`;
  writeFileSync(jsonPath, JSON.stringify(transcript, null, 2) + "\n");

  return NextResponse.json({
    audioPath: `/onboarding/${name}.${ext}`,
    jsonPath: `/onboarding/${name}.json`,
    wordCount: transcript.words?.length ?? 0,
  });
}
