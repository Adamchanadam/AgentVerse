import styles from "./RetroButton.module.css";

interface RetroButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "danger" | "ghost";
  label: string;
}

export function RetroButton({ variant = "primary", label, ...props }: RetroButtonProps) {
  return (
    <button className={`${styles.btn} ${styles[variant]}`} {...props}>
      {"[ "}
      {label}
      {" ]"}
    </button>
  );
}
