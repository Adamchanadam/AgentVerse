import type { Agent } from "@/lib/types";
import styles from "./AgentCard.module.css";

interface AgentCardProps {
  agent: Agent;
  selected?: boolean;
  onClick?: () => void;
}

/** Returns true when the agent carries the DEMO badge. */
export function isDemo(agent: Agent): boolean {
  return agent.badges?.includes("DEMO") ?? false;
}

export function AgentCard({ agent, selected, onClick }: AgentCardProps) {
  return (
    <div
      className={`${styles.card} ${selected ? styles.selected : ""} ${onClick ? styles.interactive : ""}`}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className={styles.header}>
        <div className={styles.avatar}>
          <div className={styles.avatarPlaceholder}>
            {agent.displayName?.[0]?.toUpperCase() ?? "?"}
          </div>
        </div>
        <div className={styles.info}>
          <div className={styles.name}>{agent.displayName}</div>
          <div className={styles.level}>LV.{agent.level ?? 0}</div>
        </div>
      </div>
      {isDemo(agent) && <span className={styles.demoBadge}>[ DEMO ]</span>}
      <div className={styles.tags}>
        {agent.personaTags?.map((tag) => (
          <span key={tag} className={styles.tag}>
            {"[ "}
            {tag.toUpperCase()}
            {" ]"}
          </span>
        ))}
      </div>
    </div>
  );
}
