"use client";

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { EssayBlock } from "@/lib/make-it-thick/types";
import { EPIGRAPH_MAIN_COLUMN } from "@/lib/make-it-thick/layout";
import { FOOTNOTES } from "@/lib/make-it-thick/footnotes";

function collectFootnoteIds(blocks: EssayBlock[]): number[] {
  const seen = new Set<number>();
  const order: number[] = [];
  const scan = (s: string) => {
    let m: RegExpExecArray | null;
    const re = /⟦(\d+)⟧/g;
    while ((m = re.exec(s)) !== null) {
      const n = Number(m[1]);
      if (!seen.has(n)) {
        seen.add(n);
        order.push(n);
      }
    }
  };
  for (const b of blocks) {
    if (b.type === "h3") scan(b.text);
    if (b.type === "p") scan(b.text);
    if (b.type === "blockquote") scan(b.text);
  }
  return order;
}

/** If two callouts are this close vertically (px), sit them side-by-side in the margin. */
const FOOTNOTE_CLUSTER_PX = 58;
const FOOTNOTE_ROW_GAP = 12;
const FOOTNOTE_COL_GAP_PX = 10;

type NotePlacement = { top: number; left: string; width: string };

function InlineWithFootnotes({
  text,
  noteRefs,
}: {
  text: string;
  noteRefs: React.MutableRefObject<Map<number, HTMLSpanElement | null>>;
}): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  const re = /⟦(\d+)⟧/g;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const id = Number(m[1]);
    out.push(
      <sup
        key={`fnref-${k++}`}
        className="ml-px align-super text-[0.7em] font-medium leading-none text-zinc-300"
      >
        <span
          ref={(el) => {
            noteRefs.current.set(id, el);
          }}
          className="tabular-nums"
        >
          {id}
        </span>
      </sup>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

function renderBlock(
  block: EssayBlock,
  idx: number,
  noteRefs: React.MutableRefObject<Map<number, HTMLSpanElement | null>>,
): ReactNode {
  if (block.type === "h3") {
    return (
      <h3
        key={`b-${idx}`}
        className="scroll-mt-24 pt-6 font-sans text-sm font-semibold tracking-tight text-white/90 first:pt-0 md:text-base"
      >
        <InlineWithFootnotes text={block.text} noteRefs={noteRefs} />
      </h3>
    );
  }
  if (block.type === "blockquote") {
    return (
      <blockquote
        key={`b-${idx}`}
        className="border-l-[3px] border-zinc-600 py-1 pl-5 font-sans text-sm italic leading-6 text-zinc-400"
      >
        <InlineWithFootnotes text={block.text} noteRefs={noteRefs} />
      </blockquote>
    );
  }
  return (
    <p
      key={`b-${idx}`}
      className="font-sans text-sm leading-6 text-zinc-400 [&_strong]:font-semibold [&_strong]:text-zinc-300"
    >
      <InlineWithFootnotes text={block.text} noteRefs={noteRefs} />
    </p>
  );
}

export default function MakeItThickEssay({ blocks }: { blocks: EssayBlock[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement | null>(null);
  const asideRef = useRef<HTMLDivElement>(null);
  const fnWrapRefs = useRef<Map<number, HTMLDivElement | null>>(new Map());
  const noteRefs = useRef<Map<number, HTMLSpanElement | null>>(new Map());

  const usedIds = useMemo(() => collectFootnoteIds(blocks), [blocks]);
  const [placements, setPlacements] = useState<Record<number, NotePlacement>>(
    {},
  );

  const footnotesReady =
    usedIds.length === 0 ||
    (usedIds.length > 0 &&
      usedIds.every((id) => placements[id] != null));

  useLayoutEffect(() => {
    const run = () => {
      const container = containerRef.current;
      const article = articleRef.current;
      if (!container || !article) return;

      const cRect = container.getBoundingClientRect();
      const ideal: { id: number; y: number }[] = [];
      for (const id of usedIds) {
        const span = noteRefs.current.get(id);
        if (!span) continue;
        const r = span.getBoundingClientRect();
        ideal.push({ id, y: r.top - cRect.top });
      }

      if (usedIds.length > 0 && ideal.length !== usedIds.length) {
        requestAnimationFrame(run);
        return;
      }

      ideal.sort((a, b) => a.y - b.y);

      const noteHeight = (id: number) =>
        fnWrapRefs.current.get(id)?.offsetHeight ?? 48;

      const halfW = `calc(50% - ${FOOTNOTE_COL_GAP_PX / 2}px)`;
      const leftCol2 = `calc(50% + ${FOOTNOTE_COL_GAP_PX / 2}px)`;

      let prevBottom = 0;
      const next: Record<number, NotePlacement> = {};
      let i = 0;

      while (i < ideal.length) {
        const cur = ideal[i];
        const nxt = ideal[i + 1];
        const canPair =
          nxt !== undefined &&
          nxt.y - cur.y >= 0 &&
          nxt.y - cur.y <= FOOTNOTE_CLUSTER_PX;

        if (canPair) {
          const anchorY = Math.max(cur.y, nxt.y);
          const top = Math.max(anchorY, prevBottom + FOOTNOTE_ROW_GAP);
          const h1 = noteHeight(cur.id);
          const h2 = noteHeight(nxt.id);
          const rowH = Math.max(h1, h2);
          next[cur.id] = { top, left: "0", width: halfW };
          next[nxt.id] = { top, left: leftCol2, width: halfW };
          prevBottom = top + rowH;
          i += 2;
        } else {
          const top = Math.max(cur.y, prevBottom + FOOTNOTE_ROW_GAP);
          const h = noteHeight(cur.id);
          next[cur.id] = { top, left: "0", width: "100%" };
          prevBottom = top + h;
          i += 1;
        }
      }

      setPlacements(next);

      let maxBottom = 0;
      for (const id of usedIds) {
        const p = next[id];
        if (!p) continue;
        const h = fnWrapRefs.current.get(id)?.offsetHeight ?? 0;
        maxBottom = Math.max(maxBottom, p.top + h);
      }
      const artH = article.offsetHeight;
      const pad = Math.max(0, maxBottom - artH + 40);
      article.style.paddingBottom = `${pad}px`;
    };

    run();
    let rafId = requestAnimationFrame(run);
    const ro = new ResizeObserver(run);
    if (containerRef.current) ro.observe(containerRef.current);
    if (articleRef.current) ro.observe(articleRef.current);
    window.addEventListener("resize", run);
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener("resize", run);
      if (articleRef.current) articleRef.current.style.paddingBottom = "";
    };
  }, [usedIds, blocks]);

  return (
    <div ref={containerRef} className="relative w-full">
      <article
        ref={articleRef}
        className={`${EPIGRAPH_MAIN_COLUMN} space-y-6 font-sans`}
      >
        {blocks.map((b, i) => renderBlock(b, i, noteRefs))}
      </article>

      <aside
        ref={asideRef}
        className={`pointer-events-none absolute top-0 right-0 hidden h-full w-[min(34vw,24rem)] pl-4 lg:block ${
          footnotesReady ? "visible opacity-100" : "invisible opacity-0"
        }`}
        aria-label="Footnotes"
        aria-busy={!footnotesReady}
      >
        <div className="relative min-h-full px-2 sm:px-2.5">
          {usedIds.map((id) => (
            <div
              key={id}
              ref={(el) => {
                fnWrapRefs.current.set(id, el);
              }}
              id={`fn-${id}`}
              className={`absolute break-words border-l-[3px] border-zinc-600 pl-2 font-sans text-[11px] font-normal leading-snug text-zinc-500 md:text-xs md:leading-relaxed ${
                footnotesReady ? "pointer-events-auto" : "pointer-events-none"
              }`}
              style={
                footnotesReady && placements[id]
                  ? {
                      top: placements[id].top,
                      left: placements[id].left,
                      width: placements[id].width,
                    }
                  : { top: 0, left: 0, width: "100%" }
              }
            >
              <span className="tabular-nums text-zinc-400">
                {id}.{" "}
              </span>
              {FOOTNOTES[id - 1] ?? "—"}
            </div>
          ))}
        </div>
      </aside>

      <section
        className="mt-12 border-t border-zinc-800 pt-8 lg:hidden"
        aria-label="Footnotes"
      >
        <h4 className="mb-4 font-sans text-xs font-semibold tracking-tight text-zinc-500">
          Notes
        </h4>
        <ol className="space-y-4 font-sans text-xs leading-relaxed text-zinc-500">
          {usedIds.map((id) => (
            <li key={id} id={`fn-m-${id}`} className="flex gap-2">
              <span className="shrink-0 tabular-nums text-zinc-400">
                {id}.
              </span>
              <span>{FOOTNOTES[id - 1] ?? "—"}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
