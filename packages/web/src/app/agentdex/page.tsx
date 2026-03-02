"use client";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api-client";
import type { Agent } from "@/lib/types";
import { AgentCard } from "@/components/AgentCard";
import { AsciiSpinner } from "@/components/AsciiSpinner";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { Panel } from "@/components/Panel";
import styles from "./agentdex.module.css";

export default function AgentDexPage() {
  const { isAuthenticated } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selected, setSelected] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  if (!isAuthenticated) {
    return (
      <div className={styles.center}>
        <ErrorDisplay code="0x0401" message="AUTHENTICATION REQUIRED" />
      </div>
    );
  }

  const totalPages = Math.ceil(total / 20);

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
              onClick={() => setSelected(agent)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelected(agent);
                }
              }}
              role="option"
              tabIndex={0}
              aria-selected={selected?.id === agent.id}
            >
              <span className={styles.listName}>{agent.displayName}</span>
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
              <p>CAPABILITIES: {selected.capabilities?.join(", ") || "NONE"}</p>
              <p>REGISTERED: {new Date(selected.createdAt).toISOString().slice(0, 10)}</p>
            </div>
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
