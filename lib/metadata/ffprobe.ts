import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface FfprobeResult {
  duration_seconds?: number;
  width?: number;
  height?: number;
  video_codec?: string;
  audio_codec?: string;
  audio_sample_rate?: number;
  audio_channels?: number;
}

interface FfprobeJson {
  format?: { duration?: string };
  streams?: Array<{
    codec_type?: string;
    codec_name?: string;
    width?: number;
    height?: number;
    sample_rate?: string;
    channels?: number;
  }>;
}

/**
 * Run ffprobe on a media file in memory (written to a temp file). Returns null if ffprobe is missing or fails.
 */
export async function ffprobeBuffer(buffer: Buffer, extHint: string): Promise<FfprobeResult | null> {
  if (buffer.byteLength < 32) return null;
  const safeExt = /^[a-z0-9]+$/i.test(extHint) ? extHint.toLowerCase() : "bin";
  const tmpDir = await mkdtemp(path.join(tmpdir(), "kanon-ffp-"));
  const inputPath = path.join(tmpDir, `in.${safeExt}`);

  try {
    await writeFile(inputPath, buffer);
    const { stdout } = await execFileAsync(
      "ffprobe",
      ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", inputPath],
      { maxBuffer: 8 * 1024 * 1024, timeout: 45_000 }
    );

    const j = JSON.parse(stdout.trim()) as FfprobeJson;
    const out: FfprobeResult = {};
    const d = j.format?.duration;
    if (d != null) {
      const sec = parseFloat(d);
      if (Number.isFinite(sec)) out.duration_seconds = Math.max(0, Math.round(sec));
    }
    const streams = j.streams ?? [];
    const video = streams.find((s) => s.codec_type === "video");
    const audio = streams.find((s) => s.codec_type === "audio");
    if (video) {
      if (video.width) out.width = video.width;
      if (video.height) out.height = video.height;
      if (video.codec_name) out.video_codec = video.codec_name;
    }
    if (audio) {
      if (audio.codec_name) out.audio_codec = audio.codec_name;
      if (audio.sample_rate) {
        const sr = parseInt(audio.sample_rate, 10);
        if (Number.isFinite(sr)) out.audio_sample_rate = sr;
      }
      if (audio.channels != null) out.audio_channels = audio.channels;
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch (err) {
    console.warn("[ffprobe] failed:", err);
    return null;
  } finally {
    try {
      await rm(tmpDir, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
}
