"use client";

import Link from "next/link";
import { useNavStatus } from "@/lib/nav-status-context";

export default function NavStatusLabPage() {
  const { enqueue, clearAll } = useNavStatus();

  return (
    <div className="min-h-screen bg-black p-8 text-zinc-200">
      <div className="mx-auto flex max-w-xl flex-col gap-4">
        <h1 className="font-lector text-xl tracking-tight text-white/90">
          Nav Status Lab
        </h1>
        <p className="text-sm text-zinc-400">
          Manual test harness for the floating-nav status message pipeline.
          Look at the floating nav at the bottom when pressing a button.
        </p>

        <div className="flex flex-wrap gap-2 pt-2">
          <button
            onClick={() =>
              enqueue({
                id: `lab-single-${Date.now()}`,
                text: "Welcome back to Kanon, Kris",
                durationMs: 2600,
              })
            }
            className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:border-zinc-500"
          >
            Single welcome
          </button>
          <button
            onClick={() =>
              enqueue(
                {
                  id: `lab-a-${Date.now()}`,
                  text: "3 new records",
                  durationMs: 2000,
                },
                {
                  id: `lab-b-${Date.now()}`,
                  text: "2 new connections",
                  durationMs: 2000,
                },
                {
                  id: `lab-c-${Date.now()}`,
                  text: "Welcome back to Kanon, Kris",
                  durationMs: 2600,
                }
              )
            }
            className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:border-zinc-500"
          >
            Full welcome sequence
          </button>
          <button
            onClick={() => clearAll()}
            className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:border-zinc-500"
          >
            Clear
          </button>
        </div>

        <div className="pt-6">
          <Link
            href="/"
            className="text-sm text-zinc-500 hover:text-zinc-200"
          >
            Back to gallery
          </Link>
        </div>
      </div>
    </div>
  );
}
