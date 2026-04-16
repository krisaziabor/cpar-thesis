#!/usr/bin/env node

/**
 * Generate word-level timestamps from an audio file using ElevenLabs STT.
 *
 * Usage:
 *   node scripts/generate-transcript.mjs <audio-file> [output.json]
 *
 * Requires ELEVENLABS_API_KEY environment variable.
 * Output JSON matches the shape consumed by <SyncedTranscript>:
 *   { audio_url: string, words: [{ word, start, end }] }
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { basename, extname, resolve } from "node:path";

// Load .env.local so the script works outside of Next.js
const envPath = resolve(import.meta.dirname, "..", ".env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}

const API_KEY = process.env.ELEVENLABS_API_KEY;

const MIME_TYPES = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  webm: "audio/webm",
  ogg: "audio/ogg",
};

async function main() {
  const [inputPath, outputPath] = process.argv.slice(2);

  if (!inputPath) {
    console.error(
      "Usage: node scripts/generate-transcript.mjs <audio-file> [output.json]"
    );
    process.exit(1);
  }

  if (!API_KEY) {
    console.error("Set ELEVENLABS_API_KEY in your environment.");
    process.exit(1);
  }

  const absInput = resolve(inputPath);
  const audioBuffer = readFileSync(absInput);
  const ext = extname(absInput).slice(1).toLowerCase();
  const mime = MIME_TYPES[ext] || "audio/mpeg";

  const blob = new Blob([audioBuffer], { type: mime });
  const form = new FormData();
  form.append("file", blob, basename(absInput));
  form.append("model_id", "scribe_v1");

  console.log(`Transcribing ${basename(absInput)} (${audioBuffer.length} bytes)...`);

  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": API_KEY, Accept: "application/json" },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`ElevenLabs API error ${res.status}: ${body}`);
    process.exit(1);
  }

  const data = await res.json();

  // Proper nouns the STT model won't know — case-insensitive match,
  // preserves surrounding punctuation (e.g. "Canon," → "Kanon,")
  const WORD_REPLACEMENTS = {
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

  const output = {
    audio_url: `/onboarding/${basename(absInput)}`,
    words,
  };

  const outFile = resolve(
    outputPath || absInput.replace(extname(absInput), ".json")
  );
  writeFileSync(outFile, JSON.stringify(output, null, 2) + "\n");
  console.log(`Done — ${words.length} words written to ${outFile}`);
}

main();
