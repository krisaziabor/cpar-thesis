"use client";

export type ConnectionPreviewItem = {
  id: string;
  title: string;
  thumbnailUrl?: string | null;
};

export const CONNECTION_PREVIEW_DEFAULT_COLORS: [string, string, string] = [
  "#C73C28",
  "#2A86A2",
  "#7238A0",
];

const STACK_MAX = 5;

/** Match `ItemPanel` “Play narrative” control — shared min-height + padding rhythm. */
const SM_ROW_MIN_H = "min-h-[88px]";

export type ConnectionPreviewByline = {
  name: string;
  date: string;
};

type Props = {
  items: ConnectionPreviewItem[];
  colors?: [string, string, string];
  /** Larger hero (listening / connect) vs compact list row */
  size?: "md" | "sm";
  className?: string;
  /**
   * Connection author + date (one Lector line, comma-separated) above record titles.
   * Omit in flows that only show linked records (e.g. connect draft).
   */
  byline?: ConnectionPreviewByline;
};

function RecordTitlesInline({ items }: { items: ConnectionPreviewItem[] }) {
  if (items.length === 0) return null;
  return (
    <p
      className="min-w-0 truncate font-lector text-[14px] font-normal leading-snug text-white/85"
      title={items.map((i) => i.title).join(" & ")}
    >
      {items.map((item, idx) => (
        <span key={item.id}>
          {idx > 0 ? <span className="text-white/35"> & </span> : null}
          {item.title}
        </span>
      ))}
    </p>
  );
}

/**
 * Layered thumbnails (left) + byline (Lector) and inline sans record titles (right) over a muted radial gradient.
 */
export default function ConnectionItemsPreview({
  items,
  colors = CONNECTION_PREVIEW_DEFAULT_COLORS,
  size = "md",
  className = "",
  byline,
}: Props) {
  const [c1, c2, c3] = colors;
  const layerItems = items.slice(0, STACK_MAX);
  const n = layerItems.length;
  const thumbPx = size === "md" ? 50 : 36;
  const stackW = size === "md" ? 88 : 64;
  const stackH = size === "md" ? 66 : 48;
  const oxStep = size === "md" ? 5 : 4;
  const oyStep = size === "md" ? 3.5 : 2.75;
  const titlesCls = "text-[14px] leading-snug";
  const bylineCls = "font-lector text-xs tracking-tight leading-snug";
  const emptyCls = `font-sans ${titlesCls} font-normal text-white/40`;

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-white/10 bg-black/20 ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-0 scale-110"
        style={{
          background: `radial-gradient(ellipse at center, ${c1} 0%, ${c2} 50%, ${c3} 100%)`,
          filter: "blur(24px) brightness(0.22)",
        }}
      />
      <div
        className={
          size === "sm"
            ? `relative z-10 grid ${SM_ROW_MIN_H} grid-cols-[auto_1fr] items-center gap-2 px-5 py-2`
            : "relative z-10 grid min-h-0 grid-cols-[auto_1fr] items-center gap-2 px-3.5 py-3.5 sm:gap-2.5 sm:px-4 sm:py-4"
        }
      >
        <div
          className="relative shrink-0 self-center justify-self-start"
          style={{ width: stackW, height: stackH }}
          aria-hidden={n === 0}
        >
          {[...layerItems].reverse().map((item, revIdx) => {
              const i = n - 1 - revIdx;
              const ox = i * oxStep;
              const oy = i * oyStep;
              return (
                <div
                  key={item.id}
                  className="absolute overflow-hidden rounded-md border border-white/15 bg-zinc-900 shadow-[0_6px_20px_rgba(0,0,0,0.45)]"
                  style={{
                    width: thumbPx,
                    height: thumbPx,
                    left: ox,
                    top: oy,
                    zIndex: i + 1,
                  }}
                >
                  {item.thumbnailUrl ? (
                    <img
                      src={item.thumbnailUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      draggable={false}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-zinc-800 text-[9px] font-medium uppercase tracking-wider text-zinc-500">
                      ···
                    </div>
                  )}
                </div>
              );
          })}
        </div>

        <div className="flex min-w-0 flex-col gap-1 self-center">
          {byline ? (
            <>
              <p className={bylineCls}>
                <span className="text-white">{byline.name}</span>
                <span className="text-white/55">, {byline.date}</span>
              </p>
              {items.length > 0 && (
                <div className="min-w-0">
                  <RecordTitlesInline items={items} />
                </div>
              )}
            </>
          ) : items.length === 0 ? (
            <p className={emptyCls}>No records</p>
          ) : (
            <RecordTitlesInline items={items} />
          )}
        </div>
      </div>
    </div>
  );
}
