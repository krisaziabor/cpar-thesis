"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { useRouter, usePathname } from "next/navigation";
import { auth } from "./firebase";
import { getWhitelistRole, type UserRole } from "./whitelist";
import {
  getOnboarding,
  currentStep,
} from "./installation-onboarding";
import type { OnboardingStep } from "./types";

const ONBOARDING_EXEMPT_PATHS = ["/login", "/onboarding", "/admin", "/colophon"];

interface AuthContextValue {
  user: User | null;
  role: UserRole | null;
  loading: boolean;
  authError: string | null;
  onboardingStep: OnboardingStep;
  onboardingComplete: boolean;
  /** Re-fetch onboarding status (call after a step is submitted). */
  refreshOnboarding: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  role: null,
  loading: true,
  authError: null,
  onboardingStep: "media_opt_in",
  onboardingComplete: false,
  refreshOnboarding: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [onboardingStep, setOnboardingStep] =
    useState<OnboardingStep>("media_opt_in");
  const router = useRouter();
  const pathname = usePathname();

  async function loadOnboarding(email: string) {
    const data = await getOnboarding(email);
    const step = currentStep(data);
    setOnboardingStep(step);
    return step;
  }

  // Subscribe to Firebase auth state once and check Firestore whitelist
  useEffect(() => {
    if (!auth) {
      setLoading(false);
      return;
    }
    const _auth = auth;

    const unsubscribe = onAuthStateChanged(_auth, async (firebaseUser) => {
      if (!firebaseUser?.email) {
        setUser(null);
        setRole(null);
        setOnboardingStep("media_opt_in");
        setLoading(false);
        return;
      }

      try {
        const userRole = await getWhitelistRole(firebaseUser.email);
        if (!userRole) {
          await firebaseSignOut(_auth);
          setUser(null);
          setRole(null);
          setOnboardingStep("media_opt_in");
          setAuthError("This account is not approved for access.");
        } else {
          setUser(firebaseUser);
          setRole(userRole);
          setAuthError(null);
          try {
            await loadOnboarding(firebaseUser.email);
          } catch {
            setOnboardingStep("complete");
          }
        }
      } catch {
        setAuthError("Failed to verify access. Please try again.");
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // Redirect unauthenticated users to /login
  useEffect(() => {
    if (loading || user) return;
    if (pathname === "/login") return;
    if (process.env.NODE_ENV === "development" && pathname === "/onboarding") return;
    router.replace("/login");
  }, [loading, user, pathname, router]);

  // Redirect authenticated users who haven't finished onboarding
  useEffect(() => {
    if (loading || !user) return;
    const exempt = ONBOARDING_EXEMPT_PATHS.some(
      (p) => pathname === p || pathname.startsWith(p + "/")
    );
    if (!exempt && onboardingStep !== "complete") {
      router.replace("/onboarding");
    }
  }, [loading, user, pathname, onboardingStep, router]);

  async function refreshOnboarding() {
    if (user?.email) {
      await loadOnboarding(user.email);
    }
  }

  async function signOut() {
    if (auth) {
      await firebaseSignOut(auth);
      setOnboardingStep("media_opt_in");
      router.replace("/login");
    }
  }

  const onboardingComplete = onboardingStep === "complete";

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        loading,
        authError,
        onboardingStep,
        onboardingComplete,
        refreshOnboarding,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
