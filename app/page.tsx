"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ReactFlow, type Node, type NodeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useAuth } from "@/lib/auth-context";
import { subscribeToItems } from "@/lib/items";
import type { Item } from "@/lib/types";
import { COLS, NODE_W, NODE_H, GAP_X, GAP_Y } from "@/lib/graph-constants";
import ItemThumbnailNode from "@/components/ItemThumbnailNode";
import { AnimatePresence } from "framer-motion";
import RightPanel from "@/components/RightPanel";
import ItemPanel from "@/components/ItemPanel";
import ActivityPanel from "@/components/ActivityPanel";
import { AddItemPageInnerWithSuspense } from "@/app/add/page";
import ConnectPanel from "@/components/ConnectPanel";
import NewUserChecklistCard from "@/components/NewUserChecklistCard";

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
  const [items, setItems] = useState<Item[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
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
  const connectPanelOpen = searchParams.get("connectPanel") === "1";
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
        data: { item, isFirst, index: i, isSelected: connectIds.includes(item.id) },
        draggable: false,
        selectable: false,
        focusable: false,
      });
    });

    return result;
  }, [items, isFirst, shuffleSeed, connectIds]);

  function closePanel() {
    if (isConnectSelecting) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("connectPanel");
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

  if (authLoading || shuffleSeed == null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <span className="text-xs text-zinc-600">loading…</span>
      </div>
    );
  }
  if (!user) return null;

  return (
    <div className="flex h-screen flex-col bg-black">
      <div className="flex-1" style={{ background: "#000000" }}>
        {dataLoading ? (
          <div className="flex h-full items-center justify-center">
            <span className="text-xs text-zinc-600">loading…</span>
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={[]}
            nodeTypes={NODE_TYPES}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            zoomOnScroll={true}
            zoomOnPinch={true}
            zoomOnDoubleClick={false}
            panOnDrag={true}
            panOnScroll={false}
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
          <RightPanel key="item-panel" onClose={closePanel} fullPageHref={`/items/${panelItemId}`}>
            <ItemPanel key={panelItemId} itemId={panelItemId} />
          </RightPanel>
        )}
        {panelMode === "add" && (
          <RightPanel key="add-panel" title="Add item" onClose={closePanel} fullPageHref="/add">
            <AddItemPageInnerWithSuspense hideHeader />
          </RightPanel>
        )}
        {panelMode === "activity" && (
          <RightPanel key="activity-panel" onClose={closePanel} fullPageHref="/activity">
            <ActivityPanel />
          </RightPanel>
        )}
        {panelMode === "connect" && connectPanelOpen && (
          <RightPanel key="connect-panel" title="New connection" onClose={closePanel}>
            <ConnectPanel
              selectedIds={connectIds}
              createdBy={user.email ?? ""}
              onCreated={(connectionId) => router.push(`/connections/${connectionId}`)}
            />
          </RightPanel>
        )}
      </AnimatePresence>
    </div>
  );
}
