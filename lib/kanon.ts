import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
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
  try {
    await trackKanonSaveForUser(userEmail);
  } catch (error) {
    // Checklist tracking is best-effort and should never block saves.
    console.warn("[saveToKanon] checklist tracking failed", error);
  }
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

/** Subscribe to all hold saves, newest-first. */
export function subscribeToAllKanonSaves(
  cb: (saves: KanonSave[]) => void
): Unsubscribe {
  if (!db) {
    cb([]);
    return () => {};
  }
  const q = query(collection(db, KANON_SAVES), orderBy("created_at", "desc"));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() } as KanonSave)));
  });
}

/** Subscribe to user emails that have saved a given item to Hold. */
export function subscribeToItemHolders(
  itemId: string,
  cb: (userEmails: string[]) => void
): Unsubscribe {
  if (!db) {
    cb([]);
    return () => {};
  }
  const q = query(collection(db, KANON_SAVES), where("reference_id", "==", itemId));
  return onSnapshot(q, (snap) => {
    const emails = snap.docs
      .map((d) => d.data() as Partial<KanonSave>)
      .filter((data) => data.reference_type === "item")
      .map((data) => data.user_email)
      .filter((email): email is string => typeof email === "string" && email.length > 0);
    cb([...new Set(emails)]);
  });
}

/** One-time check: is a specific item/connection already saved by this user? */
export async function hasKanonSave(
  userEmail: string,
  referenceType: "item" | "connection",
  referenceId: string
): Promise<boolean> {
  if (!db) return false;
  const normalizedEmail = userEmail.trim();
  const normalizedReferenceId = referenceId.trim();
  if (!normalizedEmail || !normalizedReferenceId) return false;
  try {
    const snap = await getDocs(
      query(
        collection(db, KANON_SAVES),
        where("user_email", "==", normalizedEmail),
        where("reference_type", "==", referenceType),
        where("reference_id", "==", normalizedReferenceId),
        limit(1)
      )
    );
    return !snap.empty;
  } catch {
    return false;
  }
}
