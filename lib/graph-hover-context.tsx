"use client";

import { createContext, useContext } from "react";

export type ConnState = "idle" | "hovered" | "first" | "second" | "dim";

interface GraphHoverContextValue {
  hoveredNodeId: string | null;
  firstDegree: Set<string>;
  secondDegree: Set<string>;
  /** Center (x, y) of each node in ReactFlow canvas coordinates */
  positionMap: Map<string, { x: number; y: number }>;
}

export const GraphHoverContext = createContext<GraphHoverContextValue>({
  hoveredNodeId: null,
  firstDegree: new Set(),
  secondDegree: new Set(),
  positionMap: new Map(),
});

export function useConnState(nodeId: string): ConnState {
  const { hoveredNodeId, firstDegree, secondDegree } = useContext(GraphHoverContext);
  if (!hoveredNodeId) return "idle";
  if (nodeId === hoveredNodeId) return "hovered";
  if (firstDegree.has(nodeId)) return "first";
  if (secondDegree.has(nodeId)) return "second";
  return "dim";
}
