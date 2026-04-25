"use client";

import { motion } from "framer-motion";
import type { Item, Connection } from "@/lib/types";

interface Props {
  records: Item[];
  connection: Connection;
}

/**
 * Shown on the panels during the connection audio phase of a synergy moment.
 * Records (2 or 3) are displayed side-by-side at equal weight, centered.
 */
export function SynergyDisplay({ records, connection }: Props) {
  return (
    <motion.div
      className="flex items-center justify-center gap-12 w-full h-full px-12"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
    >
      {records.map((record, i) => (
        <motion.div
          key={record.id}
          className="flex-1 text-center"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.3, duration: 0.8, ease: "easeOut" }}
        >
          <p
            className="text-black leading-tight"
            style={{
              fontFamily: '"LectorBold", serif',
              fontSize: "clamp(1.25rem, 3vw, 2.5rem)",
              letterSpacing: "-0.03em",
            }}
          >
            {record.title}
          </p>
          <p
            className="mt-2 text-zinc-500"
            style={{
              fontFamily: '"Lector", serif',
              fontSize: "clamp(0.75rem, 1.5vw, 1rem)",
              fontStyle: "italic",
            }}
          >
            {record.creator}
          </p>
        </motion.div>
      ))}

      {/* Subtle connection label */}
      {connection.title && (
        <motion.div
          className="absolute bottom-8 w-full text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.4 }}
          transition={{ delay: records.length * 0.3 + 0.4, duration: 1 }}
        >
          <span
            className="text-xs text-zinc-400 uppercase tracking-widest"
            style={{ fontFamily: '"Lector", serif' }}
          >
            {connection.title}
          </span>
        </motion.div>
      )}
    </motion.div>
  );
}
