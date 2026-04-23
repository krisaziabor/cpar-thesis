/**
 * Server-side video download using yt-dlp.
 * Supports Instagram, TikTok, Twitter/X, and 1000+ other sites.
 * YouTube streams may also be resolved via yt-dlp when ytdl-core fails.
 */

import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  readdirSync,
  copyFileSync,
  chmodSync,
} from "node:fs";
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

/**
 * Resolve a cookie file for yt-dlp. Precedence:
 *   1. `YT_DLP_COOKIES_FILE` — explicit path on disk.
 *   2. `YT_DLP_COOKIES_CONTENT` — raw Netscape cookies.txt contents; we
 *      materialize them under /tmp on first use (the only writable path on
 *      Vercel / Lambda). Use this for serverless deploys where you can't
 *      ship a cookie file but can set an env var.
 * Returns the resolved path, or undefined if neither is configured.
 */
let materializedCookiePath: string | undefined;
function resolveCookieFile(): string | undefined {
  const explicit = process.env.YT_DLP_COOKIES_FILE?.trim();
  if (explicit && existsSync(explicit)) return explicit;

  const content = process.env.YT_DLP_COOKIES_CONTENT;
  if (content && content.trim().length > 0) {
    if (materializedCookiePath && existsSync(materializedCookiePath)) {
      return materializedCookiePath;
    }
    const target = path.join(tmpdir(), "yt-dlp-cookies.txt");
    writeFileSync(target, content, { mode: 0o600 });
    materializedCookiePath = target;
    return target;
  }
  return undefined;
}

/**
 * Global args for every yt-dlp invocation: cookies (when available) plus a
 * realistic UA to reduce bot-detection blocks on Instagram / X.
 */
export function ytDlpGlobalArgs(): string[] {
  const args: string[] = [];
  const cookieFile = resolveCookieFile();
  if (cookieFile) {
    args.push("--cookies", cookieFile);
  } else {
    const fromBrowser = process.env.YT_DLP_COOKIES_FROM_BROWSER?.trim();
    if (fromBrowser) args.push("--cookies-from-browser", fromBrowser);
  }
  // A desktop UA string dramatically improves Instagram success on server IPs.
  args.push(
    "--user-agent",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
  );
  return args;
}

/** Platforms yt-dlp cannot reach anonymously from datacenter IPs. */
function requiresAuth(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return /(?:^|\.)(?:instagram\.com|facebook\.com|twitter\.com|x\.com)$/.test(h);
  } catch {
    return false;
  }
}

function hasCookies(): boolean {
  return Boolean(resolveCookieFile() || process.env.YT_DLP_COOKIES_FROM_BROWSER?.trim());
}

/**
 * Thrown when a site needs auth (or better cookies) and yt-dlp can't download.
 * Callers should catch this and fall back to link-only storage.
 */
export class VideoAuthError extends Error {
  readonly host: string;
  readonly stderr: string;
  constructor(url: string, stderr: string) {
    const host = (() => {
      try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "this site"; }
    })();
    super(
      `${host} requires an authenticated session to download. ` +
      `The operator cookies may be missing, expired, or rate-limited. ` +
      `Original yt-dlp error: ${stderr.slice(0, 200)}`
    );
    this.name = "VideoAuthError";
    this.host = host;
    this.stderr = stderr;
  }
}

function resolveYtDlpBinary(): string {
  const fileName = process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp";

  const envPath = process.env.YOUTUBE_DL_PATH;
  if (envPath && existsSync(envPath)) return envPath;

  // Project-owned binary downloaded by scripts/download-ytdlp.js (Vercel/CI).
  const projectBin = path.join(process.cwd(), "bin", fileName);
  if (existsSync(projectBin)) return projectBin;

  let sourcePath: string | null = null;

  try {
    const requireFromRoot = createRequire(path.join(process.cwd(), "package.json"));
    const pkgDir = path.dirname(requireFromRoot.resolve("yt-dlp-exec/package.json"));
    const embedded = path.join(pkgDir, "bin", fileName);
    if (existsSync(embedded)) sourcePath = embedded;
  } catch {
    // package not tree-visible from cwd
  }

  if (!sourcePath) {
    const cwdCandidate = path.join(
      process.cwd(),
      "node_modules",
      "yt-dlp-exec",
      "bin",
      fileName
    );
    if (existsSync(cwdCandidate)) sourcePath = cwdCandidate;
  }

  if (!sourcePath) {
    throw new Error(
      "yt-dlp binary not found. Run `npm install` (yt-dlp-exec downloads it on postinstall), " +
        "set YOUTUBE_DL_PATH to your yt-dlp executable, or install yt-dlp on the system PATH."
    );
  }

  // On serverless runtimes (Vercel / Lambda) the deployment bundler may strip
  // executable bits from files packed into the zip. Copy once to /tmp where we
  // can guarantee chmod 755 and execution is permitted.
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const tmpBin = path.join(tmpdir(), fileName);
    copyFileSync(sourcePath, tmpBin);
    chmodSync(tmpBin, 0o755);
    return tmpBin;
  }

  return sourcePath;
}

function extToContentType(ext: string): string {
  if (ext === "webm") return "video/webm";
  if (ext === "mov") return "video/quicktime";
  return "video/mp4";
}

const IMAGE_EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** Normalized fields from `yt-dlp --dump-single-json` for social pages. */
export interface YtDlpMediaProbe {
  title?: string;
  description?: string;
  thumbnailUrl?: string;
  uploader?: string;
  uploaderUrl?: string;
  /** YYYY-MM-DD when derivable */
  published_date?: string;
  duration_seconds?: number;
  view_count?: number;
  like_count?: number;
  playlist_count?: number;
  id?: string;
  extractor?: string;
  raw: Record<string, unknown>;
}

function ymdToIsoDate(ymd: string | undefined): string | undefined {
  if (!ymd || !/^\d{8}$/.test(ymd)) return undefined;
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

function timestampToIsoDate(ts: unknown): string | undefined {
  if (typeof ts !== "number" || !Number.isFinite(ts) || ts <= 0) return undefined;
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

function parseYtCount(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && /^\d[\d,]*$/.test(v.replace(/,/g, ""))) {
    return parseInt(v.replace(/,/g, ""), 10);
  }
  return undefined;
}

/**
 * Single yt-dlp JSON probe — no video download. Use with TikTok / Instagram / X video URLs.
 * Returns null if yt-dlp is missing or the page is unsupported.
 */
export async function probeMediaPageWithYtDlp(pageUrl: string): Promise<YtDlpMediaProbe | null> {
  let binaryPath: string;
  try {
    binaryPath = resolveYtDlpBinary();
    console.log("[yt-dlp-probe] binary resolved:", binaryPath);
  } catch (err) {
    console.warn("[yt-dlp-probe] binary not found:", err);
    return null;
  }

  try {
    const { stdout } = await execFileAsync(
      binaryPath,
      [...ytDlpGlobalArgs(), "--dump-single-json", "--no-playlist", "--no-warnings", pageUrl],
      { maxBuffer: 32 * 1024 * 1024, timeout: 45_000 }
    );

    const j = JSON.parse(stdout.trim()) as Record<string, unknown>;
    const uploadDate = typeof j.upload_date === "string" ? j.upload_date : undefined;
    const published =
      ymdToIsoDate(uploadDate) ?? timestampToIsoDate(j.timestamp);

    const title = typeof j.title === "string" ? j.title : undefined;
    const description = typeof j.description === "string" ? j.description : undefined;
    const thumbnailUrl = typeof j.thumbnail === "string" ? j.thumbnail : undefined;
    const uploader =
      typeof j.uploader === "string"
        ? j.uploader
        : typeof j.channel === "string"
          ? j.channel
          : undefined;
    const uploaderUrl =
      typeof j.uploader_url === "string"
        ? j.uploader_url
        : typeof j.channel_url === "string"
          ? j.channel_url
          : undefined;

    const duration =
      typeof j.duration === "number" && Number.isFinite(j.duration)
        ? Math.max(0, Math.floor(j.duration))
        : undefined;

    const playlistCount =
      typeof j.playlist_count === "number"
        ? j.playlist_count
        : typeof j.n_entries === "number"
          ? j.n_entries
          : undefined;

    const idRaw = j.id;
    const id =
      typeof idRaw === "string"
        ? idRaw
        : typeof idRaw === "number" && Number.isFinite(idRaw)
          ? String(Math.trunc(idRaw))
          : undefined;

    return {
      title,
      description,
      thumbnailUrl,
      uploader,
      uploaderUrl,
      published_date: published,
      duration_seconds: duration,
      view_count: parseYtCount(j.view_count),
      like_count: parseYtCount(j.like_count),
      playlist_count: playlistCount,
      id,
      extractor: typeof j.extractor === "string" ? j.extractor : undefined,
      raw: j,
    };
  } catch (err) {
    console.warn("[yt-dlp-probe] failed:", err);
    return null;
  }
}

/**
 * Best-effort clean poster image (no oEmbed play-button overlay on IG, etc.).
 * Uses yt-dlp only; does not download video bytes.
 */
export async function fetchThumbnailBytesViaYtDlp(
  pageUrl: string
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  let binaryPath: string;
  try {
    binaryPath = resolveYtDlpBinary();
  } catch (err) {
    console.warn("[yt-dlp-thumb] binary not found:", err);
    return null;
  }
  const tmpDir = await mkdtemp(path.join(tmpdir(), "kanon-thumb-"));
  const outBase = path.join(tmpDir, "thumb");

  try {
    await execFileAsync(
      binaryPath,
      [
        ...ytDlpGlobalArgs(),
        "--no-playlist",
        "--no-warnings",
        "--skip-download",
        "--write-thumbnail",
        "-o",
        `${outBase}.%(ext)s`,
        pageUrl,
      ],
      { maxBuffer: 16 * 1024 * 1024, timeout: 45_000 }
    );

    const files = readdirSync(tmpDir);
    const thumbFile = files.find((f) => f.startsWith("thumb."));
    if (!thumbFile) return null;

    const buf = readFileSync(path.join(tmpDir, thumbFile));
    if (buf.byteLength < 256 || buf.byteLength > 12 * 1024 * 1024) return null;

    const ext = path.extname(thumbFile).slice(1).toLowerCase() || "jpg";
    const mimeType = IMAGE_EXT_TO_MIME[ext] ?? "image/jpeg";
    return { buffer: buf, mimeType };
  } catch (err) {
    console.warn("[yt-dlp-thumbnail] failed:", err);
    return null;
  } finally {
    try {
      for (const f of readdirSync(tmpDir)) {
        unlinkSync(path.join(tmpDir, f));
      }
      const { rmdirSync } = await import("node:fs");
      rmdirSync(tmpDir);
    } catch {
      /* best-effort */
    }
  }
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

  if (requiresAuth(url) && !hasCookies()) {
    throw new VideoAuthError(url, "no cookies configured");
  }

  // Probe first to get ext + size without downloading
  let probeStdout: string;
  try {
    ({ stdout: probeStdout } = await execFileAsync(
      binaryPath,
      [
        ...ytDlpGlobalArgs(),
        "--dump-single-json",
        "--no-playlist",
        "--no-warnings",
        "-f",
        "best[ext=mp4][vcodec!=none]/best[ext=mp4]/best",
        url,
      ],
      { maxBuffer: 32 * 1024 * 1024, timeout: 60_000 }
    ));
  } catch (err) {
    const stderr = err instanceof Error && "stderr" in err
      ? String((err as { stderr: unknown }).stderr ?? err.message)
      : String(err);
    if (/login required|rate-limit|not available|cookies/i.test(stderr) && requiresAuth(url)) {
      throw new VideoAuthError(url, stderr);
    }
    throw err;
  }

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
    try {
      await execFileAsync(
        binaryPath,
        [
          ...ytDlpGlobalArgs(),
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
    } catch (err) {
      const stderr = err instanceof Error && "stderr" in err
        ? String((err as { stderr: unknown }).stderr ?? err.message)
        : String(err);
      if (/login required|rate-limit|not available|cookies/i.test(stderr) && requiresAuth(url)) {
        throw new VideoAuthError(url, stderr);
      }
      throw err;
    }

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

/**
 * Best-effort direct MP4/stream URL for YouTube when @distube/ytdl-core cannot produce one.
 * Uses the same yt-dlp binary and cookie env vars as other extractors.
 */
export async function tryYoutubeStreamUrlViaYtDlp(pageUrl: string): Promise<string | undefined> {
  let binaryPath: string;
  try {
    binaryPath = resolveYtDlpBinary();
  } catch {
    return undefined;
  }
  try {
    const { stdout } = await execFileAsync(
      binaryPath,
      [
        ...ytDlpGlobalArgs(),
        "--dump-single-json",
        "--no-playlist",
        "--no-warnings",
        "-f",
        "best[ext=mp4][vcodec!=none][acodec!=none]/best[ext=mp4][vcodec!=none]/best[ext=mp4]/best",
        pageUrl,
      ],
      { maxBuffer: 32 * 1024 * 1024, timeout: 60_000 }
    );
    const j = JSON.parse(stdout.trim()) as Record<string, unknown>;
    if (typeof j.url === "string" && /^https?:\/\//.test(j.url)) {
      return j.url;
    }
    const formats = j.formats as
      | Array<{ url?: string; vcodec?: string; acodec?: string }>
      | undefined;
    if (!Array.isArray(formats)) return undefined;
    for (let i = formats.length - 1; i >= 0; i--) {
      const f = formats[i];
      if (
        f?.url &&
        /^https?:\/\//.test(f.url) &&
        f.vcodec &&
        f.vcodec !== "none" &&
        f.acodec &&
        f.acodec !== "none"
      ) {
        return f.url;
      }
    }
    for (let i = formats.length - 1; i >= 0; i--) {
      const f = formats[i];
      if (f?.url && /^https?:\/\//.test(f.url) && f.vcodec && f.vcodec !== "none") {
        return f.url;
      }
    }
  } catch (err) {
    console.warn("[yt-dlp-youtube-stream] failed:", err);
  }
  return undefined;
}
