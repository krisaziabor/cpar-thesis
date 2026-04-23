import { NextResponse } from "next/server";
import { existsSync, statSync, readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { tmpdir } from "node:os";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

export async function GET() {
  const fileName = "yt-dlp";
  const candidates = {
    project_bin: path.join(process.cwd(), "bin", fileName),
    node_modules: path.join(process.cwd(), "node_modules", "yt-dlp-exec", "bin", fileName),
    tmp: path.join(tmpdir(), fileName),
    env: process.env.YOUTUBE_DL_PATH ?? null,
  };

  const info: Record<string, unknown> = {
    platform: process.platform,
    cwd: process.cwd(),
    vercel: !!process.env.VERCEL,
    youtube_dl_host_env: process.env.YOUTUBE_DL_HOST ?? null,
    candidates: Object.fromEntries(
      Object.entries(candidates).map(([k, v]) => {
        if (!v) return [k, { path: null, exists: false }];
        const exists = existsSync(v);
        const size = exists ? statSync(v).size : null;
        const first_bytes = exists
          ? readFileSync(v).subarray(0, 16).toString("hex")
          : null;
        const is_elf = first_bytes?.startsWith("7f454c46") ?? false;
        const shebang = exists
          ? readFileSync(v).subarray(0, 40).toString("utf8").split("\n")[0]
          : null;
        return [k, { path: v, exists, size, is_elf, shebang }];
      })
    ),
  };

  // Try running whichever binary exists
  const resolved =
    Object.values(candidates).find((p) => p && existsSync(p)) ?? null;

  if (resolved) {
    try {
      const { stdout } = await execFileAsync(resolved, ["--version"], {
        timeout: 10_000,
      });
      info.version_check = { ok: true, version: stdout.trim(), binary: resolved };
    } catch (err) {
      info.version_check = {
        ok: false,
        binary: resolved,
        error: String(err),
      };
    }
  } else {
    info.version_check = { ok: false, error: "no binary found" };
  }

  return NextResponse.json(info, { status: 200 });
}
