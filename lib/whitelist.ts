import { doc, getDoc } from "firebase/firestore";
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
