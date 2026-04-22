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
  Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "./firebase";
import type {
  Item,
  AudioVersion,
  DeletionRequest,
  Connection,
  ConnectionItem,
  Response as ConnectionResponse,
  ItemResponse,
} from "./types";
import type { SourceMetadata } from "./metadata/types";
import { trackCreatedConnectionForUser, trackPublishedTextForUser } from "./user-checklist";

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

type ItemFields = Pick<Item, "title" | "description" | "media_date" | "type" | "creator" | "tags" | "added_by" | "media_url"> & {
  encountered_source?: string;
  link?: string;
  thumbnail_url?: string;
  source_metadata?: SourceMetadata;
};

async function requestTimedTranscript(audioUrl: string): Promise<Array<{ word: string; start: number; end: number }> | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch("/api/transcribe-words", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audioUrl }),
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as { words?: Array<{ word: string; start: number; end: number }> };
    return Array.isArray(payload.words) && payload.words.length > 0 ? payload.words : null;
  } catch {
    return null;
  }
}

function queueItemTimedTranscript(itemId: string, audioUrl: string): void {
  if (!db || !audioUrl) return;
  void (async () => {
    const words = await requestTimedTranscript(audioUrl);
    if (!words) return;
    try {
      await updateDoc(doc(db, "items", itemId), { timed_transcript: words });
    } catch {
      // Best-effort background transcription; ignore write failures.
    }
  })();
}

async function requestTranscript(audioUrl: string): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch("/api/transcribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audioUrl }),
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as { text?: string };
    return typeof payload.text === "string" && payload.text.trim() ? payload.text.trim() : null;
  } catch {
    return null;
  }
}

function queueItemTranscript(itemId: string, audioUrl: string): void {
  if (!db || !audioUrl) return;
  void (async () => {
    const transcript = await requestTranscript(audioUrl);
    if (!transcript) return;
    try {
      await updateDoc(doc(db, "items", itemId), { transcript });
    } catch {
      // Best-effort background transcription; ignore write failures.
    }
  })();
}

function queueConnectionTranscript(connectionId: string, audioUrl: string): void {
  if (!db || !audioUrl) return;
  void (async () => {
    const transcript = await requestTranscript(audioUrl);
    if (!transcript) return;
    try {
      await updateDoc(doc(db, "connections", connectionId), { transcript });
    } catch {
      // Best-effort background transcription; ignore write failures.
    }
  })();
}

function queueConnectionTimedTranscript(connectionId: string, audioUrl: string): void {
  if (!db || !audioUrl) return;
  void (async () => {
    const words = await requestTimedTranscript(audioUrl);
    if (!words) return;
    try {
      await updateDoc(doc(db, "connections", connectionId), { timed_transcript: words });
    } catch {
      // Best-effort background transcription; ignore write failures.
    }
  })();
}

function queueConnectionResponseTranscript(
  connectionId: string,
  responseId: string,
  audioUrl: string
): void {
  if (!db || !audioUrl) return;
  void (async () => {
    const transcript = await requestTranscript(audioUrl);
    if (!transcript) return;
    try {
      await updateDoc(
        doc(db, "connections", connectionId, "responses", responseId),
        { transcript }
      );
    } catch {
      // Best-effort background transcription.
    }
  })();
}

function queueItemResponseTranscript(itemId: string, responseId: string, audioUrl: string): void {
  if (!db || !audioUrl) return;
  void (async () => {
    const transcript = await requestTranscript(audioUrl);
    if (!transcript) return;
    try {
      await updateDoc(doc(db, "items", itemId, "responses", responseId), { transcript });
    } catch {
      // Best-effort background transcription; ignore write failures.
    }
  })();
}

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
  if (data.added_by) {
    try {
      await trackPublishedTextForUser(data.added_by);
    } catch (error) {
      // Checklist tracking is best-effort and should not block item creation.
      console.warn("[createItemDoc] checklist tracking failed", error);
    }
  }
  return docRef.id;
}

/** Attach the Storage URL to an item after audio upload. */
export async function setItemAudioUrl(itemId: string, url: string): Promise<void> {
  if (!db) throw new Error("Firestore not initialised");
  await updateDoc(doc(db, "items", itemId), { voice_recording_url: url });
  queueItemTranscript(itemId, url);
  queueItemTimedTranscript(itemId, url);
}

/** Real-time listener for all *published* items, newest-first. */
export function subscribeToItems(
  callback: (items: Item[]) => void,
  onError?: (error: { code?: string; message?: string }) => void
): Unsubscribe {
  if (!db) return () => {};
  const q = query(
    collection(db, "items"),
    where("is_draft", "==", false),
    orderBy("created_at", "desc")
  );
  return onSnapshot(
    q,
    (snap) => { callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Item)); },
    (err) => {
      console.warn("[subscribeToItems]", err.code);
      onError?.({ code: err.code, message: err.message });
    }
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

/** Find an existing published item by exact external link. */
export async function findPublishedItemByLink(link: string): Promise<Item | null> {
  if (!db) return null;
  const normalized = link.trim();
  if (!normalized) return null;
  try {
    // Rules-safe query: only published items are globally readable.
    const snap = await getDocs(
      query(
        collection(db, "items"),
        where("is_draft", "==", false),
        where("link", "==", normalized),
        limit(1)
      )
    );
    const first = snap.docs[0];
    return first ? ({ id: first.id, ...first.data() } as Item) : null;
  } catch {
    // Duplicate-check should never block creation flow.
    return null;
  }
}

/** Find an existing published item by normalized title (and optional creator). */
export async function findPublishedItemByTitle(
  title: string,
  creator?: string
): Promise<Item | null> {
  if (!db) return null;
  const normalizedTitle = title.trim();
  if (!normalizedTitle) return null;
  try {
    const constraints = [
      where("is_draft", "==", false),
      where("title", "==", normalizedTitle),
      limit(5),
    ] as const;
    const snap = await getDocs(query(collection(db, "items"), ...constraints));
    if (snap.empty) return null;

    const normalizedCreator = creator?.trim().toLowerCase();
    if (!normalizedCreator) {
      const first = snap.docs[0];
      return first ? ({ id: first.id, ...first.data() } as Item) : null;
    }

    const creatorMatched = snap.docs.find((docSnap) => {
      const value = (docSnap.data().creator as string | undefined)?.trim().toLowerCase() ?? "";
      return value === normalizedCreator;
    });
    const chosen = creatorMatched ?? snap.docs[0];
    return chosen ? ({ id: chosen.id, ...chosen.data() } as Item) : null;
  } catch {
    // Duplicate-check should never block creation flow.
    return null;
  }
}

/** Find an existing published music item by canonical song.link URL. */
export async function findPublishedMusicItemBySongLink(songLinkUrl: string): Promise<Item | null> {
  if (!db) return null;
  const normalized = songLinkUrl.trim();
  if (!normalized) return null;
  const candidateUrls = new Set<string>([normalized]);
  try {
    const parsed = new URL(normalized);
    candidateUrls.add(`${parsed.origin}${parsed.pathname}`.replace(/\/+$/, ""));
  } catch {
    // ignore parse fallback
  }

  async function queryByField(fieldPath: "source_metadata.song_link_url" | "link", value: string): Promise<Item | null> {
    const snap = await getDocs(
      query(
        collection(db!, "items"),
        where("is_draft", "==", false),
        where(fieldPath, "==", value),
        limit(1)
      )
    );
    const first = snap.docs[0];
    return first ? ({ id: first.id, ...first.data() } as Item) : null;
  }

  try {
    for (const candidate of candidateUrls) {
      const bySourceMetadata = await queryByField("source_metadata.song_link_url", candidate);
      if (bySourceMetadata) return bySourceMetadata;
      const byLink = await queryByField("link", candidate);
      if (byLink) return byLink;
    }
    return null;
  } catch {
    // Duplicate-check should never block creation flow.
    return null;
  }
}

/** Update editable metadata fields on a published item. */
export async function updateItem(
  id: string,
  data: Partial<
    Pick<
      Item,
      "title" | "description" | "media_date" | "type" | "creator" | "link" | "tags" | "media_url" | "thumbnail_url" | "source_metadata"
    >
  >
): Promise<void> {
  if (!db) throw new Error("Firestore not initialised");
  const cleaned = Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined)
  );
  if (Object.keys(cleaned).length === 0) return;
  await updateDoc(doc(db, "items", id), cleaned);
}

/**
 * Delete an item from Firestore and remove its audio from Storage. Also
 * cascades: removes each audio version (doc + storage blob) and each response
 * subcollection doc (plus its audio). Keeps Storage clean when admins prune.
 */
export async function deleteItem(item: Item): Promise<void> {
  if (!db) throw new Error("Firestore not initialised");
  if (item.voice_recording_url) await deleteItemAudio(item.voice_recording_url);

  const [versionsSnap, responsesSnap] = await Promise.all([
    getDocs(collection(db, "items", item.id, "audio_versions")),
    getDocs(collection(db, "items", item.id, "responses")),
  ]);

  await Promise.all([
    ...versionsSnap.docs.map(async (d) => {
      const url = (d.data() as { url?: string }).url;
      if (url) await deleteItemAudio(url);
      await deleteDoc(d.ref);
    }),
    ...responsesSnap.docs.map(async (d) => {
      const url = (d.data() as { audio_url?: string }).audio_url;
      if (url) await deleteItemAudio(url);
      await deleteDoc(d.ref);
    }),
  ]);

  await deleteDoc(doc(db, "items", item.id));
}

/** Admin/owner delete of a voice response on an item. */
export async function deleteItemResponse(
  itemId: string,
  responseId: string,
  audioUrl?: string
): Promise<void> {
  if (!db) throw new Error("Firestore not initialised");
  if (audioUrl) await deleteItemAudio(audioUrl);
  await deleteDoc(doc(db, "items", itemId, "responses", responseId));
}

/** Admin/owner delete of a voice response on a connection. */
export async function deleteConnectionResponse(
  connectionId: string,
  responseId: string,
  audioUrl?: string
): Promise<void> {
  if (!db) throw new Error("Firestore not initialised");
  if (audioUrl) await deleteItemAudio(audioUrl);
  await deleteDoc(doc(db, "connections", connectionId, "responses", responseId));
}

// ─── Ownership transfer (admin) ─────────────────────────────────────────────

async function assertWhitelisted(email: string): Promise<void> {
  if (!db) throw new Error("Firestore not initialised");
  const normalised = email.trim().toLowerCase();
  if (!normalised) throw new Error("Email required");
  const snap = await getDoc(doc(db, "whitelist", normalised));
  if (!snap.exists()) throw new Error(`${normalised} is not a whitelisted user`);
}

export async function transferItemOwnership(
  itemId: string,
  newOwnerEmail: string
): Promise<void> {
  if (!db) throw new Error("Firestore not initialised");
  await assertWhitelisted(newOwnerEmail);
  await updateDoc(doc(db, "items", itemId), {
    added_by: newOwnerEmail.trim().toLowerCase(),
  });
}

export async function transferConnectionOwnership(
  connectionId: string,
  newOwnerEmail: string
): Promise<void> {
  if (!db) throw new Error("Firestore not initialised");
  await assertWhitelisted(newOwnerEmail);
  await updateDoc(doc(db, "connections", connectionId), {
    created_by: newOwnerEmail.trim().toLowerCase(),
  });
}

export async function transferItemResponseOwnership(
  itemId: string,
  responseId: string,
  newOwnerEmail: string
): Promise<void> {
  if (!db) throw new Error("Firestore not initialised");
  await assertWhitelisted(newOwnerEmail);
  await updateDoc(doc(db, "items", itemId, "responses", responseId), {
    created_by: newOwnerEmail.trim().toLowerCase(),
  });
}

export async function transferConnectionResponseOwnership(
  connectionId: string,
  responseId: string,
  newOwnerEmail: string
): Promise<void> {
  if (!db) throw new Error("Firestore not initialised");
  await assertWhitelisted(newOwnerEmail);
  await updateDoc(doc(db, "connections", connectionId, "responses", responseId), {
    created_by: newOwnerEmail.trim().toLowerCase(),
  });
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
    if (audioUrl) { queueItemTranscript(draftId, audioUrl); queueItemTimedTranscript(draftId, audioUrl); }
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
    queueItemTranscript(docRef.id, audioUrl);
    queueItemTimedTranscript(docRef.id, audioUrl);
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
  try {
    await trackPublishedTextForUser(userEmail);
  } catch (error) {
    // Checklist tracking is best-effort and should not block publish.
    console.warn("[createAndPublishItem] checklist tracking failed", error);
  }
  queueItemTranscript(draftId, audioUrl);
  queueItemTimedTranscript(draftId, audioUrl);
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
  const draftSnap = await getDoc(doc(db, "items", draftId));
  const addedBy = draftSnap.exists() ? (draftSnap.data().added_by as string | undefined) : undefined;
  if (addedBy) {
    try {
      await trackPublishedTextForUser(addedBy);
    } catch (error) {
      // Checklist tracking is best-effort and should not block publish.
      console.warn("[publishDraft] checklist tracking failed", error);
    }
  }
  if (audioUrl) { queueItemTranscript(draftId, audioUrl); queueItemTimedTranscript(draftId, audioUrl); }
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
  await updateDoc(doc(db, "items", itemId), {
    voice_recording_url: url,
    transcript: "",
    timed_transcript: [],
  });
  queueItemTranscript(itemId, url);
  queueItemTimedTranscript(itemId, url);

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
  createdBy: string,
  title?: string
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
    ...(title?.trim() ? { title: title.trim() } : {}),
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

  await trackCreatedConnectionForUser(createdBy, itemIds);

  if (audioUrl) {
    queueConnectionTranscript(connectionRef.id, audioUrl);
    queueConnectionTimedTranscript(connectionRef.id, audioUrl);
  }

  return connectionRef.id;
}

/**
 * Upload a new audio version for a connection. Mirrors `addAudioVersion` for
 * items: writes an immutable doc to the `connections/{id}/audio_versions`
 * subcollection, points `connection.audio_url` at the latest upload, and
 * kicks off fresh plain + timed transcripts. Resets the old transcript fields
 * first so stale text doesn't flash while the new one is still transcribing.
 */
export async function addConnectionAudioVersion(
  connectionId: string,
  blob: Blob,
  createdBy: string
): Promise<string> {
  if (!db) throw new Error("Firestore not initialised");
  if (!storage) throw new Error("Storage not initialised");

  const mimeType = blob.type || "audio/webm";
  const ext = mimeType.includes("mp4") ? "mp4"
    : mimeType.includes("ogg") ? "ogg"
    : "webm";

  const versionRef = doc(collection(db, "connections", connectionId, "audio_versions"));
  const storageRef = ref(storage, `audio/connections/${connectionId}/${versionRef.id}.${ext}`);
  await uploadBytes(storageRef, blob, { contentType: mimeType });
  const url = await getDownloadURL(storageRef);

  await setDoc(versionRef, { url, created_at: serverTimestamp(), created_by: createdBy });
  await updateDoc(doc(db, "connections", connectionId), {
    audio_url: url,
    transcript: "",
    timed_transcript: [],
  });
  queueConnectionTranscript(connectionId, url);
  queueConnectionTimedTranscript(connectionId, url);

  return url;
}

/**
 * Find an existing connection that has exactly the same set of item IDs.
 * Returns the connection ID when found, otherwise null.
 */
export async function findExistingConnectionByItemIds(itemIds: string[]): Promise<string | null> {
  if (!db) return null;
  const target = [...new Set(itemIds)].sort();
  if (target.length < 2) return null;

  const allJunctions = await getDocs(collection(db, "connection_items"));
  const byConnection = new Map<string, Set<string>>();

  allJunctions.docs.forEach((docSnap) => {
    const data = docSnap.data();
    const connectionId = data.connection_id as string | undefined;
    const itemId = data.item_id as string | undefined;
    if (!connectionId || !itemId) return;
    if (!byConnection.has(connectionId)) byConnection.set(connectionId, new Set());
    byConnection.get(connectionId)!.add(itemId);
  });

  for (const [connectionId, itemSet] of byConnection.entries()) {
    const ids = [...itemSet].sort();
    if (ids.length !== target.length) continue;
    if (!ids.every((id, index) => id === target[index])) continue;
    const connectionSnap = await getDoc(doc(db, "connections", connectionId));
    if (connectionSnap.exists()) return connectionId;
  }
  return null;
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
  callback: (responses: ConnectionResponse[]) => void
): Unsubscribe {
  if (!db) return () => {};
  const q = query(
    collection(db, "connections", connectionId, "responses"),
    orderBy("created_at", "desc")
  );
  return onSnapshot(
    q,
    (snap) => { callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ConnectionResponse)); },
    (err) => { console.warn("[subscribeToResponses]", err.code); }
  );
}

/**
 * Create an audio response on an item.
 * Stores audio in Storage, writes response doc, then backfills transcript.
 */
export async function addItemResponse(
  itemId: string,
  blob: Blob,
  createdBy: string
): Promise<string> {
  if (!db) throw new Error("Firestore not initialised");
  if (!storage) throw new Error("Storage not initialised");

  const mimeType = blob.type || "audio/webm";
  const ext = mimeType.includes("mp4")
    ? "mp4"
    : mimeType.includes("ogg")
    ? "ogg"
    : "webm";

  const responseRef = doc(collection(db, "items", itemId, "responses"));
  const storageRef = ref(storage, `audio/item_responses/${itemId}/${responseRef.id}.${ext}`);
  await uploadBytes(storageRef, blob, { contentType: mimeType });
  const audioUrl = await getDownloadURL(storageRef);

  await setDoc(responseRef, {
    item_id: itemId,
    audio_url: audioUrl,
    transcript: "",
    created_by: createdBy,
    created_at: serverTimestamp(),
  });

  queueItemResponseTranscript(itemId, responseRef.id, audioUrl);
  return responseRef.id;
}

/**
 * Create an audio response on a connection. Uploads audio, writes a response
 * doc under `connections/{id}/responses`, then kicks off a background
 * transcription.
 */
export async function addConnectionResponse(
  connectionId: string,
  blob: Blob,
  createdBy: string
): Promise<string> {
  if (!db) throw new Error("Firestore not initialised");
  if (!storage) throw new Error("Storage not initialised");

  const mimeType = blob.type || "audio/webm";
  const ext = mimeType.includes("mp4")
    ? "mp4"
    : mimeType.includes("ogg")
    ? "ogg"
    : "webm";

  const responseRef = doc(collection(db, "connections", connectionId, "responses"));
  const storageRef = ref(
    storage,
    `audio/connection_responses/${connectionId}/${responseRef.id}.${ext}`
  );
  await uploadBytes(storageRef, blob, { contentType: mimeType });
  const audioUrl = await getDownloadURL(storageRef);

  await setDoc(responseRef, {
    connection_id: connectionId,
    audio_url: audioUrl,
    transcript: "",
    created_by: createdBy,
    created_at: serverTimestamp(),
  });

  queueConnectionResponseTranscript(connectionId, responseRef.id, audioUrl);
  return responseRef.id;
}

/** Real-time listener for responses on an item, newest-first. */
export function subscribeToItemResponses(
  itemId: string,
  callback: (responses: ItemResponse[]) => void
): Unsubscribe {
  if (!db) return () => {};
  const q = query(
    collection(db, "items", itemId, "responses"),
    orderBy("created_at", "desc")
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ItemResponse));
    },
    (err) => {
      console.warn("[subscribeToItemResponses]", err.code);
    }
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

  const [junctionSnap, responsesSnap, versionsSnap] = await Promise.all([
    getDocs(query(collection(db, "connection_items"), where("connection_id", "==", connection.id))),
    getDocs(collection(db, "connections", connection.id, "responses")),
    getDocs(collection(db, "connections", connection.id, "audio_versions")),
  ]);

  await Promise.all([
    ...junctionSnap.docs.map((d) => deleteDoc(d.ref)),
    ...responsesSnap.docs.map(async (d) => {
      const url = (d.data() as { audio_url?: string }).audio_url;
      if (url) await deleteItemAudio(url);
      await deleteDoc(d.ref);
    }),
    ...versionsSnap.docs.map(async (d) => {
      const url = (d.data() as { url?: string }).url;
      if (url) await deleteItemAudio(url);
      await deleteDoc(d.ref);
    }),
  ]);

  await deleteDoc(doc(db, "connections", connection.id));
}

/** Count published items created after a given timestamp. */
export async function countItemsSince(since: Date): Promise<number> {
  if (!db) return 0;
  const q = query(
    collection(db, "items"),
    where("is_draft", "==", false),
    where("created_at", ">", Timestamp.fromDate(since))
  );
  const snap = await getDocs(q);
  return snap.size;
}

/** Count connections created after a given timestamp. */
export async function countConnectionsSince(since: Date): Promise<number> {
  if (!db) return 0;
  const q = query(
    collection(db, "connections"),
    where("created_at", ">", Timestamp.fromDate(since))
  );
  const snap = await getDocs(q);
  return snap.size;
}
