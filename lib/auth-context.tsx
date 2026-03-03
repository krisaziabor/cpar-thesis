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

interface AuthContextValue {
  user: User | null;
  role: UserRole | null;
  loading: boolean;
  authError: string | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  role: null,
  loading: true,
  authError: null,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Subscribe to Firebase auth state once and check Firestore whitelist
  useEffect(() => {
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
    if (auth) {
      await firebaseSignOut(auth);
      router.replace("/login");
    }
  }

  return (
    <AuthContext.Provider value={{ user, role, loading, authError, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
