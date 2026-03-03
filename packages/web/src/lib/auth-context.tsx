"use client";
import { createContext, useContext, useState, useCallback, useEffect } from "react";
import type { ReactNode } from "react";
import { api } from "./api-client";
import { generateKeypair, loadKeypair, signNonce, isJwtExpired } from "./crypto";

interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  agentId: string | null;
  pubkey: string | null;
  hasKeypair: boolean;
  login: (secret: string) => Promise<void>;
  bootstrapAgent: (displayName?: string, personaTags?: string[]) => Promise<void>;
  reAuth: () => Promise<void>;
  logout: () => void;
  error: string | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [hasKeypair, setHasKeypair] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ── Perform PoP auth (shared by bootstrapAgent and reAuth) ───────────

  const performPoP = useCallback(
    async (
      kp: { privateKey: string; publicKey: string },
      displayName?: string,
      personaTags?: string[],
    ) => {
      const { nonce } = await api.getNonce();
      const signature = signNonce(nonce, kp.privateKey);
      const res = await api.bootstrap({
        pubkey: kp.publicKey,
        signature,
        nonce,
        display_name: displayName,
        persona_tags: personaTags,
      });
      localStorage.setItem("agentverse_token", res.jwt);
      setToken(res.jwt);
      setAgentId(res.agent_id);
      setPubkey(kp.publicKey);
    },
    [],
  );

  // ── Mount: check keypair + token state ───────────────────────────────

  useEffect(() => {
    const init = async () => {
      const kp = loadKeypair();
      setHasKeypair(!!kp);

      const stored = localStorage.getItem("agentverse_token");
      if (stored && !isJwtExpired(stored)) {
        // Token still valid — decode agentId from payload
        try {
          const payload = JSON.parse(atob(stored.split(".")[1])) as {
            sub?: string;
            pubkey?: string;
            scope?: string;
          };
          setToken(stored);
          if (payload.scope === "agent") {
            setAgentId(payload.sub ?? null);
            setPubkey(payload.pubkey ?? null);
          }
        } catch {
          // Malformed token — clear
          localStorage.removeItem("agentverse_token");
        }
      } else if (kp && (!stored || isJwtExpired(stored))) {
        // Keypair exists but token expired/missing — silent re-auth
        try {
          await performPoP(kp);
        } catch {
          // Silent failure — user will see login page
        }
      }
      setLoading(false);
    };
    void init();
  }, [performPoP]);

  // ── Admin login (existing flow) ──────────────────────────────────────

  const login = useCallback(async (secret: string) => {
    setError(null);
    try {
      const { token: newToken } = await api.login(secret);
      localStorage.setItem("agentverse_token", newToken);
      setToken(newToken);
      setAgentId(null);
      setPubkey(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
      throw e;
    }
  }, []);

  // ── PoP bootstrap (new agent or returning) ───────────────────────────

  const bootstrapAgent = useCallback(
    async (displayName?: string, personaTags?: string[]) => {
      setError(null);
      try {
        let kp = loadKeypair();
        if (!kp) {
          kp = generateKeypair();
          setHasKeypair(true);
        }
        await performPoP(kp, displayName, personaTags);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Bootstrap failed");
        throw e;
      }
    },
    [performPoP],
  );

  // ── Silent re-auth (keypair must exist) ──────────────────────────────

  const reAuth = useCallback(async () => {
    setError(null);
    const kp = loadKeypair();
    if (!kp) {
      setError("No keypair found");
      return;
    }
    try {
      await performPoP(kp);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Re-authentication failed");
      throw e;
    }
  }, [performPoP]);

  // ── Logout (clear JWT only, keep keypair) ────────────────────────────

  const logout = useCallback(() => {
    localStorage.removeItem("agentverse_token");
    setToken(null);
    setAgentId(null);
    setPubkey(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        token,
        isAuthenticated: !!token,
        agentId,
        pubkey,
        hasKeypair,
        login,
        bootstrapAgent,
        reAuth,
        logout,
        error,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
