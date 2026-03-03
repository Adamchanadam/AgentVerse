"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Panel } from "@/components/Panel";
import { RetroButton } from "@/components/RetroButton";
import { AsciiSpinner } from "@/components/AsciiSpinner";
import styles from "./login.module.css";

export default function LoginPage() {
  const {
    isAuthenticated,
    agentId,
    hasKeypair,
    login,
    bootstrapAgent,
    reAuth,
    logout,
    error,
    loading: authLoading,
  } = useAuth();
  const router = useRouter();

  const [secret, setSecret] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  // ── Loading state (initial auth check) ─────────────────────────────

  if (authLoading) {
    return (
      <div className={styles.container}>
        <Panel title="INITIALIZING" accentColor="cyan">
          <AsciiSpinner text="LOADING" />
        </Panel>
      </div>
    );
  }

  // ── State C: Authenticated ─────────────────────────────────────────

  if (isAuthenticated) {
    return (
      <div className={styles.container}>
        <Panel title="SESSION ACTIVE" accentColor="cyan">
          {agentId ? (
            <p className={styles.status}>
              {">"} AGENT: {agentId.slice(0, 8)}..._
            </p>
          ) : (
            <p className={styles.status}>{">"} ADMIN AUTHENTICATED_</p>
          )}
          <div className={styles.actions}>
            <RetroButton label="AGENTDEX" onClick={() => router.push("/agentdex")} />
            <RetroButton label="LOGOUT" variant="danger" onClick={logout} />
          </div>
        </Panel>
      </div>
    );
  }

  // ── State B: Has keypair, JWT expired → auto re-auth ───────────────

  if (hasKeypair) {
    const handleReAuth = async () => {
      setBootstrapLoading(true);
      try {
        await reAuth();
        router.push("/agentdex");
      } catch {
        // error shown by context
      } finally {
        setBootstrapLoading(false);
      }
    };

    return (
      <div className={styles.container}>
        <Panel title="AUTHENTICATING" accentColor="cyan">
          {bootstrapLoading ? (
            <AsciiSpinner text="AUTHENTICATING" />
          ) : error ? (
            <div>
              <p className={styles.error}>ERROR: {error}</p>
              <div className={styles.actions}>
                <RetroButton label="TRY AGAIN" onClick={handleReAuth} />
                <RetroButton
                  label="RESET IDENTITY"
                  variant="danger"
                  onClick={() => {
                    localStorage.removeItem("agentverse_keypair");
                    window.location.reload();
                  }}
                />
              </div>
            </div>
          ) : (
            <div>
              <p className={styles.status}>{">"} KEYPAIR FOUND. RE-AUTHENTICATING..._</p>
              <RetroButton label="AUTHENTICATE" onClick={handleReAuth} />
            </div>
          )}
        </Panel>
      </div>
    );
  }

  // ── State A: No keypair (first-time user) ──────────────────────────

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setBootstrapLoading(true);
    try {
      await bootstrapAgent(displayName || undefined);
      router.push("/agentdex");
    } catch {
      // error shown by context
    } finally {
      setBootstrapLoading(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    try {
      await login(secret);
      router.push("/agentdex");
    } catch {
      // error shown by context
    } finally {
      setLoginLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <Panel title="AGENT REGISTRATION" accentColor="cyan">
        <form onSubmit={handleBootstrap} className={styles.form}>
          <p className={styles.label}>{">"} GENERATE YOUR IDENTITY_</p>
          <p className={styles.warning}>YOUR PRIVATE KEY STAYS LOCAL. LOSE IT = LOSE ACCESS.</p>
          <label htmlFor="display-name" className={styles.label}>
            Display name:
          </label>
          <input
            id="display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={styles.input}
            placeholder="(optional)"
            disabled={bootstrapLoading}
            autoFocus
          />
          {error && <p className={styles.error}>ERROR: {error}</p>}
          <RetroButton
            label={bootstrapLoading ? "CREATING" : "CREATE MY AGENT"}
            type="submit"
            disabled={bootstrapLoading}
          />
        </form>

        <div className={styles.divider} />

        <button
          type="button"
          className={styles.collapsibleToggle}
          onClick={() => setShowAdmin(!showAdmin)}
          aria-expanded={showAdmin}
        >
          {">"} ADMIN ACCESS {showAdmin ? "[-]" : "[+]"}
        </button>

        {showAdmin && (
          <form onSubmit={handleAdminLogin} className={styles.form}>
            <label htmlFor="access-key" className={styles.label}>
              {">"} ENTER ACCESS KEY:
            </label>
            <input
              id="access-key"
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              className={styles.input}
              disabled={loginLoading}
            />
            <RetroButton
              label={loginLoading ? "VERIFYING" : "AUTHENTICATE"}
              type="submit"
              disabled={loginLoading}
            />
          </form>
        )}
      </Panel>
    </div>
  );
}
