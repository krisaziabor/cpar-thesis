"use client";

import { useEffect, useRef, useState } from "react";

type PdfViewport = { width: number; height: number };
type PdfRenderTask = { promise: Promise<void>; cancel?: () => void };
type PdfPageProxy = {
  getViewport: (params: { scale: number }) => PdfViewport;
  render: (params: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewport;
  }) => PdfRenderTask;
};
type PdfDocumentProxy = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPageProxy>;
  destroy: () => Promise<void>;
};

export default function MinimalPdfViewer({ url, title }: { url: string; title: string }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfDoc, setPdfDoc] = useState<PdfDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState<number | null>(null);
  const [frameWidth, setFrameWidth] = useState(0);
  const [loading, setLoading] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [hasRenderedPage, setHasRenderedPage] = useState(false);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const updateWidth = () => setFrameWidth(frame.clientWidth || 0);
    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let isCancelled = false;
    let destroyDoc: (() => Promise<void>) | null = null;

    setPage(1);
    setPdfDoc(null);
    setTotalPages(null);
    setRenderError(null);
    setHasRenderedPage(false);
    setLoading(true);

    async function loadPdf() {
      try {
        const pdfjs = await import("pdfjs-dist");
        const pdfjsLib = pdfjs as unknown as {
          getDocument?: (source: { data: Uint8Array; disableWorker: boolean }) => {
            promise: Promise<PdfDocumentProxy>;
          };
          GlobalWorkerOptions?: { workerSrc: string };
          default?: {
            getDocument?: (source: { data: Uint8Array; disableWorker: boolean }) => {
              promise: Promise<PdfDocumentProxy>;
            };
            GlobalWorkerOptions?: { workerSrc: string };
          };
        };

        const globalWorkerOptions =
          pdfjsLib.GlobalWorkerOptions ?? pdfjsLib.default?.GlobalWorkerOptions;
        if (globalWorkerOptions && !globalWorkerOptions.workerSrc) {
          globalWorkerOptions.workerSrc =
            "https://unpkg.com/pdfjs-dist@5.5.207/build/pdf.worker.min.mjs";
        }

        const getDocument =
          pdfjsLib.getDocument ?? pdfjsLib.default?.getDocument;

        if (typeof getDocument !== "function") {
          throw new Error("PDF engine failed to initialize");
        }

        let bytes: ArrayBuffer;
        const proxied = await fetch("/api/media/proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        if (proxied.ok) {
          bytes = await proxied.arrayBuffer();
        } else {
          // Fallback: direct fetch for cases the proxy intentionally rejects.
          const direct = await fetch(url);
          if (!direct.ok) throw new Error("Failed to load PDF bytes");
          bytes = await direct.arrayBuffer();
        }

        const loadingTask = getDocument({ data: new Uint8Array(bytes), disableWorker: true });
        const doc = await loadingTask.promise;
        if (isCancelled) {
          await doc.destroy();
          return;
        }
        destroyDoc = () => doc.destroy();
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
      } catch (err) {
        if (!isCancelled) {
          setTotalPages(null);
          setLoading(false);
          const reason = err instanceof Error ? err.message : "Unknown PDF error";
          setRenderError(`Could not render this PDF here (${reason}).`);
        }
      }
    }

    void loadPdf();

    return () => {
      isCancelled = true;
      if (destroyDoc) {
        void destroyDoc().catch(() => {
          // Ignore teardown errors from pdfjs internals during rapid unmount/remount.
        });
      }
    };
  }, [url]);

  useEffect(() => {
    const doc = pdfDoc;
    const canvas = canvasRef.current;
    if (!doc || !canvas || frameWidth <= 0 || renderError) return;

    let isCancelled = false;
    let renderTask: PdfRenderTask | null = null;

    async function renderPage(currentDoc: PdfDocumentProxy, currentCanvas: HTMLCanvasElement) {
      try {
        setLoading(true);
        const pdfPage = await currentDoc.getPage(page);
        if (isCancelled) return;

        const baseViewport = pdfPage.getViewport({ scale: 1 });
        const scale = frameWidth / baseViewport.width;
        const viewport = pdfPage.getViewport({ scale });

        const ctx = currentCanvas.getContext("2d");
        if (!ctx) return;

        const dpr = window.devicePixelRatio || 1;
        currentCanvas.width = Math.floor(viewport.width * dpr);
        currentCanvas.height = Math.floor(viewport.height * dpr);
        currentCanvas.style.width = `${viewport.width}px`;
        currentCanvas.style.height = `${viewport.height}px`;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, viewport.width, viewport.height);

        renderTask = pdfPage.render({ canvasContext: ctx, viewport });
        await renderTask.promise;
        if (!isCancelled) {
          setRenderError(null);
          setHasRenderedPage(true);
        }
      } catch (err) {
        if (!isCancelled) {
          const reason = err instanceof Error ? err.message : "Unknown PDF render error";
          setRenderError(`Could not render this PDF here (${reason}).`);
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    }

    void renderPage(doc, canvas);

    return () => {
      isCancelled = true;
      renderTask?.cancel?.();
    };
  }, [pdfDoc, page, frameWidth]);

  function goToLast() {
    setPage((prev) => Math.max(1, prev - 1));
  }

  function goToNext() {
    setPage((prev) => {
      if (typeof totalPages === "number") return Math.min(totalPages, prev + 1);
      return prev + 1;
    });
  }

  const canGoLast = page > 1;
  const canGoNext = typeof totalPages === "number" ? page < totalPages : true;
  const pageLabel =
    typeof totalPages === "number" ? `Page ${page} of ${totalPages}` : `Page ${page}`;
  const showFallback = !!renderError;
  const shouldReserveHeight = loading && !hasRenderedPage && !showFallback;

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={frameRef}
        className={`relative w-full overflow-hidden border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 ${
          shouldReserveHeight ? "min-h-[420px]" : ""
        }`}
        aria-label={`${title} PDF viewer`}
      >
        {showFallback && (
          <iframe
            src={url}
            title={title}
            className="h-[600px] w-full bg-white"
          />
        )}
        {shouldReserveHeight && (
          <div className="flex h-[420px] items-center justify-center text-xs text-zinc-500 dark:text-zinc-400">
            Loading PDF...
          </div>
        )}
        {!showFallback && (
          <canvas
            ref={canvasRef}
            className={`${hasRenderedPage ? "block" : "hidden"} w-full bg-white`}
          />
        )}
        {!showFallback && (
          <>
            <button
              type="button"
              onClick={goToLast}
              disabled={!canGoLast}
              aria-label="Go to previous page"
              className="absolute left-0 top-0 h-full w-1/2 cursor-w-resize bg-transparent disabled:cursor-default"
            />
            <button
              type="button"
              onClick={goToNext}
              disabled={!canGoNext}
              aria-label="Go to next page"
              className="absolute right-0 top-0 h-full w-1/2 cursor-e-resize bg-transparent disabled:cursor-default"
            />
          </>
        )}
      </div>
      <div className="flex items-start justify-between gap-4 px-6 py-3 font-sans text-sm text-zinc-500 dark:text-zinc-400">
        <div className="flex flex-col items-start gap-1">
          <span>{showFallback ? renderError : pageLabel}</span>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 transition-colors hover:text-zinc-900 dark:hover:text-zinc-200"
          >
            Open in new tab
          </a>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={goToLast}
            disabled={!canGoLast || showFallback}
            className="transition-colors hover:text-zinc-900 disabled:opacity-40 dark:hover:text-zinc-200"
          >
            Last
          </button>
          <button
            type="button"
            onClick={goToNext}
            disabled={!canGoNext || showFallback}
            className="transition-colors hover:text-zinc-900 disabled:opacity-40 dark:hover:text-zinc-200"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
