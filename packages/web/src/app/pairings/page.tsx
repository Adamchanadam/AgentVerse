"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api-client";
import type { Pairing } from "@/lib/types";
import { PairingCard } from "@/components/PairingCard";
import { Panel } from "@/components/Panel";
import { RetroButton } from "@/components/RetroButton";
import { AsciiSpinner } from "@/components/AsciiSpinner";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import styles from "./pairings.module.css";

export default function PairingsPage() {
  const { isAuthenticated } = useAuth();
  const [pairings, setPairings] = useState<Pairing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newAgentA, setNewAgentA] = useState("");
  const [newAgentB, setNewAgentB] = useState("");
  const [mutatingIds, setMutatingIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const dialogFirstInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus first input when dialog opens
  useEffect(() => {
    if (showNewDialog) {
      dialogFirstInputRef.current?.focus();
    }
  }, [showNewDialog]);

  const fetchPairings = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getPairings();
      setPairings(res.pairings);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load pairings");
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchPairings();
  }, [fetchPairings]);

  const handleApprove = async (id: string) => {
    setError(null);
    setMutatingIds((prev) => new Set(prev).add(id));
    try {
      await api.updatePairing(id, "approve");
      await fetchPairings();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to approve");
    } finally {
      setMutatingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleRevoke = async (id: string) => {
    setError(null);
    setMutatingIds((prev) => new Set(prev).add(id));
    try {
      await api.updatePairing(id, "revoke");
      await fetchPairings();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to revoke");
    } finally {
      setMutatingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleCreate = async () => {
    const a = newAgentA.trim();
    const b = newAgentB.trim();
    if (!a || !b) return;
    setError(null);
    setSubmitting(true);
    try {
      await api.createPairing(a, b);
      setShowNewDialog(false);
      setNewAgentA("");
      setNewAgentB("");
      await fetchPairings();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to create pairing");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className={styles.center}>
        <ErrorDisplay code="0x0401" message="AUTHENTICATION REQUIRED" />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>PAIRING MANAGEMENT</h1>
        <RetroButton label="NEW PAIRING" onClick={() => setShowNewDialog(true)} />
      </div>

      {error && <ErrorDisplay message={error} />}
      {loading && <AsciiSpinner text="LOADING PAIRINGS" />}

      {/* New pairing dialog */}
      {showNewDialog && (
        <Panel title="> INITIATING HANDSHAKE..." accentColor="yellow">
          <div
            className={styles.dialogForm}
            onKeyDown={(e) => {
              if (e.key === "Escape") setShowNewDialog(false);
            }}
          >
            <label htmlFor="agent-a-id" className={styles.dialogLabel}>
              AGENT A ID:
            </label>
            <input
              ref={dialogFirstInputRef}
              id="agent-a-id"
              className={styles.dialogInput}
              value={newAgentA}
              onChange={(e) => setNewAgentA(e.target.value)}
              disabled={submitting}
              autoComplete="off"
            />
            <label htmlFor="agent-b-id" className={styles.dialogLabel}>
              AGENT B ID:
            </label>
            <input
              id="agent-b-id"
              className={styles.dialogInput}
              value={newAgentB}
              onChange={(e) => setNewAgentB(e.target.value)}
              disabled={submitting}
              autoComplete="off"
            />
            <div className={styles.dialogActions}>
              <RetroButton label="SUBMIT" onClick={handleCreate} disabled={submitting} />
              <RetroButton
                label="CANCEL"
                variant="ghost"
                onClick={() => setShowNewDialog(false)}
                disabled={submitting}
              />
            </div>
          </div>
        </Panel>
      )}

      {/* Pairing list */}
      <div className={styles.grid} role="list" aria-label="Pairings">
        {pairings.map((p) => (
          <PairingCard
            key={p.id}
            pairing={p}
            onApprove={handleApprove}
            onRevoke={handleRevoke}
            disabled={mutatingIds.has(p.id)}
          />
        ))}
        {!loading && pairings.length === 0 && (
          <p className={styles.empty}>{">"} NO ACTIVE PAIRINGS IN SECTOR_</p>
        )}
      </div>
    </div>
  );
}
