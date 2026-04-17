"use client";

import { FormEvent, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { submitFeedback } from "@/lib/feedback";
import PanelIntro from "@/components/ui/PanelIntro";
import FloatingNavClearance from "@/components/ui/FloatingNavClearance";

const MAX_FEEDBACK_LENGTH = 1200;

export default function FeedbackPanel() {
  const { user } = useAuth();
  const shouldReduceMotion = useReducedMotion();
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [didSubmit, setDidSubmit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedText = text.trim();
  const canSubmit =
    !!user?.uid && !!user?.email && trimmedText.length > 0 && text.length <= MAX_FEEDBACK_LENGTH;

  const transitionFast = {
    duration: shouldReduceMotion ? 0 : 0.2,
    ease: [0.215, 0.61, 0.355, 1] as const,
  };

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit || !user?.email) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await submitFeedback({
        userId: user.uid,
        userEmail: user.email,
        userName: user.displayName ?? "",
        text: trimmedText,
      });
      setDidSubmit(true);
      setText("");
    } catch {
      setError("Could not send feedback right now. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transitionFast}
      className="space-y-4 px-6 py-6"
    >
      <PanelIntro
        title="Share feedback"
        subtitle="Let me know what is working, what feels off, or what you want next."
      />

      <AnimatePresence mode="wait" initial={false}>
        {didSubmit ? (
          <motion.div
            key="success"
            initial={shouldReduceMotion ? false : { opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.99 }}
            transition={transitionFast}
            className="space-y-2"
          >
            <p className="text-xs leading-5 text-zinc-500">
              Thanks for the advice & for testing Kanon; it means the world to me {"<3"}
            </p>
            <button
              type="button"
              onClick={() => setDidSubmit(false)}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors duration-150 ease-[ease] hover:border-zinc-500 hover:text-zinc-100"
            >
              Send another
            </button>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            onSubmit={onSubmit}
            initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={transitionFast}
            className="space-y-3"
          >
            <div className="space-y-2">
              <label htmlFor="feedback-text" className="text-xs text-zinc-500">
                Feedback
              </label>
              <textarea
                id="feedback-text"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Write your thoughts..."
                maxLength={MAX_FEEDBACK_LENGTH}
                rows={6}
                className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none transition-colors duration-150 ease-[ease] placeholder:text-zinc-600 focus:border-zinc-600"
              />
            </div>

            <AnimatePresence initial={false}>
              {error && (
                <motion.p
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
                  transition={transitionFast}
                  className="text-xs text-red-400"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={!canSubmit || isSubmitting}
              className="rounded-md border border-zinc-700 bg-zinc-100 px-3 py-1.5 text-xs text-zinc-900 transition-colors duration-150 ease-[ease] hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Sending..." : "Send feedback"}
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      <FloatingNavClearance />
    </motion.div>
  );
}
