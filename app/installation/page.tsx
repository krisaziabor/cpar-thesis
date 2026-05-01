"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ReactFlow, type Edge, type Node, type NodeTypes } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { subscribeToItems } from "@/lib/items";
import type { Item, TimedWord } from "@/lib/types";
import { COLS, NODE_W, NODE_H, GAP_X, GAP_Y } from "@/lib/graph-constants";
import ItemThumbnailNode from "@/components/ItemThumbnailNode";
import ColorWheel from "@/components/ColorWheel";
import FirstTimeIntroOverlay from "@/components/FirstTimeIntroOverlay";
import SyncedTranscript from "@/components/SyncedTranscript";
import GradientSVG from "@/components/GradientSVG";
import RightPanel from "@/components/RightPanel";
import ItemPanel from "@/components/ItemPanel";
import { EASE_OUT, MOTION_DURATION } from "@/lib/motion";
import { useNavStatus } from "@/lib/nav-status-context";
import RecordingInterface, { type RecordingStackItem } from "@/components/RecordingInterface";
import Image from "next/image";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const FADE_OUT_MS = 700;

const NODE_TYPES: NodeTypes = { itemThumbnail: ItemThumbnailNode };

const EASE = [0.215, 0.61, 0.355, 1] as const;

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

const STEP_AUDIO_MAP: Record<string, string> = {
  color_consumed: "color-consumed",
  color_made: "color-made",
  color_changed: "color-changed",
  avatar_reveal: "avatar-reveal",
};

interface StepTranscript {
  audio_url: string;
  words: TimedWord[];
}

function useStepTranscript(stepKey: string | undefined) {
  const [data, setData] = useState<StepTranscript | null>(null);
  useEffect(() => {
    if (!stepKey) {
      setData(null);
      return;
    }
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
          if (audioRes.ok) audioUrl = URL.createObjectURL(await audioRes.blob());
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

function ListenGate({
  locked,
  children,
}: {
  locked: boolean;
  children: React.ReactNode;
}) {
  const [showTip, setShowTip] = useState(false);
  const [tipPos, setTipPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<NodeJS.Timeout | null>(null);
  const reduced = useReducedMotion();
  const flash = useCallback(() => {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
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
    <div ref={ref} className="relative">
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
                key="tip"
                initial={reduced ? false : { opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={reduced ? { duration: 0 } : { duration: 0.15, ease: EASE }}
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

const AMBIENT_MOBILE = { ...AMBIENT, blurCSS: 40, saturation: 1, drift: false };

function useIsMobileViewport(query = "(max-width: 640px)"): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [query]);
  return matches;
}

const driftKeyframes = `
@keyframes ambientDrift {
  0%   { transform: translate(0%, 0%) scale(1.0) rotate(0deg); }
  25%  { transform: translate(3%, -4%) scale(1.06) rotate(2.5deg); }
  50%  { transform: translate(-3%, -6%) scale(1.03) rotate(-1.5deg); }
  75%  { transform: translate(1%, -2%) scale(1.07) rotate(1deg); }
  100% { transform: translate(0%, 0%) scale(1.0) rotate(0deg); }
}
`;

type Phase = "colophon" | "color" | "reveal" | "graph";

export default function InstallationPage() {
  const shouldReduceMotion = useReducedMotion();
  const isMobile = useIsMobileViewport();
  const ambient = isMobile ? AMBIENT_MOBILE : { ...AMBIENT, drift: true };
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("colophon");
  const [picked, setPicked] = useState<[string | null, string | null, string | null]>([
    null,
    null,
    null,
  ]);
  const [colorStep, setColorStep] = useState(0);
  const [revealStage, setRevealStage] = useState(0);
  const [revealListened, setRevealListened] = useState(false);
  const [listenedKeys, setListenedKeys] = useState<Set<string>>(new Set());
  const revealTimers = useRef<NodeJS.Timeout[]>([]);

  const [items, setItems] = useState<Item[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [edges, setEdges] = useState<Edge[]>([]);
  const [authed, setAuthed] = useState(false);

  const [recordOpen, setRecordOpen] = useState(false);
  const [recordFullScreen, setRecordFullScreen] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [viewportWidth, setViewportWidth] = useState<number>(
    typeof window !== "undefined" ? window.innerWidth : 1200,
  );

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const [selectMode, setSelectMode] = useState(false);
  const [panelItemId, setPanelItemId] = useState<string | null>(null);
  const [fadingOut, setFadingOut] = useState(false);
  const [isNarrativePlaying, setIsNarrativePlaying] = useState(false);
  const [showIntroCard, setShowIntroCard] = useState(false);

  // Reset listening state whenever the panel changes items so it never opens wide incorrectly.
  useEffect(() => {
    setIsNarrativePlaying(false);
  }, [panelItemId]);
  const { startProgress: startNavProgress } = useNavStatus();

  const selectedItems = useMemo(
    () => items.filter((i) => selectedIds.has(i.id)),
    [items, selectedIds]
  );

  const allPicked = picked.every((c) => c !== null);
  const colors = (allPicked ? picked : ["#000", "#000", "#000"]) as [
    string,
    string,
    string,
  ];
  const [seed] = useState("Kanon");

  const currentKey =
    phase === "color" ? COLOR_STEPS[colorStep]?.key : undefined;
  const transcript = useStepTranscript(currentKey);
  const revealTranscript = useStepTranscript(phase === "reveal" ? "avatar_reveal" : undefined);
  const hasListened = !transcript || (currentKey ? listenedKeys.has(currentKey) : true);

  const markListened = useCallback(() => {
    if (currentKey) setListenedKeys((prev) => new Set(prev).add(currentKey));
  }, [currentKey]);

  useEffect(() => {
    if (!auth) return;
    const _auth = auth;
    return onAuthStateChanged(_auth, (u) => {
      if (u) setAuthed(true);
      else signInAnonymously(_auth).catch((err) => console.warn("[installation] anon", err?.code ?? err));
    });
  }, []);

  useEffect(() => {
    if (!authed) return;
    return subscribeToItems(setItems);
  }, [authed]);

  useEffect(() => {
    revealTimers.current.forEach(clearTimeout);
    if (phase === "reveal") {
      setRevealStage(2);
      setRevealListened(false);
    } else {
      setRevealStage(0);
    }
    return () => revealTimers.current.forEach(clearTimeout);
  }, [phase]);

  const handleColorPick = useCallback(
    (hex: string) => {
      const next = [...picked] as [string | null, string | null, string | null];
      next[colorStep] = hex;
      setPicked(next);
      const delay = shouldReduceMotion ? 0 : 400;
      window.setTimeout(() => {
        if (colorStep < 2) setColorStep((s) => s + 1);
        else setPhase("reveal");
      }, delay);
    },
    [colorStep, picked, shouldReduceMotion],
  );

  const handleColorDotClick = useCallback(
    (target: number) => {
      if (target < colorStep) setColorStep(target);
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

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }

  function confirmConnection() {
    const ids = Array.from(selectedIds);
    const stamp = Date.now();
    const newEdges: Edge[] = [];
    for (let i = 0; i < ids.length - 1; i++) {
      newEdges.push({
        id: `inst-${stamp}-${i}`,
        source: ids[i],
        target: ids[i + 1],
        style: { stroke: "#ffffff", strokeOpacity: 0.55, strokeWidth: 1.25 },
      });
    }
    setEdges((prev) => [...prev, ...newEdges]);
    setSelectedIds(new Set());
    setRecordOpen(false);
    setSelectMode(false);
    setPanelItemId(null);

    const thumbs = selectedItems.flatMap((i) => i.thumbnail_url ? [i.thumbnail_url] : []);
    const { resolve } = startNavProgress({
      id: `inst-conn-${stamp}`,
      text: "Filing connection",
      thumbnails: thumbs.length > 0 ? thumbs : undefined,
      showProgress: true,
      durationMs: 1800,
    });

    window.setTimeout(() => {
      resolve("Connection filed");
      window.setTimeout(() => {
        setFadingOut(true);
        // Wait for the screen to finish fading to black, hold briefly, then mount
        // the colophon and fade it in — never crossfade with the graph.
        window.setTimeout(() => {
          resetState();
          window.setTimeout(() => setFadingOut(false), 250);
        }, FADE_OUT_MS);
      }, 2000);
    }, 700);
  }

  function closeRecord() {
    setAudioBlob(null);
    setRecordOpen(false);
    setRecordFullScreen(false);
  }

  const resetState = useCallback(() => {
    setPicked([null, null, null]);
    setColorStep(0);
    setRevealStage(0);
    setRevealListened(false);
    setListenedKeys(new Set());
    setSelectedIds(new Set());
    setEdges([]);
    setRecordOpen(false);
    setRecordFullScreen(false);
    setSelectMode(false);
    setPanelItemId(null);
    setShowIntroCard(false);
    setAudioBlob(null);
    setPhase("colophon");
  }, []);

  const restart = useCallback(() => {
    resetState();
    setFadingOut(false);
  }, [resetState]);

  // 5-minute idle timer — restart back to the colophon screen.
  // Only fires if the user has already started (picked at least one color or moved past color phase).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (fadingOut) return;
    if (phase === "colophon") return;
    if (phase === "color" && !picked[0]) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        restart();
      }, IDLE_TIMEOUT_MS);
    };
    const events: (keyof WindowEventMap)[] = [
      "mousemove",
      "mousedown",
      "keydown",
      "touchstart",
      "wheel",
    ];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [restart, fadingOut, phase, picked]);

  const nodes = useMemo<Node[]>(() => {
    const published = items.filter((i) => !!i.voice_recording_url);
    return published.map((item, i) => ({
      id: item.id,
      type: "itemThumbnail",
      position: {
        x: (i % COLS) * (NODE_W + GAP_X),
        y: Math.floor(i / COLS) * (NODE_H + GAP_Y),
      },
      data: {
        item,
        isFirst: false,
        index: i,
        isSelected: selectMode && selectedIds.has(item.id),
        isConnectSelecting: selectMode,
      },
      draggable: false,
      selectable: false,
      focusable: false,
    }));
  }, [items, selectedIds, selectMode]);

  const canConnect = selectedIds.size >= 2;
  const showAmbient = phase === "reveal";

  function handleNodeClick(_: React.MouseEvent, node: Node) {
    if (selectMode) {
      toggleSelect(node.id);
    } else {
      setPanelItemId(node.id);
    }
  }

  function enterSelectMode() {
    setPanelItemId(null);
    setSelectMode(true);
  }

  function cancelSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  return (
    <motion.div
      className="relative h-dvh w-full overflow-hidden bg-black"
      animate={{ opacity: fadingOut ? 0 : 1 }}
      transition={{ duration: FADE_OUT_MS / 1000, ease: EASE_OUT }}
    >
      <style>{driftKeyframes}</style>

      {/* Ambient gradient reveal */}
      <AnimatePresence>
        {showAmbient && allPicked && (
          <motion.div
            key="ambient"
            initial={{ opacity: 0 }}
            animate={{ opacity: revealStage >= 3 ? 1 : 0 }}
            exit={{ opacity: 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: ambient.fadeInDuration, ease: EASE }}
            className="pointer-events-none fixed inset-0 z-0"
          >
            <motion.div
              initial={false}
              animate={{
                scaleY: revealStage >= 3 ? ambient.endHeight / 100 : ambient.startHeight / 100,
                scaleX: revealStage >= 3 ? ambient.endWidth / 100 : ambient.startWidth / 100,
              }}
              transition={
                shouldReduceMotion
                  ? { duration: 0 }
                  : {
                      scaleY: { duration: ambient.growDuration, ease: ambient.growEase },
                      scaleX: { duration: ambient.growDuration * 0.55, ease: EASE },
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
                  filter:
                    ambient.saturation === 1
                      ? `blur(${ambient.blurCSS}px)`
                      : `blur(${ambient.blurCSS}px) saturate(${ambient.saturation})`,
                  opacity: ambient.opacity,
                  animation:
                    shouldReduceMotion || !ambient.drift
                      ? "none"
                      : `ambientDrift ${ambient.driftDuration}s ease-in-out infinite`,
                  willChange: ambient.drift ? "transform" : "auto",
                }}
              >
                <GradientSVG
                  colors={colors}
                  seed={seed}
                  size={ambient.svgSize}
                  blurDeviation={ambient.blurInternal}
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

      {/* Restart — hidden on the colophon entry screen */}
      {phase !== "colophon" && (
        <button
          type="button"
          onClick={restart}
          className="fixed right-6 top-6 z-[70] rounded-md bg-zinc-900 px-3 py-1.5 font-sans text-xs text-white shadow-[0_4px_16px_rgba(0,0,0,0.4)] transition-colors hover:bg-zinc-800"
          aria-label="Restart installation"
        >
          Restart
        </button>
      )}

      {/* Header */}
      <div className="pointer-events-none fixed left-0 right-0 top-6 z-20 flex flex-col items-center">
        <h1 className="font-lector text-2xl tracking-tight text-white/90">Kanon</h1>
      </div>

      {/* Colophon entry phase */}
      <AnimatePresence mode="wait">
        {phase === "colophon" && (
          <motion.div
            key="colophon"
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, transition: { duration: 0.3, ease: EASE } }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-10 overflow-y-auto text-zinc-200"
          >
            <main className="mx-auto w-full max-w-4xl px-6 pb-24 pt-24">
              <div className="grid min-h-[calc(100dvh-6rem)] w-full grid-cols-1 grid-rows-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                <div className="min-h-0" aria-hidden />
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
                  <section className="w-full space-y-8">
                    <p className="whitespace-pre-line font-lector text-sm leading-relaxed text-zinc-400">
                      {
                        "A social network, library, installation, book, and practice.\nIn partial fulfillment of the requirements for the degree of Bachelor of Arts in Computing and the Arts at Yale University.\nWork of Kristopher Aziabor."
                      }
                    </p>
                    <p className="text-sm leading-6 text-zinc-400">
                      Social media platforms optimize for viral reach and algorithmic engagement, minimizing
                      the possibility of intimate knowledge-sharing within close communities. Influential apps
                      like Instagram and TikTok strip content of personal context and make any act of
                      communication or sharing a performance that can be tracked and compared through likes,
                      views, and followers.
                      <br />
                      <br />
                      I propose an alternative. Kanon seeks to bring people together by pushing the work we
                      create, the media we consume, and the theory we treasure into one space where
                      everything can be connected through solely voice.
                    </p>
                  </section>

                  <div className="w-full">
                    <button
                      type="button"
                      onClick={() => setPhase("color")}
                      className="inline-block font-lector text-sm tracking-tight text-white/90 transition-colors hover:text-white"
                    >
                      Begin
                    </button>
                  </div>
                </div>
                <div className="min-h-0" aria-hidden />
              </div>
            </main>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Color phase */}
      <AnimatePresence mode="wait">
        {phase === "color" && (
          <motion.div
            key="color"
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -30, transition: { duration: 0.25, ease: EASE } }}
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
                            (colorStep === i ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.1)"),
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
                      key={COLOR_STEPS[colorStep]?.key}
                      initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -6 }}
                      transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2, ease: EASE }}
                    >
                      {transcript ? (
                        <SyncedTranscript
                          audioUrl={transcript.audio_url}
                          words={transcript.words}
                          onFinished={markListened}
                          autoPlay
                        />
                      ) : (
                        <p className="font-sans text-sm leading-relaxed text-zinc-400">
                          {COLOR_STEPS[colorStep]?.prompt}
                        </p>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
              <div className="shrink-0">
                <ListenGate locked={!hasListened}>
                  <ColorWheel
                    picked={picked}
                    currentStep={colorStep}
                    onPick={handleColorPick}
                    shouldReduceMotion={shouldReduceMotion}
                  />
                </ListenGate>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reveal phase */}
      <AnimatePresence>
        {phase === "reveal" && (
          <motion.div
            key="reveal-content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-20 flex items-center justify-center px-6"
          >
            <div className="w-[min(560px,calc(100vw-3rem))]">
              {revealTranscript && (
                <SyncedTranscript
                  audioUrl={revealTranscript.audio_url}
                  words={revealTranscript.words}
                  onPlayStart={handleRevealPlayStart}
                  onFinished={() => setRevealListened(true)}
                  lightControls
                  autoPlay
                />
              )}
              <AnimatePresence>
                {revealListened && (
                  <motion.div
                    initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.4, ease: EASE }}
                    className="mt-4"
                  >
                    <button
                      onClick={() => { setPhase("graph"); setShowIntroCard(true); }}
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

      {/* Graph phase */}
      <AnimatePresence>
        {phase === "graph" && (
          <motion.div
            key="graph"
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, ease: EASE_OUT }}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              zoomOnScroll={false}
              zoomOnPinch
              zoomOnDoubleClick={false}
              panOnDrag
              panOnScroll
              fitView
              fitViewOptions={{ padding: 0.6, minZoom: 0.95 }}
              onNodeClick={handleNodeClick}
              style={{ background: "#000000" }}
              proOptions={{ hideAttribution: true }}
            />

            {/* Fullscreen walkthrough — better visibility than the corner card variant */}
            <FirstTimeIntroOverlay
              variant="fullscreen"
              open={showIntroCard}
              onClose={() => setShowIntroCard(false)}
            />

            {/* Backdrop + side panel for an item */}
            <AnimatePresence>
              {panelItemId && (
                <>
                  <motion.div
                    key="panel-backdrop"
                    className="absolute inset-0 z-40 bg-black/50 backdrop-blur-sm"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    onClick={() => setPanelItemId(null)}
                  />
                  <RightPanel
                    key="installation-item-panel"
                    onClose={() => setPanelItemId(null)}
                    wide={isNarrativePlaying}
                    wideWidth={1100}
                    disableBodyScroll={isNarrativePlaying}
                  >
                    <ItemPanel
                      key={panelItemId}
                      itemId={panelItemId}
                      onListeningChange={setIsNarrativePlaying}
                      installationMode
                    />
                  </RightPanel>
                </>
              )}
            </AnimatePresence>

            {/* Custom installation floating nav */}
            <InstallationFloatingNav
              selectMode={selectMode}
              selectedCount={selectedIds.size}
              canConnect={canConnect}
              onEnterSelect={enterSelectMode}
              onCancelSelect={cancelSelectMode}
              onConfirmConnect={() => setRecordOpen(true)}
              shouldReduceMotion={!!shouldReduceMotion}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recording panel — wide RightPanel using existing RecordingInterface */}
      <AnimatePresence>
        {recordOpen && (
          <RightPanel
            key="install-record-panel"
            onClose={closeRecord}
            disableBodyScroll
            wide
            wideWidth={recordFullScreen ? Math.max(900, viewportWidth - 32) : 900}
            onFullScreen={() => setRecordFullScreen((v) => !v)}
          >
            <RecordingInterface
              item={{
                title: selectedItems[0]?.title ?? "Connection",
                creator: selectedItems[0]?.creator ?? "",
                mediaDate: "",
                thumbnailUrl: selectedItems[0]?.thumbnail_url ?? null,
                index: 0,
                total: 1,
              }}
              colors={colors}
              stackItems={selectedItems.map<RecordingStackItem>((i) => ({
                title: i.title,
                thumbnailUrl: i.thumbnail_url ?? null,
                creator: i.creator || undefined,
              }))}
              heading="Record connection"
              onRecorded={(blob) => setAudioBlob(blob)}
              onReRecord={() => setAudioBlob(null)}
              hasRecording={audioBlob !== null}
              destination="library"
              isLast
              canAdvance={audioBlob !== null}
              onSkip={() => {}}
              onNext={() => {}}
              onSubmit={confirmConnection}
            />
          </RightPanel>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ── Nav status helpers (mirrors FloatingNav.tsx) ──────────────────────────── */

function ThumbnailCycler({ thumbnails }: { thumbnails: string[] }) {
  const [index, setIndex] = useState(0);
  const shouldReduceMotion = useReducedMotion();
  useEffect(() => {
    if (thumbnails.length <= 1) return;
    const id = setInterval(() => setIndex((p) => (p + 1) % thumbnails.length), 1200);
    return () => clearInterval(id);
  }, [thumbnails.length]);
  return (
    <div className="relative h-7 w-7 flex-shrink-0 overflow-hidden rounded-[4px]">
      <AnimatePresence mode="popLayout">
        <motion.div
          key={`${thumbnails[index]}-${index}`}
          initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
          className="absolute inset-0"
        >
          <Image src={thumbnails[index]!} alt="" fill className="object-cover" sizes="28px" unoptimized />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function MorphingText({ text, entranceDelay = 0 }: { text: string; entranceDelay?: number }) {
  const shouldReduceMotion = useReducedMotion();
  if (shouldReduceMotion) {
    return (
      <span className="whitespace-nowrap font-lector text-sm text-zinc-300">{text}</span>
    );
  }
  return (
    <span className="whitespace-nowrap font-lector text-sm text-zinc-300">
      <AnimatePresence mode="popLayout">
        {text.split("").map((char, i) => (
          <motion.span
            key={`${i}-${char}-${text}`}
            initial={{ opacity: 0, filter: "blur(2px)" }}
            animate={{
              opacity: 1,
              filter: "blur(0px)",
              transition: { type: "spring", stiffness: 350, damping: 55, delay: entranceDelay + i * 0.015 },
            }}
            exit={{ opacity: 0, filter: "blur(2px)", transition: { type: "spring", stiffness: 500, damping: 55 } }}
            className="inline-block"
          >
            {char === " " ? " " : char}
          </motion.span>
        ))}
      </AnimatePresence>
    </span>
  );
}

interface InstallationFloatingNavProps {
  selectMode: boolean;
  selectedCount: number;
  canConnect: boolean;
  onEnterSelect: () => void;
  onCancelSelect: () => void;
  onConfirmConnect: () => void;
  shouldReduceMotion: boolean;
}

function InstallationFloatingNav({
  selectMode,
  selectedCount,
  canConnect,
  onEnterSelect,
  onCancelSelect,
  onConfirmConnect,
  shouldReduceMotion,
}: InstallationFloatingNavProps) {
  const { currentMessage } = useNavStatus();
  const greyClass =
    "min-h-[44px] cursor-not-allowed px-4 py-2.5 text-sm text-zinc-600";
  const showStatus = !!currentMessage;

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
      className="fixed left-1/2 z-50 -translate-x-1/2"
      style={{ bottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <motion.div
        layout
        transition={{ layout: { duration: MOTION_DURATION.fast, ease: EASE_OUT } }}
        className="relative overflow-hidden rounded-md shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
      >
        {/* Progress border when filing — matches FloatingNav exactly */}
        <AnimatePresence>
          {showStatus && currentMessage.showProgress && (
            <motion.div
              key={`border-${currentMessage.id}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.15, ease: EASE_OUT, delay: MOTION_DURATION.fast + 0.04 } }}
              exit={{ opacity: 0, transition: { duration: 0.4, ease: EASE_OUT } }}
              className="pointer-events-none absolute inset-0 z-10 rounded-md"
              style={{
                padding: "1px",
                background: `conic-gradient(from var(--border-angle), transparent 0deg, rgba(255,255,255,0.9) 40deg, transparent 80deg)`,
                mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                maskComposite: "exclude",
                WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                WebkitMaskComposite: "xor",
                animation: "nav-border-loop 1.4s linear infinite",
              } as React.CSSProperties}
            />
          )}
        </AnimatePresence>

        <div className="overflow-hidden rounded-md border border-zinc-800 bg-zinc-950">
          <AnimatePresence initial={false} mode="wait">
            {showStatus ? (
              <motion.div
                key={`status-${currentMessage.id}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: MOTION_DURATION.fast, ease: EASE_OUT, delay: MOTION_DURATION.fast + 0.04 } }}
                exit={{ opacity: 0, transition: { duration: MOTION_DURATION.fast, ease: EASE_OUT } }}
                className="flex items-center gap-2.5 px-4 py-2.5"
              >
                {currentMessage.thumbnails && currentMessage.thumbnails.length > 0 && (
                  <ThumbnailCycler thumbnails={currentMessage.thumbnails} />
                )}
                <MorphingText text={currentMessage.text} entranceDelay={MOTION_DURATION.fast + 0.04} />
              </motion.div>
            ) : (
              <motion.div
                key="nav-buttons"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.15, ease: EASE_OUT } }}
                exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE_OUT } }}
              >
                <AnimatePresence initial={false}>
                  {selectMode && (
                    <motion.div
                      key="select-strip"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: MOTION_DURATION.standard, ease: EASE_OUT }}
                      className="overflow-hidden border-b border-zinc-800"
                    >
                      <div className="flex flex-col gap-2 px-4 py-3 font-sans">
                        <p className="text-xs text-zinc-400">
                          Select records in the graph to connect them.
                        </p>
                        <span className="text-xs text-zinc-500">
                          {selectedCount} selected
                        </span>
                        <div className="flex items-center justify-between gap-2">
                          <button
                            onClick={onCancelSelect}
                            className="-mx-1 px-1 py-2 text-xs text-zinc-500 transition-colors hover:text-zinc-200"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={onConfirmConnect}
                            disabled={!canConnect}
                            className="rounded border border-zinc-700 px-2.5 py-2 text-xs text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-40"
                          >
                            Confirm
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex items-stretch divide-x divide-zinc-800 font-lector">
                  <button type="button" disabled className={greyClass}>
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={selectMode ? onCancelSelect : onEnterSelect}
                    className={`min-h-[44px] px-4 py-2.5 text-sm transition-colors hover:bg-zinc-900 hover:text-zinc-50 ${
                      selectMode ? "font-medium text-zinc-300" : "text-zinc-400"
                    }`}
                  >
                    Connect
                  </button>
                  <button type="button" disabled className={greyClass}>
                    Search
                  </button>
                  <button type="button" disabled className={greyClass}>
                    Hold
                  </button>
                  <button type="button" disabled className={greyClass}>
                    Activity
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
