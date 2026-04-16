"use client";

import { Suspense } from "react";
import { AuthProvider } from "@/lib/auth-context";
import { NavGuardProvider } from "@/lib/nav-guard-context";
import { NavStatusProvider } from "@/lib/nav-status-context";
import { PanelHistoryProvider } from "@/lib/panel-history-context";
import FloatingNav from "@/components/FloatingNav";
import UtilityDock from "@/components/UtilityDock";
import GlobalFeedbackPanel from "@/components/GlobalFeedbackPanel";
import { DialRoot } from "dialkit";
import "dialkit/styles.css";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <NavGuardProvider>
        <NavStatusProvider>
          <Suspense fallback={null}>
            <PanelHistoryProvider>
            {children}
            <FloatingNav />
            <UtilityDock />
            <GlobalFeedbackPanel />
            </PanelHistoryProvider>
          </Suspense>
          <DialRoot position="top-right" />
        </NavStatusProvider>
      </NavGuardProvider>
    </AuthProvider>
  );
}
