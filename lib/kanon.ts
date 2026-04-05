import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import type { KanonSave } from "./types";
import { trackKanonSaveForUser } from "./user-checklist";

const KANON_SAVES = "kanon_saves";

/** Save an item or connection to a user's personal Kanon. Returns the new save doc ID. */
export async function saveToKanon(
  userEmail: string,
  referenceType: "item" | "connection",
  referenceId: string
): Promise<string> {
  if (!db) throw new Error("Firestore not initialised");
  const ref = await addDoc(collection(db, KANON_SAVES), {
    user_email: userEmail,
    reference_type: referenceType,
    reference_id: referenceId,
    created_at: serverTimestamp(),
  });
  await trackKanonSaveForUser(userEmail);
  return ref.id;
}

/** Remove a save from a user's personal Kanon by save document ID. */
export async function removeFromKanon(saveId: string): Promise<void> {
  if (!db) throw new Error("Firestore not initialised");
  await deleteDoc(doc(db, KANON_SAVES, saveId));
}

/**
 * Subscribe to whether a specific item/connection is saved in a user's Kanon.
 * Calls cb with the saveId (string) if saved, or null if not saved.
 */
export function subscribeToKanonSaveStatus(
  userEmail: string,
  referenceType: "item" | "connection",
  referenceId: string,
  cb: (saveId: string | null) => void
): Unsubscribe {
  if (!db) {
    cb(null);
    return () => {};
  }
  const q = query(
    collection(db, KANON_SAVES),
    where("user_email", "==", userEmail),
    where("reference_type", "==", referenceType),
    where("reference_id", "==", referenceId)
  );
  return onSnapshot(q, (snap) => {
    if (snap.empty) {
      cb(null);
    } else {
      cb(snap.docs[0].id);
    }
  });
}

/**
 * Subscribe to all of a user's Kanon saves, ordered by created_at desc.
 */
export function subscribeToUserKanon(
  userEmail: string,
  cb: (saves: KanonSave[]) => void
): Unsubscribe {
  if (!db) {
    cb([]);
    return () => {};
  }
  const q = query(
    collection(db, KANON_SAVES),
    where("user_email", "==", userEmail),
    orderBy("created_at", "desc")
  );
  return onSnapshot(q, (snap) => {
    cb(
      snap.docs.map((d) => ({ id: d.id, ...d.data() } as KanonSave))
    );
  });
}
