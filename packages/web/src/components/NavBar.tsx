"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import styles from "./NavBar.module.css";

const NAV_ITEMS = [
  { href: "/agentdex", label: "AGENTDEX" },
  { href: "/pairings", label: "PAIRINGS" },
] as const;

export function NavBar() {
  const pathname = usePathname();
  const { isAuthenticated, agentId } = useAuth();

  return (
    <nav className={styles.nav} aria-label="Main navigation">
      <Link href="/" className={styles.brand}>
        AGENTVERSE
      </Link>
      <div className={styles.links}>
        {NAV_ITEMS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`${styles.link} ${pathname.startsWith(href) ? styles.active : ""}`}
            aria-current={pathname.startsWith(href) ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </div>
      <div className={styles.spacer} />
      {isAuthenticated && agentId ? (
        <span className={styles.agentBadge}>{agentId.slice(0, 8)}</span>
      ) : null}
      <Link href="/login" className={styles.link}>
        AUTH
      </Link>
    </nav>
  );
}
