/**
 * Server-side video download using yt-dlp.
 * Supports Instagram, TikTok, Twitter/X, and 1000+ other sites.
 * YouTube is handled separately by the youtube handler (ytdl-core).
 */

import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readFileSync, unlinkSync, readdirSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const MAX_VIDEO_BYTES = 500 * 1024 * 1024; // 500 MB

export interface DownloadedVideo {
  buffer: Buffer;
  ext: string;
  contentType: string;
  /** Total media items in the post, if > 1 (e.g. Instagram carousel). Only the first was downloaded. */
  totalMediaCount?: number;
}

interface YtDlpProbe {
  ext?: string;
  filesize?: number;
  filesize_approx?: number;
  playlist_count?: number;
  n_entries?: number;
}

function resolveYtDlpBinary(): string {
  const fileName = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";

  const envPath = process.env.YOUTUBE_DL_PATH;
  if (envPath && existsSync(envPath)) return envPath;

  try {
    const requireFromRoot = createRequire(path.join(process.cwd(), "package.json"));
    const pkgDir = path.dirname(requireFromRoot.resolve("yt-dlp-exec/package.json"));
    const embedded = path.join(pkgDir, "bin", fileName);
    if (existsSync(embedded)) return embedded;
  } catch {
    // package not tree-visible from cwd
  }

  const cwdCandidate = path.join(
    process.cwd(),
    "node_modules",
    "yt-dlp-exec",
    "bin",
    fileName
  );
  if (existsSync(cwdCandidate)) return cwdCandidate;

  throw new Error(
    "yt-dlp binary not found. Run `npm install` (yt-dlp-exec downloads it on postinstall), " +
      "set YOUTUBE_DL_PATH to your yt-dlp executable, or install yt-dlp on the system PATH."
  );
}

function extToContentType(ext: string): string {
  if (ext === "webm") return "video/webm";
  if (ext === "mov") return "video/quicktime";
  return "video/mp4";
}

/**
 * Use yt-dlp to download a video to a temp file and return its bytes.
 * yt-dlp manages all platform-specific cookies/headers internally, so
 * platforms like TikTok that reject re-fetches of CDN URLs work correctly.
 *
 * Throws if:
 * - yt-dlp doesn't support the URL or can't extract a video
 * - The reported file size exceeds MAX_VIDEO_BYTES (500 MB)
 */
export async function downloadVideo(url: string): Promise<DownloadedVideo> {
  const binaryPath = resolveYtDlpBinary();

  // Probe first to get ext + size without downloading
  const { stdout: probeStdout } = await execFileAsync(
    binaryPath,
    [
      "--dump-single-json",
      "--no-playlist",
      "--no-warnings",
      "-f",
      "best[ext=mp4][vcodec!=none]/best[ext=mp4]/best",
      url,
    ],
    { maxBuffer: 32 * 1024 * 1024, timeout: 60_000 }
  );

  const probe = JSON.parse(probeStdout.trim()) as YtDlpProbe;
  const fileSizeBytes = probe.filesize ?? probe.filesize_approx;
  if (fileSizeBytes && fileSizeBytes > MAX_VIDEO_BYTES) {
    throw new Error(
      `Video too large: ${Math.round(fileSizeBytes / 1024 / 1024)} MB (max 500 MB)`
    );
  }

  const totalMediaCount = probe.playlist_count ?? probe.n_entries;
  const ext = probe.ext ?? "mp4";

  // Download to a temp directory so yt-dlp handles all auth/cookies itself
  const tmpDir = await mkdtemp(path.join(tmpdir(), "kanon-video-"));
  const outTemplate = path.join(tmpDir, `video.%(ext)s`);

  try {
    await execFileAsync(
      binaryPath,
      [
        "--no-playlist",
        "--no-warnings",
        "-f",
        "best[ext=mp4][vcodec!=none]/best[ext=mp4]/best",
        "-o",
        outTemplate,
        url,
      ],
      { maxBuffer: 32 * 1024 * 1024, timeout: 300_000 }
    );

    // Find the downloaded file (ext may differ from probe if format changed)
    const files = readdirSync(tmpDir);
    const videoFile = files.find((f) => f.startsWith("video."));
    if (!videoFile) throw new Error("yt-dlp completed but no output file found");

    const filePath = path.join(tmpDir, videoFile);
    const buffer = readFileSync(filePath);

    if (buffer.byteLength > MAX_VIDEO_BYTES) {
      throw new Error(
        `Video too large: ${Math.round(buffer.byteLength / 1024 / 1024)} MB (max 500 MB)`
      );
    }

    const actualExt = path.extname(videoFile).slice(1) || ext;
    return {
      buffer,
      ext: actualExt,
      contentType: extToContentType(actualExt),
      ...(totalMediaCount && totalMediaCount > 1 ? { totalMediaCount } : {}),
    };
  } finally {
    // Clean up temp files
    try {
      const files = readdirSync(tmpDir);
      for (const f of files) unlinkSync(path.join(tmpDir, f));
      // rmdir via fs.rmdirSync — temp dir is now empty
      const { rmdirSync } = await import("node:fs");
      rmdirSync(tmpDir);
    } catch { /* best-effort cleanup */ }
  }
}
