import type { User } from "firebase/auth";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

const FEEDBACK_COLLECTION = "feedback_submissions";
const MAX_FEEDBACK_LENGTH = 2000;

export async function submitFeedback(user: User, feedbackText: string): Promise<string> {
  if (!db) throw new Error("Firestore not initialised");
  if (!user.email) throw new Error("Signed-in user is missing an email address");

  const message = feedbackText.trim();
  if (!message) throw new Error("Feedback text cannot be empty");
  if (message.length > MAX_FEEDBACK_LENGTH) {
    throw new Error(`Feedback cannot exceed ${MAX_FEEDBACK_LENGTH} characters`);
  }

  const feedbackRef = await addDoc(collection(db, FEEDBACK_COLLECTION), {
    message,
    user_email: user.email,
    user_uid: user.uid,
    user_name: user.displayName ?? user.email,
    source: "floating_nav",
    created_at: serverTimestamp(),
  });

  return feedbackRef.id;
}
