import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface UserProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'editor' | 'viewer';
  isActive: boolean;
  createdAt: string;
  name: string;
}

interface AuthContextType {
  currentUser: UserProfile | null;
  userProfile: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

function buildProfile(data: Omit<UserProfile, 'name'>): UserProfile {
  return { ...data, name: `${data.firstName} ${data.lastName}` };
}

// ── Context ───────────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  userProfile: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
  refreshUser: async () => {},
});

export const useAuth = () => useContext(AuthContext);

// ── Provider ──────────────────────────────────────────────────────────────────
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // All fetches use credentials: 'include' so the httpOnly cookie is sent automatically.
  // The frontend never reads or stores the JWT token.

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch { /* ignore network errors during logout */ }
    setCurrentUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (!res.ok) { await logout(); return; }
      const data = await res.json();
      setCurrentUser(buildProfile(data));
    } catch {
      await logout();
    }
  }, [logout]);

  // On mount: restore session from cookie (the server validates it)
  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(res => {
        if (!res.ok) throw new Error('No session');
        return res.json();
      })
      .then(data => setCurrentUser(buildProfile(data)))
      .catch(() => setCurrentUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include', // receive httpOnly Set-Cookie
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al iniciar sesión.');
    setCurrentUser(buildProfile(data.user));
  };

  return (
    <AuthContext.Provider value={{ currentUser, userProfile: currentUser, loading, login, logout, refreshUser }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
