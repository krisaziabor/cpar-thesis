"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  submitProfileSetup,
  submitMediaOptIn,
  submitBookText,
  submitContactAndComplete,
  submitAvatarColors,
} from "@/lib/installation-onboarding";
import { ensureUserProfile } from "@/lib/users";
import MarkdownEditor from "@/components/MarkdownEditor";
import SyncedTranscript from "@/components/SyncedTranscript";
import GradientSVG from "@/components/GradientSVG";
import ColorWheel from "@/components/ColorWheel";
import type { TimedWord } from "@/lib/types";

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

/* ── Transcript loader ───────────────────────────────────────────────────── */

interface StepTranscript {
  audio_url: string;
  words: TimedWord[];
}

/**
 * Map onboarding step key → static asset filename (without extension).
 * Audio at /onboarding/{name}.mp3, transcript at /onboarding/{name}.json.
 *
 * Generate with:  node scripts/generate-transcript.mjs public/onboarding/<name>.mp3
 */
const STEP_AUDIO_MAP: Record<string, string> = {
  profile_setup:  "profile-setup",
  media_opt_in:   "media-opt-in",
  book_text:      "book-text",
  contact:        "contact",
  color_consumed: "color-consumed",
  color_made:     "color-made",
  color_changed:  "color-changed",
  avatar_reveal:  "avatar-reveal",
};

function useStepTranscript(stepKey: string | undefined) {
  const [data, setData] = useState<StepTranscript | null>(null);

  useEffect(() => {
    if (!stepKey) return;
    const name = STEP_AUDIO_MAP[stepKey];
    if (!name) return;

    let cancelled = false;

    (async () => {
      try {
        const jsonRes = await fetch(`/onboarding/${name}.json`);
        if (!jsonRes.ok) return;
        const json = await jsonRes.json();
        if (cancelled || !json?.words) return;

        // Fetch audio as blob — Turbopack may not serve files added to public/
        // after dev server start, but blob URLs always work
        let audioUrl = json.audio_url as string;
        try {
          const audioRes = await fetch(audioUrl);
          if (audioRes.ok) {
            audioUrl = URL.createObjectURL(await audioRes.blob());
          }
        } catch {}

        if (!cancelled) setData({ audio_url: audioUrl, words: json.words });
      } catch {}
    })();

    return () => { cancelled = true; };
  }, [stepKey]);

  return data;
}

/* ── Color steps config ──────────────────────────────────────────────────── */

const COLOR_STEPS = [
  {
    key: "color_consumed",
    prompt:
      "Think of something you\u2019ve consumed recently that stuck with you \u2014 a film, an album, a piece of writing, anything. Pick a color.",
  },
  {
    key: "color_made",
    prompt:
      "Now something you\u2019ve made \u2014 however small, however unfinished. Pick a color.",
  },
  {
    key: "color_changed",
    prompt:
      "Finally, something that changed the way you think. An idea, a theory, a conversation. Pick a color.",
  },
] as const;

/* ── Ambient gradient config ─────────────────────────────────────────────── */

const AMBIENT = {
  svgSize: 80,
  blurInternal: 12,
  blurCSS: 120,
  saturation: 1.4,
  opacity: 0.8,
  driftDuration: 30,
  growDuration: 14,
  growEase: [0.05, 0.5, 0.12, 1],
  startHeight: 3,
  endHeight: 120,
  startWidth: 75,
  endWidth: 100,
  fadeInDuration: 4,
};

const REVEAL = {
  textFade: { duration: 0.4 },
};

const CARD = {
  yOffset: 6,
  spring: { duration: 0.2, ease: [0.215, 0.61, 0.355, 1] },
};

const TIMING = {
  pickAdvance: 400,
  avatarAppear: 600,
  textAppear: 1200,
  ambientRise: 2000,
};

/* ── Ambient drift keyframes ─────────────────────────────────────────────── */

const driftKeyframes = `
@keyframes ambientDrift {
  0%   { transform: translate(0%, 0%) scale(1.0) rotate(0deg); }
  25%  { transform: translate(3%, -4%) scale(1.06) rotate(2.5deg); }
  50%  { transform: translate(-3%, -6%) scale(1.03) rotate(-1.5deg); }
  75%  { transform: translate(1%, -2%) scale(1.07) rotate(1deg); }
  100% { transform: translate(0%, 0%) scale(1.0) rotate(0deg); }
}
`;

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

  /* ── Color picking state ───────────────────────────────────────────────── */
  const [colorStep, setColorStep] = useState(0); // 0, 1, 2 = color prompts; 3 = reveal
  const [picked, setPicked] = useState<[string | null, string | null, string | null]>([
    null, null, null,
  ]);
  const [revealStage, setRevealStage] = useState(0);
  const revealTimers = useRef<NodeJS.Timeout[]>([]);
  const [seed] = useState("Kanon");

  const allPicked = picked.every((c) => c !== null);
  const colors = (allPicked ? picked : ["#000", "#000", "#000"]) as [string, string, string];

  /* ── Reveal transcript (separate from the step-based one) ────────────── */
  const revealTranscript = useStepTranscript(
    realStep === "avatar_colors" && colorStep === 3 ? "avatar_reveal" : undefined
  );

  /* ── Audio listening gate ───────────────────────────────────────────────── */
  // For form steps, key by realStep; for color sub-steps, key by color step key
  const currentTranscriptKey = realStep === "avatar_colors"
    ? COLOR_STEPS[colorStep]?.key
    : realStep;

  const [listenedSteps, setListenedSteps] = useState<Set<string>>(new Set());
  const [revealListened, setRevealListened] = useState(false);
  const transcript = useStepTranscript(currentTranscriptKey);
  const hasListened = !transcript || (currentTranscriptKey ? listenedSteps.has(currentTranscriptKey) : true);

  const markListened = useCallback(() => {
    if (currentTranscriptKey) {
      setListenedSteps((prev) => new Set(prev).add(currentTranscriptKey));
    }
  }, [currentTranscriptKey]);

  const activeStep = realStep;
  const activeEmail = user?.email ?? "";
  const activeName = user?.displayName ?? "";

  /* ── Form step handlers ────────────────────────────────────────────────── */

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

  /* ── Color pick handler ────────────────────────────────────────────────── */

  const handleColorPick = useCallback(
    (hex: string) => {
      const next = [...picked] as [string | null, string | null, string | null];
      next[colorStep] = hex;
      setPicked(next);

      const delay = shouldReduceMotion ? 0 : TIMING.pickAdvance;
      setTimeout(() => setColorStep((s) => s + 1), delay);
    },
    [colorStep, picked, shouldReduceMotion],
  );

  const handleColorDotClick = useCallback(
    (targetStep: number) => {
      if (targetStep < colorStep && targetStep < 3) {
        setColorStep(targetStep);
      }
    },
    [colorStep],
  );

  /* Trigger reveal stages when all three colors are picked */
  useEffect(() => {
    if (activeStep !== "avatar_colors" || colorStep !== 3) return;
    revealTimers.current.forEach(clearTimeout);
    const t: NodeJS.Timeout[] = [];

    if (shouldReduceMotion) {
      setRevealStage(3);
    } else {
      t.push(setTimeout(() => setRevealStage(1), TIMING.avatarAppear));
      t.push(setTimeout(() => setRevealStage(2), TIMING.textAppear));
      t.push(setTimeout(() => setRevealStage(3), TIMING.ambientRise));
    }

    revealTimers.current = t;
    return () => t.forEach(clearTimeout);
  }, [activeStep, colorStep, shouldReduceMotion]);

  /* Save colors and complete onboarding */
  async function handleAvatarComplete() {
    if (!allPicked) return;
    setSubmitting(true);
    await submitAvatarColors(activeEmail, colors);
    await refreshOnboarding();
    setSubmitting(false);
  }

  /* ── Loading state ─────────────────────────────────────────────────────── */

  const isLoading = loading;

  /* ── Render ─────────────────────────────────────────────────────────────── */

  const m = anim(shouldReduceMotion);
  const isColorPromptStep = activeStep === "avatar_colors" && colorStep < 3;
  const isColorReveal = activeStep === "avatar_colors" && colorStep === 3;

  const colorStepAnim = {
    initial: shouldReduceMotion ? false : ({ opacity: 0, y: CARD.yOffset } as const),
    animate: { opacity: 1, y: 0 } as const,
    exit: shouldReduceMotion
      ? ({ opacity: 1 } as const)
      : ({ opacity: 0, y: -CARD.yOffset } as const),
    transition: shouldReduceMotion ? { duration: 0 } : CARD.spring,
  };

  return (
    <div className="min-h-screen bg-black overflow-hidden">
      <style>{driftKeyframes}</style>

      {/* ── Ambient gradient — visible during avatar reveal ──────────────── */}
      <AnimatePresence>
        {isColorReveal && allPicked && (
          <motion.div
            key="ambient"
            initial={{ opacity: 0 }}
            animate={{ opacity: revealStage >= 3 ? 1 : 0 }}
            exit={{ opacity: 0 }}
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : { duration: AMBIENT.fadeInDuration, ease: EASE }
            }
            className="fixed inset-0 pointer-events-none z-0"
          >
            <motion.div
              initial={false}
              animate={{
                scaleY: revealStage >= 3
                  ? AMBIENT.endHeight / 100
                  : AMBIENT.startHeight / 100,
                scaleX: revealStage >= 3
                  ? AMBIENT.endWidth / 100
                  : AMBIENT.startWidth / 100,
              }}
              transition={
                shouldReduceMotion
                  ? { duration: 0 }
                  : {
                      scaleY: {
                        duration: AMBIENT.growDuration,
                        ease: AMBIENT.growEase,
                      },
                      scaleX: {
                        duration: AMBIENT.growDuration * 0.55,
                        ease: [0.215, 0.61, 0.355, 1],
                      },
                    }
              }
              style={{
                position: "absolute",
                bottom: 0,
                left: "-50vw",
                width: "200vw",
                height: "100vh",
                transformOrigin: "center bottom",
                willChange: "transform",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  filter: `blur(${AMBIENT.blurCSS}px) saturate(${AMBIENT.saturation})`,
                  opacity: AMBIENT.opacity,
                  animation: shouldReduceMotion
                    ? "none"
                    : `ambientDrift ${AMBIENT.driftDuration}s ease-in-out infinite`,
                  willChange: "transform",
                }}
              >
                <GradientSVG
                  colors={colors}
                  seed={seed}
                  size={AMBIENT.svgSize}
                  blurDeviation={AMBIENT.blurInternal}
                />
              </div>
            </motion.div>

            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to bottom, black 0%, rgba(0,0,0,0.6) 20%, rgba(0,0,0,0.2) 35%, transparent 55%)",
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="fixed left-6 top-6 z-20 flex flex-col gap-3">
        <h1 className="font-lector text-2xl tracking-tight text-white/90">
          Kanon
        </h1>

        {!isColorReveal && !isColorPromptStep && (
          <p className="whitespace-pre-line text-xs text-zinc-400">
            {"Installation onboarding"}
          </p>
        )}

        {/* ── Avatar reveal — transcript + enter button, no icon ─────────── */}
        <AnimatePresence>
          {isColorReveal && (
            <motion.div
              key="reveal-content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col gap-3"
            >
              <motion.div
                initial={shouldReduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: revealStage >= 2 ? 1 : 0 }}
                transition={
                  shouldReduceMotion ? { duration: 0 } : REVEAL.textFade
                }
              >
                {revealTranscript ? (
                  <SyncedTranscript
                    audioUrl={revealTranscript.audio_url}
                    words={revealTranscript.words}
                    onFinished={() => setRevealListened(true)}
                    className="max-w-[280px]"
                  />
                ) : (
                  <p className="font-sans text-xs text-zinc-400">
                    This is yours.
                  </p>
                )}
              </motion.div>

              {revealListened && (
                <div>
                  <button
                    disabled={submitting}
                    onClick={() => void handleAvatarComplete()}
                    className="font-lector text-xs text-zinc-300 transition-colors hover:text-zinc-50 disabled:opacity-30"
                  >
                    {submitting ? "Saving…" : "Enter Kanon"}
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Sign out */}
      {!isLoading && user && !isColorReveal && (
        <button
          onClick={signOut}
          className="fixed right-6 top-6 z-20 font-sans text-xs text-zinc-600 transition-colors hover:text-zinc-300"
        >
          Sign out
        </button>
      )}

      {/* ── Color prompt flow — centered, card + wheel ──────────────────── */}
      <AnimatePresence mode="wait">
        {isColorPromptStep && (
          <motion.div
            key="color-flow"
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={
              shouldReduceMotion
                ? { opacity: 0 }
                : {
                    opacity: 0,
                    y: -30,
                    transition: { duration: 0.25, ease: EASE },
                  }
            }
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-10 flex flex-col items-center justify-center gap-8"
          >
            {/* Progress dots */}
            <div className="flex gap-2">
              {[0, 1, 2].map((i) => {
                const canGoBack = i < colorStep;
                return (
                  <motion.button
                    key={i}
                    onClick={() => handleColorDotClick(i)}
                    disabled={!canGoBack}
                    className="h-1.5 rounded-full"
                    style={{ cursor: canGoBack ? "pointer" : "default" }}
                    animate={{
                      width: colorStep > i ? 24 : 6,
                      backgroundColor:
                        picked[i] ??
                        (colorStep === i
                          ? "rgba(255,255,255,0.4)"
                          : "rgba(255,255,255,0.1)"),
                    }}
                    whileHover={
                      canGoBack && !shouldReduceMotion
                        ? { opacity: 0.7 }
                        : {}
                    }
                    transition={
                      shouldReduceMotion
                        ? { duration: 0 }
                        : { duration: 0.3, ease: EASE }
                    }
                  />
                );
              })}
            </div>

            {/* Prompt card with optional transcript */}
            <div className="w-[min(440px,calc(100vw-3rem))]">
              <motion.div
                layout
                transition={shouldReduceMotion ? { duration: 0 } : CARD.spring}
                className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
              >
                <AnimatePresence initial={false} mode="wait">
                  <motion.div
                    key={COLOR_STEPS[colorStep].key}
                    {...colorStepAnim}
                    className="px-5 py-4"
                  >
                    {transcript ? (
                      <SyncedTranscript
                        audioUrl={transcript.audio_url}
                        words={transcript.words}
                        onFinished={markListened}
                      />
                    ) : (
                      <p className="font-sans text-sm leading-relaxed text-zinc-400">
                        {COLOR_STEPS[colorStep].prompt}
                      </p>
                    )}
                  </motion.div>
                </AnimatePresence>
              </motion.div>
            </div>

            {/* Color wheel — gated on listening if transcript exists */}
            <div style={{ opacity: hasListened ? 1 : 0.3, pointerEvents: hasListened ? "auto" : "none", transition: "opacity 0.3s" }}>
              <ColorWheel
                picked={picked}
                currentStep={colorStep}
                onPick={handleColorPick}
                shouldReduceMotion={shouldReduceMotion}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Form steps card (profile, media, book, contact) ────────────── */}
      <AnimatePresence>
        {activeStep !== "avatar_colors" && activeStep !== "complete" && !isLoading && (
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
              <AnimatePresence initial={false} mode="wait">
                {/* ── Step 0: Profile setup ─────────────────────────────── */}
                {activeStep === "profile_setup" && (
                  <motion.div key="profile_setup" {...m} className="flex flex-col">
                    <div className="border-b border-zinc-800 px-4 py-3">
                      {transcript ? (
                        <SyncedTranscript
                          audioUrl={transcript.audio_url}
                          words={transcript.words}
                          onFinished={markListened}
                        />
                      ) : (
                        <p className="font-sans text-xs leading-relaxed text-zinc-400">
                          Welcome to Kanon. Enter your name to get started.
                        </p>
                      )}
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

                    <button
                      disabled={!profileName.trim() || submitting || !hasListened}
                      onClick={() => void handleProfileSetup()}
                      className="w-full px-4 py-2.5 font-lector text-xs text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      {submitting ? "Setting up…" : "Continue"}
                    </button>
                  </motion.div>
                )}

                {/* ── Step 1: Media opt-in ──────────────────────────────── */}
                {activeStep === "media_opt_in" && (
                  <motion.div key="media_opt_in" {...m} className="flex flex-col">
                    <div className="border-b border-zinc-800 px-4 py-3">
                      {transcript ? (
                        <SyncedTranscript
                          audioUrl={transcript.audio_url}
                          words={transcript.words}
                          onFinished={markListened}
                        />
                      ) : (
                        <p className="font-sans text-xs leading-relaxed text-zinc-400">
                          Your voice recordings and media can be projected across the
                          installation&apos;s three panels during the exhibition. This
                          is entirely optional&nbsp;&mdash; your contributions to the
                          library remain regardless.
                        </p>
                      )}
                    </div>
                    <div className="flex items-stretch divide-x divide-zinc-800">
                      <button
                        disabled={submitting || !hasListened}
                        onClick={() => void handleMediaOptIn(true)}
                        className="flex-1 px-4 py-2.5 font-lector text-xs text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-50 disabled:opacity-40"
                      >
                        Include my contributions
                      </button>
                      <button
                        disabled={submitting || !hasListened}
                        onClick={() => void handleMediaOptIn(false)}
                        className="px-4 py-2.5 font-lector text-xs text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-300 disabled:opacity-40"
                      >
                        Not this time
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* ── Step 2: Book text ─────────────────────────────────── */}
                {activeStep === "book_text" && (
                  <motion.div key="book_text" {...m} className="flex flex-col">
                    <div className="border-b border-zinc-800 px-4 py-3">
                      {transcript ? (
                        <SyncedTranscript
                          audioUrl={transcript.audio_url}
                          words={transcript.words}
                          onFinished={markListened}
                        />
                      ) : (
                        <p className="font-sans text-xs leading-relaxed text-zinc-400">
                          The installation includes a physical book&nbsp;&mdash; a
                          collection of texts that resonate deeply with each
                          contributor. Write or paste a piece of text you&apos;d like
                          included. You can also upload a PDF showing how you&apos;d
                          like it formatted.
                        </p>
                      )}
                    </div>

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

                    <div className="border-t border-zinc-800">
                      <button
                        disabled={!bookTitle.trim() || !bookText.trim() || submitting || !hasListened}
                        onClick={() => void handleBookTextSubmit()}
                        className="w-full px-4 py-2.5 font-lector text-xs text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        {submitting ? "Submitting…" : "Submit text"}
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* ── Step 3: Contact ───────────────────────────────────── */}
                {activeStep === "contact" && (
                  <motion.div key="contact" {...m} className="flex flex-col">
                    <div className="border-b border-zinc-800 px-4 py-3">
                      {transcript ? (
                        <SyncedTranscript
                          audioUrl={transcript.audio_url}
                          words={transcript.words}
                          onFinished={markListened}
                        />
                      ) : (
                        <p className="font-sans text-xs leading-relaxed text-zinc-400">
                          Kris may reach out about the installation and will email you
                          when Kanon goes live. How would you prefer to be contacted?
                        </p>
                      )}
                    </div>

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

                    <button
                      disabled={
                        submitting ||
                        !hasListened ||
                        (contactMethod === "text" && !phoneNumber.trim())
                      }
                      onClick={() => void handleContactSubmit()}
                      className="w-full px-4 py-2.5 font-lector text-xs text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      {submitting ? "Saving…" : "Continue"}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Complete — enter app ─────────────────────────────────────────── */}
      <AnimatePresence>
        {activeStep === "complete" && !isLoading && (
          <div className="fixed bottom-6 left-6 z-20">
            <motion.div {...m}>
              <button
                onClick={() => {
                  try { sessionStorage.setItem("kanon-just-onboarded", "1"); } catch {}
                  router.replace("/");
                }}
                className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2.5 font-lector text-xs text-zinc-300 shadow-[0_4px_24px_rgba(0,0,0,0.5)] transition-colors hover:bg-zinc-900 hover:text-zinc-50"
              >
                Done
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
