#!/usr/bin/env node
/**
 * Downloads the yt-dlp binary before `next build`.
 * Runs via the "prebuild" npm script so Vercel always has a fresh binary
 * regardless of its node_modules layer cache.
 *
 * Only downloads on Linux (Vercel's runtime). On macOS/Windows the binary
 * is already present from `yt-dlp-exec`'s postinstall.
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

if (process.platform !== "linux") {
  console.log("[download-ytdlp] non-Linux platform, skipping");
  process.exit(0);
}

const DEST = path.join(
  __dirname,
  "..",
  "node_modules",
  "yt-dlp-exec",
  "bin",
  "yt-dlp"
);

const URL =
  process.env.YOUTUBE_DL_HOST ||
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";

function download(url, dest, redirects) {
  if (redirects > 10) throw new Error("Too many redirects");
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return download(res.headers.location, dest, redirects + 1)
            .then(resolve)
            .catch(reject);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        const dir = path.dirname(dest);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on("finish", () => {
          file.close(() => {
            fs.chmodSync(dest, 0o755);
            resolve();
          });
        });
        file.on("error", reject);
      })
      .on("error", reject);
  });
}

console.log(`[download-ytdlp] downloading from ${URL} → ${DEST}`);
download(URL, DEST, 0)
  .then(() => console.log("[download-ytdlp] done"))
  .catch((err) => {
    console.error("[download-ytdlp] failed:", err.message);
    process.exit(1);
  });
