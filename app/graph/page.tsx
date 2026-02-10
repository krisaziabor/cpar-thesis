import Link from "next/link";
import GraphView from "@/components/GraphView";

export default function GraphPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link
            href="/"
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            ← Kanon
          </Link>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            Graph view
          </h1>
          <span />
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-6">
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          Placeholder force-directed graph (mock data). Will show items and
          connections from Firestore.
        </p>
        <GraphView />
      </main>
    </div>
  );
}
