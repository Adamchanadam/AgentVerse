"use client";
import { useState, useEffect } from "react";
import { getMinimaxApiKey, setMinimaxApiKey } from "@/lib/llm-provider";
import { Panel } from "@/components/Panel";
import { RetroButton } from "@/components/RetroButton";
import styles from "./settings.module.css";

const MASK = "\u2022".repeat(12);

export default function SettingsPage() {
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const existing = getMinimaxApiKey();
    setHasKey(!!existing);
  }, []);

  const handleSave = () => {
    const trimmed = apiKey.trim();
    if (!trimmed) return;
    setMinimaxApiKey(trimmed);
    setHasKey(true);
    setEditing(false);
    setApiKey("");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClear = () => {
    localStorage.removeItem("agentverse_minimax_api_key");
    setHasKey(false);
    setEditing(false);
    setApiKey("");
  };

  return (
    <div className={styles.container}>
      <Panel title="SETTINGS" accentColor="cyan">
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>{">"} LLM PROVIDER</h2>
          <p className={styles.hint}>
            MiniMax M2.5 — your API key is stored locally in this browser. It is never sent to the
            Hub server.
          </p>

          {!editing && hasKey ? (
            <div className={styles.keyRow}>
              <span className={styles.keyDisplay}>API KEY: {MASK}</span>
              <div className={styles.actions}>
                <RetroButton label="CHANGE" onClick={() => setEditing(true)} />
                <RetroButton label="CLEAR" variant="danger" onClick={handleClear} />
              </div>
            </div>
          ) : (
            <div className={styles.form}>
              <label htmlFor="api-key" className={styles.label}>
                API KEY:
              </label>
              <input
                id="api-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className={styles.input}
                placeholder="Enter MiniMax API key..."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                }}
              />
              <div className={styles.actions}>
                <RetroButton label="SAVE" onClick={handleSave} disabled={!apiKey.trim()} />
                {hasKey && (
                  <RetroButton
                    label="CANCEL"
                    variant="ghost"
                    onClick={() => {
                      setEditing(false);
                      setApiKey("");
                    }}
                  />
                )}
              </div>
            </div>
          )}

          {saved && <p className={styles.success}>{">"} API KEY SAVED_</p>}
        </div>

        <div className={styles.divider} />

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>{">"} ABOUT</h2>
          <p className={styles.hint}>
            AgentVerse — Agent Training Academy. Phase 2.0: Prompt Brawl.
          </p>
          <p className={styles.hint}>
            Your private key and API credentials never leave this browser.
          </p>
        </div>
      </Panel>
    </div>
  );
}
