/* ─────────────────────────────────────────────────────────
 * ENTRANCE ANIMATION STORYBOARD
 *
 * Read top-to-bottom. Each `at` value is ms after fonts ready.
 *
 *    0ms   blank, fonts loaded
 *  100ms   backdrop layer fades in (5 instances, ghosted)
 *  350ms   mid-weight repetitions stagger in (sharp arrival)
 *  700ms   bold punch instances snap into place
 * 1520ms   all instances fade out simultaneously
 * 2120ms   resting word fades in at a new grid position
 * 2620ms   sequence complete; onComplete fires
 *
 * All instances are the same visual width (INSTANCE_SIZE % of container).
 * Positions come from a deterministic shuffled grid — no overlaps.
 * ───────────────────────────────────────────────────────── */

export const TIMING = {
  backdropEnter: 100, // backdrop ghosts begin to fade in
  midEnter: 350,      // mid layer begins staggered arrival
  punchEnter: 700,    // bold punch layer snaps in
};

// Per-layer entrance durations (ms) — kept very short for a cut-like feel
export const ENTRY_DURATION = {
  backdrop: 80,
  mid: 60,
  punch: 50,
  settle: 60,
  resting: 60,
};

// Rolling animation constants
export const FADE_MS = 60;          // appear/disappear duration
export const SLOT_COUNT = 4;        // concurrent visible instances
export const HOLD_MS = { min: 300, max: 700 }; // how long each instance stays
export const CYCLE_DURATION_MS = 7000; // total rolling duration before settling

// Sharp-tween easing presets — typographic precision, not bouncy springs
export const EASING_PRESETS = {
  sharp: [0.2, 0.8, 0.2, 1] as [number, number, number, number],
  smooth: [0.4, 0, 0.2, 1] as [number, number, number, number],
  snappy: [0.6, 0, 0.1, 1] as [number, number, number, number],
};

export type EasingPreset = keyof typeof EASING_PRESETS;

export type LayerName = "backdrop" | "mid" | "punch";

export type LayerConfig = {
  count: number;    // number of instances in this layer
  sizeMin: number;  // target visual width % — set equal to sizeMax for uniform size
  sizeMax: number;  // target visual width % — set equal to sizeMin for uniform size
  opacityMin: number;
  opacityMax: number;
  staggerMs: number;
};

/**
 * Approximate average character width as a fraction of font-size for
 * LectorBold at display size. Used to derive font-size from a target
 * visual width, so size reads as "this word occupies ~X% of the panel."
 * Bold display fonts run wider than regular — 0.6 is a safer estimate
 * that prevents rendered text from exceeding its reserved grid cell.
 */
export const CHAR_WIDTH_FACTOR = 0.6;

/** Convert a target visual-width (% of container) to a font-size in cqw. */
export function fontSizeForWidth(targetWidthPct: number, textLength: number): number {
  const len = Math.max(1, textLength);
  return targetWidthPct / (len * CHAR_WIDTH_FACTOR);
}

// Uniform instance size — all layers share this visual width (% of container).
export const INSTANCE_SIZE = 14;

export const LAYERS: Record<LayerName, LayerConfig> = {
  backdrop: {
    count: 8,
    sizeMin: INSTANCE_SIZE,
    sizeMax: INSTANCE_SIZE,
    opacityMin: 1.0,
    opacityMax: 1.0,
    staggerMs: 25,
  },
  mid: {
    count: 6,
    sizeMin: INSTANCE_SIZE,
    sizeMax: INSTANCE_SIZE,
    opacityMin: 1.0,
    opacityMax: 1.0,
    staggerMs: 20,
  },
  punch: {
    count: 3,
    sizeMin: INSTANCE_SIZE,
    sizeMax: INSTANCE_SIZE,
    opacityMin: 1.0,
    opacityMax: 1.0,
    staggerMs: 25,
  },
};

export const ROTATION_RANGE = {
  min: 0,
  max: 0,
};

export type RestingConfig = {
  count: number; // 0 = no resting element, 1 = show one after settle
  sizeRange: readonly [number, number]; // % of container width for resting element
};

export const RESTING: RestingConfig = {
  count: 1,
  sizeRange: [INSTANCE_SIZE, INSTANCE_SIZE],
};

export const CRASH_HOLD_MS = 600;

export const DEFAULT_SEED = 42;

// ── Deterministic random ──────────────────────────────────────────────────
// mulberry32 — fast, seedable PRNG. Same seed = same layout, every run.
export function mulberry32(seed: number) {
  let s = seed | 0;
  return function rand() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Instance generation ───────────────────────────────────────────────────

export type FontChoice = "LectorBold" | "DieGrotesk";

export type Instance = {
  id: string;
  layer: LayerName;
  layerIndex: number; // index within its layer (drives stagger)
  x: number;          // % of container width — center point
  y: number;          // % of container height — center point
  size: number;       // % of container width — visual width
  rotation: number;   // degrees (always 0)
  peakOpacity: number;
  font: FontChoice;
};

export type RestingPosition = {
  x: number; // % of container width
  y: number; // % of container height
  size: number; // % of container width
};

export type GenerateResult = {
  instances: Instance[];
  restingPosition: RestingPosition | null;
};

export type GenerateInstancesOpts = {
  seed: number;
  layers: Record<LayerName, LayerConfig>;
  rotationRange: { min: number; max: number };
  resting: RestingConfig;
};

// Grid layout: 5 columns × 4 rows = 20 cells.
// Cell width = 16%, instance size = 14% → 2% clearance (CHAR_WIDTH_FACTOR=0.6 keeps actual render ≤14%).
// Instances are placed in shuffled cells — no two instances share a cell.
const GRID_COLS = 5;
const GRID_ROWS = 4;
const GRID_MARGIN = 10; // % inset from each edge
const GRID_W = 100 - GRID_MARGIN * 2;
const GRID_H = 100 - GRID_MARGIN * 2;

export function cellCenter(cellIdx: number): { x: number; y: number } {
  const col = cellIdx % GRID_COLS;
  const row = Math.floor(cellIdx / GRID_COLS);
  return {
    x: GRID_MARGIN + (col + 0.5) * (GRID_W / GRID_COLS),
    y: GRID_MARGIN + (row + 0.5) * (GRID_H / GRID_ROWS),
  };
}

function manhattanDist(a: number, b: number): number {
  const aCol = a % GRID_COLS, aRow = Math.floor(a / GRID_COLS);
  const bCol = b % GRID_COLS, bRow = Math.floor(b / GRID_COLS);
  return Math.abs(aCol - bCol) + Math.abs(aRow - bRow);
}

// Pick a random cell that isn't occupied and isn't adjacent to any occupied cell.
// Falls back to non-overlapping if no non-adjacent option exists.
export function pickCell(occupied: number[]): number {
  const total = GRID_COLS * GRID_ROWS;
  const all = Array.from({ length: total }, (_, i) => i);

  const nonAdjacent = all.filter(
    c => !occupied.includes(c) && occupied.every(o => manhattanDist(c, o) >= 2),
  );
  if (nonAdjacent.length > 0) return nonAdjacent[Math.floor(Math.random() * nonAdjacent.length)];

  const available = all.filter(c => !occupied.includes(c));
  if (available.length > 0) return available[Math.floor(Math.random() * available.length)];

  return Math.floor(Math.random() * total);
}

export function generateInstances(opts: GenerateInstancesOpts): GenerateResult {
  const rand = mulberry32(opts.seed);
  const lerp = (a: number, b: number) => a + rand() * (b - a);

  const layerOrder: LayerName[] = ["backdrop", "mid", "punch"];
  const totalAnimated = layerOrder.reduce((sum, l) => sum + opts.layers[l].count, 0);
  const needsResting = opts.resting.count > 0;
  const totalNeeded = totalAnimated + (needsResting ? 1 : 0);
  const totalCells = GRID_COLS * GRID_ROWS;

  if (totalNeeded > totalCells) {
    console.warn(`EntranceAnimation: ${totalNeeded} instances requested but grid only has ${totalCells} cells. Reduce layer counts.`);
  }

  // Fisher-Yates shuffle of cell indices
  const cells = Array.from({ length: totalCells }, (_, i) => i);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }

  let posIdx = 0;
  const out: Instance[] = [];

  for (const layer of layerOrder) {
    const cfg = opts.layers[layer];
    for (let i = 0; i < cfg.count; i++) {
      const { x, y } = cellCenter(cells[posIdx++]);
      const size = lerp(cfg.sizeMin, cfg.sizeMax);
      const peakOpacity = lerp(cfg.opacityMin, cfg.opacityMax);
      const font: FontChoice = rand() < 0.5 ? "LectorBold" : "DieGrotesk";

      out.push({
        id: `${layer}-${i}`,
        layer,
        layerIndex: i,
        x,
        y,
        size,
        rotation: 0,
        peakOpacity,
        font,
      });
    }
  }

  let restingPosition: RestingPosition | null = null;
  if (needsResting && posIdx < totalCells) {
    const { x, y } = cellCenter(cells[posIdx]);
    const size = lerp(opts.resting.sizeRange[0], opts.resting.sizeRange[1]);
    restingPosition = { x, y, size };
  }

  return { instances: out, restingPosition };
}

// Derived timing
export function computeSettleAt(crashHoldMs: number) {
  return TIMING.punchEnter + ENTRY_DURATION.punch + crashHoldMs;
}

// Resting element appears after all animated instances have fully faded out.
export function computeRestingAppearAt(crashHoldMs: number) {
  return computeSettleAt(crashHoldMs) + ENTRY_DURATION.settle + 100;
}

export function computeCompleteAt(crashHoldMs: number) {
  return computeRestingAppearAt(crashHoldMs) + ENTRY_DURATION.resting;
}
