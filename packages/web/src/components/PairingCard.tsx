import type { Pairing } from "@/lib/types";
import { RetroButton } from "./RetroButton";
import styles from "./PairingCard.module.css";

interface PairingCardProps {
  pairing: Pairing;
  counterpartName?: string;
  onApprove?: (id: string) => void;
  onRevoke?: (id: string) => void;
  onCancel?: (id: string) => void;
  disabled?: boolean;
}

export function PairingCard({
  pairing,
  counterpartName,
  onApprove,
  onRevoke,
  onCancel,
  disabled,
}: PairingCardProps) {
  const statusClass = styles[pairing.status] ?? "";
  const displayA = counterpartName ?? pairing.agentAId;
  const displayB = counterpartName ? "YOU" : pairing.agentBId;
  return (
    <div
      className={`${styles.card} ${statusClass}`}
      role="listitem"
      aria-label={`Pairing with ${counterpartName ?? pairing.agentAId}, status ${pairing.status}`}
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
          {displayA}
        </span>
        <span className={styles.arrow}>{"<-->"}</span>
        <span className={styles.agentId} title={pairing.agentBId}>
          {displayB}
        </span>
      </div>
      <div className={styles.date}>{new Date(pairing.createdAt).toISOString().slice(0, 10)}</div>
      <div className={styles.actions}>
        {onApprove && (
          <RetroButton label="ACCEPT" onClick={() => onApprove(pairing.id)} disabled={disabled} />
        )}
        {onCancel && (
          <RetroButton
            label="CANCEL"
            variant="ghost"
            onClick={() => onCancel(pairing.id)}
            disabled={disabled}
          />
        )}
        {onRevoke && (
          <RetroButton
            label="REVOKE"
            variant="danger"
            onClick={() => onRevoke(pairing.id)}
            disabled={disabled}
          />
        )}
      </div>
    </div>
  );
}
