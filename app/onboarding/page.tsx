"use client";

import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  submitMediaOptIn,
  submitBookText,
  submitContactAndComplete,
} from "@/lib/installation-onboarding";
import type { OnboardingStep } from "@/lib/types";
import MarkdownEditor from "@/components/MarkdownEditor";

/* ── Dev-mode fake users ─────────────────────────────────────────────────── */

interface DevUser {
  email: string;
  displayName: string;
}

const DEV_USERS: DevUser[] = [
  { email: "alex@demo.kanon", displayName: "Alex Demo" },
  { email: "jordan@demo.kanon", displayName: "Jordan Demo" },
  { email: "sam@demo.kanon", displayName: "Sam Demo" },
];

/* ── Shared animation config ─────────────────────────────────────────────── */

const EASE = [0.215, 0.61, 0.355, 1] as const;

function anim(reduced: boolean | null) {
  return {
    initial: reduced ? false : ({ opacity: 0, y: 6 } as const),
    animate: { opacity: 1, y: 0 } as const,
    exit: reduced ? ({ opacity: 1 } as const) : ({ opacity: 0, y: -6 } as const),
    transition: reduced
      ? { duration: 0 }
      : { duration: 0.2, ease: EASE },
  };
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function OnboardingPage() {
  const {
    user,
    loading,
    onboardingStep: realStep,
    refreshOnboarding,
  } = useAuth();
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();

  /* Dev mode: ?dev param forces it on; otherwise auto-activates when
     unauthenticated in development (only evaluated after loading finishes
     so a cached Firebase session doesn't cause a flash). */
  const [devParam, setDevParam] = useState(false);
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      setDevParam(new URLSearchParams(window.location.search).has("dev"));
    }
  }, []);
  const isDev =
    process.env.NODE_ENV === "development" &&
    !loading &&
    (devParam || !user);

  /* Dev-mode state */
  const [devUserIdx, setDevUserIdx] = useState(0);
  const [devStep, setDevStep] = useState<OnboardingStep>("media_opt_in");

  /* Per-step form state (shared between real and dev) */
  const [bookTitle, setBookTitle] = useState("");
  const [bookDate, setBookDate] = useState("");
  const [bookText, setBookText] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [contactMethod, setContactMethod] = useState<"email" | "text">("email");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const activeStep = isDev ? devStep : realStep;
  const activeEmail = isDev
    ? DEV_USERS[devUserIdx].email
    : user?.email ?? "";
  const activeName = isDev
    ? DEV_USERS[devUserIdx].displayName
    : user?.displayName ?? "";

  /* Reset form state when switching steps or dev users */
  const resetFormState = useCallback(() => {
    setBookTitle("");
    setBookDate("");
    setBookText("");
    setPdfFile(null);
    setContactMethod("email");
    setPhoneNumber("");
    setSubmitting(false);
  }, []);

  /* ── Step handlers ──────────────────────────────────────────────────────── */

  async function handleMediaOptIn(optIn: boolean) {
    setSubmitting(true);
    if (isDev) {
      setDevStep("book_text");
      setSubmitting(false);
      return;
    }
    await submitMediaOptIn(activeEmail, activeName, optIn);
    await refreshOnboarding();
    setSubmitting(false);
  }

  async function handleBookTextSubmit() {
    if (!bookTitle.trim() || !bookText.trim()) return;
    setSubmitting(true);
    if (isDev) {
      setDevStep("contact");
      setSubmitting(false);
      return;
    }
    await submitBookText(activeEmail, bookTitle.trim(), bookDate.trim() || undefined, bookText, pdfFile);
    await refreshOnboarding();
    setSubmitting(false);
  }

  async function handleContactSubmit() {
    if (contactMethod === "text" && !phoneNumber.trim()) return;
    setSubmitting(true);
    if (isDev) {
      setDevStep("complete");
      setSubmitting(false);
      return;
    }
    await submitContactAndComplete(
      activeEmail,
      contactMethod,
      phoneNumber.trim() || undefined
    );
    await refreshOnboarding();
    setSubmitting(false);
  }

  /* ── Dev helpers ────────────────────────────────────────────────────────── */

  function devCycleUser() {
    setDevUserIdx((i) => (i + 1) % DEV_USERS.length);
    setDevStep("media_opt_in");
    resetFormState();
  }

  function devReset() {
    setDevStep("media_opt_in");
    resetFormState();
  }

  /* ── Redirect completed users to main app (real mode only) ─────────────── */

  useEffect(() => {
    if (!isDev && !loading && user && realStep === "complete") {
      // Don't auto-redirect — let the user see the thank-you step
    }
  }, [isDev, loading, user, realStep]);

  /* ── Loading state ─────────────────────────────────────────────────────── */

  const isLoading = loading;

  /* ── Render ─────────────────────────────────────────────────────────────── */

  const m = anim(shouldReduceMotion);

  return (
    <div className="min-h-screen bg-black">
      {/* Header — matches login page */}
      <div className="fixed left-6 top-6 z-20 flex flex-col gap-2">
        <h1 className="font-lector text-2xl tracking-tight text-white/90">
          Kanon
        </h1>
        <p className="whitespace-pre-line text-xs text-zinc-400">
          {"Installation onboarding"}
        </p>
      </div>

      {/* ── Dev panel ──────────────────────────────────────────────────────── */}
      {isDev && (
        <div className="fixed right-6 top-6 z-50 flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
          <span className="font-mono text-[10px] uppercase tracking-wider text-amber-500/80">
            Dev
          </span>
          <span className="text-xs text-zinc-400">
            {DEV_USERS[devUserIdx].displayName}
          </span>
          <button
            onClick={devCycleUser}
            className="text-xs text-zinc-500 transition-colors hover:text-zinc-300"
            title="Switch fake user"
          >
            ↔
          </button>
          <div className="h-4 w-px bg-zinc-800" />
          {/* Step dots */}
          <div className="flex items-center gap-1.5">
            {(["media_opt_in", "book_text", "contact", "complete"] as OnboardingStep[]).map(
              (s, i) => (
                <div
                  key={s}
                  className={`h-1.5 w-1.5 rounded-full transition-colors ${
                    s === activeStep
                      ? "bg-zinc-200"
                      : i <
                        ["media_opt_in", "book_text", "contact", "complete"].indexOf(
                          activeStep
                        )
                      ? "bg-zinc-500"
                      : "bg-zinc-700"
                  }`}
                />
              )
            )}
          </div>
          <div className="h-4 w-px bg-zinc-800" />
          <button
            onClick={devReset}
            className="text-xs text-zinc-500 transition-colors hover:text-zinc-300"
          >
            Reset
          </button>
        </div>
      )}

      {/* ── Main card area ─────────────────────────────────────────────────── */}
      <div className="fixed bottom-6 left-6 z-20 flex w-[min(560px,calc(100vw-3rem))] flex-col gap-2">
        <motion.div
          layout
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : { duration: 0.25, ease: EASE }
          }
          className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
        >
          {isLoading ? (
            <div className="px-4 py-2.5 font-sans text-xs text-zinc-400">
              Loading…
            </div>
          ) : (
            <AnimatePresence initial={false} mode="wait">
              {/* ── Step 1: Media opt-in ───────────────────────────────────── */}
              {activeStep === "media_opt_in" && (
                <motion.div key="media_opt_in" {...m} className="flex flex-col">
                  <div className="border-b border-zinc-800 px-4 py-3 font-sans text-xs leading-relaxed text-zinc-400">
                    Your voice recordings and media can be projected across the
                    installation&apos;s three panels during the exhibition. This
                    is entirely optional&nbsp;&mdash; your contributions to the
                    library remain regardless.
                  </div>
                  <div className="flex items-stretch divide-x divide-zinc-800">
                    <button
                      disabled={submitting}
                      onClick={() => void handleMediaOptIn(true)}
                      className="flex-1 px-4 py-2.5 font-lector text-xs text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-50 disabled:opacity-40"
                    >
                      Include my contributions
                    </button>
                    <button
                      disabled={submitting}
                      onClick={() => void handleMediaOptIn(false)}
                      className="px-4 py-2.5 font-lector text-xs text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-300 disabled:opacity-40"
                    >
                      Not this time
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ── Step 2: Book text ──────────────────────────────────────── */}
              {activeStep === "book_text" && (
                <motion.div key="book_text" {...m} className="flex flex-col">
                  <div className="border-b border-zinc-800 px-4 py-3 font-sans text-xs leading-relaxed text-zinc-400">
                    The installation includes a physical book&nbsp;&mdash; a
                    collection of texts that resonate deeply with each
                    contributor. Write or paste a piece of text you&apos;d like
                    included. You can also upload a PDF showing how you&apos;d
                    like it formatted.
                  </div>

                  {/* Title and date */}
                  <div className="flex items-stretch divide-x divide-zinc-800 border-b border-zinc-800">
                    <input
                      type="text"
                      value={bookTitle}
                      onChange={(e) => setBookTitle(e.target.value)}
                      placeholder="Title of the piece"
                      className="min-w-0 flex-1 bg-transparent px-4 py-2.5 font-lector text-xs text-zinc-300 placeholder:text-zinc-500 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={bookDate}
                      onChange={(e) => setBookDate(e.target.value)}
                      placeholder="Date (optional)"
                      className="w-[140px] bg-transparent px-4 py-2.5 font-sans text-xs text-zinc-300 placeholder:text-zinc-500 focus:outline-none"
                    />
                  </div>

                  <div className="p-3">
                    <MarkdownEditor
                      value={bookText}
                      onChange={setBookText}
                      placeholder="Paste or write your text here…"
                    />
                  </div>

                  {/* Optional PDF */}
                  <div className="flex items-center gap-2 border-t border-zinc-800 px-4 py-2">
                    <label className="cursor-pointer font-sans text-[11px] text-zinc-500 transition-colors hover:text-zinc-300">
                      <input
                        type="file"
                        accept=".pdf"
                        className="hidden"
                        onChange={(e) =>
                          setPdfFile(e.target.files?.[0] ?? null)
                        }
                      />
                      {pdfFile
                        ? pdfFile.name
                        : "Attach a formatted PDF (optional)"}
                    </label>
                    {pdfFile && (
                      <button
                        onClick={() => setPdfFile(null)}
                        className="text-[11px] text-zinc-600 transition-colors hover:text-zinc-400"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Submit */}
                  <div className="border-t border-zinc-800">
                    <button
                      disabled={!bookTitle.trim() || !bookText.trim() || submitting}
                      onClick={() => void handleBookTextSubmit()}
                      className="w-full px-4 py-2.5 font-lector text-xs text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      {submitting ? "Submitting…" : "Submit text"}
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ── Step 3: Contact ────────────────────────────────────────── */}
              {activeStep === "contact" && (
                <motion.div key="contact" {...m} className="flex flex-col">
                  <div className="border-b border-zinc-800 px-4 py-3 font-sans text-xs leading-relaxed text-zinc-400">
                    Kris may reach out about the installation and will email you
                    when Kanon goes live. How would you prefer to be contacted?
                  </div>

                  {/* Method toggle */}
                  <div className="flex items-stretch divide-x divide-zinc-800 border-b border-zinc-800">
                    <button
                      onClick={() => setContactMethod("email")}
                      className={`flex-1 px-4 py-2.5 font-lector text-xs transition-colors ${
                        contactMethod === "email"
                          ? "bg-zinc-900 text-zinc-200"
                          : "text-zinc-500 hover:bg-zinc-900/50 hover:text-zinc-300"
                      }`}
                    >
                      Email
                    </button>
                    <button
                      onClick={() => setContactMethod("text")}
                      className={`flex-1 px-4 py-2.5 font-lector text-xs transition-colors ${
                        contactMethod === "text"
                          ? "bg-zinc-900 text-zinc-200"
                          : "text-zinc-500 hover:bg-zinc-900/50 hover:text-zinc-300"
                      }`}
                    >
                      Text
                    </button>
                  </div>

                  {/* Phone input (shown when "text" is selected) */}
                  {contactMethod === "text" && (
                    <div className="border-b border-zinc-800">
                      <input
                        type="tel"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="Phone number"
                        className="w-full bg-transparent px-4 py-2.5 font-sans text-xs text-zinc-300 placeholder:text-zinc-500 focus:outline-none"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleContactSubmit();
                        }}
                      />
                    </div>
                  )}

                  {/* Submit */}
                  <button
                    disabled={
                      submitting ||
                      (contactMethod === "text" && !phoneNumber.trim())
                    }
                    onClick={() => void handleContactSubmit()}
                    className="w-full px-4 py-2.5 font-lector text-xs text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {submitting ? "Saving…" : "Complete"}
                  </button>
                </motion.div>
              )}

              {/* ── Step 4: Thank you ──────────────────────────────────────── */}
              {activeStep === "complete" && (
                <motion.div key="complete" {...m} className="flex flex-col">
                  <div className="border-b border-zinc-800 px-4 py-3 font-sans text-xs leading-relaxed text-zinc-400">
                    Thank you for participating. You&apos;ll receive an email
                    when Kanon goes live and you can begin adding records to the
                    library. Kris may reach out via your preferred contact
                    method before then.
                  </div>
                  {!isDev && (
                    <button
                      onClick={() => router.replace("/")}
                      className="w-full px-4 py-2.5 font-lector text-xs text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-50"
                    >
                      Done
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </motion.div>
      </div>
    </div>
  );
}
