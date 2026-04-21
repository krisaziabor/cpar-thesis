"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";

/** Wraps internal `*-lab` pages so only Firestore `role: admin` users see them. */
export function AdminOnlyLabGate({ children }: { children: ReactNode }) {
  const { loading, user, role } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <span className="text-xs text-zinc-500">loading…</span>
      </div>
    );
  }

  if (!user || role !== "admin") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black">
        <p className="font-sans text-lg font-medium text-zinc-400">404</p>
        <p className="text-sm text-zinc-500">This page could not be found.</p>
        <Link
          href="/"
          className="text-xs text-zinc-500 underline underline-offset-2 transition-colors hover:text-zinc-300"
        >
          Back to Kanon
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
