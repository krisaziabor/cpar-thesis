"use client";

import Link from "next/link";

export default function ColophonPage() {
  return (
    <div className="min-h-screen bg-black text-zinc-200">
      <div className="fixed left-6 top-6 z-20 flex flex-col gap-2">
        <h1 className="font-lector text-2xl tracking-tight text-white/90">Kanon</h1>
        <p className="text-xs text-zinc-500">Colophon</p>
      </div>

      <main className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-6 pb-20 pt-28">
        <section className="space-y-3">
          <h2 className="font-lector text-xl text-zinc-100">About this build</h2>
          <p className="max-w-3xl text-sm leading-6 text-zinc-400">
            Kanon is a social library for connecting texts, sound, and memory. This colophon tracks
            the design and technical decisions behind the interface and evolving thesis artifact.
          </p>
        </section>

        <section className="space-y-3 border-t border-zinc-800 pt-6">
          <h2 className="font-lector text-lg text-zinc-100">Inspirations</h2>
          <ul className="space-y-2 text-sm leading-6 text-zinc-400">
            <li>Raycast and Arc for compact command-like controls.</li>
            <li>Linear and Are.na for calm contrast and information density.</li>
            <li>Artist books and installation wall labels for pacing and voice.</li>
          </ul>
        </section>

        <section className="space-y-3 border-t border-zinc-800 pt-6">
          <h2 className="font-lector text-lg text-zinc-100">Typography</h2>
          <div className="max-w-3xl space-y-2 text-sm leading-6 text-zinc-400">
            <p>
              <span className="text-zinc-200">Display:</span> Lector (`font-lector`) for titles,
              nav anchors, and authored voice.
            </p>
            <p>
              <span className="text-zinc-200">UI/System:</span> Sans-serif stack for inputs,
              metadata, and body copy.
            </p>
          </div>
        </section>

        <section className="space-y-3 border-t border-zinc-800 pt-6">
          <h2 className="font-lector text-lg text-zinc-100">Text + media stack</h2>
          <ul className="space-y-2 text-sm leading-6 text-zinc-400">
            <li>Next.js App Router frontend with Framer Motion transitions.</li>
            <li>Firebase Authentication, Firestore, and Storage.</li>
            <li>Audio-first testimony and connection metadata recorded per entry.</li>
          </ul>
        </section>

        <section className="space-y-3 border-t border-zinc-800 pt-6">
          <h2 className="font-lector text-lg text-zinc-100">Notes in progress</h2>
          <p className="max-w-3xl text-sm leading-6 text-zinc-400">
            Upcoming work includes personalized visual identity markers tied to contributors and
            playback states, expanded call-a-thon framing, and continued hierarchy refinement for
            the floating navigation system.
          </p>
        </section>

        <div className="pt-4">
          <Link
            href="/"
            className="text-xs text-zinc-500 underline underline-offset-2 transition-colors hover:text-zinc-300"
          >
            Back to gallery
          </Link>
        </div>
      </main>
    </div>
  );
}
