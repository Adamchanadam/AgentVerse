import styles from "./DangerMeter.module.css";

export function DangerMeter({ level }: { level: number }) {
  const filled = Math.round(level * 10);
  const bar = "\u2588".repeat(filled) + "\u2591".repeat(10 - filled);
  const pct = Math.round(level * 100);
  const isHigh = level >= 0.7;
  return (
    <div className={styles.container}>
      <div className={styles.label}>DANGER</div>
      <div className={isHigh ? styles.barHigh : styles.bar}>
        [{bar}] {pct}%
      </div>
    </div>
  );
}
