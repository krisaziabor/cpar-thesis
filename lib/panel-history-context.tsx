"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

interface PanelHistoryEntry {
  url: string;
  label: string;
}

interface PanelHistoryContextValue {
  /** Navigate to a new panel URL, pushing the current panel onto the back stack. */
  navigatePanel: (url: string, backLabel: string) => void;
  /** Pop the stack and navigate to the previous panel. */
  goBack: () => void;
  /** The most recent back entry (what the back button would navigate to), or null. */
  backEntry: PanelHistoryEntry | null;
  /** Clear the entire history stack (e.g. when all panels close). */
  clearHistory: () => void;
}

const PanelHistoryContext = createContext<PanelHistoryContextValue>({
  navigatePanel: () => {},
  goBack: () => {},
  backEntry: null,
  clearHistory: () => {},
});

export function PanelHistoryProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const stackRef = useRef<PanelHistoryEntry[]>([]);
  const [backEntry, setBackEntry] = useState<PanelHistoryEntry | null>(null);

  const navigatePanel = useCallback(
    (url: string, backLabel: string) => {
      const qs = searchParams.toString();
      const currentUrl = qs ? `${pathname}?${qs}` : pathname;
      stackRef.current.push({ url: currentUrl, label: backLabel });
      setBackEntry(stackRef.current[stackRef.current.length - 1] ?? null);
      router.push(url);
    },
    [router, pathname, searchParams]
  );

  const goBack = useCallback(() => {
    const entry = stackRef.current.pop();
    setBackEntry(stackRef.current[stackRef.current.length - 1] ?? null);
    if (entry) {
      router.push(entry.url);
    }
  }, [router]);

  const clearHistory = useCallback(() => {
    stackRef.current = [];
    setBackEntry(null);
  }, []);

  return (
    <PanelHistoryContext.Provider
      value={{ navigatePanel, goBack, backEntry, clearHistory }}
    >
      {children}
    </PanelHistoryContext.Provider>
  );
}

export function usePanelHistory() {
  return useContext(PanelHistoryContext);
}
