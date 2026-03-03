"use client";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api-client";
import type { Pairing } from "@/lib/types";
import { PairingCard } from "@/components/PairingCard";
import { AsciiSpinner } from "@/components/AsciiSpinner";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import styles from "./pairings.module.css";

export default function PairingsPage() {
  const { isAuthenticated, agentId } = useAuth();
  const [pairings, setPairings] = useState<Pairing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mutatingIds, setMutatingIds] = useState<Set<string>>(new Set());
  const [nameMap, setNameMap] = useState<Map<string, string>>(new Map());

  const fetchPairings = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getPairings();
      setPairings(res.pairings);

      // Resolve counterpart names
      const counterpartIds = new Set<string>();
      for (const p of res.pairings) {
        const other = p.agentAId === agentId ? p.agentBId : p.agentAId;
        counterpartIds.add(other);
      }
      const entries = await Promise.all(
        [...counterpartIds].map(async (id) => {
          try {
            const agent = await api.getAgent(id);
            return [id, agent.displayName] as const;
          } catch {
            return [id, id.slice(0, 8)] as const;
          }
        }),
      );
      setNameMap(new Map(entries));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load pairings");
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, agentId]);

  useEffect(() => {
    fetchPairings();
  }, [fetchPairings]);

  const withMutationGuard = (id: string, fn: () => Promise<void>) => async () => {
    setError(null);
    setMutatingIds((prev) => new Set(prev).add(id));
    try {
      await fn();
      await fetchPairings();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Operation failed");
    } finally {
      setMutatingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  if (!isAuthenticated) {
    return (
      <div className={styles.center}>
        <ErrorDisplay code="0x0401" message="AUTHENTICATION REQUIRED" />
      </div>
    );
  }

  // Categorize pairings
  const incoming = pairings.filter((p) => p.status === "pending" && p.agentBId === agentId);
  const outgoing = pairings.filter((p) => p.status === "pending" && p.agentAId === agentId);
  const active = pairings.filter((p) => p.status === "active");

  const getCounterpartName = (p: Pairing) => {
    const otherId = p.agentAId === agentId ? p.agentBId : p.agentAId;
    return nameMap.get(otherId) ?? otherId.slice(0, 8);
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>PAIRING MANAGEMENT</h1>
      </div>

      {error && <ErrorDisplay message={error} />}
      {loading && <AsciiSpinner text="LOADING PAIRINGS" />}

      {/* Incoming requests */}
      <div className={`${styles.sectionTitle} ${styles.incomingTitle}`}>
        {">"} INCOMING REQUESTS ({incoming.length})
      </div>
      {incoming.length === 0 ? (
        <p className={styles.emptySection}>NO INCOMING REQUESTS_</p>
      ) : (
        <div className={styles.grid} role="list" aria-label="Incoming pairings">
          {incoming.map((p) => (
            <PairingCard
              key={p.id}
              pairing={p}
              counterpartName={getCounterpartName(p)}
              onApprove={withMutationGuard(p.id, () =>
                api.updatePairing(p.id, "approve").then(() => {}),
              )}
              onRevoke={withMutationGuard(p.id, () =>
                api.updatePairing(p.id, "revoke").then(() => {}),
              )}
              disabled={mutatingIds.has(p.id)}
            />
          ))}
        </div>
      )}

      {/* Outgoing requests */}
      <div className={`${styles.sectionTitle} ${styles.outgoingTitle}`}>
        {">"} OUTGOING REQUESTS ({outgoing.length})
      </div>
      {outgoing.length === 0 ? (
        <p className={styles.emptySection}>NO OUTGOING REQUESTS_</p>
      ) : (
        <div className={styles.grid} role="list" aria-label="Outgoing pairings">
          {outgoing.map((p) => (
            <PairingCard
              key={p.id}
              pairing={p}
              counterpartName={getCounterpartName(p)}
              onCancel={withMutationGuard(p.id, () =>
                api.updatePairing(p.id, "cancel").then(() => {}),
              )}
              disabled={mutatingIds.has(p.id)}
            />
          ))}
        </div>
      )}

      {/* Active pairings */}
      <div className={`${styles.sectionTitle} ${styles.activeTitle}`}>
        {">"} ACTIVE PAIRINGS ({active.length})
      </div>
      {active.length === 0 ? (
        <p className={styles.emptySection}>NO ACTIVE PAIRINGS_</p>
      ) : (
        <div className={styles.grid} role="list" aria-label="Active pairings">
          {active.map((p) => (
            <PairingCard
              key={p.id}
              pairing={p}
              counterpartName={getCounterpartName(p)}
              onRevoke={withMutationGuard(p.id, () =>
                api.updatePairing(p.id, "revoke").then(() => {}),
              )}
              disabled={mutatingIds.has(p.id)}
            />
          ))}
        </div>
      )}

      {!loading && pairings.length === 0 && (
        <p className={styles.emptySection}>{">"} NO PAIRINGS IN SECTOR_</p>
      )}
    </div>
  );
}
