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
  const [localError, setLocalError] = useState("");
  const [transientNotice, setTransientNotice] = useState("");

  // Redirect to home if already authenticated
  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [user, loading, router]);

  // Complete sign-in when user returns from the email link
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

  const shouldShowYaleNotice =
    (stage === "choice" || stage === "sent") &&
    gatedEmail.trim().toLowerCase().endsWith("@yale.edu");
  const error = localError || authError || "";

  async function handleGoogleSignIn(emailHint?: string) {
    if (!auth) { setError("Firebase is not configured."); return; }
    setLocalError("");
    setSigningIn(true);

    const normalizedHint = emailHint?.trim().toLowerCase() ?? "";
    if (normalizedHint) {
      googleProvider.setCustomParameters({
        login_hint: normalizedHint,
        ...(normalizedHint.endsWith("@yale.edu") ? { hd: "yale.edu" } : {}),
      });
    } else {
      googleProvider.setCustomParameters({});
    }

    try {
      await signInWithPopup(auth, googleProvider);
      // Auth context handles whitelist check, role, and redirect
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        setLocalError(err instanceof Error ? err.message : "Sign-in failed.");
      }
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

    // actionCodeSettings.url must be an authorized domain in Firebase Console:
    // Authentication > Sign-in method > Email/Password > Email link (passwordless sign-in)
    try {
      await sendSignInLinkToEmail(auth, gatedEmail, {
        url: `${window.location.origin}/login`,
        handleCodeInApp: true,
      });
      localStorage.setItem(EMAIL_STORAGE_KEY, gatedEmail);
      setStage("sent");
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : "Failed to send sign-in link.");
    }
  }

  function setError(message: string) {
    setLocalError(message);
  }

  const isAuthTransitioning = loading || signingIn || stage === "verifying";

  return (
    <div className="min-h-screen bg-black">
      <div className="fixed left-6 top-6 z-20 flex flex-col gap-2">
        <h1 className="font-lector text-2xl tracking-tight text-white/90">Kanon</h1>
        <p className="whitespace-pre-line text-xs text-zinc-400">
          {"A social network, library, installation, book, and practice.\nThesis for Computing and the Arts at Yale University.\nWork of Kristopher Aziabor."}
        </p>
      </div>

      <div className="fixed bottom-6 left-6 z-20 flex w-[min(560px,calc(100vw-3rem))] flex-col gap-2">
        <motion.div
          layout
          transition={
            shouldReduceMotion
              ? { duration: 0 }
              : { duration: 0.22, ease: [0.215, 0.61, 0.355, 1] }
          }
          className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-[0_4px_24px_rgba(0,0,0,0.5)]"
        >
          {isAuthTransitioning ? (
            <div className="px-4 py-2.5 text-xs text-zinc-400 font-sans">
              {stage === "verifying" ? "Signing you in..." : "Loading..."}
            </div>
          ) : (
            <AnimatePresence initial={false} mode="wait">
              {stage === "gate" && (
                <motion.form
                  key="gate"
                  onSubmit={handleEmailGateSubmit}
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -6 }}
                  transition={
                    shouldReduceMotion
                      ? { duration: 0 }
                      : { duration: 0.18, ease: [0.215, 0.61, 0.355, 1] }
                  }
                  className="flex items-stretch divide-x divide-zinc-800"
                >
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => {
                      setEmailInput(e.target.value);
                      if (transientNotice === ACCESS_NOT_GIVEN_MESSAGE) {
                        setTransientNotice("");
                      }
                    }}
                    placeholder="Enter your email"
                    required
                    className="min-w-0 flex-1 bg-transparent px-4 py-2.5 text-xs text-zinc-300 placeholder:text-zinc-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="font-lector px-4 py-2.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-50"
                  >
                    Continue
                  </button>
                </motion.form>
              )}

              {stage === "choice" && (
                <motion.div
                  key="choice"
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -6 }}
                  transition={
                    shouldReduceMotion
                      ? { duration: 0 }
                      : { duration: 0.2, ease: [0.215, 0.61, 0.355, 1] }
                  }
                  className="flex flex-col font-lector"
                >
                  <div className="border-b border-zinc-800 px-4 py-2 text-[11px] text-zinc-500 font-sans">
                    {isNewUser
                      ? "Create your account"
                      : gatedFirstName
                        ? `Hey ${gatedFirstName}!`
                        : gatedEmail}
                  </div>
                  <div className="flex items-stretch divide-x divide-zinc-800">
                    <button
                      onClick={() => void handleGoogleSignIn(gatedEmail)}
                      className="flex flex-1 items-center justify-center gap-2 px-4 py-2.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-50"
                    >
                      <GoogleIcon />
                      {isNewUser ? "Sign up with Google" : "Continue with Google"}
                    </button>
                    <button
                      onClick={() => void handleSendMagicLink()}
                      className="px-4 py-2.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-zinc-50"
                    >
                      {isNewUser ? "Send sign-up link" : "Send magic link"}
                    </button>
                  </div>
                </motion.div>
              )}

              {stage === "sent" && (
                <motion.div
                  key="sent"
                  initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: -6 }}
                  transition={
                    shouldReduceMotion
                      ? { duration: 0 }
                      : { duration: 0.2, ease: [0.215, 0.61, 0.355, 1] }
                  }
                  className="flex flex-col"
                >
                  <div className="border-b border-zinc-800 px-4 py-2 text-[11px] text-zinc-500 font-sans">
                    Check your email (spam included)
                  </div>
                  <div className="px-4 py-2.5 text-xs text-zinc-300 font-sans">
                    Magic link sent to {gatedEmail}.
                  </div>
                  <div className="flex items-stretch divide-x divide-zinc-800 border-t border-zinc-800">
                    <button
                      onClick={() => void handleGoogleSignIn(gatedEmail)}
                      className="flex-1 px-4 py-2.5 text-left text-xs text-zinc-400 font-lector transition-colors hover:bg-zinc-900 hover:text-zinc-50"
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
                      className="flex-1 px-4 py-2.5 text-left text-xs text-zinc-400 font-lector transition-colors hover:bg-zinc-900 hover:text-zinc-50"
                    >
                      Use a different email
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </motion.div>

        {shouldShowYaleNotice && (
          <p className="px-1 text-xs text-zinc-400">
            Google Sign-In is recommended for yale.edu email addresses.
          </p>
        )}

        {transientNotice && (
          <p className="px-1 text-xs text-red-400">{transientNotice}</p>
        )}

        {error && (
          <p className="px-1 text-xs text-red-400">{error}</p>
        )}
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
