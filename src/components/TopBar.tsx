import { ConnectWallet } from "./ConnectWallet";
import styles from "./TopBar.module.css";

/**
 * A pane of smoked glass across the top. The wallet lives here now — a persistent
 * identity you can see and step away from at any moment — rather than in the
 * middle of the page. The wood grain reads faintly through it.
 */
export function TopBar() {
  return (
    <header className={styles.bar}>
      <div className={styles.inner}>
        <span className={styles.mark}>heirloom</span>
        <ConnectWallet />
      </div>
    </header>
  );
}
