import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

const FEEDBACK_COLLECTION = "feedback";

interface SubmitFeedbackParams {
  userId: string;
  userEmail: string;
  userName: string;
  text: string;
}

/** Store a feedback message with user identity and server timestamp. */
export async function submitFeedback({
  userId,
  userEmail,
  userName,
  text,
}: SubmitFeedbackParams): Promise<string> {
  if (!db) throw new Error("Firestore not initialised");

  const trimmedText = text.trim();
  if (!trimmedText) throw new Error("Feedback cannot be empty.");

  const ref = await addDoc(collection(db, FEEDBACK_COLLECTION), {
    user_id: userId,
    user_email: userEmail,
    user_name: userName,
    text: trimmedText,
    created_at: serverTimestamp(),
  });

  return ref.id;
}
