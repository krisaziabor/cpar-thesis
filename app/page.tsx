"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PanOnScrollMode, ReactFlow, type Node, type NodeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useAuth } from "@/lib/auth-context";
import { deleteItem, subscribeToItem, subscribeToItemConnections, subscribeToItems } from "@/lib/items";
import type { Item } from "@/lib/types";
import { COLS, NODE_W, NODE_H, GAP_X, GAP_Y } from "@/lib/graph-constants";
import ItemThumbnailNode from "@/components/ItemThumbnailNode";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import RightPanel from "@/components/RightPanel";
import ItemPanel from "@/components/ItemPanel";
import ActivityPanel from "@/components/ActivityPanel";
import SearchPanel from "@/components/SearchPanel";
import HoldsPanel from "@/components/HoldsPanel";
import { AddItemPageInnerWithSuspense } from "@/app/add/page";
import ConnectPanel from "@/components/ConnectPanel";
import NewUserChecklistCard from "@/components/NewUserChecklistCard";
import { useSequenceReplayNonce, useSequenceTimings } from "@/lib/sequence-dialkit";

const NODE_TYPES: NodeTypes = {
  itemThumbnail: ItemThumbnailNode,
};

export default function Home() {
  return (
    <Suspense>
      <HomeInner />
    </Suspense>
  );
}

function HomeInner() {
  const { user, loading: authLoading } = useAuth();
  const shouldReduceMotion = useReducedMotion();
  const timings = useSequenceTimings();
  const replayNonce = useSequenceReplayNonce();
  const [items, setItems] = useState<Item[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [addProgressPercent, setAddProgressPercent] = useState(100 / 3);
  const [panelItem, setPanelItem] = useState<Item | null>(null);
  const [panelItemHasConnections, setPanelItemHasConnections] = useState(false);
  const [deletingPanelItem, setDeletingPanelItem] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [addPanelBackSignal, setAddPanelBackSignal] = useState(0);
  const [addPanelCloseSignal, setAddPanelCloseSignal] = useState(0);
  const [addPanelCanGoBack, setAddPanelCanGoBack] = useState(false);
  const [{ isFirst, shuffleSeed }] = useState<{
    isFirst: boolean;
    shuffleSeed: number | null;
  }>(() => {
    if (typeof window === "undefined") return { isFirst: false, shuffleSeed: null };

    const seen = sessionStorage.getItem("kanon-seen");
    if (!seen) sessionStorage.setItem("kanon-seen", "1");

    const seedBuf = new Uint32Array(1);
    crypto.getRandomValues(seedBuf);

    return { isFirst: !seen, shuffleSeed: seedBuf[0] ?? 1 };
  });
  const router = useRouter();
  const searchParams = useSearchParams();

  const panelItemId = searchParams.get("item");
  const panelMode   = searchParams.get("panel");
  const holdUser = searchParams.get("holdUser");
  const connectPanelOpen = searchParams.get("connectPanel") === "1";
  const connectSelectMode = searchParams.get("connectSelect") === "1";
  const connectIds = (searchParams.get("connectIds") ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const isConnectSelecting = panelMode === "connect";

  useEffect(() => {
    return subscribeToItems((fetched) => {
      setItems(fetched);
      setDataLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!panelItemId) {
      setPanelItem(null);
      setPanelItemHasConnections(false);
      return;
    }
    const unsubItem = subscribeToItem(panelItemId, setPanelItem);
    const unsubConnections = subscribeToItemConnections(panelItemId, (connections) => {
      setPanelItemHasConnections(connections.length > 0);
    });
    return () => {
      unsubItem();
      unsubConnections();
    };
  }, [panelItemId]);

  const nodes = useMemo<Node[]>(() => {
    if (shuffleSeed == null) return [];

    const mulberry32 = (seed: number) => {
      let t = seed >>> 0;
      return () => {
        t += 0x6d2b79f5;
        let r = Math.imul(t ^ (t >>> 15), t | 1);
        r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
      };
    };

    // Shuffle a copy so order is random per page load (seeded once on mount)
    const rand = mulberry32(shuffleSeed);
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const numRows = Math.max(1, Math.ceil(shuffled.length / COLS));

    const slots: Array<{ row: number; col: number }> = [];
    outer: for (let row = 0; row < numRows; row++) {
      for (let col = 0; col < COLS; col++) {
        slots.push({ row, col });
        if (slots.length === shuffled.length) break outer;
      }
    }

    const result: Node[] = [];

    shuffled.forEach((item, i) => {
      const slot = slots[i];
      if (!slot) return;
      result.push({
        id: item.id,
        type: "itemThumbnail",
        position: {
          x: slot.col * (NODE_W + GAP_X),
          y: slot.row * (NODE_H + GAP_Y),
        },
        data: {
          item,
          isFirst,
          index: i,
          isSelected: connectIds.includes(item.id),
          isConnectSelecting: isConnectSelecting && !connectPanelOpen,
        },
        draggable: false,
        selectable: false,
        focusable: false,
      });
    });

    return result;
  }, [items, isFirst, shuffleSeed, connectIds, isConnectSelecting, connectPanelOpen]);

  function closePanel() {
    if (isConnectSelecting) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("connectPanel");
      params.delete("connectSelect");
      router.push(params.toString() ? `/?${params.toString()}` : "/");
      return;
    }
    router.push("/");
  }

  function setConnectIds(nextIds: string[]) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("panel", "connect");
    params.delete("item");
    if (nextIds.length > 0) params.set("connectIds", nextIds.join(","));
    else params.delete("connectIds");
    router.push(`/?${params.toString()}`);
  }

  function toggleConnectSelection(id: string) {
    const set = new Set(connectIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    setConnectIds([...set]);
  }

  const itemEditRequested = searchParams.get("itemEdit") === "1";
  const itemEditAction = searchParams.get("itemEditAction");
  const canEditPanelItem = !!panelItem && !!user?.email && panelItem.added_by === user.email;
  const panelItemDeleteDisabled = deletingPanelItem || panelItemHasConnections || !canEditPanelItem;

  async function handlePanelItemDelete() {
    if (!panelItem || panelItemDeleteDisabled) return;
    setDeletingPanelItem(true);
    try {
      await deleteItem(panelItem);
      router.push("/");
    } finally {
      setDeletingPanelItem(false);
      setIsDeleteConfirmOpen(false);
    }
  }

  function setItemEditRequested(next: boolean) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set("itemEdit", "1");
    else {
      params.delete("itemEdit");
      params.delete("itemEditAction");
    }
    if (next) params.delete("itemEditAction");
    router.push(params.toString() ? `/?${params.toString()}` : "/");
  }

  function triggerItemEditSave() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("itemEdit", "1");
    params.set("itemEditAction", "save");
    router.push(params.toString() ? `/?${params.toString()}` : "/");
  }

  if (authLoading || shuffleSeed == null) {
    return (
      <div className="min-h-screen bg-black">
        <div className="fixed left-6 top-6 z-30">
          <h1 className="font-lector text-2xl tracking-tight text-white/90">Kanon</h1>
        </div>
      </div>
    );
  }
  if (!user) return null;

  const introTotalMs = Math.max(
    1,
    timings.topLeftFadeInMs + timings.topLeftHoldMs + timings.topLeftFadeOutMs
  );
  const holdStop = Math.min(1, (timings.topLeftFadeInMs + timings.topLeftHoldMs) / introTotalMs);

  return (
    <div className="flex h-screen flex-col bg-black">
      <div className="fixed left-6 top-6 z-30">
        {!shouldReduceMotion && (
          <motion.h1
            key={`home-intro-kanon-${replayNonce}`}
            initial={{ opacity: 1 }}
            animate={{ opacity: [1, 1, 0] }}
            transition={{
              duration: introTotalMs / 1000,
              ease: [0.215, 0.61, 0.355, 1],
              times: [0, holdStop, 1],
            }}
            className="font-lector text-2xl tracking-tight text-white/90"
          >
            Kanon
          </motion.h1>
        )}
      </div>
      <div className="flex-1" style={{ background: "#000000" }}>
        {dataLoading ? (
          <div className="h-full" />
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={[]}
            nodeTypes={NODE_TYPES}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            zoomOnScroll={false}
            zoomOnPinch={true}
            zoomOnDoubleClick={false}
            panOnDrag={true}
            panOnScroll={true}
            panOnScrollMode={PanOnScrollMode.Vertical}
            fitView={true}
            fitViewOptions={{ padding: 0.1 }}
            onNodeClick={(_, node) => {
              if (isConnectSelecting && !connectPanelOpen) {
                toggleConnectSelection(node.id);
                return;
              }
              router.push(`/?item=${node.id}`);
            }}
            style={{ background: "#000000" }}
            proOptions={{ hideAttribution: true }}
          />
        )}
      </div>
      {user.email && <NewUserChecklistCard userEmail={user.email} />}

      <AnimatePresence>
        {panelItemId && (
          <RightPanel
            key="item-panel"
            onClose={closePanel}
            headerActions={
              canEditPanelItem ? (
                <div className="flex items-center gap-3 font-lector text-sm">
                  {!itemEditRequested ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setItemEditRequested(true)}
                        className="inline-flex items-center leading-none text-zinc-300 transition-colors hover:text-zinc-100"
                      >
                        Edit
                      </button>
                      <div className="group relative">
                        <button
                          type="button"
                          disabled={panelItemDeleteDisabled}
                          onClick={() => setIsDeleteConfirmOpen(true)}
                          className="inline-flex items-center leading-none text-zinc-500 transition-colors hover:text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {deletingPanelItem ? "Deleting..." : "Delete"}
                        </button>
                        {panelItemHasConnections && (
                          <div className="pointer-events-none absolute right-0 top-[calc(100%+8px)] z-20 hidden w-52 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-sans text-[11px] text-zinc-300 shadow-[0_8px_20px_rgba(0,0,0,0.5)] group-hover:block">
                            This record is connected to others in the Library and cannot be removed.
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setItemEditRequested(false)}
                        className="inline-flex items-center leading-none text-zinc-500 transition-colors hover:text-zinc-300"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={triggerItemEditSave}
                        disabled={itemEditAction === "save"}
                        className="inline-flex items-center leading-none text-zinc-200 transition-colors hover:text-zinc-50 disabled:opacity-40"
                      >
                        Save
                      </button>
                    </>
                  )}
                </div>
              ) : undefined
            }
          >
            <ItemPanel key={panelItemId} itemId={panelItemId} />
          </RightPanel>
        )}
        {panelMode === "add" && (
          <RightPanel
            key="add-panel"
            onBack={addPanelCanGoBack ? () => setAddPanelBackSignal((prev) => prev + 1) : undefined}
            onClose={() => setAddPanelCloseSignal((prev) => prev + 1)}
            progressPercent={addProgressPercent}
          >
            <AddItemPageInnerWithSuspense
              onProgressChange={setAddProgressPercent}
              backSignal={addPanelBackSignal}
              closeSignal={addPanelCloseSignal}
              onRequestPanelClose={closePanel}
              onCanGoBackChange={setAddPanelCanGoBack}
            />
          </RightPanel>
        )}
        {panelMode === "activity" && (
          <RightPanel key="activity-panel" onClose={closePanel}>
            <ActivityPanel />
          </RightPanel>
        )}
        {panelMode === "search" && (
          <RightPanel key="search-panel" title="Search" onClose={closePanel}>
            <SearchPanel />
          </RightPanel>
        )}
        {panelMode === "holds" && (
          <RightPanel key="holds-panel" title="Holds" onClose={closePanel}>
            <HoldsPanel currentUserEmail={user.email ?? null} initialUserEmail={holdUser} />
          </RightPanel>
        )}
        {panelMode === "connect" && connectPanelOpen && (
          <RightPanel key="connect-panel" title="New connection" onClose={closePanel}>
            <ConnectPanel
              selectedIds={connectIds}
              createdBy={user.email ?? ""}
              initialMode={connectSelectMode ? "select" : "record"}
              onCreated={(connectionId) => router.push(`/connections/${connectionId}`)}
              onOpenExistingResponse={(connectionId) => router.push(`/respond/${connectionId}`)}
            />
          </RightPanel>
        )}
        {isDeleteConfirmOpen && panelItem && (
          <motion.div
            key="delete-confirm-modal"
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.215, 0.61, 0.355, 1] }}
          >
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2, ease: [0.215, 0.61, 0.355, 1] }}
              className="w-full max-w-sm rounded-lg border border-zinc-800 bg-zinc-950 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
            >
              <h3 className="font-lector text-lg text-zinc-100">Delete record?</h3>
              <p className="mt-2 font-sans text-sm text-zinc-400">
                This action will permanently remove "{panelItem.title}" and its media.
              </p>
              <div className="mt-5 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsDeleteConfirmOpen(false)}
                  className="font-sans text-sm text-zinc-500 transition-colors hover:text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handlePanelItemDelete()}
                  disabled={deletingPanelItem}
                  className="rounded-md border border-red-500/60 px-3 py-1.5 font-sans text-sm text-red-300 transition-colors hover:border-red-400 hover:text-red-200 disabled:opacity-50"
                >
                  {deletingPanelItem ? "Deleting..." : "Delete"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
