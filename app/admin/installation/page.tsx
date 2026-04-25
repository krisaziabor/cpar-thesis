"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { subscribeToAllItems } from "@/lib/admin";
import { getAssignmentStatus, getDisplayThumbnail, type AssignmentStatus } from "@/lib/installationMedia";
import type { Item } from "@/lib/types";

type SortKey = "recent" | "alpha" | "assigned";
type StatusFilter = "all" | "full" | "partial" | "unassigned";

function formatDate(ts: unknown): string {
  if (!ts) return "—";
  if (typeof ts === "object" && ts !== null && "toDate" in ts) {
    return (ts as { toDate: () => Date }).toDate().toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  }
  return "—";
}

function assignedAt(item: Item): Date | null {
  const ts = item.installationMedia?.file?.uploadedAt ?? item.installationMedia?.thumbnail?.uploadedAt;
  if (!ts) return null;
  if (typeof ts === "object" && "toDate" in ts) return (ts as { toDate: () => Date }).toDate();
  return null;
}

export default function InstallationListPage() {
  const { user, role, loading } = useAuth();
  const router = useRouter();

  const [items, setItems] = useState<Item[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [eligibleOnly, setEligibleOnly] = useState(false);

  const isAdmin = role === "admin";

  useEffect(() => {
    if (loading) return;
    if (!user || !isAdmin) { router.replace("/"); return; }
  }, [loading, user, isAdmin, router]);

  useEffect(() => {
    if (!isAdmin) return;
    return subscribeToAllItems((all) => {
      setItems(all);
      setItemsLoading(false);
    });
  }, [isAdmin]);

  const allTypes = useMemo(() => {
    const types = new Set(items.map((i) => i.type).filter(Boolean));
    return ["all", ...Array.from(types).sort()];
  }, [items]);

  const filtered = useMemo(() => {
    let out = items;

    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter((i) => i.title.toLowerCase().includes(q) || i.creator.toLowerCase().includes(q));
    }

    if (typeFilter !== "all") {
      out = out.filter((i) => i.type === typeFilter);
    }

    if (eligibleOnly) {
      out = out.filter((i) => !!i.installationEligible);
    }

    if (statusFilter !== "all") {
      out = out.filter((i) => {
        const s = getAssignmentStatus(i);
        if (statusFilter === "full") return s === "full";
        if (statusFilter === "partial") return s === "partial";
        if (statusFilter === "unassigned") return s === "unassigned";
        return true;
      });
    }

    if (sort === "alpha") {
      out = [...out].sort((a, b) => a.title.localeCompare(b.title));
    } else if (sort === "assigned") {
      out = [...out].sort((a, b) => {
        const da = assignedAt(a)?.getTime() ?? 0;
        const db = assignedAt(b)?.getTime() ?? 0;
        return db - da;
      });
    }
    // "recent" uses default order from subscribeToAllItems (created_at desc)

    return out;
  }, [items, search, typeFilter, statusFilter, eligibleOnly, sort]);

  const assignedCount = useMemo(
    () => items.filter((i) => getAssignmentStatus(i) !== "unassigned").length,
    [items],
  );

  const eligibleCount = useMemo(
    () => items.filter((i) => !!i.installationEligible).length,
    [items],
  );

  async function toggleEligible(item: Item, e: React.MouseEvent) {
    e.stopPropagation();
    if (!db) return;
    await updateDoc(doc(db, "items", item.id), {
      installationEligible: !item.installationEligible,
    });
  }

  if (loading || (!isAdmin && !loading)) return null;

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium">Installation Media</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Assign media files and thumbnails for the three-panel projection.
          </p>
        </div>
        <Link href="/admin" className="text-sm text-zinc-500 hover:text-white transition-colors">
          ← Admin
        </Link>
      </div>

      <div className="flex h-[calc(100vh-73px)]">
        {/* ── Left: filters ── */}
        <aside className="w-56 shrink-0 border-r border-zinc-800 p-4 space-y-5 overflow-y-auto">
          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Search</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Title or creator…"
              className="w-full rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Type</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="w-full rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none"
            >
              {allTypes.map((t) => (
                <option key={t} value={t}>{t === "all" ? "All types" : t}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer py-1">
              <input
                type="checkbox"
                checked={eligibleOnly}
                onChange={(e) => setEligibleOnly(e.target.checked)}
                className="accent-white"
              />
              <span className="text-sm text-zinc-300">Eligible only</span>
            </label>
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Assignment</label>
            {(["all", "full", "partial", "unassigned"] as const).map((v) => (
              <label key={v} className="flex items-center gap-2 py-1 cursor-pointer">
                <input
                  type="radio"
                  name="status"
                  checked={statusFilter === v}
                  onChange={() => setStatusFilter(v)}
                  className="accent-white"
                />
                <span className="text-sm capitalize text-zinc-300">{v === "all" ? "All" : v}</span>
              </label>
            ))}
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1.5">Sort</label>
            {([["recent", "Recently added"], ["alpha", "Alphabetical"], ["assigned", "Recently assigned"]] as const).map(
              ([v, label]) => (
                <label key={v} className="flex items-center gap-2 py-1 cursor-pointer">
                  <input
                    type="radio"
                    name="sort"
                    checked={sort === v}
                    onChange={() => setSort(v)}
                    className="accent-white"
                  />
                  <span className="text-sm text-zinc-300">{label}</span>
                </label>
              ),
            )}
          </div>
        </aside>

        {/* ── Right: table ── */}
        <main className="flex-1 overflow-y-auto">
          {/* Counter */}
          <div className="sticky top-0 z-10 bg-black border-b border-zinc-800 px-6 py-2 text-xs text-zinc-500">
            {itemsLoading ? (
              "Loading records…"
            ) : (
              <>
                <span className="text-white">{eligibleCount}</span> of{" "}
                <span className="text-white">{items.length}</span> records included in installation ·{" "}
                <span className="text-white">{assignedCount}</span> have media assigned ·{" "}
                showing <span className="text-white">{filtered.length}</span>
              </>
            )}
          </div>

          <table className="w-full text-sm">
            <thead className="border-b border-zinc-800 text-xs text-zinc-500">
              <tr>
                <th className="py-2 pl-6 pr-2 text-left font-normal w-10">Thumb</th>
                <th className="py-2 px-2 text-left font-normal">Title</th>
                <th className="py-2 px-2 text-left font-normal hidden sm:table-cell">Type</th>
                <th className="py-2 px-2 text-left font-normal">File</th>
                <th className="py-2 px-2 text-left font-normal hidden md:table-cell">Thumbnail</th>
                <th className="py-2 px-2 text-left font-normal hidden lg:table-cell">Added</th>
                <th className="py-2 px-2 text-center font-normal w-16 text-zinc-400">✓ Show</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const status = getAssignmentStatus(item);
                const thumbUrl = getDisplayThumbnail(item);
                const installFile = item.installationMedia?.file;
                const thumbSrc = item.installationMedia?.thumbnail?.source ?? null;

                return (
                  <tr
                    key={item.id}
                    onClick={() => router.push(`/admin/installation/${item.id}`)}
                    className="border-b border-zinc-900 cursor-pointer hover:bg-zinc-950 transition-colors"
                  >
                    {/* Thumbnail */}
                    <td className="py-2 pl-6 pr-2">
                      {thumbUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumbUrl} alt="" className="h-8 w-8 rounded object-cover" />
                      ) : (
                        <div className="h-8 w-8 rounded bg-zinc-800" />
                      )}
                    </td>
                    {/* Title */}
                    <td className="py-2 px-2">
                      <div className="text-zinc-200 truncate max-w-xs">{item.title}</div>
                      <div className="text-xs text-zinc-600 truncate">{item.creator}</div>
                    </td>
                    {/* Type */}
                    <td className="py-2 px-2 hidden sm:table-cell">
                      <span className="text-zinc-500 capitalize">{item.type}</span>
                    </td>
                    {/* File status */}
                    <td className="py-2 px-2">
                      {installFile ? (
                        <span className="text-green-400 text-xs truncate block max-w-[140px]">
                          ✓ {installFile.fileName}
                        </span>
                      ) : (
                        <span className="text-zinc-700">—</span>
                      )}
                    </td>
                    {/* Thumbnail status */}
                    <td className="py-2 px-2 hidden md:table-cell">
                      <span className={
                        thumbSrc === "custom" ? "text-green-400 text-xs" :
                        thumbSrc === "native" ? "text-zinc-400 text-xs" :
                        item.installationMedia?.thumbnail === null ? "text-zinc-600 text-xs" :
                        thumbUrl ? "text-zinc-500 text-xs" : "text-zinc-700 text-xs"
                      }>
                        {thumbSrc === "custom" ? "custom" :
                         thumbSrc === "native" ? "native (set)" :
                         item.installationMedia?.thumbnail === null ? "none" :
                         thumbUrl ? "native (fallback)" : "—"}
                      </span>
                    </td>
                    {/* Added */}
                    <td className="py-2 px-2 hidden lg:table-cell text-zinc-600 text-xs whitespace-nowrap">
                      {formatDate(item.created_at)}
                    </td>
                    {/* Eligible toggle */}
                    <td className="py-2 px-2 text-center">
                      <input
                        type="checkbox"
                        checked={!!item.installationEligible}
                        onClick={(e) => toggleEligible(item, e)}
                        onChange={() => {}}
                        className="accent-white cursor-pointer"
                        title="Include in installation"
                      />
                    </td>
                  </tr>
                );
              })}

              {!itemsLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-zinc-600 text-sm">
                    No records match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </main>
      </div>
    </div>
  );
}
