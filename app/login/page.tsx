"use client";

import { useState, useEffect } from "react";
import {
  signInWithPopup,
  GoogleAuthProvider,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
} from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { getWhitelistRole } from "@/lib/whitelist";
import { useAuth } from "@/lib/auth-context";

const googleProvider = new GoogleAuthProvider();
const EMAIL_STORAGE_KEY = "kanon_signin_email";

type PageState = "idle" | "sent" | "verifying";

export default function LoginPage() {
  const { user, loading, authError } = useAuth();
  const router = useRouter();
  const [pageState, setPageState] = useState<PageState>("idle");
  const [email, setEmail] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState("");

  // Surface auth errors from context (e.g. "not approved")
  useEffect(() => {
    if (authError) setError(authError);
  }, [authError]);

  // Redirect to home if already authenticated
  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [user, loading, router]);

  // Complete sign-in when user returns from the email link
  useEffect(() => {
    if (!auth || typeof window === "undefined") return;
    if (!isSignInWithEmailLink(auth, window.location.href)) return;

    setPageState("verifying");
    const storedEmail = localStorage.getItem(EMAIL_STORAGE_KEY);

    if (!storedEmail) {
      setError("Could not find your email. Please request a new sign-in link.");
      setPageState("idle");
      return;
    }

    signInWithEmailLink(auth, storedEmail, window.location.href)
      .then(() => localStorage.removeItem(EMAIL_STORAGE_KEY))
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : "Sign-in failed. Please try again.";
        setError(message);
        setPageState("idle");
      });
  }, []);

  async function handleGoogleSignIn() {
    if (!auth) { setError("Firebase is not configured."); return; }
    setError("");
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
      // Auth context handles whitelist check, role, and redirect
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        setError(err instanceof Error ? err.message : "Sign-in failed.");
      }
      setSigningIn(false);
    }
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!auth) { setError("Firebase is not configured."); return; }
    setError("");

    const normalizedEmail = email.trim().toLowerCase();

    // Check whitelist before sending the link so the user gets immediate feedback
    const role = await getWhitelistRole(normalizedEmail).catch(() => null);
    if (!role) {
      setError("This email is not on the access list.");
      return;
    }

    // actionCodeSettings.url must be an authorized domain in Firebase Console:
    // Authentication > Sign-in method > Email/Password > Email link (passwordless sign-in)
    try {
      await sendSignInLinkToEmail(auth, normalizedEmail, {
        url: `${window.location.origin}/login`,
        handleCodeInApp: true,
      });
      localStorage.setItem(EMAIL_STORAGE_KEY, normalizedEmail);
      setPageState("sent");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send sign-in link.");
    }
  }

  if (loading || signingIn || pageState === "verifying") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {pageState === "verifying" ? "Signing you in…" : "Loading…"}
        </p>
      </div>
    );
  }

  if (pageState === "sent") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 dark:bg-black">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Check your email
        </h1>
        <p className="max-w-sm text-center text-sm text-zinc-600 dark:text-zinc-400">
          We sent a sign-in link to <strong>{email}</strong>. Click the link to
          continue.
        </p>
        <button
          onClick={() => { setPageState("idle"); setEmail(""); }}
          className="text-sm text-zinc-500 underline underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-zinc-50 dark:bg-black">
      <div className="flex flex-col items-center gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Kanon
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Sign in to continue
        </p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-3">
        {error && <p className="text-center text-sm text-red-500">{error}</p>}

        <button
          onClick={handleGoogleSignIn}
          className="flex items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
        >
          <GoogleIcon />
          Continue with Google
        </button>

        <div className="flex items-center gap-3">
          <hr className="flex-1 border-zinc-200 dark:border-zinc-800" />
          <span className="text-xs text-zinc-400 dark:text-zinc-600">or</span>
          <hr className="flex-1 border-zinc-200 dark:border-zinc-800" />
        </div>

        <form onSubmit={handleEmailSubmit} className="flex flex-col gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:focus:border-zinc-400"
          />
          {email.toLowerCase().includes("@yale.edu") && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Yale addresses may experience email delays — Google Sign-In is recommended.
            </p>
          )}
          <button
            type="submit"
            className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Send sign-in link
          </button>
        </form>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
