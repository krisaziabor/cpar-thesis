"use client";

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PanOnScrollMode, ReactFlow, type Node, type NodeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useAuth } from "@/lib/auth-context";
import { deleteItem, subscribeToItem, subscribeToItemConnections, subscribeToItems, countItemsSince, countConnectionsSince } from "@/lib/items";
import type { Item } from "@/lib/types";
import { COLS, NODE_W, NODE_H, GAP_X, GAP_Y } from "@/lib/graph-constants";
import ItemThumbnailNode from "@/components/ItemThumbnailNode";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import RightPanel from "@/components/RightPanel";
import ItemPanel from "@/components/ItemPanel";
import RespondRecordPanel from "@/components/RespondRecordPanel";
import RespondConnectionRecordPanel from "@/components/RespondConnectionRecordPanel";
import ActivityPanel from "@/components/ActivityPanel";
import SearchPanel from "@/components/SearchPanel";
import HoldsPanel from "@/components/HoldsPanel";
import { AddItemPageInnerWithSuspense } from "@/app/add/page";
import ConnectPanel from "@/components/ConnectPanel";
import ConnectionPanel from "@/components/ConnectionPanel";
import NewUserChecklistCard from "@/components/NewUserChecklistCard";
import FirstTimeIntroOverlay from "@/components/FirstTimeIntroOverlay";
import { useNavGuard } from "@/lib/nav-guard-context";
import { useNavStatus } from "@/lib/nav-status-context";
import { useSuppressFloatingNavWhile } from "@/lib/floating-nav-suppress-context";
import { usePanelHistory } from "@/lib/panel-history-context";
import { useSequenceReplayNonce, useSequenceTimings } from "@/lib/sequence-dialkit";

const NODE_TYPES: NodeTypes = {
  itemThumbnail: ItemThumbnailNode,
};

type FirstTimeIntroState = { open: boolean; variant: "fullscreen" | "card" };

export default function Home() {
  return (
    <Suspense>
      <HomeInner />
    </Suspense>
  );
}

function HomeInner() {
  const { user, firstName, loading: authLoading } = useAuth();
  const shouldReduceMotion = useReducedMotion();
  const timings = useSequenceTimings();
  const replayNonce = useSequenceReplayNonce();
  const { registerGuard, unregisterGuard, navigateWithGuard } = useNavGuard();
  const { enqueue: enqueueStatus } = useNavStatus();
  const {
    goBack: panelGoBack,
    backEntry: panelBackEntry,
    clearHistory: clearPanelHistory,
  } = usePanelHistory();
  const [items, setItems] = useState<Item[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = sessionStorage.getItem("kanon-cached-items");
      if (!raw) return [];
      const parsed = JSON.parse(raw) as Item[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [dataLoading, setDataLoading] = useState(() => items.length === 0);
  const [addProgressPercent, setAddProgressPercent] = useState(100 / 3);
  const [isNarrativePlaying, setIsNarrativePlaying] = useState(false);

  const [firstTimeIntro, setFirstTimeIntro] = useState<FirstTimeIntroState>(() => {
    if (typeof window === "undefined") return { open: false, variant: "card" };
    if (sessionStorage.getItem("kanon-just-onboarded")) {
      return { open: true, variant: "card" };
    }
    return { open: false, variant: "card" };
  });
  const itemFullScreenTriggerRef = useRef<(() => void) | null>(null);
  const registerItemFullScreenTrigger = useCallback((trigger: () => void) => {
    itemFullScreenTriggerRef.current = trigger;
  }, []);
  const itemMediaFullscreenRef = useRef(false);
  const setItemMediaFullscreen = useCallback((open: boolean) => {
    itemMediaFullscreenRef.current = open;
  }, []);
  const [panelItem, setPanelItem] = useState<Item | null>(null);
  const [panelItemHasConnections, setPanelItemHasConnections] = useState(false);
  const [deletingPanelItem, setDeletingPanelItem] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [addPanelBackSignal, setAddPanelBackSignal] = useState(0);
  const [addPanelCloseSignal, setAddPanelCloseSignal] = useState(0);
  const [addPanelCanGoBack, setAddPanelCanGoBack] = useState(false);
  const [addPanelSourceScrollLocked, setAddPanelSourceScrollLocked] = useState(true);
  const [addPanelHasUnsaved, setAddPanelHasUnsaved] = useState(false);
  const [isAddInRecordStep, setIsAddInRecordStep] = useState(false);
  const [pendingNavAfterAddClose, setPendingNavAfterAddClose] = useState<string | null>(null);
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
  const panelConnectionId = searchParams.get("connection");
  const panelMode   = searchParams.get("panel");
  const holdUser = searchParams.get("holdUser");
  const connectPanelOpen = searchParams.get("connectPanel") === "1";
  const connectSelectMode = searchParams.get("connectSelect") === "1";
  const connectIdsRaw = searchParams.get("connectIds") ?? "";
  const connectIds = useMemo(
    () => connectIdsRaw.split(",").map((v) => v.trim()).filter(Boolean),
    [connectIdsRaw]
  );
  const connectReturnItem = searchParams.get("connectReturnItem");
  const connectSubmitReturnUrl = useMemo(() => {
    if (connectReturnItem) return `/?item=${encodeURIComponent(connectReturnItem)}`;
    return "/";
  }, [connectReturnItem]);
  const isConnectSelecting = panelMode === "connect";
  const isRespondPanel = panelMode === "respond" && !!panelItemId;
  const isRespondConnectionPanel = panelMode === "respondConnection" && !!panelConnectionId;

  useEffect(() => {
    if (isRespondPanel) setIsNarrativePlaying(false);
  }, [isRespondPanel]);

  useSuppressFloatingNavWhile(isRespondPanel);
  useSuppressFloatingNavWhile(isRespondConnectionPanel);
  /** Full-screen feature intro — hide the floating nav while it's up (corner card leaves nav visible). */
  useSuppressFloatingNavWhile(
    firstTimeIntro.open && firstTimeIntro.variant === "fullscreen"
  );
  /** Connection panel (wide two-pane view) — hide nav for focus. */
  useSuppressFloatingNavWhile(!!panelConnectionId && panelMode !== "respondConnection");
  /** Immersive item listening (narrative / transcript layout opened from the narrative card). */
  useSuppressFloatingNavWhile(isNarrativePlaying);
  /** Connect flow record step (wide panel + RecordingInterface) — hide bottom nav for focus. */
  useSuppressFloatingNavWhile(
    panelMode === "connect" && connectPanelOpen && !connectSelectMode
  );
  /** Holds panel (full-width two-pane view) — hide nav for focus. */
  useSuppressFloatingNavWhile(panelMode === "holds");

  useEffect(() => {
    if (panelMode !== "add" || !addPanelHasUnsaved) {
      unregisterGuard();
      return;
    }
    registerGuard((href) => {
      setPendingNavAfterAddClose(href);
      setAddPanelCloseSignal((prev) => prev + 1);
      return true;
    });
    return () => unregisterGuard();
  }, [panelMode, addPanelHasUnsaved, registerGuard, unregisterGuard]);

  useEffect(() => {
    if (panelMode !== "add") setAddPanelSourceScrollLocked(true);
  }, [panelMode]);

  useEffect(() => {
    return subscribeToItems(
      (fetched) => {
        setItems(fetched);
        setDataLoading(false);
        try {
          sessionStorage.setItem("kanon-cached-items", JSON.stringify(fetched));
        } catch {
          // Ignore storage failures.
        }
      },
      () => {
        setDataLoading(false);
      }
    );
  }, []);

  // Welcome-back / post-onboarding messages on session start
  useEffect(() => {
    if (authLoading || !user) return;
    const KEY = "kanon-last-visit";
    const justOnboarded = sessionStorage.getItem("kanon-just-onboarded");
    const alreadyGreeted = sessionStorage.getItem("kanon-greeted");

    if (justOnboarded) {
      sessionStorage.removeItem("kanon-just-onboarded");
      sessionStorage.setItem("kanon-greeted", "1");
      // One-time 4-slide feature intro as a corner card (Getting Started waits to enter).
      setFirstTimeIntro({ open: true, variant: "card" });
      try { localStorage.setItem(KEY, Date.now().toString()); } catch {}

      const name = firstName ?? user.displayName?.split(/\s+/)[0] ?? null;
      const introDelay = timings.bottomStartMs + timings.navDelayMs + (timings.bottomEnterMs * 2);

      setTimeout(() => {
        void (async () => {
          try {
            const [totalItems, totalConnections] = await Promise.all([
              countItemsSince(new Date(0)),
              countConnectionsSince(new Date(0)),
            ]);

            const messages: Parameters<typeof enqueueStatus> = [];
            const parts: string[] = [];
            if (totalItems > 0) parts.push(`${totalItems} record${totalItems === 1 ? "" : "s"}`);
            if (totalConnections > 0) parts.push(`${totalConnections} connection${totalConnections === 1 ? "" : "s"}`);

            if (parts.length > 0) {
              messages.push({
                id: `onb-counts-${Date.now()}`,
                text: `${parts.join(" & ")} to explore`,
                durationMs: 2400,
              });
            }

            if (name) {
              messages.push({
                id: `onb-welcome-${Date.now()}`,
                text: `Welcome to Kanon, ${name}`,
                durationMs: 2600,
              });
            }

            if (messages.length > 0) enqueueStatus(...messages);
          } catch {
            // Non-fatal
          }
        })();
      }, introDelay);
      return;
    }

    if (alreadyGreeted) {
      try { localStorage.setItem(KEY, Date.now().toString()); } catch {}
      return;
    }
    sessionStorage.setItem("kanon-greeted", "1");

    const lastVisitRaw = localStorage.getItem(KEY);
    const name = firstName ?? user.displayName?.split(/\s+/)[0] ?? null;
    const lastVisit = lastVisitRaw ? new Date(Number(lastVisitRaw)) : null;
    try { localStorage.setItem(KEY, Date.now().toString()); } catch {}

    const introDelay = timings.bottomStartMs + timings.navDelayMs + (timings.bottomEnterMs * 2);

    setTimeout(() => {
      void (async () => {
        const messages: Parameters<typeof enqueueStatus> = [];

        if (lastVisit) {
          try {
            const [newItems, newConnections] = await Promise.all([
              countItemsSince(lastVisit),
              countConnectionsSince(lastVisit),
            ]);

            if (newItems > 0) {
              messages.push({
                id: `wb-items-${Date.now()}`,
                text: `${newItems} new record${newItems === 1 ? "" : "s"}`,
                durationMs: 2000,
              });
            }
            if (newConnections > 0) {
              messages.push({
                id: `wb-conns-${Date.now()}`,
                text: `${newConnections} new connection${newConnections === 1 ? "" : "s"}`,
                durationMs: 2000,
              });
            }
          } catch {
            // Firestore query failed — still show the greeting below
          }
        }

        messages.push({
          id: `wb-name-${Date.now()}`,
          text: name
            ? `Welcome back to Kanon, ${name}`
            : "Welcome back to Kanon",
          durationMs: 2600,
        });

        enqueueStatus(...messages);
      })();
    }, introDelay);
  }, [authLoading, user, firstName, enqueueStatus, timings]);

  // Utility menu “Walkthrough” → full-screen slides (`UtilityDock`).
  useEffect(() => {
    if (searchParams.get("introTour") !== "fullscreen") return;
    setFirstTimeIntro({ open: true, variant: "fullscreen" });
    const p = new URLSearchParams(searchParams.toString());
    p.delete("introTour");
    router.replace(p.toString() ? `/?${p}` : "/");
  }, [searchParams, router]);

  useEffect(() => {
    if (!panelItemId) {
      setPanelItem(null);
      setPanelItemHasConnections(false);
      setIsNarrativePlaying(false);
      itemMediaFullscreenRef.current = false;
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
    const shuffled = [...items.filter((i) => !!i.voice_recording_url)];
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
    clearPanelHistory();
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
        <div className="fixed left-0 right-0 top-6 z-30 flex flex-col items-center">
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
      <div className="fixed left-0 right-0 top-6 z-30 flex flex-col items-center">
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
            fitViewOptions={{ padding: 0.6, minZoom: 0.95 }}
            onNodeClick={(_, node) => {
              if (isConnectSelecting && !connectPanelOpen) {
                toggleConnectSelection(node.id);
                return;
              }
              navigateWithGuard(`/?item=${node.id}`);
            }}
            style={{ background: "#000000" }}
            proOptions={{ hideAttribution: true }}
          />
        )}
      </div>
      {user.email && (
        <NewUserChecklistCard
          userEmail={user.email}
          extraEnterDelaySec={
            firstTimeIntro.open &&
            firstTimeIntro.variant === "card" &&
            !shouldReduceMotion
              ? 0.38
              : 0
          }
        />
      )}

      {/* One-time 4-slide feature intro (corner card after onboarding; full screen from account menu). */}
      <FirstTimeIntroOverlay
        variant={firstTimeIntro.variant}
        open={firstTimeIntro.open}
        onClose={() => setFirstTimeIntro((s) => ({ ...s, open: false }))}
      />

      {/* Graph dim overlay — sits above the graph (z-20), below the panel and nav (z-50) */}
      <AnimatePresence>
        {(isNarrativePlaying ||
          (panelConnectionId && !panelItemId && panelMode !== "respondConnection") ||
          isRespondConnectionPanel ||
          (panelMode === "connect" && connectPanelOpen) ||
          panelMode === "holds" ||
          panelMode === "add" ||
          panelMode === "activity" ||
          panelMode === "search") && (
          <motion.div
            key="graph-dim"
            className="fixed inset-0 z-20 bg-black"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.80 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.215, 0.61, 0.355, 1] }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {panelItemId && isRespondPanel && (
          <RightPanel
            key="respond-panel"
            title="Respond"
            onClose={() => {
              if (panelBackEntry) panelGoBack();
              else {
                const p = new URLSearchParams(searchParams.toString());
                p.delete("panel");
                router.push(p.toString() ? `/?${p}` : "/");
              }
            }}
            onBack={panelBackEntry ? panelGoBack : undefined}
            backLabel={panelBackEntry?.label}
            wide
            wideWidth={900}
            disableBodyScroll
          >
            <RespondRecordPanel
              itemId={panelItemId}
              onSubmitted={clearPanelHistory}
              onClose={() => {
                if (panelBackEntry) panelGoBack();
                else {
                  const p = new URLSearchParams(searchParams.toString());
                  p.delete("panel");
                  router.push(p.toString() ? `/?${p}` : "/");
                }
              }}
            />
          </RightPanel>
        )}
        {panelItemId && !isRespondPanel && (
          <RightPanel
            key="item-panel"
            onClose={closePanel}
            escapeDismissBlockedRef={itemMediaFullscreenRef}
            onBack={panelBackEntry ? panelGoBack : undefined}
            backLabel={panelBackEntry?.label}
            wide={isNarrativePlaying}
            wideWidth={1100}
            disableBodyScroll={isNarrativePlaying}
            onFullScreen={
              (panelItem?.media_url || panelItem?.thumbnail_url)
                ? () => itemFullScreenTriggerRef.current?.()
                : undefined
            }
            headerActions={
              canEditPanelItem ? (
                <div className="flex items-center gap-3 font-sans text-sm">
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
            <ItemPanel
              key={panelItemId}
              itemId={panelItemId}
              onListeningChange={setIsNarrativePlaying}
              onFullScreenReady={registerItemFullScreenTrigger}
              onMediaFullscreenChange={setItemMediaFullscreen}
            />
          </RightPanel>
        )}
        {panelMode === "add" && (
          <RightPanel
            key="add-panel"
            onBack={addPanelCanGoBack ? () => setAddPanelBackSignal((prev) => prev + 1) : undefined}
            onClose={() => setAddPanelCloseSignal((prev) => prev + 1)}
            progressPercent={addProgressPercent}
            disableBodyScroll={isAddInRecordStep || addPanelSourceScrollLocked}
            wide={isAddInRecordStep}
            wideWidth={900}
          >
            <AddItemPageInnerWithSuspense
              hideHeader
              onProgressChange={setAddProgressPercent}
              backSignal={addPanelBackSignal}
              closeSignal={addPanelCloseSignal}
              onRequestPanelClose={() => {
                const dest = pendingNavAfterAddClose;
                setPendingNavAfterAddClose(null);
                setAddPanelHasUnsaved(false);
                router.push(dest ?? "/");
              }}
              onCanGoBackChange={setAddPanelCanGoBack}
              onHasUnsavedProgressChange={setAddPanelHasUnsaved}
              onSourceStepScrollLockChange={setAddPanelSourceScrollLocked}
              onRecordStepChange={setIsAddInRecordStep}
            />
          </RightPanel>
        )}
        {panelMode === "activity" && (
          <RightPanel
            key="activity-panel"
            onClose={closePanel}
            onBack={panelBackEntry ? panelGoBack : undefined}
            backLabel={panelBackEntry?.label}
            disableBodyScroll
          >
            <ActivityPanel />
          </RightPanel>
        )}
        {panelMode === "search" && (
          <RightPanel
            key="search-panel"
            title="Search"
            onClose={closePanel}
            onBack={panelBackEntry ? panelGoBack : undefined}
            backLabel={panelBackEntry?.label}
          >
            <SearchPanel />
          </RightPanel>
        )}
        {panelMode === "holds" && (
          <RightPanel
            key="holds-panel"
            title="Holds"
            onClose={closePanel}
            onBack={panelBackEntry ? panelGoBack : undefined}
            backLabel={panelBackEntry?.label}
            wide
            wideWidth={1100}
            disableBodyScroll
          >
            <HoldsPanel currentUserEmail={user.email ?? null} initialUserEmail={holdUser} />
          </RightPanel>
        )}
        {panelConnectionId && panelMode === "respondConnection" && (
          <RightPanel
            key="respond-connection-panel"
            title="Respond"
            onClose={() => {
              if (panelBackEntry) panelGoBack();
              else {
                const p = new URLSearchParams(searchParams.toString());
                p.delete("panel");
                router.push(p.toString() ? `/?${p}` : "/");
              }
            }}
            onBack={panelBackEntry ? panelGoBack : undefined}
            backLabel={panelBackEntry?.label}
            wide
            wideWidth={900}
            disableBodyScroll
          >
            <RespondConnectionRecordPanel
              connectionId={panelConnectionId}
              onSubmitted={clearPanelHistory}
              onClose={() => {
                if (panelBackEntry) panelGoBack();
                else {
                  const p = new URLSearchParams(searchParams.toString());
                  p.delete("panel");
                  router.push(p.toString() ? `/?${p}` : "/");
                }
              }}
            />
          </RightPanel>
        )}
        {panelConnectionId && !panelItemId && panelMode !== "respondConnection" && (
          <RightPanel
            key="connection-panel"
            title="Connection"
            onClose={closePanel}
            onBack={panelBackEntry ? panelGoBack : undefined}
            backLabel={panelBackEntry?.label}
            wide
            wideWidth={1100}
            disableBodyScroll
          >
            <ConnectionPanel key={panelConnectionId} connectionId={panelConnectionId} />
          </RightPanel>
        )}
        {panelMode === "connect" && connectPanelOpen && (
          <RightPanel
            key="connect-panel"
            title="New connection"
            onClose={closePanel}
            wide={!connectSelectMode}
            wideWidth={900}
            disableBodyScroll={!connectSelectMode}
          >
            <div className="flex min-h-0 flex-1 flex-col">
              <ConnectPanel
                selectedIds={connectIds}
                createdBy={user.email ?? ""}
                initialMode={connectSelectMode ? "select" : "record"}
                submitReturnUrl={connectSubmitReturnUrl}
                onLeaveConnectFlowForSubmit={clearPanelHistory}
                onOpenExistingResponse={(connectionId) => router.push(`/respond/${connectionId}`)}
              />
            </div>
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
              <h3 className="font-sans text-lg font-medium tracking-tight text-zinc-100">Delete record?</h3>
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
