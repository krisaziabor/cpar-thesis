"use client";

import { Suspense } from "react";
import { AuthProvider } from "@/lib/auth-context";
import FloatingNav from "@/components/FloatingNav";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      {children}
      <Suspense fallback={null}>
        <FloatingNav />
      </Suspense>
    </AuthProvider>
  );
}
