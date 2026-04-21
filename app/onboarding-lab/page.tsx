"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import SyncedTranscript from "@/components/SyncedTranscript";
import MarkdownEditor from "@/components/MarkdownEditor";
import GradientSVG from "@/components/GradientSVG";
import ColorWheel from "@/components/ColorWheel";
import { AdminOnlyLabGate } from "@/components/AdminOnlyLabGate";
import type { TimedWord } from "@/lib/types";

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

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

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
                    : { duration: 0.15, ease: [0.215, 0.61, 0.355, 1] as const }
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

type LabStep = "accessibility" | "profile_setup" | "media_opt_in" | "book_text" | "contact" | "avatar_colors" | "complete";

const FORM_STEPS: { key: LabStep; label: string; fallbackText: string }[] = [
  { key: "profile_setup", label: "Profile Setup",  fallbackText: "Hi. Welcome to Kanon. I\u2019m super excited that you\u2019re here. To start things off, please enter your name." },
  { key: "media_opt_in",  label: "Media Opt-in",   fallbackText: "Your voice recordings and media can be projected across the installation\u2019s three panels during the exhibition. This is entirely optional \u2014 your contributions to the library remain regardless." },
  { key: "book_text",     label: "Book Text",      fallbackText: "The installation includes a physical book \u2014 a collection of texts that resonate deeply with each contributor. Write or paste a piece of text you\u2019d like included." },
  { key: "contact",       label: "Contact",        fallbackText: "Kris may reach out about the installation and will email you when Kanon goes live. How would you prefer to be contacted?" },
];

const COLOR_STEPS = [
  { key: "color_consumed", prompt: "Think of something you\u2019ve consumed recently that stuck with you \u2014 a film, an album, a piece of writing, anything. Pick a color." },
  { key: "color_made",     prompt: "Now something you\u2019ve made \u2014 however small, however unfinished. Pick a color." },
  { key: "color_changed",  prompt: "Finally, something that changed the way you think. An idea, a theory, a conversation. Pick a color." },
] as const;

/* ── Configs ─────────────────────────────────────────────────────────────── */

const AMBIENT = {
  svgSize: 80, blurInternal: 12, blurCSS: 120, saturation: 1.4, opacity: 0.8,
  driftDuration: 30, growDuration: 14, growEase: [0.05, 0.5, 0.12, 1] as const,
  startHeight: 3, endHeight: 120, startWidth: 75, endWidth: 100, fadeInDuration: 4,
};

const REVEAL = { textFade: { duration: 0.4 } };
const CARD = { yOffset: 6, spring: { duration: 0.2, ease: [0.215, 0.61, 0.355, 1] as const } };
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

const ALL_STEPS: LabStep[] = ["accessibility", "profile_setup", "media_opt_in", "book_text", "contact", "avatar_colors", "complete"];

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function OnboardingLabPage() {
  const shouldReduceMotion = useReducedMotion();

  const [step, setStep] = useState<LabStep>("accessibility");
  const formStepIndex = FORM_STEPS.findIndex((s) => s.key === step);
  const isFormStep = formStepIndex >= 0;

  /* ── Per-step form state ───────────────────────────────────────────────── */
  const profileInputRef = useRef<HTMLInputElement>(null);
  const [profileName, setProfileName] = useState("");
  const [bookTitle, setBookTitle] = useState("");
  const [bookDate, setBookDate] = useState("");
  const [bookText, setBookText] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [contactMethod, setContactMethod] = useState<"email" | "text">("email");
  const [phoneNumber, setPhoneNumber] = useState("");

  /* ── Color picking state ───────────────────────────────────────────────── */
  const [colorStep, setColorStep] = useState(0);
  const [picked, setPicked] = useState<[string | null, string | null, string | null]>([null, null, null]);
  const [revealStage, setRevealStage] = useState(0);
  const revealTimers = useRef<NodeJS.Timeout[]>([]);
  const [seed] = useState("Kanon");

  const allPicked = picked.every((c) => c !== null);
  const colors = (allPicked ? picked : ["#000", "#000", "#000"]) as [string, string, string];

  /* ── Transcript loading ────────────────────────────────────────────────── */
  const currentTranscriptKey = step === "avatar_colors"
    ? (colorStep === 3 ? undefined : COLOR_STEPS[colorStep]?.key)
    : (isFormStep ? step : undefined);

  const transcript = useStepTranscript(currentTranscriptKey);
  const revealTranscript = useStepTranscript(
    step === "avatar_colors" && colorStep === 3 ? "avatar_reveal" : undefined
  );

  /* ── Audio listening gate ──────────────────────────────────────────────── */
  const [listenedSteps, setListenedSteps] = useState<Set<string>>(new Set());
  const [revealListened, setRevealListened] = useState(false);
  const hasListened = !transcript || (currentTranscriptKey ? listenedSteps.has(currentTranscriptKey) : true);

  const markListened = useCallback(() => {
    if (currentTranscriptKey) {
      setListenedSteps((prev) => new Set(prev).add(currentTranscriptKey));
    }
  }, [currentTranscriptKey]);

  useEffect(() => {
    if (hasListened && step === "profile_setup") {
      profileInputRef.current?.focus();
    }
  }, [hasListened, step]);

  /* ── Navigation ────────────────────────────────────────────────────────── */
  const advanceFormStep = useCallback(() => {
    const idx = FORM_STEPS.findIndex((s) => s.key === step);
    if (idx < FORM_STEPS.length - 1) {
      setStep(FORM_STEPS[idx + 1].key);
    } else {
      setStep("avatar_colors");
    }
  }, [step]);

  const skipToNext = useCallback(() => {
    const currentIdx = ALL_STEPS.indexOf(step);
    if (currentIdx < ALL_STEPS.length - 1) {
      const nextStep = ALL_STEPS[currentIdx + 1];
      setStep(nextStep);
      if (nextStep === "avatar_colors") {
        setColorStep(0);
        setPicked([null, null, null]);
        setRevealStage(0);
        setRevealListened(false);
      }
    }
  }, [step]);

  const handleColorPick = useCallback((hex: string) => {
    const next = [...picked] as [string | null, string | null, string | null];
    next[colorStep] = hex;
    setPicked(next);
    const delay = shouldReduceMotion ? 0 : TIMING.pickAdvance;
    setTimeout(() => setColorStep((s) => s + 1), delay);
  }, [colorStep, picked, shouldReduceMotion]);

  const handleColorDotClick = useCallback((targetStep: number) => {
    if (targetStep < colorStep && targetStep < 3) setColorStep(targetStep);
  }, [colorStep]);

  const handleReset = useCallback(() => {
    revealTimers.current.forEach(clearTimeout);
    setStep("accessibility");
    setColorStep(0);
    setRevealStage(0);
    setPicked([null, null, null]);
    setListenedSteps(new Set());
    setRevealListened(false);
  }, []);

  const handleRevealPlayStart = useCallback(() => {
    if (revealStage >= 3) return;
    revealTimers.current.forEach(clearTimeout);
    const delay = shouldReduceMotion ? 0 : 600;
    const t = setTimeout(() => setRevealStage(3), delay);
    revealTimers.current = [t];
  }, [revealStage, shouldReduceMotion]);

  useEffect(() => {
    revealTimers.current.forEach(clearTimeout);
    if (step === "avatar_colors" && colorStep === 3) {
      setRevealStage(2);
      setRevealListened(false);
    } else {
      setRevealStage(0);
    }
    return () => revealTimers.current.forEach(clearTimeout);
  }, [step, colorStep]);

  /* ── Derived state ─────────────────────────────────────────────────────── */
  const isColorPromptStep = step === "avatar_colors" && colorStep < 3;
  const isColorReveal = step === "avatar_colors" && colorStep === 3;
  const m = anim(shouldReduceMotion);

  const stepIdx = ALL_STEPS.indexOf(step);
  const stepLabel = step === "accessibility" ? "Accessibility" : step === "avatar_colors" ? "Colors" : step === "complete" ? "Complete" : FORM_STEPS[formStepIndex]?.label ?? step;

  const colorStepAnim = {
    initial: shouldReduceMotion ? false : ({ opacity: 0, y: CARD.yOffset } as const),
    animate: { opacity: 1, y: 0 } as const,
    exit: shouldReduceMotion ? ({ opacity: 1 } as const) : ({ opacity: 0, y: -CARD.yOffset } as const),
    transition: shouldReduceMotion ? { duration: 0 } : CARD.spring,
  };

  return (
    <AdminOnlyLabGate>
    <div className="min-h-screen bg-black overflow-hidden">
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
            className="fixed inset-0 pointer-events-none z-0"
          >
            <motion.div
              initial={false}
              animate={{
                scaleY: revealStage >= 3 ? AMBIENT.endHeight / 100 : AMBIENT.startHeight / 100,
                scaleX: revealStage >= 3 ? AMBIENT.endWidth / 100 : AMBIENT.startWidth / 100,
              }}
              transition={
                shouldReduceMotion
                  ? { duration: 0 }
                  : {
                      scaleY: { duration: AMBIENT.growDuration, ease: AMBIENT.growEase },
                      scaleX: { duration: AMBIENT.growDuration * 0.55, ease: [0.215, 0.61, 0.355, 1] },
                    }
              }
              style={{
                position: "absolute", bottom: 0, left: "-50vw",
                width: "200vw", height: "100vh",
                transformOrigin: "center bottom", willChange: "transform",
              }}
            >
              <div
                style={{
                  position: "absolute", inset: 0,
                  filter: `blur(${AMBIENT.blurCSS}px) saturate(${AMBIENT.saturation})`,
                  opacity: AMBIENT.opacity,
                  animation: shouldReduceMotion ? "none" : `ambientDrift ${AMBIENT.driftDuration}s ease-in-out infinite`,
                  willChange: "transform",
                }}
              >
                <GradientSVG colors={colors} seed={seed} size={AMBIENT.svgSize} blurDeviation={AMBIENT.blurInternal} />
              </div>
            </motion.div>
            <div
              className="absolute inset-0"
              style={{ background: "linear-gradient(to bottom, black 0%, rgba(0,0,0,0.6) 20%, rgba(0,0,0,0.2) 35%, transparent 55%)" }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Header — centered ──────────────────────────────────────────────── */}
      <div className="fixed left-0 right-0 top-6 z-20 flex flex-col items-center">
        <h1 className="font-lector text-2xl tracking-tight text-white/90">Kanon</h1>
      </div>

      {/* ── Avatar reveal — centered transcript + enter button ────────── */}
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
                transition={shouldReduceMotion ? { duration: 0 } : REVEAL.textFade}
              >
                {revealTranscript ? (
                  <SyncedTranscript
                    audioUrl={revealTranscript.audio_url}
                    words={revealTranscript.words}
                    onPlayStart={handleRevealPlayStart}
                    onFinished={() => setRevealListened(true)}
                  />
                ) : (
                  <p className="font-sans text-xs text-white/50">This is yours.</p>
                )}
              </motion.div>

              <AnimatePresence>
                {revealListened && (
                  <motion.div
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.4, ease: EASE }}
                    className="mt-4"
                  >
                    <button
                      onClick={() => setStep("complete")}
                      className="font-sans text-xs text-white/70 transition-opacity hover:text-white/90"
                    >
                      Enter Kanon
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Top-right: step index + sign out ────────────────────────────────── */}
      {step !== "complete" && !isColorReveal && (
        <div className="fixed right-6 top-6 z-20 flex items-center gap-4">
          <span className="font-sans text-xs text-zinc-500">
            {stepIdx + 1} of {ALL_STEPS.length}
          </span>
          <button
            onClick={handleReset}
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
                : { opacity: 0, y: -30, transition: { duration: 0.25, ease: EASE } }
            }
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-10 flex items-center justify-center"
          >
            <div className="flex w-[min(860px,calc(100vw-3rem))] items-center gap-20">
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
                            picked[i] ?? (colorStep === i ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.1)"),
                        }}
                        whileHover={canGoBack && !shouldReduceMotion ? { opacity: 0.7 } : {}}
                        transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.3, ease: EASE }}
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
        {(step === "accessibility" || isFormStep) && (
          <div className="fixed inset-0 z-10 flex items-center justify-center px-6">
            <AnimatePresence initial={false} mode="wait">
              {/* ── Accessibility ────────────────────────────────────────── */}
              {step === "accessibility" && (
                <motion.div
                  key="accessibility"
                  {...m}
                  className="w-[min(480px,calc(100vw-3rem))]"
                >
                  <p className="font-lector text-sm leading-relaxed text-zinc-300">
                    Kanon uses audio recording and listening as the primary ways to
                    share and experience content. Most interactions involve speaking
                    and hearing rather than reading and typing.
                  </p>
                  <p className="mt-3 font-sans text-xs leading-relaxed text-zinc-500">
                    If you need accessibility features such as text input and
                    screen-reader-friendly content, you can enable text mode below.
                    You can always change this later in settings.
                  </p>

                  <div className="mt-5 flex items-center gap-4">
                    <button
                      onClick={() => setStep("profile_setup")}
                      className="font-sans text-xs text-zinc-300 transition-colors hover:text-zinc-50"
                    >
                      Continue with audio
                    </button>
                    <button
                      onClick={() => setStep("profile_setup")}
                      className="font-sans text-xs text-zinc-500 transition-colors hover:text-zinc-300"
                    >
                      Enable text mode
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ── Profile setup — side-by-side ────────────────────────── */}
              {step === "profile_setup" && (
                <motion.div key="profile_setup" {...m} className="flex w-[min(680px,calc(100vw-3rem))] items-end gap-14">
                  <div className="flex-[3]">
                    {transcript ? (
                      <SyncedTranscript audioUrl={transcript.audio_url} words={transcript.words} onFinished={markListened} />
                    ) : (
                      <p className="font-sans text-xs leading-relaxed text-zinc-400">
                        {FORM_STEPS[0].fallbackText}
                      </p>
                    )}
                  </div>
                  <ListenGate locked={!hasListened} className="flex-[2] min-w-[220px]">
                    <div className="flex flex-col items-start gap-1.5">
                      <input
                        ref={profileInputRef}
                        type="text"
                        value={profileName}
                        onChange={(e) => setProfileName(e.target.value)}
                        placeholder="First and last name"
                        tabIndex={hasListened ? 0 : -1}
                        className="w-full bg-transparent font-sans text-xs text-zinc-300 placeholder:text-zinc-500 focus:outline-none border-b border-zinc-800 pb-2"
                        onKeyDown={(e) => { if (e.key === "Enter" && profileName.trim()) advanceFormStep(); }}
                      />
                      <button
                        disabled={!profileName.trim()}
                        onClick={advanceFormStep}
                        className="font-sans text-xs text-zinc-300 transition-colors hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-30 pt-1"
                      >
                        Continue
                      </button>
                    </div>
                  </ListenGate>
                </motion.div>
              )}

              {/* ── Media opt-in — vertical ─────────────────────────────── */}
              {step === "media_opt_in" && (
                <motion.div key="media_opt_in" {...m} className="w-[min(520px,calc(100vw-3rem))]">
                  {transcript ? (
                    <SyncedTranscript audioUrl={transcript.audio_url} words={transcript.words} onFinished={markListened} />
                  ) : (
                    <p className="font-sans text-xs leading-relaxed text-zinc-400">
                      {FORM_STEPS[1].fallbackText}
                    </p>
                  )}
                  <ListenGate locked={!hasListened}>
                    <div className="mt-5 flex items-center gap-4">
                      <button
                        onClick={advanceFormStep}
                        className="font-sans text-xs text-zinc-300 transition-colors hover:text-zinc-50"
                      >
                        Include my contributions
                      </button>
                      <button
                        onClick={advanceFormStep}
                        className="font-sans text-xs text-zinc-500 transition-colors hover:text-zinc-300"
                      >
                        No thanks
                      </button>
                    </div>
                  </ListenGate>
                </motion.div>
              )}

              {/* ── Book text — side-by-side with large editor ──────────── */}
              {step === "book_text" && (
                <motion.div key="book_text" {...m} className="flex max-w-[calc(100vw-3rem)] items-start gap-20">
                  <div className="w-[340px] shrink-0 pt-1">
                    {transcript ? (
                      <SyncedTranscript audioUrl={transcript.audio_url} words={transcript.words} onFinished={markListened} />
                    ) : (
                      <p className="font-sans text-xs leading-relaxed text-zinc-400">
                        {FORM_STEPS[2].fallbackText}
                      </p>
                    )}
                  </div>
                  <ListenGate locked={!hasListened}>
                    <div className="flex w-[min(520px,calc(100vw-28rem))] flex-col gap-3">
                      <div className="flex items-center gap-3">
                        <input
                          type="text"
                          value={bookTitle}
                          onChange={(e) => setBookTitle(e.target.value)}
                          placeholder="Title of the piece"
                          className="min-w-0 flex-1 bg-transparent font-sans text-xs text-zinc-300 placeholder:text-zinc-500 focus:outline-none border-b border-zinc-800 pb-1.5"
                        />
                        <input
                          type="text"
                          value={bookDate}
                          onChange={(e) => setBookDate(e.target.value)}
                          placeholder="Date (optional)"
                          className="w-[130px] bg-transparent font-sans text-xs text-zinc-300 placeholder:text-zinc-500 focus:outline-none border-b border-zinc-800 pb-1.5"
                        />
                      </div>

                      <MarkdownEditor
                        value={bookText}
                        onChange={setBookText}
                        placeholder="Paste or write your text here"
                      />

                      <div className="flex items-center justify-between">
                        <label className="cursor-pointer font-sans text-[11px] text-zinc-500 transition-colors hover:text-zinc-300">
                          <input
                            type="file"
                            accept=".pdf"
                            className="hidden"
                            onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                          />
                          {pdfFile ? pdfFile.name : "Attach a formatted PDF (optional)"}
                        </label>
                        {pdfFile && (
                          <button onClick={() => setPdfFile(null)} className="text-[11px] text-zinc-600 transition-colors hover:text-zinc-400">
                            ✕
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-4">
                        <button
                          disabled={!bookTitle.trim() || !bookText.trim()}
                          onClick={advanceFormStep}
                          className="font-sans text-xs text-zinc-300 transition-colors hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          Submit text
                        </button>
                        <button
                          onClick={advanceFormStep}
                          className="font-sans text-xs text-zinc-500 transition-colors hover:text-zinc-300"
                        >
                          Skip for now
                        </button>
                      </div>
                    </div>
                  </ListenGate>
                </motion.div>
              )}

              {/* ── Contact — vertical ──────────────────────────────────── */}
              {step === "contact" && (
                <motion.div key="contact" {...m} className="w-[min(520px,calc(100vw-3rem))]">
                  {transcript ? (
                    <SyncedTranscript audioUrl={transcript.audio_url} words={transcript.words} onFinished={markListened} />
                  ) : (
                    <p className="font-sans text-xs leading-relaxed text-zinc-400">
                      {FORM_STEPS[3].fallbackText}
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
                          className="w-full bg-transparent font-sans text-xs text-zinc-300 placeholder:text-zinc-500 focus:outline-none border-b border-zinc-800 pb-1.5"
                          onKeyDown={(e) => { if (e.key === "Enter") advanceFormStep(); }}
                        />
                      )}

                      <button
                        disabled={contactMethod === "text" && !phoneNumber.trim()}
                        onClick={advanceFormStep}
                        className="self-start font-sans text-xs text-zinc-300 transition-colors hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        Continue
                      </button>
                    </div>
                  </ListenGate>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </AnimatePresence>

      {/* ── Complete ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {step === "complete" && (
          <div className="fixed inset-0 z-10 flex items-center justify-center">
            <motion.div {...m}>
              <button
                onClick={handleReset}
                className="font-sans text-xs text-zinc-300 transition-colors hover:text-zinc-50"
              >
                Restart from beginning
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
    </AdminOnlyLabGate>
  );
}
