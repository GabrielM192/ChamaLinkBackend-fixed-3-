import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { login as loginRequest, type LoginPayload, type AuthResponse } from '../api/auth';

interface StoredUser {
  userId: string;
  fullName: string;
  email: string;
}

interface AuthContextValue {
  user: StoredUser | null;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readStoredUser(): StoredUser | null {
  const raw = localStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<StoredUser | null>(readStoredUser);

  const login = useCallback(async (payload: LoginPayload) => {
    const response: AuthResponse = await loginRequest(payload);
    const storedUser: StoredUser = {
      userId: response.userId,
      fullName: response.fullName,
      email: response.email,
    };
    localStorage.setItem('token', response.token);
    localStorage.setItem('user', JSON.stringify(storedUser));
    setUser(storedUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
