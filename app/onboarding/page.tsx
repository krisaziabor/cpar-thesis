"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  submitAccessibility,
  submitProfileSetup,
  submitMediaOptIn,
  submitContactAndComplete,
  submitAvatarColors,
} from "@/lib/installation-onboarding";
import { ensureUserProfile } from "@/lib/users";
import SyncedTranscript from "@/components/SyncedTranscript";
import GradientSVG from "@/components/GradientSVG";
import ColorWheel from "@/components/ColorWheel";
import type { OnboardingStep, TimedWord } from "@/lib/types";

/* ── Shared animation config ─────────────────────────────────────────────── */

const EASE = [0.215, 0.61, 0.355, 1] as const;

function anim(reduced: boolean | null) {
  return {
    initial: reduced ? false : ({ opacity: 0, y: 8 } as const),
    animate: { opacity: 1, y: 0 } as const,
    exit: reduced ? ({ opacity: 1 } as const) : ({ opacity: 0, y: -4 } as const),
    transition: reduced
      ? { duration: 0 }
      : {
          duration: 0.3,
          ease: EASE,
          exit: { duration: 0.2, ease: EASE },
        },
  };
}

/* ── Transcript loader ───────────────────────────────────────────────────── */

interface StepTranscript {
  audio_url: string;
  words: TimedWord[];
}

const STEP_AUDIO_MAP: Record<string, string> = {
  profile_setup: "profile-setup",
  media_opt_in: "media-opt-in",
  contact: "contact",
  color_consumed: "color-consumed",
  color_made: "color-made",
  color_changed: "color-changed",
  avatar_reveal: "avatar-reveal",
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

    return () => {
      cancelled = true;
    };
  }, [stepKey]);

  return data;
}

/* ── Listen gate — blocks interaction until audio finishes ───────────────── */

function ListenGate({
  locked,
  children,
  className,
}: {
  locked: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const [showTip, setShowTip] = useState(false);
  const [tipPos, setTipPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const timer = useRef<NodeJS.Timeout | null>(null);
  const reduced = useReducedMotion();

  const flash = useCallback(() => {
    if (containerRef.current) {
      const r = containerRef.current.getBoundingClientRect();
      setTipPos({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    }
    setShowTip(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setShowTip(false), 2000);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <div
        style={{
          opacity: locked ? 0.3 : 1,
          pointerEvents: locked ? "none" : "auto",
          transition: "opacity 0.3s ease",
        }}
      >
        {children}
      </div>
      {locked && (
        <button
          type="button"
          onClick={flash}
          className="absolute inset-0 z-10 cursor-default"
          aria-label="Listen to the full recording first"
        />
      )}
      {locked &&
        typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {showTip && (
              <motion.div
                key="listen-tip"
                initial={reduced ? false : { opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={
                  reduced
                    ? { duration: 0 }
                    : { duration: 0.15, ease: EASE }
                }
                style={{ left: tipPos.x, top: tipPos.y }}
                className="pointer-events-none fixed z-[9999] -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-zinc-800 px-3 py-1.5 font-sans text-xs text-zinc-300 shadow-lg"
              >
                Listen to the full recording first
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}

/* ── Step definitions ────────────────────────────────────────────────────── */

const FORM_STEPS: { key: OnboardingStep; fallbackText: string }[] = [
  {
    key: "profile_setup",
    fallbackText:
      "Hi. Welcome to Kanon. I\u2019m super excited that you\u2019re here. To start things off, please enter your name.",
  },
  {
    key: "media_opt_in",
    fallbackText:
      "Your voice recordings and media can be projected across the installation\u2019s three panels during the exhibition. This is entirely optional \u2014 your contributions to the library remain regardless.",
  },
  {
    key: "contact",
    fallbackText:
      "Kris may reach out about the installation and will email you when Kanon goes live. How would you prefer to be contacted?",
  },
];

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

/* ── Configs ─────────────────────────────────────────────────────────────── */

const AMBIENT = {
  svgSize: 80,
  blurInternal: 12,
  blurCSS: 120,
  saturation: 1.4,
  opacity: 0.8,
  driftDuration: 30,
  growDuration: 14,
  growEase: [0.05, 0.5, 0.12, 1] as const,
  startHeight: 3,
  endHeight: 120,
  startWidth: 75,
  endWidth: 100,
  fadeInDuration: 4,
};

const REVEAL = { textFade: { duration: 0.4 } };
const CARD = {
  yOffset: 6,
  spring: { duration: 0.2, ease: [0.215, 0.61, 0.355, 1] as const },
};
const TIMING = { pickAdvance: 400 };

const driftKeyframes = `
@keyframes ambientDrift {
  0%   { transform: translate(0%, 0%) scale(1.0) rotate(0deg); }
  25%  { transform: translate(3%, -4%) scale(1.06) rotate(2.5deg); }
  50%  { transform: translate(-3%, -6%) scale(1.03) rotate(-1.5deg); }
  75%  { transform: translate(1%, -2%) scale(1.07) rotate(1deg); }
  100% { transform: translate(0%, 0%) scale(1.0) rotate(0deg); }
}
`;

const ALL_STEPS: OnboardingStep[] = [
  "accessibility",
  "profile_setup",
  "media_opt_in",
  "contact",
  "avatar_colors",
  "complete",
];

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function OnboardingPage() {
  const {
    user,
    loading,
    onboardingStep: activeStep,
    refreshOnboarding,
    signOut,
  } = useAuth();
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();

  /* ── Per-step form state ───────────────────────────────────────────────── */
  const profileInputRef = useRef<HTMLInputElement>(null);
  const [profileName, setProfileName] = useState("");
  const [contactMethod, setContactMethod] = useState<"email" | "text">("email");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);

  /* ── Color picking state ───────────────────────────────────────────────── */
  const [colorStep, setColorStep] = useState(0);
  const [picked, setPicked] = useState<
    [string | null, string | null, string | null]
  >([null, null, null]);
  const [revealStage, setRevealStage] = useState(0);
  const revealTimers = useRef<NodeJS.Timeout[]>([]);
  const [seed] = useState("Kanon");

  const allPicked = picked.every((c) => c !== null);
  const colors = (allPicked ? picked : ["#000", "#000", "#000"]) as [
    string,
    string,
    string,
  ];

  const activeEmail = user?.email ?? "";
  const activeName = user?.displayName ?? "";

  /* ── Transcript loading ────────────────────────────────────────────────── */
  const currentTranscriptKey =
    activeStep === "avatar_colors"
      ? colorStep === 3
        ? undefined
        : COLOR_STEPS[colorStep]?.key
      : activeStep !== "accessibility" && activeStep !== "complete"
        ? activeStep
        : undefined;

  const transcript = useStepTranscript(currentTranscriptKey);
  const revealTranscript = useStepTranscript(
    activeStep === "avatar_colors" && colorStep === 3
      ? "avatar_reveal"
      : undefined,
  );

  /* ── Audio listening gate ──────────────────────────────────────────────── */
  const [listenedSteps, setListenedSteps] = useState<Set<string>>(new Set());
  const [revealListened, setRevealListened] = useState(false);
  const hasListened =
    !transcript ||
    (currentTranscriptKey ? listenedSteps.has(currentTranscriptKey) : true);

  const markListened = useCallback(() => {
    if (currentTranscriptKey) {
      setListenedSteps((prev) => new Set(prev).add(currentTranscriptKey));
    }
  }, [currentTranscriptKey]);

  useEffect(() => {
    if (hasListened && activeStep === "profile_setup") {
      profileInputRef.current?.focus();
    }
  }, [hasListened, activeStep]);

  /* ── Form step handlers ────────────────────────────────────────────────── */

  async function handleAccessibility(prefersTextMode: boolean) {
    setSubmitting(true);
    await submitAccessibility(activeEmail, activeName, prefersTextMode);
    await refreshOnboarding();
    setSubmitting(false);
  }

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

  async function handleContactSubmit() {
    if (contactMethod === "text" && !phoneNumber.trim()) return;
    setSubmitting(true);
    await submitContactAndComplete(
      activeEmail,
      contactMethod,
      phoneNumber.trim() || undefined,
    );
    await refreshOnboarding();
    setSubmitting(false);
  }

  /* ── Color handlers ────────────────────────────────────────────────────── */

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
      if (targetStep < colorStep && targetStep < 3) setColorStep(targetStep);
    },
    [colorStep],
  );

  const handleRevealPlayStart = useCallback(() => {
    if (revealStage >= 3) return;
    revealTimers.current.forEach(clearTimeout);
    const delay = shouldReduceMotion ? 0 : 600;
    const t = setTimeout(() => setRevealStage(3), delay);
    revealTimers.current = [t];
  }, [revealStage, shouldReduceMotion]);

  useEffect(() => {
    revealTimers.current.forEach(clearTimeout);
    if (activeStep === "avatar_colors" && colorStep === 3) {
      setRevealStage(2);
      setRevealListened(false);
    } else {
      setRevealStage(0);
    }
    return () => revealTimers.current.forEach(clearTimeout);
  }, [activeStep, colorStep]);

  async function handleAvatarComplete() {
    if (!allPicked) return;
    setSubmitting(true);
    await submitAvatarColors(activeEmail, colors);
    try {
      sessionStorage.setItem("kanon-just-onboarded", "1");
    } catch {}
    await refreshOnboarding();
    setSubmitting(false);
    router.replace("/");
  }

  /* ── Derived state ─────────────────────────────────────────────────────── */

  const isLoading = loading;
  const isColorPromptStep = activeStep === "avatar_colors" && colorStep < 3;
  const isColorReveal = activeStep === "avatar_colors" && colorStep === 3;
  const isFormStep =
    activeStep !== "accessibility" &&
    activeStep !== "avatar_colors" &&
    activeStep !== "complete";
  const m = anim(shouldReduceMotion);
  const stepIdx = ALL_STEPS.indexOf(activeStep ?? "accessibility");

  const colorStepAnim = {
    initial: shouldReduceMotion
      ? false
      : ({ opacity: 0, y: CARD.yOffset } as const),
    animate: { opacity: 1, y: 0 } as const,
    exit: shouldReduceMotion
      ? ({ opacity: 1 } as const)
      : ({ opacity: 0, y: -CARD.yOffset } as const),
    transition: shouldReduceMotion ? { duration: 0 } : CARD.spring,
  };

  return (
    <div className="min-h-screen overflow-hidden bg-black">
      <style>{driftKeyframes}</style>

      {/* ── Ambient gradient ──────────────────────────────────────────────── */}
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
            className="pointer-events-none fixed inset-0 z-0"
          >
            <motion.div
              initial={false}
              animate={{
                scaleY:
                  revealStage >= 3
                    ? AMBIENT.endHeight / 100
                    : AMBIENT.startHeight / 100,
                scaleX:
                  revealStage >= 3
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

      {/* ── Header — centered ──────────────────────────────────────────────── */}
      <div className="fixed left-0 right-0 top-6 z-20 flex flex-col items-center">
        <h1 className="font-lector text-2xl tracking-tight text-white/90">
          Kanon
        </h1>
      </div>

      {/* ── Avatar reveal — centered transcript + enter button ────────────── */}
      <AnimatePresence>
        {isColorReveal && (
          <motion.div
            key="reveal-content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-20 flex items-center justify-center px-6"
          >
            <div className="w-[min(560px,calc(100vw-3rem))]">
              <motion.div
                initial={shouldReduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={
                  shouldReduceMotion ? { duration: 0 } : REVEAL.textFade
                }
              >
                {revealTranscript && (
                  <SyncedTranscript
                    audioUrl={revealTranscript.audio_url}
                    words={revealTranscript.words}
                    onPlayStart={handleRevealPlayStart}
                    onFinished={() => setRevealListened(true)}
                    lightControls
                  />
                )}
              </motion.div>

              <AnimatePresence>
                {revealListened && (
                  <motion.div
                    initial={
                      shouldReduceMotion ? false : { opacity: 0, y: 4 }
                    }
                    animate={{ opacity: 1, y: 0 }}
                    transition={
                      shouldReduceMotion
                        ? { duration: 0 }
                        : { duration: 0.4, ease: EASE }
                    }
                    className="mt-4"
                  >
                    <button
                      disabled={submitting}
                      onClick={() => void handleAvatarComplete()}
                      className="font-sans text-xs text-white/70 transition-opacity hover:text-white/90 disabled:opacity-30"
                    >
                      {submitting ? "Saving\u2026" : "Enter Kanon"}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Top-right: step index + sign out ────────────────────────────────── */}
      {!isLoading && user && activeStep !== "complete" && !isColorReveal && (
        <div className="fixed right-6 top-6 z-20 flex items-center gap-4">
          <span className="font-sans text-xs text-zinc-500">
            {stepIdx + 1} of {ALL_STEPS.length}
          </span>
          <button
            onClick={signOut}
            className="font-sans text-xs text-zinc-600 transition-colors hover:text-zinc-300"
          >
            Sign out
          </button>
        </div>
      )}

      {/* ── Color prompt flow — side-by-side ─────────────────────────────── */}
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
            className="fixed inset-0 z-10 flex items-center justify-center"
          >
            <div className="flex w-[min(860px,calc(100vw-3rem))] flex-col items-center gap-10 sm:flex-row sm:gap-20">
              <div className="flex flex-1 flex-col items-start gap-6">
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

                <div className="w-full">
                  <AnimatePresence initial={false} mode="wait">
                    <motion.div
                      key={COLOR_STEPS[colorStep].key}
                      {...colorStepAnim}
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
                </div>
              </div>

              <div
                className="shrink-0"
                style={{
                  opacity: hasListened ? 1 : 0.3,
                  pointerEvents: hasListened ? "auto" : "none",
                  transition: "opacity 0.3s",
                }}
              >
                <ColorWheel
                  picked={picked}
                  currentStep={colorStep}
                  onPick={handleColorPick}
                  shouldReduceMotion={shouldReduceMotion}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Form steps — no card chrome ───────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {(activeStep === "accessibility" || isFormStep) && !isLoading && (
          <div className="fixed inset-0 z-10 flex items-center justify-center px-6">
            <AnimatePresence initial={false} mode="wait">
              {/* ── Accessibility ────────────────────────────────────────── */}
              {activeStep === "accessibility" && (
                <motion.div
                  key="accessibility"
                  {...m}
                  className="w-[min(480px,calc(100vw-3rem))]"
                >
                  <p className="font-lector text-sm leading-relaxed text-zinc-300">
                    Kanon uses audio recording and listening as the primary ways
                    to share and experience content. Most interactions involve
                    speaking and hearing rather than reading and typing.
                  </p>
                  <p className="mt-3 font-sans text-xs leading-relaxed text-zinc-500">
                    If you need accessibility features such as text input and
                    screen-reader-friendly content, you can enable text mode
                    below. You can always change this later in settings.
                  </p>

                  <div className="mt-5 flex items-center gap-4">
                    <button
                      disabled={submitting}
                      onClick={() => void handleAccessibility(false)}
                      className="font-sans text-xs text-zinc-300 transition-colors hover:text-zinc-50 disabled:opacity-40"
                    >
                      Continue with audio
                    </button>
                    <button
                      disabled={submitting}
                      onClick={() => void handleAccessibility(true)}
                      className="font-sans text-xs text-zinc-500 transition-colors hover:text-zinc-300 disabled:opacity-40"
                    >
                      Enable text mode
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ── Profile setup — stacked on mobile, side-by-side on sm+ ── */}
              {activeStep === "profile_setup" && (
                <motion.div
                  key="profile_setup"
                  {...m}
                  className="flex w-[min(680px,calc(100vw-3rem))] flex-col gap-8 sm:flex-row sm:items-end sm:gap-14"
                >
                  <div className="flex-[3]">
                    {transcript ? (
                      <SyncedTranscript
                        audioUrl={transcript.audio_url}
                        words={transcript.words}
                        onFinished={markListened}
                      />
                    ) : (
                      <p className="font-sans text-xs leading-relaxed text-zinc-400">
                        {FORM_STEPS[0].fallbackText}
                      </p>
                    )}
                  </div>
                  <ListenGate locked={!hasListened} className="flex-[2]">
                    <div className="flex flex-col items-start gap-1.5">
                      <input
                        ref={profileInputRef}
                        type="text"
                        value={profileName}
                        onChange={(e) => setProfileName(e.target.value)}
                        placeholder="First and last name"
                        tabIndex={hasListened ? 0 : -1}
                        className="w-full border-b border-zinc-800 bg-transparent pb-2 font-sans text-xs text-zinc-300 placeholder:text-zinc-500 focus:outline-none"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && profileName.trim())
                            void handleProfileSetup();
                        }}
                      />
                      <button
                        disabled={!profileName.trim() || submitting}
                        onClick={() => void handleProfileSetup()}
                        className="pt-1 font-sans text-xs text-zinc-300 transition-colors hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        {submitting ? "Setting up\u2026" : "Continue"}
                      </button>
                    </div>
                  </ListenGate>
                </motion.div>
              )}

              {/* ── Media opt-in — vertical ─────────────────────────────── */}
              {activeStep === "media_opt_in" && (
                <motion.div
                  key="media_opt_in"
                  {...m}
                  className="w-[min(520px,calc(100vw-3rem))]"
                >
                  {transcript ? (
                    <SyncedTranscript
                      audioUrl={transcript.audio_url}
                      words={transcript.words}
                      onFinished={markListened}
                    />
                  ) : (
                    <p className="font-sans text-xs leading-relaxed text-zinc-400">
                      {FORM_STEPS[1].fallbackText}
                    </p>
                  )}
                  <ListenGate locked={!hasListened}>
                    <div className="mt-5 flex items-center gap-4">
                      <button
                        disabled={submitting}
                        onClick={() => void handleMediaOptIn(true)}
                        className="font-sans text-xs text-zinc-300 transition-colors hover:text-zinc-50 disabled:opacity-40"
                      >
                        Include my contributions
                      </button>
                      <button
                        disabled={submitting}
                        onClick={() => void handleMediaOptIn(false)}
                        className="font-sans text-xs text-zinc-500 transition-colors hover:text-zinc-300 disabled:opacity-40"
                      >
                        No thanks
                      </button>
                    </div>
                  </ListenGate>
                </motion.div>
              )}

              {/* ── Contact — vertical ──────────────────────────────────── */}
              {activeStep === "contact" && (
                <motion.div
                  key="contact"
                  {...m}
                  className="w-[min(520px,calc(100vw-3rem))]"
                >
                  {transcript ? (
                    <SyncedTranscript
                      audioUrl={transcript.audio_url}
                      words={transcript.words}
                      onFinished={markListened}
                    />
                  ) : (
                    <p className="font-sans text-xs leading-relaxed text-zinc-400">
                      {FORM_STEPS[2].fallbackText}
                    </p>
                  )}
                  <ListenGate locked={!hasListened}>
                    <div className="mt-5 flex flex-col gap-3">
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => setContactMethod("email")}
                          className={`font-sans text-xs transition-colors ${
                            contactMethod === "email"
                              ? "text-zinc-200"
                              : "text-zinc-500 hover:text-zinc-300"
                          }`}
                        >
                          Email
                        </button>
                        <button
                          onClick={() => setContactMethod("text")}
                          className={`font-sans text-xs transition-colors ${
                            contactMethod === "text"
                              ? "text-zinc-200"
                              : "text-zinc-500 hover:text-zinc-300"
                          }`}
                        >
                          Text
                        </button>
                      </div>

                      {contactMethod === "text" && (
                        <input
                          type="tel"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          placeholder="Phone number"
                          className="w-full border-b border-zinc-800 bg-transparent pb-1.5 font-sans text-xs text-zinc-300 placeholder:text-zinc-500 focus:outline-none"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleContactSubmit();
                          }}
                        />
                      )}

                      <button
                        disabled={
                          submitting ||
                          (contactMethod === "text" && !phoneNumber.trim())
                        }
                        onClick={() => void handleContactSubmit()}
                        className="self-start font-sans text-xs text-zinc-300 transition-colors hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        {submitting ? "Saving\u2026" : "Continue"}
                      </button>
                    </div>
                  </ListenGate>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
