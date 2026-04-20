"use client";

import { AnimatePresence } from "framer-motion";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import FloatingNav from "@/components/FloatingNav";

interface FloatingNavSuppressContextValue {
  acquire: () => void;
  release: () => void;
}

const FloatingNavSuppressContext = createContext<FloatingNavSuppressContextValue | null>(null);

/**
 * Wraps the app shell: provides acquire/release for hiding the floating nav
 * (recording flows), and renders the nav with AnimatePresence for exit motion.
 * `trailing` renders after the nav (e.g. UtilityDock) so stacking matches the prior layout.
 */
export function FloatingNavShell({
  children,
  trailing,
}: {
  children: ReactNode;
  trailing?: ReactNode;
}) {
  const countRef = useRef(0);
  const [suppressed, setSuppressed] = useState(false);

  const sync = useCallback(() => {
    setSuppressed(countRef.current > 0);
  }, []);

  const acquire = useCallback(() => {
    countRef.current += 1;
    sync();
  }, [sync]);

  const release = useCallback(() => {
    countRef.current = Math.max(0, countRef.current - 1);
    sync();
  }, [sync]);

  const value = useMemo(() => ({ acquire, release }), [acquire, release]);

  return (
    <FloatingNavSuppressContext.Provider value={value}>
      {children}
      <AnimatePresence initial={false}>
        {!suppressed && <FloatingNav key="floating-nav" />}
      </AnimatePresence>
      {trailing}
    </FloatingNavSuppressContext.Provider>
  );
}

export function useFloatingNavSuppress(): FloatingNavSuppressContextValue {
  const ctx = useContext(FloatingNavSuppressContext);
  if (!ctx) {
    return {
      acquire: () => {},
      release: () => {},
    };
  }
  return ctx;
}

/** While `active`, the floating nav is hidden; cleans up on deactivate or unmount. */
export function useSuppressFloatingNavWhile(active: boolean) {
  const { acquire, release } = useFloatingNavSuppress();
  useEffect(() => {
    if (!active) return;
    acquire();
    return release;
  }, [active, acquire, release]);
}
