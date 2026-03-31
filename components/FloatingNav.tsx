"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth-context";

export default function FloatingNav() {
  const { user, role, signOut } = useAuth();
  const pathname = usePathname();
  const [expanded, setExpanded] = useState(false);

  if (!user || pathname === "/login") return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-[0_4px_24px_rgba(0,0,0,0.5)]">

        {/* Expandable drawer — slides open above base row */}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key="drawer"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.215, 0.61, 0.355, 1] }}
              className="overflow-hidden"
            >
              <div className="flex flex-col border-b border-zinc-800 font-lector">
                {/* Kanon — top, full width */}
                <Link
                  href="/"
                  onClick={() => setExpanded(false)}
                  className="px-5 py-2.5 text-center text-xs text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-50"
                >
                  Kanon
                </Link>

                {/* My Kanon + Sign out — share a row */}
                <div className="flex divide-x divide-zinc-800 border-t border-zinc-800">
                  <Link
                    href="/kanon"
                    onClick={() => setExpanded(false)}
                    className="flex-1 px-4 py-2.5 text-center text-xs text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-50"
                  >
                    My Kanon
                  </Link>
                  <button
                    onClick={() => { setExpanded(false); void signOut(); }}
                    className="flex-1 px-4 py-2.5 text-center text-xs text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-50"
                  >
                    Sign out
                  </button>
                </div>

                {/* Admin row — only for admins */}
                {role === "admin" && (
                  <Link
                    href="/admin"
                    onClick={() => setExpanded(false)}
                    className="border-t border-zinc-800 px-5 py-2.5 text-center text-xs text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-50"
                  >
                    Admin
                  </Link>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Base row — always visible */}
        <div className="flex items-stretch divide-x divide-zinc-800 font-lector">
          <Link
            href="/?panel=add"
            className="px-4 py-2.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-50"
          >
            Add
          </Link>
          <Link
            href="/connect"
            className="px-4 py-2.5 text-xs text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-50"
          >
            Connect
          </Link>
          <Link
            href="/?panel=activity"
            className="px-4 py-2.5 text-xs text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-50"
          >
            Activity
          </Link>
          <button
            onClick={() => setExpanded((e) => !e)}
            aria-label={expanded ? "Collapse navigation" : "Expand navigation"}
            className="px-3 py-2.5 text-xs leading-none text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-200"
          >
            <motion.span
              animate={{ rotate: expanded ? 45 : 0 }}
              transition={{ duration: 0.18, ease: [0.215, 0.61, 0.355, 1] }}
              style={{ display: "inline-block" }}
            >
              {expanded ? "×" : "···"}
            </motion.span>
          </button>
        </div>
      </div>
    </div>
  );
}
