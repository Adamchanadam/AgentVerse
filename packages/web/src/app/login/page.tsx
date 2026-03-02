"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Panel } from "@/components/Panel";
import { RetroButton } from "@/components/RetroButton";
import styles from "./login.module.css";

export default function LoginPage() {
  const { login, isAuthenticated, logout, error } = useAuth();
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) {
    return (
      <div className={styles.container}>
        <Panel title="SESSION ACTIVE" accentColor="cyan">
          <p className={styles.status}>{">"} AUTHENTICATED_</p>
          <div className={styles.actions}>
            <RetroButton label="AGENTDEX" onClick={() => router.push("/agentdex")} />
            <RetroButton label="LOGOUT" variant="danger" onClick={logout} />
          </div>
        </Panel>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(secret);
      router.push("/agentdex");
    } catch {
      // error is set by auth context
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <Panel title="AUTHENTICATION REQUIRED" accentColor="magenta">
        <form onSubmit={handleSubmit} className={styles.form}>
          <label htmlFor="access-key" className={styles.label}>
            {">"} ENTER ACCESS KEY:
          </label>
          <input
            id="access-key"
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className={styles.input}
            autoFocus
            disabled={loading}
          />
          {error && <p className={styles.error}>ERROR: {error}</p>}
          <RetroButton
            label={loading ? "VERIFYING" : "AUTHENTICATE"}
            type="submit"
            disabled={loading}
          />
        </form>
      </Panel>
    </div>
  );
}
