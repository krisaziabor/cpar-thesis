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
import {
  getWhitelistAccessInfo,
  createWhitelistEntry,
  REGISTRATION_OPEN,
  type UserRole,
} from "./whitelist";
import {
  getOnboarding,
  currentStep,
} from "./installation-onboarding";
import { getUserProfile } from "./users";
import type { OnboardingStep } from "./types";

const ONBOARDING_EXEMPT_PATHS = ["/login", "/onboarding", "/admin", "/colophon"];

interface AuthContextValue {
  user: User | null;
  role: UserRole | null;
  firstName: string | null;
  avatarColors: [string, string, string] | null;
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
  firstName: null,
  avatarColors: null,
  loading: true,
  authError: null,
  onboardingStep: "profile_setup",
  onboardingComplete: false,
  refreshOnboarding: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [avatarColors, setAvatarColors] = useState<[string, string, string] | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [onboardingStep, setOnboardingStep] =
    useState<OnboardingStep>("profile_setup");
  const router = useRouter();
  const pathname = usePathname();

  async function loadOnboarding(email: string, selfRegistered: boolean) {
    const data = await getOnboarding(email);
    const step = currentStep(data, selfRegistered);
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
        setFirstName(null);
        setAvatarColors(null);
        setOnboardingStep("profile_setup");
        setLoading(false);
        return;
      }

      // Keep loading true while resolving whitelist + onboarding.
      // Critical after sign-in: the initial null callback already set
      // loading=false, so without this reset the redirect effects would
      // fire before role/onboardingStep are resolved.
      setLoading(true);

      try {
        let access = await getWhitelistAccessInfo(firebaseUser.email);

        if (!access.role && REGISTRATION_OPEN) {
          await createWhitelistEntry(firebaseUser.email);
          access = { role: "member", firstName: null };
        }

        if (!access.role) {
          await firebaseSignOut(_auth);
          setUser(null);
          setRole(null);
          setFirstName(null);
          setAvatarColors(null);
          setOnboardingStep("profile_setup");
          setAuthError("This account is not approved for access.");
        } else {
          const selfRegistered = !access.firstName;
          setUser(firebaseUser);
          setRole(access.role);
          setFirstName(access.firstName);
          setAuthError(null);
          try {
            await loadOnboarding(firebaseUser.email, selfRegistered);
          } catch {
            setOnboardingStep("complete");
          }
          try {
            const profile = await getUserProfile(firebaseUser.email);
            setAvatarColors(profile?.avatar_colors ?? null);
            // If whitelist had no firstName (typical for self-registered users),
            // fall back to the name saved during onboarding (users/{email}.name)
            // so the floating-nav welcome greeting can personalize.
            if (!access.firstName && profile?.name) {
              const derived = profile.name.trim().split(/\s+/)[0] ?? null;
              if (derived) setFirstName(derived);
            }
          } catch {
            setAvatarColors(null);
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
    if (process.env.NODE_ENV === "development" && pathname === "/nav-status-lab") return;
    router.replace("/login");
  }, [loading, user, pathname, router]);

  // Redirect authenticated users based on onboarding status
  useEffect(() => {
    if (loading || !user) return;

    if (onboardingStep === "complete") {
      if (pathname === "/onboarding") {
        router.replace("/");
      }
      return;
    }

    const exempt = ONBOARDING_EXEMPT_PATHS.some(
      (p) => pathname === p || pathname.startsWith(p + "/")
    );
    if (!exempt) {
      router.replace("/onboarding");
    }
  }, [loading, user, pathname, onboardingStep, router]);

  async function refreshOnboarding() {
    if (user?.email) {
      await loadOnboarding(user.email, !firstName);
      try {
        const profile = await getUserProfile(user.email);
        if (profile?.avatar_colors) setAvatarColors(profile.avatar_colors);
        if (!firstName && profile?.name) {
          const derived = profile.name.trim().split(/\s+/)[0] ?? null;
          if (derived) setFirstName(derived);
        }
      } catch {}
    }
  }

  async function signOut() {
    if (auth) {
      await firebaseSignOut(auth);
      setFirstName(null);
      setAvatarColors(null);
      setOnboardingStep("profile_setup");
      try {
        sessionStorage.removeItem("kanon-greeted");
        sessionStorage.removeItem("kanon-just-onboarded");
        sessionStorage.removeItem("kanon-cached-items");
      } catch {}
      router.replace("/login");
    }
  }

  const onboardingComplete = onboardingStep === "complete";

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        firstName,
        avatarColors,
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
