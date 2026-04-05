import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";

const USER_CHECKLIST_PROGRESS = "user_checklist_progress";
const TARGET_ADD_TEXTS = 3;
const TARGET_CONNECT_OWN_TO_OTHER = 2;
const TARGET_CONNECT_FOREIGN = 2;

interface ChecklistCompleted {
  add_texts_to_library: boolean;
  connect_own_to_other: boolean;
  connect_foreign_to_foreign: boolean;
  add_to_my_kanon: boolean;
}

export interface UserChecklistProgress {
  user_email: string;
  texts_added_count: number;
  own_to_other_connections_count: number;
  foreign_connections_count: number;
  kanon_saves_count: number;
  completed: ChecklistCompleted;
}

function checklistDocId(userEmail: string): string {
  return encodeURIComponent(userEmail.trim().toLowerCase());
}

function checklistRef(userEmail: string) {
  if (!db) throw new Error("Firestore not initialised");
  return doc(db, USER_CHECKLIST_PROGRESS, checklistDocId(userEmail));
}

function emptyProgress(userEmail: string): UserChecklistProgress {
  return {
    user_email: userEmail,
    texts_added_count: 0,
    own_to_other_connections_count: 0,
    foreign_connections_count: 0,
    kanon_saves_count: 0,
    completed: {
      add_texts_to_library: false,
      connect_own_to_other: false,
      connect_foreign_to_foreign: false,
      add_to_my_kanon: false,
    },
  };
}

function normaliseProgress(userEmail: string, raw: Record<string, unknown> | undefined): UserChecklistProgress {
  const base = emptyProgress(userEmail);
  const completedRaw = (raw?.completed ?? {}) as Record<string, unknown>;

  const textsAdded =
    typeof raw?.texts_added_count === "number" ? raw.texts_added_count : base.texts_added_count;
  const ownToOther =
    typeof raw?.own_to_other_connections_count === "number"
      ? raw.own_to_other_connections_count
      : base.own_to_other_connections_count;
  const foreignConnections =
    typeof raw?.foreign_connections_count === "number"
      ? raw.foreign_connections_count
      : base.foreign_connections_count;
  const kanonSaves =
    typeof raw?.kanon_saves_count === "number" ? raw.kanon_saves_count : base.kanon_saves_count;

  return {
    user_email: typeof raw?.user_email === "string" ? raw.user_email : userEmail,
    texts_added_count: Math.max(0, textsAdded),
    own_to_other_connections_count: Math.max(0, ownToOther),
    foreign_connections_count: Math.max(0, foreignConnections),
    kanon_saves_count: Math.max(0, kanonSaves),
    completed: {
      add_texts_to_library:
        completedRaw.add_texts_to_library === true || textsAdded >= TARGET_ADD_TEXTS,
      connect_own_to_other:
        completedRaw.connect_own_to_other === true ||
        ownToOther >= TARGET_CONNECT_OWN_TO_OTHER,
      connect_foreign_to_foreign:
        completedRaw.connect_foreign_to_foreign === true ||
        foreignConnections >= TARGET_CONNECT_FOREIGN,
      add_to_my_kanon: completedRaw.add_to_my_kanon === true || kanonSaves >= 1,
    },
  };
}

async function applyChecklistDelta(
  userEmail: string,
  delta: {
    textsAdded?: number;
    ownToOtherConnections?: number;
    foreignConnections?: number;
    kanonSaves?: number;
    markKanonComplete?: boolean;
  }
): Promise<void> {
  if (!db || !userEmail) return;
  const ref = checklistRef(userEmail);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const current = normaliseProgress(userEmail, snap.data() as Record<string, unknown> | undefined);

    const next: UserChecklistProgress = {
      ...current,
      texts_added_count: current.texts_added_count + (delta.textsAdded ?? 0),
      own_to_other_connections_count:
        current.own_to_other_connections_count + (delta.ownToOtherConnections ?? 0),
      foreign_connections_count: current.foreign_connections_count + (delta.foreignConnections ?? 0),
      kanon_saves_count: current.kanon_saves_count + (delta.kanonSaves ?? 0),
      completed: {
        add_texts_to_library:
          current.completed.add_texts_to_library ||
          current.texts_added_count + (delta.textsAdded ?? 0) >= TARGET_ADD_TEXTS,
        connect_own_to_other:
          current.completed.connect_own_to_other ||
          current.own_to_other_connections_count + (delta.ownToOtherConnections ?? 0) >=
            TARGET_CONNECT_OWN_TO_OTHER,
        connect_foreign_to_foreign:
          current.completed.connect_foreign_to_foreign ||
          current.foreign_connections_count + (delta.foreignConnections ?? 0) >=
            TARGET_CONNECT_FOREIGN,
        add_to_my_kanon:
          current.completed.add_to_my_kanon ||
          delta.markKanonComplete === true ||
          current.kanon_saves_count + (delta.kanonSaves ?? 0) >= 1,
      },
    };

    tx.set(
      ref,
      {
        user_email: next.user_email,
        texts_added_count: Math.max(0, next.texts_added_count),
        own_to_other_connections_count: Math.max(0, next.own_to_other_connections_count),
        foreign_connections_count: Math.max(0, next.foreign_connections_count),
        kanon_saves_count: Math.max(0, next.kanon_saves_count),
        completed: next.completed,
        created_at: (snap.data() as { created_at?: unknown } | undefined)?.created_at ?? serverTimestamp(),
        updated_at: serverTimestamp(),
      },
      { merge: true }
    );
  });
}

export async function trackPublishedTextForUser(userEmail: string): Promise<void> {
  await applyChecklistDelta(userEmail, { textsAdded: 1 });
}

export async function trackKanonSaveForUser(userEmail: string): Promise<void> {
  await applyChecklistDelta(userEmail, { kanonSaves: 1, markKanonComplete: true });
}

export async function trackCreatedConnectionForUser(
  userEmail: string,
  itemIds: string[]
): Promise<void> {
  if (!db || !userEmail || itemIds.length < 2) return;
  const firestore = db;

  const itemSnaps = await Promise.all(
    itemIds.map((itemId) => getDoc(doc(firestore, "items", itemId)))
  );
  const owners = itemSnaps
    .map((snap) => (snap.exists() ? (snap.data().added_by as string | undefined) : undefined))
    .filter((owner): owner is string => typeof owner === "string" && owner.length > 0);

  if (owners.length < 2) return;

  const hasOwn = owners.some((owner) => owner === userEmail);
  const hasOther = owners.some((owner) => owner !== userEmail);
  const allNotOwn = owners.every((owner) => owner !== userEmail);

  await applyChecklistDelta(userEmail, {
    ownToOtherConnections: hasOwn && hasOther ? 1 : 0,
    foreignConnections: allNotOwn ? 1 : 0,
  });
}

export function subscribeToUserChecklistProgress(
  userEmail: string,
  cb: (progress: UserChecklistProgress) => void
): Unsubscribe {
  if (!db || !userEmail) {
    cb(emptyProgress(userEmail));
    return () => {};
  }

  const ref = checklistRef(userEmail);
  return onSnapshot(ref, (snap) => {
    cb(normaliseProgress(userEmail, snap.data() as Record<string, unknown> | undefined));
  });
}

/**
 * Backfills checklist progress from existing data.
 * Uses max(current, observed) so once users hit a milestone, it stays complete.
 */
export async function backfillChecklistProgress(userEmail: string): Promise<void> {
  if (!db || !userEmail) return;
  const firestore = db;

  const [ownItemsSnap, kanonSavesSnap, createdConnectionsSnap] = await Promise.all([
    getDocs(
      query(
        collection(firestore, "items"),
        where("added_by", "==", userEmail),
        where("is_draft", "==", false)
      )
    ),
    getDocs(query(collection(firestore, "kanon_saves"), where("user_email", "==", userEmail))),
    getDocs(query(collection(firestore, "connections"), where("created_by", "==", userEmail))),
  ]);

  const connectionIds = createdConnectionsSnap.docs.map((d) => d.id);
  const perConnectionItems = await Promise.all(
    connectionIds.map(async (connectionId) => {
      const snap = await getDocs(
        query(collection(firestore, "connection_items"), where("connection_id", "==", connectionId))
      );
      return {
        connectionId,
        itemIds: snap.docs.map((d) => d.data().item_id as string),
      };
    })
  );

  const uniqueItemIds = [...new Set(perConnectionItems.flatMap((entry) => entry.itemIds))];
  const itemDocs = await Promise.all(
    uniqueItemIds.map((itemId) => getDoc(doc(firestore, "items", itemId)))
  );
  const ownerById = new Map<string, string>();
  itemDocs.forEach((snap) => {
    if (!snap.exists()) return;
    const owner = snap.data().added_by;
    if (typeof owner === "string" && owner.length > 0) ownerById.set(snap.id, owner);
  });

  let ownToOtherConnections = 0;
  let foreignConnections = 0;

  perConnectionItems.forEach(({ itemIds }) => {
    if (itemIds.length < 2) return;
    const owners = itemIds
      .map((itemId) => ownerById.get(itemId))
      .filter((owner): owner is string => typeof owner === "string");
    if (owners.length < 2) return;

    const hasOwn = owners.some((owner) => owner === userEmail);
    const hasOther = owners.some((owner) => owner !== userEmail);
    if (hasOwn && hasOther) ownToOtherConnections += 1;

    const allNotOwn = owners.every((owner) => owner !== userEmail);
    if (allNotOwn) foreignConnections += 1;
  });

  const observed = {
    texts_added_count: ownItemsSnap.size,
    own_to_other_connections_count: ownToOtherConnections,
    foreign_connections_count: foreignConnections,
    kanon_saves_count: kanonSavesSnap.size,
  };

  const ref = checklistRef(userEmail);
  await runTransaction(firestore, async (tx) => {
    const snap = await tx.get(ref);
    const current = normaliseProgress(userEmail, snap.data() as Record<string, unknown> | undefined);
    const next: UserChecklistProgress = {
      ...current,
      texts_added_count: Math.max(current.texts_added_count, observed.texts_added_count),
      own_to_other_connections_count: Math.max(
        current.own_to_other_connections_count,
        observed.own_to_other_connections_count
      ),
      foreign_connections_count: Math.max(
        current.foreign_connections_count,
        observed.foreign_connections_count
      ),
      kanon_saves_count: Math.max(current.kanon_saves_count, observed.kanon_saves_count),
      completed: {
        add_texts_to_library:
          current.completed.add_texts_to_library || observed.texts_added_count >= TARGET_ADD_TEXTS,
        connect_own_to_other:
          current.completed.connect_own_to_other ||
          observed.own_to_other_connections_count >= TARGET_CONNECT_OWN_TO_OTHER,
        connect_foreign_to_foreign:
          current.completed.connect_foreign_to_foreign ||
          observed.foreign_connections_count >= TARGET_CONNECT_FOREIGN,
        add_to_my_kanon: current.completed.add_to_my_kanon || observed.kanon_saves_count >= 1,
      },
    };

    const unchanged =
      next.texts_added_count === current.texts_added_count &&
      next.own_to_other_connections_count === current.own_to_other_connections_count &&
      next.foreign_connections_count === current.foreign_connections_count &&
      next.kanon_saves_count === current.kanon_saves_count &&
      next.completed.add_texts_to_library === current.completed.add_texts_to_library &&
      next.completed.connect_own_to_other === current.completed.connect_own_to_other &&
      next.completed.connect_foreign_to_foreign === current.completed.connect_foreign_to_foreign &&
      next.completed.add_to_my_kanon === current.completed.add_to_my_kanon;

    if (unchanged) return;

    tx.set(
      ref,
      {
        user_email: next.user_email,
        texts_added_count: next.texts_added_count,
        own_to_other_connections_count: next.own_to_other_connections_count,
        foreign_connections_count: next.foreign_connections_count,
        kanon_saves_count: next.kanon_saves_count,
        completed: next.completed,
        created_at: (snap.data() as { created_at?: unknown } | undefined)?.created_at ?? serverTimestamp(),
        updated_at: serverTimestamp(),
      },
      { merge: true }
    );
  });
}
