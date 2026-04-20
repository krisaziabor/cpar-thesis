import { execFile } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Extract a single JPEG frame (~0.5s) for use as a video poster / thumbnail.
 */
export async function extractVideoPosterJpeg(videoBuffer: Buffer, ext: string): Promise<Buffer | null> {
  if (videoBuffer.byteLength < 32) return null;
  const safeExt = /^[a-z0-9]+$/i.test(ext) ? ext.toLowerCase() : "mp4";
  const tmpDir = await mkdtemp(path.join(tmpdir(), "kanon-poster-"));
  const inPath = path.join(tmpDir, `v.${safeExt}`);
  const outPath = path.join(tmpDir, "poster.jpg");

  try {
    await writeFile(inPath, videoBuffer);
    await execFileAsync(
      "ffmpeg",
      ["-hide_banner", "-loglevel", "error", "-y", "-ss", "0.5", "-i", inPath, "-frames:v", "1", "-q:v", "2", outPath],
      { timeout: 120_000 }
    );
    const buf = await readFile(outPath);
    return buf.byteLength > 32 ? buf : null;
  } catch (err) {
    console.warn("[video-poster] ffmpeg extract failed:", err);
    return null;
  } finally {
    try {
      await rm(tmpDir, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
}
