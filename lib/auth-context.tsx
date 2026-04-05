"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
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

const DEV_EMAIL = "agent@cursor.com";
const IS_DEV = process.env.NODE_ENV === "development";
const DEV_SESSION_KEY = "kanon_dev_session";

function isDevSessionActive(): boolean {
  if (!IS_DEV || typeof window === "undefined") return false;
  return sessionStorage.getItem(DEV_SESSION_KEY) === "1";
}

function setDevSession(active: boolean): void {
  if (typeof window === "undefined") return;
  if (active) sessionStorage.setItem(DEV_SESSION_KEY, "1");
  else sessionStorage.removeItem(DEV_SESSION_KEY);
}

function createDevUser(): User {
  return {
    email: DEV_EMAIL,
    uid: "dev-agent-uid",
    displayName: "Dev Agent",
    photoURL: null,
    emailVerified: true,
    isAnonymous: false,
    providerId: "dev",
    metadata: {} as User["metadata"],
    providerData: [],
    refreshToken: "",
    tenantId: null,
    phoneNumber: null,
    delete: async () => {},
    getIdToken: async () => "dev-id-token",
    getIdTokenResult: async () => ({
      token: "dev-id-token",
      signInProvider: "dev",
      claims: {},
      authTime: new Date().toISOString(),
      expirationTime: new Date(Date.now() + 3600_000).toISOString(),
      issuedAtTime: new Date().toISOString(),
      signInSecondFactor: null,
    }),
    reload: async () => {},
    toJSON: () => ({ email: DEV_EMAIL, uid: "dev-agent-uid" }),
  } as unknown as User;
}

interface AuthContextValue {
  user: User | null;
  role: UserRole | null;
  loading: boolean;
  authError: string | null;
  signOut: () => Promise<void>;
  devSignIn: (() => void) | null;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  role: null,
  loading: true,
  authError: null,
  signOut: async () => {},
  devSignIn: null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() =>
    isDevSessionActive() ? createDevUser() : null
  );
  const [role, setRole] = useState<UserRole | null>(() =>
    isDevSessionActive() ? "admin" : null
  );
  const [loading, setLoading] = useState(() => !isDevSessionActive());
  const [authError, setAuthError] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  const devSignIn = useCallback(() => {
    if (!IS_DEV) return;
    setDevSession(true);
    setUser(createDevUser());
    setRole("admin");
    setAuthError(null);
    setLoading(false);
  }, []);

  // Subscribe to Firebase auth state once and check Firestore whitelist
  useEffect(() => {
    if (isDevSessionActive()) return;

    if (!auth) {
      setLoading(false);
      return;
    }
    const _auth = auth; // narrowed to Auth (not null) for use inside callbacks

    const unsubscribe = onAuthStateChanged(_auth, async (firebaseUser) => {
      if (!firebaseUser?.email) {
        setUser(null);
        setRole(null);
        setLoading(false);
        return;
      }

      try {
        const userRole = await getWhitelistRole(firebaseUser.email);
        if (!userRole) {
          // Authenticated with Firebase but not on the whitelist — sign them out
          await firebaseSignOut(_auth);
          setUser(null);
          setRole(null);
          setAuthError("This account is not approved for access.");
        } else {
          setUser(firebaseUser);
          setRole(userRole);
          setAuthError(null);
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
    if (!loading && !user && pathname !== "/login") {
      router.replace("/login");
    }
  }, [loading, user, pathname, router]);

  async function signOut() {
    setDevSession(false);
    if (auth) {
      await firebaseSignOut(auth);
    }
    setUser(null);
    setRole(null);
    router.replace("/login");
  }

  return (
    <AuthContext.Provider value={{ user, role, loading, authError, signOut, devSignIn: IS_DEV ? devSignIn : null }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
