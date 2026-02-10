import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-zinc-50 font-sans dark:bg-black">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Kanon
      </h1>
      <p className="max-w-md text-center text-zinc-600 dark:text-zinc-400">
        Voice-driven community libraries. Build shared archives with audio
        testimony.
      </p>
      <nav className="flex gap-4">
        <Link
          href="/graph"
          className="rounded-full border border-zinc-300 bg-white px-5 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
        >
          Graph view
        </Link>
      </nav>
    </div>
  );
}
