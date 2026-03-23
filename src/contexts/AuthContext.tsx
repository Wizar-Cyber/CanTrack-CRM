import React, { createContext, useContext, useState, useEffect } from 'react';

interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: 'admin' | 'editor' | 'viewer';
  requiresPasswordChange: boolean;
  createdAt: string;
}

interface AuthContextType {
  currentUser: any | null;
  userProfile: UserProfile | null;
  loading: boolean;
  login: (e: string, p: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  userProfile: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('vsm_auth');
    if (stored) {
      const user = JSON.parse(stored);
      setCurrentUser({ uid: user.uid, email: user.email });
      setUserProfile(user);
    }
    setLoading(false);
  }, []);

  const login = async (email: string, pass: string) => {
    if (email === 'admin@vsm.com' && pass === 'admin123') {
      const user: UserProfile = {
        uid: '123',
        email: 'admin@vsm.com',
        name: 'Admin User',
        role: 'admin',
        requiresPasswordChange: false,
        createdAt: new Date().toISOString()
      };
      setCurrentUser({ uid: user.uid, email: user.email });
      setUserProfile(user);
      localStorage.setItem('vsm_auth', JSON.stringify(user));
    } else {
      throw new Error('Credenciales inválidas. Usa admin@vsm.com / admin123');
    }
  };

  const logout = async () => {
    setCurrentUser(null);
    setUserProfile(null);
    localStorage.removeItem('vsm_auth');
  };

  return (
    <AuthContext.Provider value={{ currentUser, userProfile, loading, login, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
