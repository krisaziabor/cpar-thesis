"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import RecordingWave from "@/components/RecordingWave";
import { EASE_OUT } from "@/lib/motion";

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

type Phase = "color" | "reveal" | "intro" | "graph";

export default function InstallationPage() {
  const shouldReduceMotion = useReducedMotion();
  const isMobile = useIsMobileViewport();
  const ambient = isMobile ? AMBIENT_MOBILE : { ...AMBIENT, drift: true };

  const [phase, setPhase] = useState<Phase>("color");
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
  const [recording, setRecording] = useState(false);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

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

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 2048;
      src.connect(an);
      setAnalyser(an);
      const mr = new MediaRecorder(stream);
      recorderRef.current = mr;
      mr.start();
      setRecording(true);
    } catch (err) {
      console.warn("[installation] mic denied", err);
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    recorderRef.current = null;
    streamRef.current = null;
    audioCtxRef.current = null;
    setAnalyser(null);
    setRecording(false);
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
  }

  function closeRecord() {
    if (recording) stopRecording();
    setRecordOpen(false);
  }

  function restart() {
    if (recording) stopRecording();
    setPicked([null, null, null]);
    setColorStep(0);
    setRevealStage(0);
    setRevealListened(false);
    setListenedKeys(new Set());
    setSelectedIds(new Set());
    setEdges([]);
    setRecordOpen(false);
    setPhase("color");
  }

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
        isSelected: selectedIds.has(item.id),
        isConnectSelecting: true,
      },
      draggable: false,
      selectable: false,
      focusable: false,
    }));
  }, [items, selectedIds]);

  const canConnect = selectedIds.size >= 2;
  const showAmbient = phase === "reveal";

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-black">
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

      {/* Restart — always visible */}
      <button
        type="button"
        onClick={restart}
        className="fixed right-6 top-6 z-[70] rounded-md border border-zinc-800 bg-zinc-950/80 px-3 py-1.5 font-sans text-xs text-zinc-300 shadow-[0_4px_16px_rgba(0,0,0,0.5)] backdrop-blur transition-colors hover:bg-zinc-900 hover:text-white"
        aria-label="Restart installation"
      >
        Restart
      </button>

      {/* Header */}
      <div className="pointer-events-none fixed left-0 right-0 top-6 z-20 flex flex-col items-center">
        <h1 className="font-lector text-2xl tracking-tight text-white/90">Kanon</h1>
      </div>

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
                      onClick={() => setPhase("intro")}
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

      <FirstTimeIntroOverlay
        variant="fullscreen"
        open={phase === "intro"}
        onClose={() => setPhase("graph")}
      />

      {/* Graph phase */}
      {phase === "graph" && (
        <div className="absolute inset-0">
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
            onNodeClick={(_, node) => toggleSelect(node.id)}
            style={{ background: "#000000" }}
            proOptions={{ hideAttribution: true }}
          />
          <AnimatePresence>
            {canConnect && !recordOpen && (
              <motion.div
                key="connect-cta"
                initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
                transition={{ duration: 0.25, ease: EASE_OUT }}
                className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2"
              >
                <button
                  type="button"
                  onClick={() => setRecordOpen(true)}
                  className="rounded-full border border-zinc-700 bg-zinc-950 px-5 py-2.5 font-sans text-sm text-zinc-100 shadow-[0_8px_24px_rgba(0,0,0,0.6)] transition-colors hover:bg-zinc-900"
                >
                  Connect {selectedIds.size} record{selectedIds.size === 1 ? "" : "s"}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Recording overlay */}
      <AnimatePresence>
        {recordOpen && (
          <motion.div
            key="record-overlay"
            className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
          >
            <button
              type="button"
              onClick={closeRecord}
              className="absolute right-6 top-6 font-sans text-xs text-white/50 transition-colors hover:text-white/90"
            >
              Cancel
            </button>
            <div className="flex w-[min(720px,calc(100vw-3rem))] flex-col items-center gap-8">
              <p className="font-lector text-xl tracking-tight text-white/90">
                Share why these {selectedIds.size} records belong together.
              </p>
              <div className="relative h-64 w-full overflow-hidden rounded-2xl border border-white/10 bg-black">
                <RecordingWave analyser={analyser} colors={colors} active={recording} />
              </div>
              <div className="flex items-center gap-6">
                {!recording ? (
                  <button
                    type="button"
                    onClick={() => void startRecording()}
                    className="rounded-full border border-white/30 bg-white/10 px-5 py-2.5 font-sans text-sm text-white transition-colors hover:bg-white/20"
                  >
                    Start recording
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="rounded-full border border-red-400/70 bg-red-500/20 px-5 py-2.5 font-sans text-sm text-red-200 transition-colors hover:bg-red-500/30"
                  >
                    Stop
                  </button>
                )}
                <button
                  type="button"
                  onClick={confirmConnection}
                  disabled={recording}
                  className="rounded-full bg-white px-5 py-2.5 font-sans text-sm text-black transition-colors hover:bg-white/90 disabled:opacity-40"
                >
                  Connect
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
