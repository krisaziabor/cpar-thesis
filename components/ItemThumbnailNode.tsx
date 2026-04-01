"use client";

import { motion } from "framer-motion";
import type { Node, NodeProps } from "@xyflow/react";
import type { Item } from "@/lib/types";
import { NODE_W, NODE_H } from "@/lib/graph-constants";

export type ItemThumbnailNodeType = Node<
  { item: Item; isFirst: boolean; index: number; isSelected?: boolean },
  "itemThumbnail"
>;

export default function ItemThumbnailNode({ data }: NodeProps<ItemThumbnailNodeType>) {
  const { item, isFirst, index, isSelected } = data;

  const delay    = isFirst ? 0.6 + index * 0.06 : index * 0.03;
  const duration = isFirst ? 0.5 : 0.28;
  const yOffset  = isFirst ? 14 : 6;

  return (
    <motion.div
      className="group cursor-pointer"
      style={{ width: NODE_W }}
      initial={{ opacity: 0, y: yOffset }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration, ease: [0.215, 0.61, 0.355, 1], delay }}
    >
      {/* Thumbnail — natural aspect ratio, capped at NODE_H so row gaps are preserved */}
      <div className="w-full overflow-hidden" style={{ maxHeight: NODE_H }}>
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
            <span className="text-[10px] text-zinc-600 uppercase tracking-widest">
              {item.type}
            </span>
          </div>
        )}
      </div>

      {/* Title — always reserves space below, text fades in on hover */}
      <div className="h-8 flex items-start pt-1.5 px-0.5">
        <p className="font-lector text-[11px] text-zinc-300 leading-tight line-clamp-2 break-words opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          {item.title}
        </p>
      </div>
    </motion.div>
  );
}
