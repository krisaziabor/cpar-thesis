"use client";

import { AuthProvider } from "@/lib/auth-context";
import FloatingNav from "@/components/FloatingNav";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      {children}
      <FloatingNav />
    </AuthProvider>
  );
}
