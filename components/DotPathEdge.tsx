"use client";

/* ─────────────────────────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — DotPathEdge
 *
 *  Positions come from positionMap (grid-computed node centers), NOT from
 *  ReactFlow handle routing — this ensures dots travel along the true geometric
 *  path between nodes regardless of handle placement or node aspect ratio.
 *
 *  10 dots, r=1, spread evenly along the path, drifting source→target at 2s.
 *  They look like a faint moving dotted line, direction-aware.
 *
 *  1st-degree: opacity 0.7   2nd-degree: opacity 0.35   Color: #213C83
 * ───────────────────────────────────────────────────────────────────────────── */

import { useContext } from "react";
import { motion } from "framer-motion";
import type { EdgeProps } from "@xyflow/react";
import { GraphHoverContext } from "@/lib/graph-hover-context";

const DOT_COUNT = 10;
const DURATION  = 2.0; // seconds per full cycle
const DOT_R     = 1;

export default function DotPathEdge({ source, target, data }: EdgeProps) {
  const { positionMap } = useContext(GraphHoverContext);

  const srcPos = positionMap.get(source);
  const tgtPos = positionMap.get(target);
  if (!srcPos || !tgtPos) return null;

  const { x: sx, y: sy } = srcPos;
  const { x: tx, y: ty } = tgtPos;

  const degree = (data as { degree?: 1 | 2 } | undefined)?.degree ?? 1;
  const dotOpacity = degree === 1 ? 0.7 : 0.35;

  return (
    <g>
      {Array.from({ length: DOT_COUNT }, (_, i) => {
        // Pre-spread: dot i starts at i/N along the path so they're already distributed
        const t0 = i / DOT_COUNT;
        const startX = sx + (tx - sx) * t0;
        const startY = sy + (ty - sy) * t0;

        // Keyframes: travel from pre-spread start → target → snap to source → back to start
        const snapAt  = 1 - t0;          // normalized time when dot reaches target
        const snapAt1 = snapAt + 0.001;   // instant snap

        return (
          <motion.circle
            key={i}
            r={DOT_R}
            fill="#213C83"
            fillOpacity={dotOpacity}
            animate={{
              cx: [startX, tx, sx, startX],
              cy: [startY, ty, sy, startY],
            }}
            transition={{
              duration: DURATION,
              times: [0, snapAt, snapAt1, 1],
              repeat: Infinity,
              ease: "linear",
            }}
          />
        );
      })}
    </g>
  );
}
