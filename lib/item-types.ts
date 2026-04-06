import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";

export const DEFAULT_ITEM_TYPES = ["book", "film", "article", "song", "podcast", "other"] as const;

export interface ItemTypeDoc {
  id: string;
  name: string;
  created_by: string;
}

function normalizeTypeName(name: string): string {
  return name.trim().toLowerCase();
}

function typeDocId(name: string): string {
  return normalizeTypeName(name).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function subscribeToItemTypes(callback: (types: string[]) => void): Unsubscribe {
  if (!db) {
    callback([...DEFAULT_ITEM_TYPES]);
    return () => {};
  }
  const q = query(collection(db, "item_types"), orderBy("name", "asc"));
  return onSnapshot(
    q,
    (snap) => {
      const remote = snap.docs
        .map((docSnap) => {
          const data = docSnap.data() as Partial<ItemTypeDoc>;
          return typeof data.name === "string" ? normalizeTypeName(data.name) : "";
        })
        .filter(Boolean);
      const merged = [...new Set([...DEFAULT_ITEM_TYPES, ...remote])];
      callback(merged);
    },
    () => {
      callback([...DEFAULT_ITEM_TYPES]);
    }
  );
}

export async function ensureItemTypeExists(name: string, createdBy: string): Promise<void> {
  if (!db) return;
  const normalized = normalizeTypeName(name);
  if (!normalized) return;
  const id = typeDocId(normalized);
  if (!id) return;
  await setDoc(
    doc(db, "item_types", id),
    {
      name: normalized,
      created_by: createdBy,
      created_at: serverTimestamp(),
    },
    { merge: true }
  );
}
