import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

export type UserRole = "admin" | "member";
export interface WhitelistAccessInfo {
  role: UserRole | null;
  firstName: string | null;
}

function getFirstNameFromRecord(data: Record<string, unknown>): string | null {
  const firstName =
    data.firstName ??
    data.first_name ??
    data.name ??
    data.fullName ??
    data.displayName;

  if (typeof firstName !== "string") return null;

  const trimmed = firstName.trim();
  if (!trimmed) return null;

  return trimmed.split(/\s+/)[0] ?? null;
}

// Looks up the user's role in the Firestore `whitelist` collection.
// Document ID is the email address (lowercase). Field: role ("admin" | "member").
// Manage entries directly in Firebase Console → Firestore → whitelist.
export async function getWhitelistRole(email: string): Promise<UserRole | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, "whitelist", email.toLowerCase()));
  if (!snap.exists()) return null;
  return (snap.data().role as UserRole) ?? null;
}

export async function getWhitelistAccessInfo(email: string): Promise<WhitelistAccessInfo> {
  if (!db) return { role: null, firstName: null };

  const snap = await getDoc(doc(db, "whitelist", email.toLowerCase()));
  if (!snap.exists()) return { role: null, firstName: null };

  const data = snap.data() as Record<string, unknown>;
  return {
    role: (data.role as UserRole) ?? null,
    firstName: getFirstNameFromRecord(data),
  };
}

export async function emailHasWhitelistEntry(email: string): Promise<boolean> {
  if (!db) return false;
  const snap = await getDoc(doc(db, "whitelist", email.toLowerCase()));
  return snap.exists();
}

export async function createWhitelistEntry(
  email: string,
  name?: string
): Promise<void> {
  if (!db) throw new Error("Firestore not initialised");
  const normalised = email.toLowerCase();
  await setDoc(doc(db, "whitelist", normalised), {
    role: "member",
    ...(name ? { name } : {}),
    created_at: serverTimestamp(),
    self_registered: true,
  });
}

export const REGISTRATION_OPEN =
  process.env.NEXT_PUBLIC_REGISTRATION_OPEN !== "false";
