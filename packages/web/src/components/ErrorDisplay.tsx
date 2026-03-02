import styles from "./ErrorDisplay.module.css";

interface ErrorDisplayProps {
  code?: string;
  message: string;
}

export function ErrorDisplay({ code = "0x000F", message }: ErrorDisplayProps) {
  return (
    <div className={styles.error} role="alert">
      FATAL ERROR: {code} — {(message ?? "UNKNOWN ERROR").toUpperCase()}
    </div>
  );
}
