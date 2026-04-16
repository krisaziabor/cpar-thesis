"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
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
    transition: reduced ? { duration: 0 } : { duration: 0.2, ease: EASE },
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

/* ── Step definitions ────────────────────────────────────────────────────── */

type FormStep = "profile_setup" | "media_opt_in" | "book_text" | "contact";
type LabStep = FormStep | "avatar_colors" | "complete";

const FORM_STEPS: { key: FormStep; label: string; fallbackText: string }[] = [
  { key: "profile_setup", label: "Profile Setup",  fallbackText: "Welcome to Kanon. Enter your name to get started." },
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
  driftDuration: 30, growDuration: 14, growEase: [0.05, 0.5, 0.12, 1],
  startHeight: 3, endHeight: 120, startWidth: 75, endWidth: 100, fadeInDuration: 4,
};

const REVEAL = {
  textFade: { duration: 0.4 },
};

const CARD = { yOffset: 6, spring: { duration: 0.2, ease: [0.215, 0.61, 0.355, 1] } };

const TIMING = { pickAdvance: 400, avatarAppear: 600, textAppear: 1200, ambientRise: 2000 };

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

export default function OnboardingLabPage() {
  const shouldReduceMotion = useReducedMotion();

  /* ── Step navigation (no auth — purely local) ──────────────────────────── */
  const [step, setStep] = useState<LabStep>("profile_setup");
  const formStepIndex = FORM_STEPS.findIndex((s) => s.key === step);
  const isFormStep = formStepIndex >= 0;

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

  /* ── Navigation ────────────────────────────────────────────────────────── */
  const advanceFormStep = useCallback(() => {
    const idx = FORM_STEPS.findIndex((s) => s.key === step);
    if (idx < FORM_STEPS.length - 1) {
      setStep(FORM_STEPS[idx + 1].key);
    } else {
      setStep("avatar_colors");
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
    setStep("profile_setup");
    setColorStep(0);
    setRevealStage(0);
    setPicked([null, null, null]);
    setListenedSteps(new Set());
  }, []);

  /* Trigger reveal stages */
  useEffect(() => {
    if (step !== "avatar_colors" || colorStep !== 3) return;
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
  }, [step, colorStep, shouldReduceMotion]);

  /* ── Derived state ─────────────────────────────────────────────────────── */
  const isColorPromptStep = step === "avatar_colors" && colorStep < 3;
  const isColorReveal = step === "avatar_colors" && colorStep === 3;
  const m = anim(shouldReduceMotion);

  const colorStepAnim = {
    initial: shouldReduceMotion ? false : ({ opacity: 0, y: CARD.yOffset } as const),
    animate: { opacity: 1, y: 0 } as const,
    exit: shouldReduceMotion ? ({ opacity: 1 } as const) : ({ opacity: 0, y: -CARD.yOffset } as const),
    transition: shouldReduceMotion ? { duration: 0 } : CARD.spring,
  };

  return (
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

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="fixed left-6 top-6 z-20 flex flex-col gap-3">
        <h1 className="font-lector text-2xl tracking-tight text-white/90">Kanon</h1>

        {!isColorReveal && !isColorPromptStep && (
          <p className="text-xs text-zinc-500">
            Lab preview &middot; Step {formStepIndex + 1}/{FORM_STEPS.length + 1}
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
                transition={shouldReduceMotion ? { duration: 0 } : REVEAL.textFade}
              >
                {revealTranscript ? (
                  <SyncedTranscript
                    audioUrl={revealTranscript.audio_url}
                    words={revealTranscript.words}
                    onFinished={() => setRevealListened(true)}
                    className="max-w-[280px]"
                  />
                ) : (
                  <p className="font-sans text-xs text-zinc-400">This is yours.</p>
                )}
              </motion.div>

              {revealListened && (
                <div>
                  <button
                    onClick={() => setStep("complete")}
                    className="font-lector text-xs text-zinc-300 transition-colors hover:text-zinc-50"
                  >
                    Enter Kanon
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Start over ──────────────────────────────────────────────────────── */}
      <button
        onClick={handleReset}
        className="fixed right-6 top-6 z-20 font-sans text-xs text-zinc-600 transition-colors hover:text-zinc-300"
      >
        Start over
      </button>

      {/* ── Color prompt flow ────────────────────────────────────────────── */}
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
                        picked[i] ?? (colorStep === i ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.1)"),
                    }}
                    whileHover={canGoBack && !shouldReduceMotion ? { opacity: 0.7 } : {}}
                    transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.3, ease: EASE }}
                  />
                );
              })}
            </div>

            {/* Prompt card */}
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

            {/* Color wheel */}
            <div style={{
              opacity: hasListened ? 1 : 0.3,
              pointerEvents: hasListened ? "auto" : "none",
              transition: "opacity 0.3s",
            }}>
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

      {/* ── Form steps (profile, media, book, contact) ───────────────────── */}
      <AnimatePresence>
        {isFormStep && (
          <div className="fixed bottom-6 left-6 z-20 flex w-[min(560px,calc(100vw-3rem))] flex-col gap-2">
            <motion.div
              layout
              transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.25, ease: EASE }}
              className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
            >
              <AnimatePresence initial={false} mode="wait">
                <motion.div key={step} {...m} className="flex flex-col">
                  <div className="border-b border-zinc-800 px-4 py-3">
                    {transcript ? (
                      <SyncedTranscript
                        audioUrl={transcript.audio_url}
                        words={transcript.words}
                        onFinished={markListened}
                      />
                    ) : (
                      <p className="font-sans text-xs leading-relaxed text-zinc-400">
                        {FORM_STEPS[formStepIndex].fallbackText}
                      </p>
                    )}
                  </div>

                  {/* Placeholder form content per step */}
                  {step === "profile_setup" && (
                    <div className="border-b border-zinc-800">
                      <div className="px-4 py-2.5 font-lector text-xs text-zinc-500">
                        [Name input]
                      </div>
                    </div>
                  )}

                  {step === "media_opt_in" && (
                    <div className="flex items-stretch divide-x divide-zinc-800 border-b border-zinc-800">
                      <div className="flex-1 px-4 py-2.5 font-lector text-xs text-zinc-500">
                        Include my contributions
                      </div>
                      <div className="px-4 py-2.5 font-lector text-xs text-zinc-600">
                        Not this time
                      </div>
                    </div>
                  )}

                  {step === "book_text" && (
                    <div className="border-b border-zinc-800 px-4 py-2.5 font-lector text-xs text-zinc-500">
                      [Text editor]
                    </div>
                  )}

                  {step === "contact" && (
                    <div className="flex items-stretch divide-x divide-zinc-800 border-b border-zinc-800">
                      <div className="flex-1 px-4 py-2.5 font-lector text-xs text-zinc-500">
                        Email
                      </div>
                      <div className="flex-1 px-4 py-2.5 font-lector text-xs text-zinc-600">
                        Text
                      </div>
                    </div>
                  )}

                  <button
                    disabled={!hasListened}
                    onClick={advanceFormStep}
                    className="w-full px-4 py-2.5 font-lector text-xs text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-50 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    Continue
                  </button>
                </motion.div>
              </AnimatePresence>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Complete ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {step === "complete" && (
          <div className="fixed bottom-6 left-6 z-20">
            <motion.div {...m} className="flex gap-3">
              <button
                onClick={handleReset}
                className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-2.5 font-lector text-xs text-zinc-300 shadow-[0_4px_24px_rgba(0,0,0,0.5)] transition-colors hover:bg-zinc-900 hover:text-zinc-50"
              >
                Restart from beginning
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
