import {
  collection,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import type {
  Feedback,
  InstallationOnboarding,
  Item,
  Connection,
  KanonSave,
} from "./types";

export interface WhitelistEntry {
  email: string;
  role: string;
  name?: string;
  created_at?: unknown;
  self_registered?: boolean;
}

export function subscribeToWhitelist(
  cb: (entries: WhitelistEntry[]) => void
): Unsubscribe {
  if (!db) { cb([]); return () => {}; }
  return onSnapshot(collection(db, "whitelist"), (snap) => {
    cb(snap.docs.map((d) => ({ email: d.id, ...d.data() } as WhitelistEntry)));
  });
}

export function subscribeToAllOnboarding(
  cb: (docs: InstallationOnboarding[]) => void
): Unsubscribe {
  if (!db) { cb([]); return () => {}; }
  return onSnapshot(collection(db, "installation_onboarding"), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as InstallationOnboarding)));
  });
}

export function subscribeToFeedback(
  cb: (items: Feedback[]) => void
): Unsubscribe {
  if (!db) { cb([]); return () => {}; }
  const q = query(collection(db, "feedback"), orderBy("created_at", "desc"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Feedback)));
  });
}

export async function fetchTotalItems(): Promise<number> {
  if (!db) return 0;
  const snap = await getDocs(collection(db, "items"));
  return snap.size;
}

export async function fetchTotalConnections(): Promise<number> {
  if (!db) return 0;
  const snap = await getDocs(collection(db, "connections"));
  return snap.size;
}

export async function fetchTotalSaves(): Promise<number> {
  if (!db) return 0;
  const snap = await getDocs(collection(db, "kanon_saves"));
  return snap.size;
}

export function subscribeToAllItems(
  cb: (items: Item[]) => void
): Unsubscribe {
  if (!db) { cb([]); return () => {}; }
  const q = query(collection(db, "items"), orderBy("created_at", "desc"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Item)));
  });
}

export function subscribeToAllConnectionsAdmin(
  cb: (connections: Connection[]) => void
): Unsubscribe {
  if (!db) { cb([]); return () => {}; }
  const q = query(collection(db, "connections"), orderBy("created_at", "desc"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Connection)));
  });
}

export function subscribeToAllSaves(
  cb: (saves: KanonSave[]) => void
): Unsubscribe {
  if (!db) { cb([]); return () => {}; }
  const q = query(collection(db, "kanon_saves"), orderBy("created_at", "desc"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as KanonSave)));
  });
}
