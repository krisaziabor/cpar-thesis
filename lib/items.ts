import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  where,
  serverTimestamp,
  getDocs,
  limit,
  type Unsubscribe,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "./firebase";
import type { Item, AudioVersion, DeletionRequest, Connection, ConnectionItem, Response as ItemResponse } from "./types";
import type { SourceMetadata } from "./metadata/types";

// ─── Storage ─────────────────────────────────────────────────────────────────

/** Upload an audio blob; returns the public download URL. */
export async function uploadItemAudio(blob: Blob, itemId: string): Promise<string> {
  if (!storage) throw new Error("Storage not initialised");
  const mimeType = blob.type || "audio/webm";
  const ext = mimeType.includes("mp4") ? "mp4"
    : mimeType.includes("ogg") ? "ogg"
    : "webm";
  const storageRef = ref(storage, `audio/items/${itemId}.${ext}`);
  console.log("[upload] starting uploadBytes", { itemId, mimeType, blobSize: blob.size, path: storageRef.fullPath });
  await uploadBytes(storageRef, blob, { contentType: mimeType });
  console.log("[upload] uploadBytes complete, fetching download URL");
  const url = await getDownloadURL(storageRef);
  console.log("[upload] done", url);
  return url;
}

/** Delete audio from Storage given a Firebase Storage download URL. */
async function deleteItemAudio(url: string): Promise<void> {
  if (!storage) return;
  try {
    const path = decodeURIComponent(new URL(url).pathname.split("/o/")[1]);
    await deleteObject(ref(storage, path));
  } catch {
    // Non-fatal: Firestore deletion proceeds regardless
  }
}

// ─── Storage (files) ──────────────────────────────────────────────────────────

/** Upload an image or PDF file; returns the public download URL. */
export async function uploadItemFile(file: File, itemId: string): Promise<string> {
  if (!storage) throw new Error("Storage not initialised");
  const mimeType = file.type;
  const ext = mimeType === "application/pdf" ? "pdf"
    : mimeType === "image/png" ? "png"
    : mimeType === "image/gif" ? "gif"
    : mimeType === "image/webp" ? "webp"
    : "jpg";
  const storageRef = ref(storage, `files/items/${itemId}.${ext}`);
  await uploadBytes(storageRef, file, { contentType: mimeType });
  return getDownloadURL(storageRef);
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ItemFields = Pick<Item, "title" | "type" | "creator" | "tags" | "added_by" | "media_url"> & {
  link?: string;
  thumbnail_url?: string;
  source_metadata?: SourceMetadata;
};

// ─── Published items ──────────────────────────────────────────────────────────

/**
 * Create a published item in Firestore (no audio yet).
 * Returns the new document ID so audio can be uploaded to the matching path.
 */
export async function createItemDoc(data: ItemFields): Promise<string> {
  if (!db) throw new Error("Firestore not initialised");
  const docRef = await addDoc(collection(db, "items"), {
    ...data,
    voice_recording_url: "",
    transcript: "",
    is_draft: false,
    is_hidden: false,
    created_at: serverTimestamp(),
  });
  return docRef.id;
}

/** Attach the Storage URL to an item after audio upload. */
export async function setItemAudioUrl(itemId: string, url: string): Promise<void> {
  if (!db) throw new Error("Firestore not initialised");
  await updateDoc(doc(db, "items", itemId), { voice_recording_url: url });
}

/** Real-time listener for all *published* items, newest-first. */
export function subscribeToItems(callback: (items: Item[]) => void): Unsubscribe {
  if (!db) return () => {};
  const q = query(
    collection(db, "items"),
    where("is_draft", "==", false),
    orderBy("created_at", "desc")
  );
  return onSnapshot(
    q,
    (snap) => { callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Item)); },
    (err) => { console.warn("[subscribeToItems]", err.code); }
  );
}

/** Real-time listener for a single item. */
export function subscribeToItem(
  id: string,
  callback: (item: Item | null) => void
): Unsubscribe {
  if (!db) return () => {};
  return onSnapshot(
    doc(db, "items", id),
    (snap) => { callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as Item) : null); },
    (err) => { console.warn("[subscribeToItem]", err.code); }
  );
}

/** Fetch a single item once (no listener). */
export async function getItem(id: string): Promise<Item | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, "items", id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as Item) : null;
}

/** Update editable metadata fields on a published item. */
export async function updateItem(
  id: string,
  data: Partial<Pick<Item, "title" | "type" | "creator" | "link" | "tags" | "media_url" | "thumbnail_url" | "source_metadata">>
): Promise<void> {
  if (!db) throw new Error("Firestore not initialised");
  await updateDoc(doc(db, "items", id), data);
}

/** Delete an item from Firestore and remove its audio from Storage. */
export async function deleteItem(item: Item): Promise<void> {
  if (!db) throw new Error("Firestore not initialised");
  if (item.voice_recording_url) await deleteItemAudio(item.voice_recording_url);
  await deleteDoc(doc(db, "items", item.id));
}

// ─── Drafts ───────────────────────────────────────────────────────────────────

/**
 * Create or update a draft. If `draftId` is null, a new draft doc is created.
 * Returns `{ draftId, audioUrl }` — `audioUrl` is the Firebase Storage download
 * URL if audio was uploaded, otherwise null.
 */
export async function upsertDraft(
  userEmail: string,
  draftId: string | null,
  fields: ItemFields,
  audioBlob?: Blob
): Promise<{ draftId: string; audioUrl: string | null }> {
  if (!db) throw new Error("Firestore not initialised");

  if (draftId) {
    // Update existing draft
    const updates: Record<string, unknown> = { ...fields };
    let audioUrl: string | null = null;
    if (audioBlob) {
      audioUrl = await uploadItemAudio(audioBlob, draftId);
      updates.voice_recording_url = audioUrl;
    }
    await updateDoc(doc(db, "items", draftId), updates);
    return { draftId, audioUrl };
  }

  // Create new draft
  const docRef = await addDoc(collection(db, "items"), {
    ...fields,
    added_by: userEmail,
    voice_recording_url: "",
    transcript: "",
    is_draft: true,
    is_hidden: false,
    created_at: serverTimestamp(),
  });

  let audioUrl: string | null = null;
  if (audioBlob) {
    audioUrl = await uploadItemAudio(audioBlob, docRef.id);
    await updateDoc(doc(db, "items", docRef.id), { voice_recording_url: audioUrl });
  }

  return { draftId: docRef.id, audioUrl };
}

/**
 * Create a brand-new item safely: write as draft first, upload audio, then
 * publish. If audio upload fails the item stays as a draft (not published).
 * Returns the new item's ID.
 */
export async function createAndPublishItem(
  userEmail: string,
  fields: ItemFields,
  audioBlob: Blob
): Promise<string> {
  if (!db) throw new Error("Firestore not initialised");

  console.log("[createAndPublishItem] step 1 — creating draft");
  const { draftId } = await upsertDraft(userEmail, null, fields);
  console.log("[createAndPublishItem] step 2 — uploading audio for draft", draftId);

  // If this throws, item stays as draft — not published
  const audioUrl = await uploadItemAudio(audioBlob, draftId);
  console.log("[createAndPublishItem] step 3 — publishing");

  await updateDoc(doc(db, "items", draftId), {
    voice_recording_url: audioUrl,
    is_draft: false,
  });
  console.log("[createAndPublishItem] done", draftId);

  return draftId;
}

/**
 * Publish a draft: optionally replace audio, then flip is_draft to false.
 * Pass `newAudioBlob` if the user re-recorded; pass `existingAudioUrl` to
 * keep the audio that was already uploaded when the draft was saved.
 */
export async function publishDraft(
  draftId: string,
  newAudioBlob: Blob | null,
  existingAudioUrl: string | null
): Promise<void> {
  if (!db) throw new Error("Firestore not initialised");

  let audioUrl = existingAudioUrl ?? "";

  if (newAudioBlob) {
    if (existingAudioUrl) await deleteItemAudio(existingAudioUrl);
    audioUrl = await uploadItemAudio(newAudioBlob, draftId);
  }

  await updateDoc(doc(db, "items", draftId), {
    voice_recording_url: audioUrl,
    is_draft: false,
  });
}

/** Real-time listener for the current user's drafts, newest-first. */
export function subscribeToDrafts(
  userEmail: string,
  callback: (drafts: Item[]) => void
): Unsubscribe {
  if (!db) return () => {};
  const q = query(
    collection(db, "items"),
    where("added_by", "==", userEmail),
    where("is_draft", "==", true),
    orderBy("created_at", "desc")
  );
  return onSnapshot(
    q,
    (snap) => { callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Item)); },
    (err) => { console.warn("[subscribeToDrafts]", err.code); }
  );
}

/** Discard a draft: deletes the Firestore doc and any uploaded audio. */
export async function discardDraft(draft: Item): Promise<void> {
  return deleteItem(draft); // same logic — clean up storage then doc
}

// ─── Audio versions ───────────────────────────────────────────────────────────

/**
 * Upload a new audio version for an item. Adds a doc to the subcollection,
 * uploads the blob, updates the doc URL and the item's voice_recording_url.
 * Returns the Storage download URL.
 */
export async function addAudioVersion(
  itemId: string,
  blob: Blob,
  createdBy: string
): Promise<string> {
  if (!db) throw new Error("Firestore not initialised");
  if (!storage) throw new Error("Storage not initialised");

  const mimeType = blob.type || "audio/webm";
  const ext = mimeType.includes("mp4") ? "mp4"
    : mimeType.includes("ogg") ? "ogg"
    : "webm";

  // Pre-generate a doc ref so we have the ID for the storage path before writing
  const versionRef = doc(collection(db, "items", itemId, "audio_versions"));

  // Upload audio first, then create the doc with the URL already set.
  // This avoids an update step (which the security rules intentionally block
  // to keep version docs immutable after creation).
  const storageRef = ref(storage, `audio/items/${itemId}/${versionRef.id}.${ext}`);
  await uploadBytes(storageRef, blob, { contentType: mimeType });
  const url = await getDownloadURL(storageRef);

  await setDoc(versionRef, { url, created_at: serverTimestamp(), created_by: createdBy });
  await updateDoc(doc(db, "items", itemId), { voice_recording_url: url });

  return url;
}

/** Real-time listener for an item's audio version history, newest-first. */
export function subscribeToAudioVersions(
  itemId: string,
  callback: (versions: AudioVersion[]) => void
): Unsubscribe {
  if (!db) return () => {};
  const q = query(
    collection(db, "items", itemId, "audio_versions"),
    orderBy("created_at", "desc")
  );
  return onSnapshot(
    q,
    (snap) => { callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AudioVersion)); },
    (err) => { console.warn("[subscribeToAudioVersions]", err.code); }
  );
}

// ─── Deletion requests ────────────────────────────────────────────────────────

/**
 * Check whether an item has any connections (via connection_items junction docs).
 * Uses a limit-1 query so it's cheap regardless of connection count.
 */
export async function itemHasConnections(itemId: string): Promise<boolean> {
  if (!db) return false;
  const snap = await getDocs(
    query(
      collection(db, "connection_items"),
      where("item_id", "==", itemId),
      limit(1)
    )
  );
  return !snap.empty;
}

/** Submit a deletion request for an item that has connections. */
export async function createDeletionRequest(
  itemId: string,
  itemTitle: string,
  requestedBy: string,
  reason: string
): Promise<void> {
  if (!db) throw new Error("Firestore not initialised");
  await addDoc(collection(db, "deletion_requests"), {
    item_id: itemId,
    item_title: itemTitle,
    requested_by: requestedBy,
    reason,
    status: "pending",
    created_at: serverTimestamp(),
  });
}

/** Real-time listener for pending deletion requests (admin use), newest-first. */
export function subscribeToDeletionRequests(
  callback: (requests: DeletionRequest[]) => void
): Unsubscribe {
  if (!db) return () => {};
  const q = query(
    collection(db, "deletion_requests"),
    where("status", "==", "pending"),
    orderBy("created_at", "desc")
  );
  return onSnapshot(
    q,
    (snap) => { callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DeletionRequest)); },
    (err) => { console.warn("[subscribeToDeletionRequests]", err.code); }
  );
}

/**
 * Resolve a deletion request. If approved, the item is also deleted.
 * `decision` is "approved" | "rejected".
 */
export async function resolveDeletionRequest(
  requestId: string,
  itemId: string,
  decision: "approved" | "rejected",
  resolvedBy: string
): Promise<void> {
  if (!db) throw new Error("Firestore not initialised");

  await updateDoc(doc(db, "deletion_requests", requestId), {
    status: decision,
    resolved_at: serverTimestamp(),
    resolved_by: resolvedBy,
  });

  if (decision === "approved") {
    const item = await getItem(itemId);
    if (item) await deleteItem(item);
  }
}

// ─── Connections ──────────────────────────────────────────────────────────────

/**
 * Create a connection between items, optionally with audio.
 * Uploads audio first (same pattern as audio versions), then writes the
 * connection doc and junction rows in a single batch of promises.
 * Returns the new connection's ID.
 */
export async function createConnection(
  itemIds: string[],
  audioBlob: Blob | null,
  createdBy: string
): Promise<string> {
  if (!db) throw new Error("Firestore not initialised");

  const connectionRef = doc(collection(db, "connections"));

  let audioUrl = "";
  if (audioBlob) {
    if (!storage) throw new Error("Storage not initialised");
    const mimeType = audioBlob.type || "audio/webm";
    const ext = mimeType.includes("mp4") ? "mp4"
      : mimeType.includes("ogg") ? "ogg"
      : "webm";
    const storageRef = ref(storage, `audio/connections/${connectionRef.id}.${ext}`);
    await uploadBytes(storageRef, audioBlob, { contentType: mimeType });
    audioUrl = await getDownloadURL(storageRef);
  }

  await setDoc(connectionRef, {
    audio_url: audioUrl,
    transcript: "",
    created_by: createdBy,
    is_hidden: false,
    created_at: serverTimestamp(),
  });

  await Promise.all(
    itemIds.map((itemId) =>
      addDoc(collection(db!, "connection_items"), {
        connection_id: connectionRef.id,
        item_id: itemId,
      })
    )
  );

  return connectionRef.id;
}

/** Real-time listener for all connections, newest-first. */
export function subscribeToAllConnections(
  callback: (connections: Connection[]) => void
): Unsubscribe {
  if (!db) return () => {};
  const q = query(collection(db, "connections"), orderBy("created_at", "desc"));
  return onSnapshot(
    q,
    (snap) => { callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Connection)); },
    (err) => { console.warn("[subscribeToAllConnections]", err.code); }
  );
}

/** Real-time listener for all connection_items junction docs. */
export function subscribeToAllConnectionItems(
  callback: (items: ConnectionItem[]) => void
): Unsubscribe {
  if (!db) return () => {};
  return onSnapshot(
    collection(db, "connection_items"),
    (snap) => { callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ConnectionItem)); },
    (err) => { console.warn("[subscribeToAllConnectionItems]", err.code); }
  );
}

/** Real-time listener for a single connection doc. */
export function subscribeToConnection(
  id: string,
  callback: (connection: Connection | null) => void
): Unsubscribe {
  if (!db) return () => {};
  return onSnapshot(
    doc(db, "connections", id),
    (snap) => { callback(snap.exists() ? ({ id: snap.id, ...snap.data() } as Connection) : null); },
    (err) => { console.warn("[subscribeToConnection]", err.code); }
  );
}

/** One-time fetch of item IDs belonging to a connection. */
export async function getConnectionItemIds(connectionId: string): Promise<string[]> {
  if (!db) return [];
  const snap = await getDocs(
    query(collection(db, "connection_items"), where("connection_id", "==", connectionId))
  );
  return snap.docs.map((d) => d.data().item_id as string);
}

/** Real-time listener for responses on a connection, newest-first. */
export function subscribeToResponses(
  connectionId: string,
  callback: (responses: ItemResponse[]) => void
): Unsubscribe {
  if (!db) return () => {};
  const q = query(
    collection(db, "connections", connectionId, "responses"),
    orderBy("created_at", "desc")
  );
  return onSnapshot(
    q,
    (snap) => { callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ItemResponse)); },
    (err) => { console.warn("[subscribeToResponses]", err.code); }
  );
}

/**
 * Real-time listener for all connections that include a given item.
 * Watches the connection_items junction table, then fetches each connection doc.
 */
export function subscribeToItemConnections(
  itemId: string,
  callback: (connections: Array<Connection & { itemIds: string[] }>) => void
): Unsubscribe {
  if (!db) return () => {};
  const q = query(collection(db, "connection_items"), where("item_id", "==", itemId));
  return onSnapshot(q, async (snap) => {
    const connectionIds = [...new Set(snap.docs.map((d) => d.data().connection_id as string))];
    if (connectionIds.length === 0) { callback([]); return; }

    const connectionDocs = await Promise.all(
      connectionIds.map((cid) => getDoc(doc(db!, "connections", cid)))
    );

    const results = await Promise.all(
      connectionDocs.filter((d) => d.exists()).map(async (d) => {
        const itemsSnap = await getDocs(
          query(collection(db!, "connection_items"), where("connection_id", "==", d.id))
        );
        return {
          id: d.id,
          ...d.data(),
          itemIds: itemsSnap.docs.map((j) => j.data().item_id as string),
        } as Connection & { itemIds: string[] };
      })
    );
    callback(results);
  }, (err) => { console.warn("[subscribeToItemConnections]", err.code); });
}

/**
 * Delete a connection: removes audio from Storage, cleans up all junction docs
 * and response subcollection docs, then deletes the connection document itself.
 */
export async function deleteConnection(connection: Connection): Promise<void> {
  if (!db) throw new Error("Firestore not initialised");

  if (connection.audio_url) await deleteItemAudio(connection.audio_url);

  const [junctionSnap, responsesSnap] = await Promise.all([
    getDocs(query(collection(db, "connection_items"), where("connection_id", "==", connection.id))),
    getDocs(collection(db, "connections", connection.id, "responses")),
  ]);

  await Promise.all([
    ...junctionSnap.docs.map((d) => deleteDoc(d.ref)),
    ...responsesSnap.docs.map((d) => deleteDoc(d.ref)),
  ]);

  await deleteDoc(doc(db, "connections", connection.id));
}
