import {
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "./firebase";
import type { InstallationOnboarding, OnboardingStep } from "./types";

const COLLECTION = "installation_onboarding";

function docId(email: string): string {
  return email.trim().toLowerCase();
}

function docRef(email: string) {
  if (!db) throw new Error("Firestore not initialised");
  return doc(db, COLLECTION, docId(email));
}

/**
 * Derive which step the user should see next based on saved progress.
 * `needsProfileSetup` is true for self-registered users who haven't
 * set up their profile yet — pre-existing whitelist users skip it.
 */
export function currentStep(
  data: InstallationOnboarding | null,
  needsProfileSetup = false
): OnboardingStep {
  if (!data) return "accessibility";
  if (data.completed_at) return "complete";
  if (data.accessibility_acknowledged_at == null) return "accessibility";
  if (needsProfileSetup && data.profile_setup_at == null) return "profile_setup";
  if (data.media_opt_in_at == null) return "media_opt_in";
  if (data.book_submitted_at == null) return "book_text";
  if (data.contact_submitted_at == null) return "contact";
  if (data.avatar_colors_at == null) return "avatar_colors";
  return "complete";
}

/** Fetch the user's onboarding doc (null if they haven't started). */
export async function getOnboarding(
  email: string
): Promise<InstallationOnboarding | null> {
  if (!db) return null;
  const snap = await getDoc(docRef(email));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as InstallationOnboarding;
}

/** Real-time subscription to onboarding progress. */
export function subscribeToOnboarding(
  email: string,
  cb: (data: InstallationOnboarding | null) => void
): Unsubscribe {
  if (!db) {
    cb(null);
    return () => {};
  }
  return onSnapshot(docRef(email), (snap) => {
    if (!snap.exists()) {
      cb(null);
      return;
    }
    cb({ id: snap.id, ...snap.data() } as InstallationOnboarding);
  });
}

/** Step 0 — acknowledge audio-first design (continue with audio or request text mode). */
export async function submitAccessibility(
  email: string,
  name: string,
  prefersTextMode: boolean
): Promise<void> {
  if (!db) return;
  await setDoc(
    docRef(email),
    {
      user_email: email,
      user_name: name,
      prefers_text_mode: prefersTextMode,
      accessibility_acknowledged_at: serverTimestamp(),
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    },
    { merge: true }
  );
}

/** Step 1 — save profile setup (name + optional icon) for self-registered users. */
export async function submitProfileSetup(
  email: string,
  name: string,
  icon?: string
): Promise<void> {
  if (!db) return;
  await Promise.all([
    setDoc(
      docRef(email),
      {
        user_email: email,
        user_name: name,
        profile_name: name,
        ...(icon ? { profile_icon: icon } : {}),
        profile_setup_at: serverTimestamp(),
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      },
      { merge: true }
    ),
    setDoc(
      doc(db, "whitelist", email.trim().toLowerCase()),
      { name },
      { merge: true }
    ),
  ]);
}

/** Step 1 — save media opt-in decision. */
export async function submitMediaOptIn(
  email: string,
  name: string,
  optIn: boolean
): Promise<void> {
  if (!db) return;
  await setDoc(
    docRef(email),
    {
      user_email: email,
      user_name: name,
      media_opt_in: optIn,
      media_opt_in_at: serverTimestamp(),
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    },
    { merge: true }
  );
}

/** Upload the formatting PDF to Storage and return the download URL. */
async function uploadBookPdf(
  email: string,
  file: File
): Promise<string> {
  if (!storage) throw new Error("Firebase Storage not initialised");
  const path = `files/book-submissions/${docId(email)}/${file.name}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

/** Step 2 — skip book text (user can complete it later from their checklist). */
export async function skipBookText(email: string): Promise<void> {
  if (!db) return;
  await setDoc(
    docRef(email),
    {
      book_skipped: true,
      book_submitted_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    },
    { merge: true }
  );
}

/** Step 2 — save book text (and optional formatting PDF). */
export async function submitBookText(
  email: string,
  title: string,
  date: string | undefined,
  text: string,
  pdfFile?: File | null
): Promise<void> {
  if (!db) return;

  let pdfUrl: string | undefined;
  if (pdfFile) {
    pdfUrl = await uploadBookPdf(email, pdfFile);
  }

  const payload: Record<string, unknown> = {
    book_title: title,
    book_text: text,
    book_submitted_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  };
  if (date) payload.book_date = date;
  if (pdfUrl) payload.book_pdf_url = pdfUrl;

  await setDoc(docRef(email), payload, { merge: true });
}

/** Step 3 — save contact preferences (no longer marks flow complete). */
export async function submitContactAndComplete(
  email: string,
  contactMethod: "email" | "text",
  phoneNumber?: string
): Promise<void> {
  if (!db) return;

  const payload: Record<string, unknown> = {
    preferred_contact_method: contactMethod,
    contact_submitted_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  };
  if (phoneNumber) payload.phone_number = phoneNumber;

  await setDoc(docRef(email), payload, { merge: true });
}

/** Step 4 — save avatar gradient colors and mark flow complete. */
export async function submitAvatarColors(
  email: string,
  colors: [string, string, string]
): Promise<void> {
  if (!db) return;

  await Promise.all([
    setDoc(
      docRef(email),
      {
        avatar_colors: colors,
        avatar_colors_at: serverTimestamp(),
        completed_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      },
      { merge: true }
    ),
    setDoc(
      doc(db, "users", email),
      { avatar_colors: colors },
      { merge: true }
    ),
  ]);
}
