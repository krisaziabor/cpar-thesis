/**
 * lib/installation/shuffleBag.ts
 *
 * Shuffle bag for the installation playback loop.
 * Cycles through all eligible records in random order, refilling when empty.
 * Tracks connections so the page can detect synergy moments.
 */

import type { Item } from "@/lib/types";
import type { ConnectionData } from "./playback";

function fisherYatesShuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class ShuffleBag {
  private bag: Item[];
  private all: Item[];
  /** Map from itemId → all ConnectionData whose itemIds include that item. */
  private connMap: Map<string, ConnectionData[]>;

  constructor(items: Item[], connectionData: ConnectionData[]) {
    this.all = [...items];
    this.bag = fisherYatesShuffle([...items]);

    // Build adjacency map
    this.connMap = new Map();
    for (const cd of connectionData) {
      for (const id of cd.itemIds) {
        if (!this.connMap.has(id)) this.connMap.set(id, []);
        this.connMap.get(id)!.push(cd);
      }
    }
  }

  get remaining(): number {
    return this.bag.length;
  }

  get total(): number {
    return this.all.length;
  }

  bagIds(): string[] {
    return this.bag.map((i) => i.id);
  }

  /**
   * Pop and return the next record. Refills the bag when empty.
   * Returns null only if there are no records at all.
   */
  consume(): Item | null {
    if (this.all.length === 0) return null;
    if (this.bag.length === 0) this.refill();
    return this.bag.shift() ?? null;
  }

  /**
   * Return all ConnectionData for `itemId` whose OTHER items are ALL still
   * present in the bag. Empty array means no synergy opportunity.
   */
  connectionOpportunities(itemId: string): ConnectionData[] {
    const connections = this.connMap.get(itemId) ?? [];
    const bagSet = new Set(this.bag.map((i) => i.id));
    return connections.filter((cd) => {
      const others = cd.itemIds.filter((id) => id !== itemId);
      return others.length > 0 && others.every((id) => bagSet.has(id));
    });
  }

  /**
   * Remove specific item IDs from the bag (for synergy reservation).
   * Returns the removed Item objects. Items not found in bag are retrieved
   * from `all` so synergy records are always returned even if already played.
   */
  reserve(itemIds: string[]): Item[] {
    const reserved: Item[] = [];
    for (const id of itemIds) {
      const idx = this.bag.findIndex((i) => i.id === id);
      if (idx >= 0) {
        reserved.push(this.bag.splice(idx, 1)[0]);
      } else {
        // Already played this cycle — find in master list
        const item = this.all.find((i) => i.id === id);
        if (item) reserved.push(item);
      }
    }
    return reserved;
  }

  private refill(): void {
    this.bag = fisherYatesShuffle([...this.all]);
  }
}
