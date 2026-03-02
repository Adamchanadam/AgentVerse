"use client";
import { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { ReactNode } from "react";
import { api } from "./api-client";

interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  login: (secret: string) => Promise<void>;
  logout: () => void;
  error: string | null;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("agentverse_token");
    if (stored) setToken(stored);
  }, []);

  const login = useCallback(async (secret: string) => {
    setError(null);
    try {
      const { token: newToken } = await api.login(secret);
      localStorage.setItem("agentverse_token", newToken);
      setToken(newToken);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
      throw e;
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("agentverse_token");
    setToken(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, isAuthenticated: !!token, login, logout, error }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
