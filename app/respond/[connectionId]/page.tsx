"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import AudioRecorder from "@/components/AudioRecorder";
import { MOCK_CONNECTIONS, MOCK_ITEMS } from "@/lib/mock-data";

export default function RespondPage() {
  const { loading, user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const connectionId = params.connectionId as string;
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <span className="font-mono text-xs text-zinc-400">loading…</span>
      </div>
    );
  }
  if (!user) return null;

  const connection = MOCK_CONNECTIONS.find((c) => c.id === connectionId);
  if (!connection) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-sm text-zinc-500">Connection not found.</p>
        <Link href="/" className="text-sm underline underline-offset-2">
          ← back
        </Link>
      </div>
    );
  }

  const items = connection.item_ids.map((id) =>
    MOCK_ITEMS.find((i) => i.id === id)
  );

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800 sm:px-6">
        <div className="mx-auto flex max-w-xl items-center justify-between">
          <Link
            href={`/connections/${connectionId}`}
            className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            ← cancel
          </Link>
          <span className="font-mono text-xs text-zinc-400">
            respond to connection
          </span>
          <span />
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-10">
        <div className="flex flex-col gap-6">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Add your response
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              Audio is required for responses.
            </p>
          </div>

          {/* Connection summary */}
          <div className="border border-zinc-200 px-3 py-3 dark:border-zinc-800 sm:px-4">
            <p className="font-mono text-xs text-zinc-400">responding to</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {items.map((item, i) => (
                <span key={item?.id ?? i} className="flex items-center gap-2">
                  {i > 0 && (
                    <span className="text-zinc-300 dark:text-zinc-700">·</span>
                  )}
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">
                    {item?.title ?? "Unknown"}
                  </span>
                </span>
              ))}
            </div>
            <p className="mt-1 font-mono text-xs text-zinc-400">
              by {connection.created_by} · {connection.created_at}
            </p>
            {connection.transcript && (
              <p className="mt-2 text-sm italic text-zinc-500 dark:text-zinc-400">
                "{connection.transcript}"
              </p>
            )}
          </div>

          <AudioRecorder
            onRecorded={(_blob, url) => setAudioUrl(url)}
            prompt="What does this connection bring up for you?"
          />

          <div className="flex gap-3">
            <button
              onClick={() =>
                router.push(`/connections/${connectionId}`)
              }
              disabled={!audioUrl}
              className="w-full border border-zinc-900 px-4 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-900 hover:text-white disabled:opacity-40 dark:border-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-100 dark:hover:text-zinc-900 sm:w-auto"
            >
              submit response
            </button>
          </div>

          <p className="font-mono text-xs text-zinc-400">
            recording required · no skip option
          </p>
        </div>
      </main>
    </div>
  );
}
