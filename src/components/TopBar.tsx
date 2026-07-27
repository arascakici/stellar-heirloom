"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ConnectWallet } from "./ConnectWallet";
import styles from "./TopBar.module.css";

/**
 * A pane of smoked glass across the top. The wallet lives here — a persistent
 * identity you can see and step away from at any moment — rather than in the
 * middle of the page. The wood grain reads faintly through it.
 *
 * The mark is the way home; beside it, the record itself and the count drawn
 * from it. Usage gives way first on a narrow screen — it is the page you go
 * looking for, never the one you need mid-task.
 */
export function TopBar() {
  const path = usePathname();

  return (
    <header className={styles.bar}>
      <div className={styles.inner}>
        <Link href="/" className={styles.mark}>
          heirloom
        </Link>
        <nav className={styles.right}>
          <Link
            href="/usage"
            className={`${styles.link} ${styles.secondary}`}
            aria-current={path === "/usage" ? "page" : undefined}
          >
            Usage
          </Link>
          <Link
            href="/registry"
            className={styles.link}
            aria-current={path === "/registry" ? "page" : undefined}
          >
            Registry
          </Link>
          <ConnectWallet />
        </nav>
      </div>
    </header>
  );
}
