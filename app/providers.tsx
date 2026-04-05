"use client";

import { Suspense } from "react";
import { AuthProvider } from "@/lib/auth-context";
import FloatingNav from "@/components/FloatingNav";
import UtilityDock from "@/components/UtilityDock";
import GlobalFeedbackPanel from "@/components/GlobalFeedbackPanel";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      {children}
      <Suspense fallback={null}>
        <FloatingNav />
        <UtilityDock />
        <GlobalFeedbackPanel />
      </Suspense>
    </AuthProvider>
  );
}
