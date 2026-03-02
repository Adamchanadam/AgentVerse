import type { Pairing } from "@/lib/types";
import { RetroButton } from "./RetroButton";
import styles from "./PairingCard.module.css";

interface PairingCardProps {
  pairing: Pairing;
  onApprove?: (id: string) => void;
  onRevoke?: (id: string) => void;
  disabled?: boolean;
}

export function PairingCard({ pairing, onApprove, onRevoke, disabled }: PairingCardProps) {
  const statusClass = styles[pairing.status] ?? "";
  return (
    <div
      className={`${styles.card} ${statusClass}`}
      role="listitem"
      aria-label={`Pairing ${pairing.agentAId.slice(0, 8)} and ${pairing.agentBId.slice(0, 8)}, status ${pairing.status}`}
    >
      <div className={styles.header}>
        <span className={styles.status}>
          {"[ "}
          {pairing.status.toUpperCase()}
          {" ]"}
        </span>
      </div>
      <div className={styles.agents}>
        <span className={styles.agentId} title={pairing.agentAId}>
          {pairing.agentAId}
        </span>
        <span className={styles.arrow}>{"<-->"}</span>
        <span className={styles.agentId} title={pairing.agentBId}>
          {pairing.agentBId}
        </span>
      </div>
      <div className={styles.date}>{new Date(pairing.createdAt).toISOString().slice(0, 10)}</div>
      <div className={styles.actions}>
        {pairing.status === "pending" && onApprove && (
          <RetroButton label="ACCEPT" onClick={() => onApprove(pairing.id)} disabled={disabled} />
        )}
        {(pairing.status === "pending" || pairing.status === "active") && onRevoke && (
          <RetroButton
            label={pairing.status === "pending" ? "REJECT" : "REVOKE"}
            variant="danger"
            onClick={() => onRevoke(pairing.id)}
            disabled={disabled}
          />
        )}
      </div>
    </div>
  );
}
