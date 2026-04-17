/**
 * Full-viewport loading shell used by authenticated top-level pages while
 * auth or data is resolving. Replaces the identical markup that was
 * previously duplicated across `/activity`, `/connections/[id]`,
 * `/kanon/[userEmail]`, and `/respond/[connectionId]`.
 */
export default function PageLoading({ label = "loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white dark:bg-black">
      <span className="font-mono text-xs text-zinc-400">{label}</span>
    </div>
  );
}
