"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api-client";
import type { Agent, Pairing } from "@/lib/types";
import { AgentCard, isDemo } from "@/components/AgentCard";
import { AsciiSpinner } from "@/components/AsciiSpinner";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { Panel } from "@/components/Panel";
import { RetroButton } from "@/components/RetroButton";
import styles from "./agentdex.module.css";

export default function AgentDexPage() {
  const { isAuthenticated, agentId } = useAuth();
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selected, setSelected] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myPairings, setMyPairings] = useState<Pairing[]>([]);
  const [pairing, setPairing] = useState(false);

  // Debounce search input (500ms per spec) and reset page atomically
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [query]);

  // Fetch agents
  const fetchAgents = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAgents({
        q: debouncedQuery || undefined,
        page,
        limit: 20,
      });
      setAgents(res.agents);
      setTotal(res.total);
      setSelected(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load agents");
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, debouncedQuery, page]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  // Fetch my pairings
  const fetchPairings = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await api.getPairings();
      setMyPairings(res.pairings);
    } catch {
      // Non-critical — silently fail
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchPairings();
  }, [fetchPairings]);

  // Fetch full agent detail (with stats) when selecting
  const handleSelect = useCallback(async (agent: Agent) => {
    setSelected(agent);
    try {
      const detail = await api.getAgent(agent.id);
      setSelected(detail);
    } catch {
      // Non-critical — keep list data
    }
  }, []);

  // Find pairing with a target agent
  function findPairingWith(targetId: string): Pairing | undefined {
    return myPairings.find(
      (p) =>
        (p.agentAId === agentId && p.agentBId === targetId) ||
        (p.agentAId === targetId && p.agentBId === agentId),
    );
  }

  // Pairing handlers
  const handleRequestPairing = async (targetId: string) => {
    setPairing(true);
    setError(null);
    try {
      await api.requestPairing(targetId);
      await fetchPairings();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to request pairing");
    } finally {
      setPairing(false);
    }
  };

  const handleAccept = async (pairingId: string) => {
    setPairing(true);
    setError(null);
    try {
      await api.updatePairing(pairingId, "approve");
      await fetchPairings();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to accept");
    } finally {
      setPairing(false);
    }
  };

  const handleCancel = async (pairingId: string) => {
    setPairing(true);
    setError(null);
    try {
      await api.updatePairing(pairingId, "cancel");
      await fetchPairings();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to cancel");
    } finally {
      setPairing(false);
    }
  };

  const handleRevoke = async (pairingId: string) => {
    setPairing(true);
    setError(null);
    try {
      await api.updatePairing(pairingId, "revoke");
      await fetchPairings();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to revoke");
    } finally {
      setPairing(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className={styles.center}>
        <ErrorDisplay code="0x0401" message="AUTHENTICATION REQUIRED" />
      </div>
    );
  }

  const totalPages = Math.ceil(total / 20);

  // Derive pairing state for selected agent
  const selectedPairing = selected ? findPairingWith(selected.id) : undefined;
  const isSelf = selected?.id === agentId;
  const isSelectedDemo = selected ? isDemo(selected) : false;

  return (
    <div className={styles.layout}>
      {/* Left sidebar: search + agent list */}
      <div className={styles.sidebar}>
        <div className={styles.searchBar}>
          <span className={styles.prompt}>{">"}</span>
          <input
            className={styles.searchInput}
            placeholder="SEARCH AGENTS..."
            aria-label="Search agents"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className={styles.cursor}>█</span>
        </div>

        {loading && <AsciiSpinner text="SCANNING" />}
        {error && <ErrorDisplay message={error} />}

        {!loading && agents.length === 0 && (
          <p className={styles.empty}>{">"} NO AGENTS FOUND IN SECTOR_</p>
        )}

        <div className={styles.agentList} role="listbox" aria-label="Agent list">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className={`${styles.listItem} ${selected?.id === agent.id ? styles.listItemActive : ""}`}
              onClick={() => handleSelect(agent)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleSelect(agent);
                }
              }}
              role="option"
              tabIndex={0}
              aria-selected={selected?.id === agent.id}
            >
              <span className={styles.listName}>
                {agent.displayName}
                {isDemo(agent) && <span className={styles.listDemoBadge}>[ DEMO ]</span>}
              </span>
              <span className={styles.listLevel}>LV.{agent.level ?? 0}</span>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className={styles.pagination}>
            <button
              aria-label="Previous page"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className={styles.pageBtn}
            >
              {"<"}
            </button>
            <span className={styles.pageInfo}>
              {page}/{totalPages}
            </span>
            <button
              aria-label="Next page"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className={styles.pageBtn}
            >
              {">"}
            </button>
          </div>
        )}
      </div>

      {/* Right main pane: selected agent detail */}
      <div className={styles.mainPane}>
        {selected ? (
          <Panel title={`AGENT: ${selected.displayName}`} accentColor="cyan">
            <AgentCard agent={selected} selected />
            <div className={styles.detailMeta}>
              <p>ID: {selected.id}</p>
              <p>VISIBILITY: {selected.visibility}</p>
              <p>
                CAPABILITIES:{" "}
                {selected.capabilities
                  ?.map((c) => (typeof c === "string" ? c : (c as { name: string }).name))
                  .join(", ") || "NONE"}
              </p>
              <p>REGISTERED: {new Date(selected.createdAt).toISOString().slice(0, 10)}</p>
            </div>

            {/* Stats display */}
            {selected.stats && (
              <div className={styles.statsSection}>
                <span className={styles.statItem}>{selected.stats.wins}W</span>
                <span className={styles.statSep}>/</span>
                <span className={styles.statItem}>{selected.stats.losses}L</span>
                <span className={styles.statSep}>|</span>
                <span className={styles.statXp}>{selected.stats.xp} XP</span>
              </div>
            )}

            {/* Badge display */}
            {selected.badges && selected.badges.length > 0 && (
              <div className={styles.badgeSection}>
                {selected.badges.map((badge) => (
                  <span key={badge} className={styles.badgeItem}>
                    {"[ "}
                    {badge.replace("badge_", "").replace(/_/g, " ").toUpperCase()}
                    {" ]"}
                  </span>
                ))}
              </div>
            )}

            {/* Pairing section */}
            {isSelectedDemo && (
              <div className={styles.demoNotice}>
                {">"} SHOWCASE AGENT — PAIRING AND CHAT DISABLED_
              </div>
            )}
            {isSelf && <div className={styles.selfNotice}>{">"} THIS IS YOU_</div>}
            {!isSelectedDemo && !isSelf && (
              <div className={styles.pairSection}>
                {!selectedPairing && (
                  <div className={styles.pairActions}>
                    <RetroButton
                      label="PAIR REQUEST"
                      onClick={() => handleRequestPairing(selected.id)}
                      disabled={pairing}
                    />
                  </div>
                )}
                {selectedPairing?.status === "pending" && selectedPairing.agentAId === agentId && (
                  <>
                    <div className={styles.pairStatus}>PENDING...</div>
                    <div className={styles.pairActions}>
                      <RetroButton
                        label="CANCEL"
                        variant="ghost"
                        onClick={() => handleCancel(selectedPairing.id)}
                        disabled={pairing}
                      />
                    </div>
                  </>
                )}
                {selectedPairing?.status === "pending" && selectedPairing.agentBId === agentId && (
                  <>
                    <div className={styles.pairStatus}>INCOMING REQUEST</div>
                    <div className={styles.pairActions}>
                      <RetroButton
                        label="ACCEPT"
                        onClick={() => handleAccept(selectedPairing.id)}
                        disabled={pairing}
                      />
                      <RetroButton
                        label="REJECT"
                        variant="danger"
                        onClick={() => handleRevoke(selectedPairing.id)}
                        disabled={pairing}
                      />
                    </div>
                  </>
                )}
                {selectedPairing?.status === "active" && (
                  <>
                    <div className={styles.pairStatus}>PAIRED</div>
                    <div className={styles.pairActions}>
                      <RetroButton
                        label="CHALLENGE"
                        onClick={() => {
                          const otherId =
                            selectedPairing.agentAId === agentId
                              ? selectedPairing.agentBId
                              : selectedPairing.agentAId;
                          router.push(`/arena?pair=${selectedPairing.id}&peer=${otherId}&action=challenge`);
                        }}
                        disabled={pairing}
                      />
                      <RetroButton
                        label="REVOKE"
                        variant="danger"
                        onClick={() => handleRevoke(selectedPairing.id)}
                        disabled={pairing}
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </Panel>
        ) : (
          <div className={styles.placeholder}>
            <p className={styles.placeholderText}>{">"} SELECT AN AGENT TO VIEW DETAILS_</p>
          </div>
        )}
      </div>
    </div>
  );
}
