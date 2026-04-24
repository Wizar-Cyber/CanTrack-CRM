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
  // Computed convenience getter
  name: string;
}

interface AuthContextType {
  currentUser: UserProfile | null;
  userProfile: UserProfile | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

// ── Storage helpers ───────────────────────────────────────────────────────────
const TOKEN_KEY = 'cantrack_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function storeToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function buildProfile(data: any): UserProfile {
  return {
    id: data.id,
    email: data.email,
    firstName: data.firstName,
    lastName: data.lastName,
    role: data.role,
    isActive: data.isActive,
    createdAt: data.createdAt,
    name: `${data.firstName} ${data.lastName}`,
  };
}

// ── Context ───────────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  userProfile: null,
  token: null,
  loading: true,
  login: async () => {},
  logout: () => {},
  refreshUser: async () => {},
});

export const useAuth = () => useContext(AuthContext);

// ── Provider ──────────────────────────────────────────────────────────────────
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    clearToken();
    setToken(null);
    setCurrentUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const storedToken = getStoredToken();
    if (!storedToken) return;
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${storedToken}` },
      });
      if (!res.ok) {
        logout();
        return;
      }
      const data = await res.json();
      setCurrentUser(buildProfile(data));
    } catch {
      logout();
    }
  }, [logout]);

  // On mount: try to restore session from stored token
  useEffect(() => {
    const storedToken = getStoredToken();
    if (!storedToken) {
      setLoading(false);
      return;
    }
    setToken(storedToken);
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${storedToken}` } })
      .then(res => {
        if (!res.ok) throw new Error('Token invalid');
        return res.json();
      })
      .then(data => setCurrentUser(buildProfile(data)))
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Login failed.');
    }

    storeToken(data.token);
    setToken(data.token);
    setCurrentUser(buildProfile(data.user));
  };

  return (
    <AuthContext.Provider value={{ currentUser, userProfile: currentUser, token, loading, login, logout, refreshUser }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
