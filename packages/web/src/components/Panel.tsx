import styles from "./Panel.module.css";

interface PanelProps {
  title?: string;
  children: React.ReactNode;
  accentColor?: "cyan" | "magenta" | "yellow" | "white";
  className?: string;
}

export function Panel({ title, children, accentColor = "white", className }: PanelProps) {
  return (
    <div className={`${styles.panel} ${styles[accentColor]} ${className ?? ""}`}>
      {title && <div className={styles.titleBar}>{title}</div>}
      <div className={styles.content}>{children}</div>
    </div>
  );
}
