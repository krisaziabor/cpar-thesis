"use client";

import { useState, useEffect } from "react";
import {
  signInWithPopup,
  GoogleAuthProvider,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signOut,
} from "firebase/auth";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { auth } from "@/lib/firebase";
import {
  emailHasWhitelistEntry,
  getWhitelistAccessInfo,
  REGISTRATION_OPEN,
} from "@/lib/whitelist";
import { useAuth } from "@/lib/auth-context";

const googleProvider = new GoogleAuthProvider();
const EMAIL_STORAGE_KEY = "kanon_signin_email";
const REGISTRATION_CLOSED_MESSAGE = "Registration is currently closed.";

const EASE = [0.215, 0.61, 0.355, 1] as const;

type Stage = "gate" | "choice" | "sent" | "verifying";

export default function LoginPage() {
  const { user, loading, authError } = useAuth();
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const [stage, setStage] = useState<Stage>(() => {
    if (
      auth &&
      typeof window !== "undefined" &&
      isSignInWithEmailLink(auth, window.location.href)
    ) {
      return "verifying";
    }
    return "gate";
  });
  const [emailInput, setEmailInput] = useState("");
  const [gatedEmail, setGatedEmail] = useState("");
  const [gatedFirstName, setGatedFirstName] = useState<string | null>(null);
  const [isNewUser, setIsNewUser] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [sendingLink, setSendingLink] = useState(false);
  const [localError, setLocalError] = useState("");
  const [transientNotice, setTransientNotice] = useState("");

  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [user, loading, router]);

  // Magic links often open in a new tab; Firebase syncs auth across same-origin tabs, but
  // when you return to this tab we re-check so you are not stuck on login after signing in elsewhere.
  useEffect(() => {
    if (!auth || typeof window === "undefined") return;
    const firebaseAuth = auth;

    function redirectIfAlreadySignedIn() {
      if (document.visibilityState !== "visible") return;
      if (firebaseAuth.currentUser) {
        router.replace("/");
      }
    }

    document.addEventListener("visibilitychange", redirectIfAlreadySignedIn);
    window.addEventListener("focus", redirectIfAlreadySignedIn);
    return () => {
      document.removeEventListener("visibilitychange", redirectIfAlreadySignedIn);
      window.removeEventListener("focus", redirectIfAlreadySignedIn);
    };
  }, [auth, router]);

  useEffect(() => {
    if (!auth || typeof window === "undefined") return;
    if (!isSignInWithEmailLink(auth, window.location.href)) return;

    const storedEmail = localStorage.getItem(EMAIL_STORAGE_KEY);

    if (!storedEmail) {
      Promise.resolve().then(() => {
        setLocalError("Could not find your email. Please request a new sign-in link.");
        setStage("gate");
      });
      return;
    }

    signInWithEmailLink(auth, storedEmail, window.location.href)
      .then(() => localStorage.removeItem(EMAIL_STORAGE_KEY))
      .catch((err: unknown) => {
        const message =
          err instanceof Error ? err.message : "Sign-in failed. Please try again.";
        setLocalError(message);
        setStage("gate");
      });
  }, []);

  useEffect(() => {
    if (!transientNotice) return;
    const timeoutId = window.setTimeout(() => setTransientNotice(""), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [transientNotice]);

  const error = localError || authError || "";

  async function handleGoogleSignIn(expectedEmail?: string) {
    if (!auth) { setError("Firebase is not configured."); return; }
    setLocalError("");
    setSigningIn(true);

    const normalizedExpected = expectedEmail?.trim().toLowerCase() ?? "";
    if (normalizedExpected) {
      googleProvider.setCustomParameters({
        login_hint: normalizedExpected,
        ...(normalizedExpected.endsWith("@yale.edu") ? { hd: "yale.edu" } : {}),
      });
    } else {
      googleProvider.setCustomParameters({});
    }

    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (normalizedExpected) {
        const googleEmail = result.user.email?.trim().toLowerCase() ?? "";
        if (googleEmail !== normalizedExpected) {
          await signOut(auth);
          const displayEmail = expectedEmail?.trim() || normalizedExpected;
          setLocalError(
            `Sign in with the Google account for ${displayEmail}—the same address you entered.`,
          );
          return;
        }
      }
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        setLocalError(err instanceof Error ? err.message : "Sign-in failed.");
      }
    } finally {
      setSigningIn(false);
    }
  }

  async function handleEmailGateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!auth) { setError("Firebase is not configured."); return; }
    setLocalError("");
    setTransientNotice("");

    const normalizedEmail = emailInput.trim().toLowerCase();

    const exists = await emailHasWhitelistEntry(normalizedEmail).catch(() => false);

    if (exists) {
      const accessInfo = await getWhitelistAccessInfo(normalizedEmail).catch(() => ({
        role: null,
        firstName: null,
      }));
      setGatedEmail(normalizedEmail);
      setGatedFirstName(accessInfo.firstName);
      setIsNewUser(false);
      setStage("choice");
      return;
    }

    if (!REGISTRATION_OPEN) {
      setStage("gate");
      setTransientNotice(REGISTRATION_CLOSED_MESSAGE);
      return;
    }

    setGatedEmail(normalizedEmail);
    setGatedFirstName(null);
    setIsNewUser(true);
    setStage("choice");
  }

  async function handleSendMagicLink() {
    if (!auth) { setError("Firebase is not configured."); return; }
    setLocalError("");

    if (!gatedEmail) {
      setLocalError("Enter your email first.");
      setStage("gate");
      return;
    }

    setSendingLink(true);
    try {
      const res = await fetch("/api/auth/send-magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: gatedEmail }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setSendingLink(false);
        setLocalError(
          typeof data.error === "string" ? data.error : "Failed to send sign-in link.",
        );
        return;
      }
      localStorage.setItem(EMAIL_STORAGE_KEY, gatedEmail);
      setStage("sent");
    } catch (err: unknown) {
      setSendingLink(false);
      setLocalError(err instanceof Error ? err.message : "Failed to send sign-in link.");
    }
  }

  function setError(message: string) {
    setLocalError(message);
  }

  const isAuthTransitioning = loading || signingIn || stage === "verifying";

  const animProps = {
    initial: shouldReduceMotion ? false : ({ opacity: 0, y: 6 } as const),
    animate: { opacity: 1, y: 0 } as const,
    exit: shouldReduceMotion ? ({ opacity: 1 } as const) : ({ opacity: 0, y: -6 } as const),
    transition: shouldReduceMotion ? { duration: 0 } : ({ duration: 0.2, ease: EASE } as const),
  };

  return (
    <div className="min-h-screen bg-black">
      {/* ── Header — fixed top center like onboarding ────────────────────── */}
      <div className="fixed left-0 right-0 top-6 z-20 flex flex-col items-center">
        <h1 className="font-lector text-2xl tracking-tight text-white/90">Kanon</h1>
      </div>

      {/* ── Centered content area ────────────────────────────────────────── */}
      <div className="flex min-h-screen flex-col items-center justify-center px-6">
        <div className="flex w-[min(380px,calc(100vw-3rem))] flex-col items-start gap-2">
          <p className="whitespace-pre-line font-sans text-base leading-relaxed text-zinc-400 sm:text-sm">
            {"A network, library, installation, book, and practice.\nThesis for Computing and the Arts at Yale University.\nWork of Kristopher Aziabor."}
          </p>
        </div>

        {/* ── Form area ─────────────────────────────────────────────────── */}
        <div className="mt-6 flex w-[min(380px,calc(100vw-3rem))] flex-col items-start gap-3">
        {isAuthTransitioning ? (
          <p className="font-sans text-sm text-zinc-400 sm:text-xs">
            {stage === "verifying" ? "Signing you in\u2026" : "Loading\u2026"}
          </p>
        ) : (
          <AnimatePresence initial={false} mode="wait">
            {stage === "gate" && (
              <motion.form
                key="gate"
                onSubmit={handleEmailGateSubmit}
                {...animProps}
                className="flex w-full flex-col items-start gap-3"
              >
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => {
                    setEmailInput(e.target.value);
                    if (transientNotice) setTransientNotice("");
                  }}
                  placeholder="Enter your email"
                  required
                  className="w-full bg-transparent font-sans text-base text-zinc-300 placeholder:text-zinc-500 focus:outline-none border-b border-zinc-800 py-3 sm:text-xs"
                />
                <button
                  type="submit"
                  className="-mx-1 px-1 py-2 font-sans text-sm text-zinc-300 transition-colors hover:text-zinc-50 sm:text-xs"
                >
                  Continue
                </button>
              </motion.form>
            )}

            {stage === "choice" && (
              <motion.div
                key="choice"
                {...animProps}
                className="flex w-full flex-col items-start gap-4"
              >
                <p className="font-sans text-base sm:text-sm" style={{ color: "lab(65.6464 1.53497 -5.42429)" }}>
                  {isNewUser
                    ? "Create your account"
                    : gatedFirstName
                      ? `Hey ${gatedFirstName}!`
                      : "Welcome back! Glad you are here :)"}
                </p>
                <div className="flex w-full flex-row flex-wrap items-center gap-x-4 gap-y-3">
                  <button
                    type="button"
                    disabled={sendingLink}
                    onClick={() => void handleSendMagicLink()}
                    className="shrink-0 font-sans text-sm text-zinc-300 transition-colors hover:text-zinc-50 disabled:opacity-50 sm:text-xs"
                  >
                    {sendingLink ? "Sending…" : isNewUser ? "Send sign-up link" : "Send magic link"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleGoogleSignIn(gatedEmail)}
                    className="flex shrink-0 items-center gap-2 font-sans text-sm text-zinc-500 transition-colors hover:text-zinc-300 sm:text-xs"
                  >
                    <GoogleIcon />
                    {isNewUser ? "Sign up with Google" : "Continue with Google"}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStage("gate");
                    setEmailInput("");
                    setGatedEmail("");
                    setGatedFirstName(null);
                    setIsNewUser(false);
                  }}
                  className="font-sans text-sm text-zinc-500 transition-colors hover:text-zinc-300 sm:text-xs"
                >
                  Use a different email
                </button>
              </motion.div>
            )}

            {stage === "sent" && (
              <motion.div
                key="sent"
                {...animProps}
                className="flex w-full flex-col items-start gap-4"
              >
                <p className="font-sans text-sm text-zinc-300 sm:text-xs">
                  Magic link sent to {gatedEmail}.
                </p>
                <p className="font-sans text-sm text-zinc-500 sm:text-xs">
                  Check your email (spam included)
                </p>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => void handleGoogleSignIn(gatedEmail)}
                    className="font-sans text-sm text-zinc-400 transition-colors hover:text-zinc-50 sm:text-xs"
                  >
                    Switch to Google Sign-In
                  </button>
                  <button
                    onClick={() => {
                      setStage("gate");
                      setEmailInput("");
                      setGatedEmail("");
                      setGatedFirstName(null);
                      setIsNewUser(false);
                    }}
                    className="font-sans text-sm text-zinc-400 transition-colors hover:text-zinc-50 sm:text-xs"
                  >
                    Use a different email
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {transientNotice && (
          <p className="text-sm text-red-400 sm:text-xs">{transientNotice}</p>
        )}

        {error && (
          <p className="text-sm text-red-400 sm:text-xs">{error}</p>
        )}
      </div>
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
