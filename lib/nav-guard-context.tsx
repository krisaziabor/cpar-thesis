"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type GuardFn = (destinationHref: string) => boolean;

interface NavGuardContextValue {
  registerGuard: (guard: GuardFn) => void;
  unregisterGuard: () => void;
  navigateWithGuard: (href: string) => void;
}

const NavGuardContext = createContext<NavGuardContextValue>({
  registerGuard: () => {},
  unregisterGuard: () => {},
  navigateWithGuard: () => {},
});

export function NavGuardProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const guardRef = useRef<GuardFn | null>(null);

  const registerGuard = useCallback((guard: GuardFn) => {
    guardRef.current = guard;
  }, []);

  const unregisterGuard = useCallback(() => {
    guardRef.current = null;
  }, []);

  const navigateWithGuard = useCallback(
    (href: string) => {
      if (guardRef.current && guardRef.current(href)) return;
      router.push(href);
    },
    [router]
  );

  return (
    <NavGuardContext.Provider value={{ registerGuard, unregisterGuard, navigateWithGuard }}>
      {children}
    </NavGuardContext.Provider>
  );
}

export function useNavGuard() {
  return useContext(NavGuardContext);
}
