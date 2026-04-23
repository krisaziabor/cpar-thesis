import { NextRequest, NextResponse } from "next/server";
import { runMetadataPipeline } from "@/lib/metadata/pipeline";

// Force Node.js runtime — required for mupdf (WASM), canvas, ytdl-core
export const runtime = "nodejs";

// Allow up to 60 s for PDF thumbnail generation + external API calls
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      // ── File upload ──
      const formData = await request.formData();
      const file = formData.get("file") as File | null;

      if (!file) {
        return NextResponse.json(
          { success: false, error: "No file provided" },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await runMetadataPipeline({
        file: { buffer, name: file.name, type: file.type },
      });

      return NextResponse.json(result);
    } else {
      // ── URL fetch ──
      const body = await request.json();
      const { url, refresh } = body as { url?: string; refresh?: boolean };

      if (!url || typeof url !== "string") {
        return NextResponse.json(
          { success: false, error: "url is required" },
          { status: 400 }
        );
      }

      const result = await runMetadataPipeline({ url, refresh: Boolean(refresh) });
      return NextResponse.json(result);
    }
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
