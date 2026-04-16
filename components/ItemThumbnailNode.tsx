"use client";

import { useRef } from "react";
import { motion } from "framer-motion";
import type { Node, NodeProps } from "@xyflow/react";
import type { Item } from "@/lib/types";
import { NODE_W, NODE_H } from "@/lib/graph-constants";

export type ItemThumbnailNodeType = Node<
  {
    item: Item;
    isFirst: boolean;
    index: number;
    isSelected?: boolean;
    isConnectSelecting?: boolean;
  },
  "itemThumbnail"
>;

export default function ItemThumbnailNode({ data }: NodeProps<ItemThumbnailNodeType>) {
  const { item, isFirst, index, isSelected, isConnectSelecting } = data;
  const hasAnimatedRef = useRef(false);

  const shouldAnimate = !hasAnimatedRef.current;
  if (shouldAnimate) hasAnimatedRef.current = true;

  const delay    = isFirst ? 0.6 + index * 0.06 : index * 0.03;
  const duration = isFirst ? 0.5 : 0.28;
  const yOffset  = isFirst ? 14 : 6;
  const targetOpacity = isConnectSelecting ? (isSelected ? 1 : 0.5) : 1;
  const createdAtLabel = formatCreatedAt(item.created_at);

  return (
    <motion.div
      className="group cursor-pointer"
      style={{ width: NODE_W }}
      initial={shouldAnimate ? { opacity: 0, y: yOffset } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={shouldAnimate ? { duration, ease: [0.215, 0.61, 0.355, 1], delay } : { duration: 0 }}
    >
      {/* Thumbnail — natural aspect ratio, capped at NODE_H so row gaps are preserved */}
      <motion.div
        animate={{ opacity: targetOpacity }}
        transition={{ duration: 0.24, ease: [0.215, 0.61, 0.355, 1] }}
        className="w-full overflow-hidden"
        style={{ maxHeight: NODE_H }}
      >
        {item.thumbnail_url ? (
          <img
            src={item.thumbnail_url}
            alt={item.title}
            className={`w-full block bg-zinc-900 transition-all duration-150 ${
              isSelected ? "ring-2 ring-zinc-200 ring-offset-2 ring-offset-black" : ""
            }`}
            draggable={false}
          />
        ) : (
          <div
            className={`flex items-center justify-center bg-zinc-900 ${
              isSelected ? "ring-2 ring-zinc-200 ring-offset-2 ring-offset-black" : ""
            }`}
            style={{ height: NODE_H }}
          >
            <span className="text-[11px] text-zinc-600 uppercase tracking-widest">
              {item.type}
            </span>
          </div>
        )}
      </motion.div>

      {/* Meta/title — always reserves space below, text fades in on hover */}
      <div className="flex flex-col items-start gap-0.5 pt-2.5 px-0.5">
        <p className="font-sans text-[11px] text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          {createdAtLabel}
        </p>
        <p className="font-lector text-[11px] text-zinc-300 leading-tight break-words opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          {item.title}
        </p>
      </div>
    </motion.div>
  );
}

function formatCreatedAt(createdAt: unknown): string {
  if (createdAt && typeof createdAt === "object" && "toDate" in createdAt) {
    return (createdAt as { toDate: () => Date }).toDate().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }
  return "";
}
