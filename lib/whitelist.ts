import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

export type UserRole = "admin" | "member";

// Looks up the user's role in the Firestore `whitelist` collection.
// Document ID is the email address (lowercase). Field: role ("admin" | "member").
// Manage entries directly in Firebase Console → Firestore → whitelist.
export async function getWhitelistRole(email: string): Promise<UserRole | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, "whitelist", email.toLowerCase()));
  if (!snap.exists()) return null;
  return (snap.data().role as UserRole) ?? null;
}
