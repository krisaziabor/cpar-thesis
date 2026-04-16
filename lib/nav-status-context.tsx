"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

export type NavStatusPhase = "active" | "success" | "error";

export interface NavStatusMessage {
  id: string;
  text: string;
  thumbnails?: string[];
  /** Progress border animation while message is displayed */
  showProgress?: boolean;
  /**
   * How long to display (ms) once resolved. Defaults to 2400.
   * For progress messages that await resolution, this is the
   * *minimum* display time — the message stays until resolved.
   */
  durationMs?: number;
  /** Current lifecycle phase — set internally */
  phase?: NavStatusPhase;
  /** Error text (set when resolved with error) */
  errorText?: string;
}

interface NavStatusContextValue {
  currentMessage: NavStatusMessage | null;
  /** Push one or more messages to display sequentially */
  enqueue: (...messages: NavStatusMessage[]) => void;
  /**
   * Start a progress message that stays until resolved.
   * Returns `resolve` and `reject` callbacks.
   */
  startProgress: (message: NavStatusMessage) => {
    resolve: (successText?: string) => void;
    reject: (errorText: string) => void;
  };
  /** Clear the current message and any remaining queue */
  clearAll: () => void;
}

const NavStatusContext = createContext<NavStatusContextValue>({
  currentMessage: null,
  enqueue: () => {},
  startProgress: () => ({ resolve: () => {}, reject: () => {} }),
  clearAll: () => {},
});

const MIN_PROGRESS_MS = 1600;
const MAX_PROGRESS_MS = 15_000;

export function NavStatusProvider({ children }: { children: React.ReactNode }) {
  const [currentMessage, setCurrentMessage] = useState<NavStatusMessage | null>(null);
  const queueRef = useRef<NavStatusMessage[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processingRef = useRef(false);
  const progressStartedAtRef = useRef<number | null>(null);
  const awaitingResolveRef = useRef(false);
  const activeProgressIdRef = useRef<string | null>(null);

  const clearSafetyTimer = useCallback(() => {
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
  }, []);

  const advance = useCallback(() => {
    clearSafetyTimer();
    const next = queueRef.current.shift();
    if (!next) {
      setCurrentMessage(null);
      processingRef.current = false;
      progressStartedAtRef.current = null;
      awaitingResolveRef.current = false;
      activeProgressIdRef.current = null;
      return;
    }
    setCurrentMessage({ ...next, phase: next.phase ?? "active" });

    if (next.showProgress && !next.phase) {
      progressStartedAtRef.current = performance.now();
      awaitingResolveRef.current = true;
      activeProgressIdRef.current = next.id;
      safetyTimerRef.current = setTimeout(() => {
        if (awaitingResolveRef.current && activeProgressIdRef.current === next.id) {
          awaitingResolveRef.current = false;
          activeProgressIdRef.current = null;
          setCurrentMessage({
            ...next,
            text: "Something went wrong, try again",
            phase: "error",
            showProgress: true,
          });
          timerRef.current = setTimeout(advance, 3600);
        }
      }, MAX_PROGRESS_MS);
    } else {
      awaitingResolveRef.current = false;
      activeProgressIdRef.current = null;
      const duration = next.durationMs ?? 2400;
      timerRef.current = setTimeout(advance, duration);
    }
  }, [clearSafetyTimer]);

  const enqueue = useCallback(
    (...messages: NavStatusMessage[]) => {
      queueRef.current.push(...messages);
      if (!processingRef.current) {
        processingRef.current = true;
        advance();
      }
    },
    [advance]
  );

  const finishCurrent = useCallback(
    (msgId: string, updatedMessage: NavStatusMessage, holdMs: number) => {
      if (activeProgressIdRef.current !== msgId) return;
      clearSafetyTimer();

      const elapsed = progressStartedAtRef.current
        ? performance.now() - progressStartedAtRef.current
        : 0;
      const remaining = Math.max(0, MIN_PROGRESS_MS - elapsed);

      const apply = () => {
        awaitingResolveRef.current = false;
        activeProgressIdRef.current = null;
        setCurrentMessage(updatedMessage);
        timerRef.current = setTimeout(advance, holdMs);
      };

      if (remaining > 0) {
        timerRef.current = setTimeout(apply, remaining);
      } else {
        apply();
      }
    },
    [advance, clearSafetyTimer]
  );

  const startProgress = useCallback(
    (message: NavStatusMessage) => {
      const msg: NavStatusMessage = {
        ...message,
        showProgress: true,
        phase: undefined, // will be set to "active" by advance
      };

      let settled = false;

      const resolve = (successText?: string) => {
        if (settled) return;
        settled = true;
        finishCurrent(
          msg.id,
          {
            ...msg,
            text: successText ?? msg.text,
            phase: "success",
            showProgress: true,
          },
          msg.durationMs ?? 2400
        );
      };

      const reject = (errorText: string) => {
        if (settled) return;
        settled = true;
        finishCurrent(
          msg.id,
          {
            ...msg,
            text: errorText,
            phase: "error",
            errorText,
            showProgress: true,
          },
          3600
        );
      };

      queueRef.current.push(msg);
      if (!processingRef.current) {
        processingRef.current = true;
        advance();
      }

      return { resolve, reject };
    },
    [advance, finishCurrent]
  );

  const clearAll = useCallback(() => {
    queueRef.current = [];
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    clearSafetyTimer();
    processingRef.current = false;
    awaitingResolveRef.current = false;
    activeProgressIdRef.current = null;
    progressStartedAtRef.current = null;
    setCurrentMessage(null);
  }, [clearSafetyTimer]);

  return (
    <NavStatusContext.Provider value={{ currentMessage, enqueue, startProgress, clearAll }}>
      {children}
    </NavStatusContext.Provider>
  );
}

export function useNavStatus() {
  return useContext(NavStatusContext);
}
