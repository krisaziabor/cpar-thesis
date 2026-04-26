/**
 * lib/installation/playback.ts
 * Types, constants, and pure helpers for the three-panel projection state machine.
 */

import type { Item, Connection } from "@/lib/types";

// ── Tunable constants ─────────────────────────────────────────────────────────

/** Delay between left panel start and center panel start (ms). */
export const STAGGER_MS = 45_000;
/** Random ± applied to each stagger delay for organic feel (ms). */
export const STAGGER_JITTER_MS = 5_000;
/** How long an image holds before the media phase ends (ms). */
export const IMAGE_HOLD_DURATION_MS = 60_000;
/** How long a thumbnail-only panel holds after testimony (ms). */
export const THUMBNAIL_ONLY_HOLD_MS = 60_000;
/** Period of the recorder name opacity oscillation (ms). */
export const RECORDER_PULSE_PERIOD_MS = 1_500;
/** Volume multiplier applied to non-testimony panels when one is speaking. */
export const DUCK_VOLUME = 0.4;
/** Duration of the gain ramp for ducking transitions (ms). */
export const DUCK_TRANSITION_MS = 400;
/** Duration of the outro phase before a panel returns to idle (ms). */
export const OUTRO_DURATION_MS = 3_000;
/** Duration of the media-flash phase between testimony and media (ms). */
export const MEDIA_FLASH_DURATION_MS = 600;
/** Duration of the creator-reveal phase (ms). */
export const CREATOR_REVEAL_MS = 1_500;
/** Crossfade duration between PDF pages (ms). */
export const PDF_PAGE_CROSSFADE_MS = 600;
/** Seconds spent on each PDF page based on word count — (wordCount / wordsPerMin) * 60. */
export const PDF_WORDS_PER_MINUTE = 300;
/** Minimum seconds to show a PDF page, even if it has very few words. */
export const PDF_MIN_PAGE_DWELL_S = 2;

// ── Phase types ───────────────────────────────────────────────────────────────

export type PanelPhase =
  | "idle"              // blank white, waiting
  | "synergyHolding"    // idle but blocking for synergy sequence
  | "entrance"          // EntranceAnimation flashing title
  | "creatorReveal"     // settled title + creator fading in
  | "testimony"         // word-by-word transcript + audio
  | "mediaFlash"        // quick title flash before media
  | "media"             // media playing
  | "synergyMediaHold"  // dimmed media hold while next synergy panel plays
  | "outro";            // brief settle before idle

export interface PanelState {
  phase: PanelPhase;
  record: Item | null;
  /** Incremented on every phase change so effects re-run. */
  phaseKey: number;
}

// ── Synergy types ─────────────────────────────────────────────────────────────

export interface ConnectionData {
  connection: Connection;
  /** All record IDs that are part of this connection (2 or 3). */
  itemIds: string[];
}

export type SynergyStatus =
  | "none"             // no synergy pending
  | "waiting"          // detected, panels finishing current records
  | "intro"            // sequential title flash before testimonies begin
  | "testimonies"      // testimonies playing sequentially (entrance → testimony → outro for each)
  | "media"            // media playing sequentially after all testimonies done
  | "connectionAudio"; // playing the connection audio after all media done

export interface SynergyState {
  status: SynergyStatus;
  records: Item[];
  connectionData: ConnectionData;
  /** Index into records[] of the next record to assign to a panel. */
  nextRecordIdx: number;
  /** Number of panels that have completed their synergy sequence. */
  completedCount: number;
}

// ── Debug event ───────────────────────────────────────────────────────────────

export interface DebugEvent {
  ts: number;       // Date.now()
  message: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function staggerDelay(nth: number): number {
  const jitter = (Math.random() * 2 - 1) * STAGGER_JITTER_MS;
  return nth * (STAGGER_MS + jitter);
}

export function pdfPageDwellMs(wordCount: number): number {
  const seconds = Math.max(PDF_MIN_PAGE_DWELL_S, (wordCount / PDF_WORDS_PER_MINUTE) * 60);
  return Math.round(seconds * 1000);
}

export function makeInitialPanels(): [PanelState, PanelState, PanelState] {
  return [
    { phase: "idle", record: null, phaseKey: 0 },
    { phase: "idle", record: null, phaseKey: 0 },
    { phase: "idle", record: null, phaseKey: 0 },
  ];
}

/** Left = -1, center = 0, right = +1. */
export function panToForIndex(index: 0 | 1 | 2): number {
  return index === 0 ? -1 : index === 2 ? 1 : 0;
}
