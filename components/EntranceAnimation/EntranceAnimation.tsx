"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  EASING_PRESETS,
  RESTING,
  INSTANCE_SIZE,
  FADE_MS,
  SLOT_COUNT,
  HOLD_MS,
  CYCLE_DURATION_MS,
  cellCenter,
  pickCell,
  fontSizeForWidth,
  type FontChoice,
  type EasingPreset,
  type RestingConfig,
  type RestingPosition,
} from "./storyboard";

export type EntranceAnimationProps = {
  text: string;
  onComplete?: () => void;
  slotCount?: number;
  holdMin?: number;
  holdMax?: number;
  cycleDurationMs?: number;
  resting?: RestingConfig;
  easing?: EasingPreset;
  /** Bump to replay from the top. */
  replayKey?: number;
  className?: string;
};

type ActiveInstance = {
  id: number;
  cellIdx: number;
  font: FontChoice;
};

export function EntranceAnimation(props: EntranceAnimationProps) {
  return <EntranceAnimationInner key={props.replayKey ?? 0} {...props} />;
}

function EntranceAnimationInner({
  text,
  onComplete,
  slotCount = SLOT_COUNT,
  holdMin = HOLD_MS.min,
  holdMax = HOLD_MS.max,
  cycleDurationMs = CYCLE_DURATION_MS,
  resting = RESTING,
  easing = "sharp",
  className,
}: EntranceAnimationProps) {
  const [instances, setInstances] = useState<ActiveInstance[]>([]);
  const [restingPosition, setRestingPosition] = useState<RestingPosition | null>(null);
  const [fontsReady, setFontsReady] = useState(false);

  const instancesRef = useRef<ActiveInstance[]>([]);
  instancesRef.current = instances;

  const idRef = useRef(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const runningRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  // Expose mutable params via refs so timer callbacks always read latest values
  const holdMinRef = useRef(holdMin);
  const holdMaxRef = useRef(holdMax);
  useEffect(() => { holdMinRef.current = holdMin; }, [holdMin]);
  useEffect(() => { holdMaxRef.current = holdMax; }, [holdMax]);

  // Wait for fonts before starting
  useEffect(() => {
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) setFontsReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  // addInstance ref — defined inside useEffect to avoid stale deps
  const addInstanceRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!fontsReady) return;

    runningRef.current = true;
    timersRef.current = [];

    function addInstance() {
      if (!runningRef.current) return;

      const occupied = instancesRef.current.map(i => i.cellIdx);
      const cellIdx = pickCell(occupied);
      const font: FontChoice = Math.random() < 0.5 ? "LectorBold" : "DieGrotesk";
      const id = ++idRef.current;

      setInstances(prev => [...prev, { id, cellIdx, font }]);

      const holdMs =
        holdMinRef.current +
        Math.random() * (holdMaxRef.current - holdMinRef.current);

      const hideTimer = setTimeout(() => {
        setInstances(prev => prev.filter(i => i.id !== id));
        // Brief gap before the next instance appears in this slot
        const nextTimer = setTimeout(() => addInstance(), 40 + Math.random() * 80);
        timersRef.current.push(nextTimer);
      }, holdMs);
      timersRef.current.push(hideTimer);
    }

    addInstanceRef.current = addInstance;

    // Stagger the initial slot appearances so they don't all flash at once
    for (let i = 0; i < slotCount; i++) {
      const delay = i * (80 + Math.random() * 60);
      const t = setTimeout(() => addInstance(), delay);
      timersRef.current.push(t);
    }

    // After cycleDurationMs, stop cycling, clear all, show resting element
    const stopTimer = setTimeout(() => {
      runningRef.current = false;
      setInstances([]);

      if (resting.count > 0) {
        const cellIdx = pickCell([]);
        const { x, y } = cellCenter(cellIdx);
        const size =
          resting.sizeRange[0] +
          Math.random() * (resting.sizeRange[1] - resting.sizeRange[0]);
        setRestingPosition({ x, y, size });
      }

      const doneTimer = setTimeout(() => onCompleteRef.current?.(), FADE_MS + 100);
      timersRef.current.push(doneTimer);
    }, cycleDurationMs);
    timersRef.current.push(stopTimer);

    return () => {
      runningRef.current = false;
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
    };
  }, [fontsReady, slotCount, cycleDurationMs, resting]);

  const ease = EASING_PRESETS[easing];
  const fadeSec = FADE_MS / 1000;

  return (
    <div
      className={"relative h-full w-full overflow-hidden " + (className ?? "")}
      style={{ containerType: "size" }}
    >
      <AnimatePresence>
        {instances.map(inst => {
          const { x, y } = cellCenter(inst.cellIdx);
          return (
            <div
              key={inst.id}
              style={{
                position: "absolute",
                left: `${x}%`,
                top: `${y}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: fadeSec, ease }}
                style={{
                  fontFamily:
                    inst.font === "DieGrotesk"
                      ? '"DieGrotesk", sans-serif'
                      : '"LectorBold", serif',
                  fontWeight: 700,
                  color: "#FFF",
                  fontSize: `${fontSizeForWidth(INSTANCE_SIZE, text.length)}cqw`,
                  lineHeight: 0.9,
                  letterSpacing: "-0.05em",
                  whiteSpace: "nowrap",
                  pointerEvents: "none",
                  userSelect: "none",
                }}
              >
                {text}
              </motion.div>
            </div>
          );
        })}
      </AnimatePresence>

      {/* Resting element — appears after rolling stops */}
      {restingPosition && (
        <div
          style={{
            position: "absolute",
            left: `${restingPosition.x}%`,
            top: `${restingPosition.y}%`,
            transform: "translate(-50%, -50%)",
          }}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: fadeSec, ease }}
            style={{
              fontFamily: '"LectorBold", serif',
              fontWeight: 700,
              color: "#FFF",
              fontSize: `${fontSizeForWidth(restingPosition.size, text.length)}cqw`,
              lineHeight: 0.9,
              letterSpacing: "-0.05em",
              whiteSpace: "nowrap",
              pointerEvents: "none",
              userSelect: "none",
            }}
          >
            {text}
          </motion.div>
        </div>
      )}
    </div>
  );
}
