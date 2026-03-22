import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";
import type { User } from "./types";

export async function getUserProfile(email: string): Promise<User | null> {
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, "users", email));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as User;
  } catch {
    return null;
  }
}
