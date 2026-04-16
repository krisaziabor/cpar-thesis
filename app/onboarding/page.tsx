"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  submitProfileSetup,
  submitMediaOptIn,
  submitBookText,
  submitContactAndComplete,
} from "@/lib/installation-onboarding";
import { ensureUserProfile } from "@/lib/users";
import MarkdownEditor from "@/components/MarkdownEditor";

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
    signOut,
  } = useAuth();
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();

  /* Per-step form state */
  const [profileName, setProfileName] = useState("");
  const [bookTitle, setBookTitle] = useState("");
  const [bookDate, setBookDate] = useState("");
  const [bookText, setBookText] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [contactMethod, setContactMethod] = useState<"email" | "text">("email");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const activeStep = realStep;
  const activeEmail = user?.email ?? "";
  const activeName = user?.displayName ?? "";

  /* ── Step handlers ──────────────────────────────────────────────────────── */

  async function handleProfileSetup() {
    if (!profileName.trim()) return;
    setSubmitting(true);
    await submitProfileSetup(activeEmail, profileName.trim());
    await ensureUserProfile(activeEmail, profileName.trim());
    await refreshOnboarding();
    setSubmitting(false);
  }

  async function handleMediaOptIn(optIn: boolean) {
    setSubmitting(true);
    await submitMediaOptIn(activeEmail, activeName, optIn);
    await refreshOnboarding();
    setSubmitting(false);
  }

  async function handleBookTextSubmit() {
    if (!bookTitle.trim() || !bookText.trim()) return;
    setSubmitting(true);
    await submitBookText(activeEmail, bookTitle.trim(), bookDate.trim() || undefined, bookText, pdfFile);
    await refreshOnboarding();
    setSubmitting(false);
  }

  async function handleContactSubmit() {
    if (contactMethod === "text" && !phoneNumber.trim()) return;
    setSubmitting(true);
    await submitContactAndComplete(
      activeEmail,
      contactMethod,
      phoneNumber.trim() || undefined
    );
    await refreshOnboarding();
    setSubmitting(false);
  }

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

      {/* Sign out */}
      {!isLoading && user && (
        <button
          onClick={signOut}
          className="fixed right-6 top-6 z-20 font-sans text-xs text-zinc-600 transition-colors hover:text-zinc-300"
        >
          Sign out
        </button>
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
              {/* ── Step 0: Profile setup (new users) ────────────────────── */}
              {activeStep === "profile_setup" && (
                <motion.div key="profile_setup" {...m} className="flex flex-col">
                  <div className="border-b border-zinc-800 px-4 py-3 font-sans text-xs leading-relaxed text-zinc-400">
                    Welcome to Kanon. Enter your name to get started.
                  </div>

                  <div className="border-b border-zinc-800">
                    <input
                      type="text"
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      placeholder="Your full name"
                      autoFocus
                      className="w-full bg-transparent px-4 py-2.5 font-lector text-xs text-zinc-300 placeholder:text-zinc-500 focus:outline-none"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleProfileSetup();
                      }}
                    />
                  </div>

                  {/* Icon selection placeholder — to be designed */}

                  <button
                    disabled={!profileName.trim() || submitting}
                    onClick={() => void handleProfileSetup()}
                    className="w-full px-4 py-2.5 font-lector text-xs text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    {submitting ? "Setting up…" : "Continue"}
                  </button>
                </motion.div>
              )}

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

              {/* ── Step 4: Done ──────────────────────────────────────────── */}
              {activeStep === "complete" && (
                <motion.div key="complete" {...m} className="flex flex-col">
                  <button
                    onClick={() => {
                      try { sessionStorage.setItem("kanon-just-onboarded", "1"); } catch {}
                      router.replace("/");
                    }}
                    className="w-full px-4 py-2.5 font-lector text-xs text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-50"
                  >
                    Done
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </motion.div>
      </div>
    </div>
  );
}
