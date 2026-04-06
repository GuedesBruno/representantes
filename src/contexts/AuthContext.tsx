'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import {
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

interface AuthContextValue {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadUserClaims = useCallback(async (firebaseUser: User | null) => {
    if (!firebaseUser) {
      setIsAdmin(false);
      return;
    }

    const tokenResult = await firebaseUser.getIdTokenResult();
    setIsAdmin(Boolean(tokenResult.claims.admin));
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      try {
        await loadUserClaims(firebaseUser);
      } finally {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, [loadUserClaims]);

  const login = useCallback(async (email: string, password: string) => {
    const credential = await signInWithEmailAndPassword(auth, email, password);

    // Create server-side session
    const idToken = await credential.user.getIdToken();
    const response = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken,
        uid: credential.user.uid,
        email: credential.user.email,
        displayName: credential.user.displayName,
      }),
    });

    if (!response.ok) {
      throw { code: 'session/create-failed' };
    }

    await loadUserClaims(credential.user);
  }, [loadUserClaims]);

  const loginWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    const credential = await signInWithPopup(auth, provider);

    const idToken = await credential.user.getIdToken();
    const response = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken,
        uid: credential.user.uid,
        email: credential.user.email,
        displayName: credential.user.displayName,
      }),
    });

    if (!response.ok) {
      throw { code: 'session/create-failed' };
    }

    await loadUserClaims(credential.user);
  }, [loadUserClaims]);

  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(auth, email);
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
    await fetch('/api/auth/session', { method: 'DELETE' });
    setIsAdmin(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAdmin, loading, login, resetPassword, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
