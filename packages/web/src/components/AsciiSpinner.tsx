"use client";
import { useState, useEffect } from "react";
import styles from "./AsciiSpinner.module.css";

const FRAMES = ["[ | ]", "[ / ]", "[ - ]", "[ \\ ]"];

export function AsciiSpinner({ text = "LOADING" }: { text?: string }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), 150);
    return () => clearInterval(id);
  }, []);
  return (
    <div className={styles.spinner} role="status" aria-label={`${text}...`}>
      <span className={styles.frames} aria-hidden="true">
        {FRAMES[frame]}
      </span>
      <span className={styles.text}>{text}...</span>
    </div>
  );
}
