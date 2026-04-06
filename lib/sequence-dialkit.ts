"use client";

import { useSyncExternalStore } from "react";

export interface SequenceTimings {
  topLeftFadeInMs: number;
  topLeftHoldMs: number;
  topLeftFadeOutMs: number;
  bottomStartMs: number;
  navDelayMs: number;
  utilityDelayMs: number;
  checklistDelayMs: number;
  bottomEnterMs: number;
}

export const DEFAULT_SEQUENCE_TIMINGS: SequenceTimings = {
  topLeftFadeInMs: 120,
  topLeftHoldMs: 260,
  topLeftFadeOutMs: 120,
  bottomStartMs: 420,
  navDelayMs: 0,
  utilityDelayMs: 70,
  checklistDelayMs: 130,
  bottomEnterMs: 150,
};

let currentTimings: SequenceTimings = DEFAULT_SEQUENCE_TIMINGS;
let replayNonce = 0;
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

export function setSequenceTimings(next: SequenceTimings): void {
  currentTimings = next;
  emitChange();
}

export function getSequenceTimings(): SequenceTimings {
  return currentTimings;
}

export function triggerSequenceReplay(): void {
  replayNonce += 1;
  emitChange();
}

export function getSequenceReplayNonce(): number {
  return replayNonce;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSequenceTimings() {
  return useSyncExternalStore(subscribe, getSequenceTimings, getSequenceTimings);
}

export function useSequenceReplayNonce() {
  return useSyncExternalStore(
    subscribe,
    getSequenceReplayNonce,
    getSequenceReplayNonce
  );
}
