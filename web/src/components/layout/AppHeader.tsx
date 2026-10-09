"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import styles from "./AppHeader.module.css";

const NAV = [
  { href: "/", label: "Check", short: "Check", match: (p: string) => p === "/" || p.startsWith("/result") },
  { href: "/records/", label: "Your records", short: "Your records", match: (p: string) => p.startsWith("/records") },
];

/** No login or account flow: the brand, two destinations and the business being protected. */
export function AppHeader() {
  const pathname = usePathname() || "/";
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand}>
          <span className={styles.mark} aria-hidden>
            <ShieldCheck size={22} />
          </span>
          <span className={styles.brandText}>
            <span className={styles.name}>Trust Engine</span>
            <span className={styles.tagline}>Before you pay or hand over goods</span>
          </span>
        </Link>
        <nav className={styles.nav} aria-label="Main">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link key={item.href} href={item.href} className={active ? styles.active : styles.link} aria-current={active ? "page" : undefined}>
                <span className={styles.long}>{item.label}</span>
                <span className={styles.short}>{item.short}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
