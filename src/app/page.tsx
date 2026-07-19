import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.page}>
      <div className={styles.plate}>
        <h1 className={styles.wordmark}>heirloom</h1>
        <div className={styles.rule} aria-hidden />
        <p className={styles.promise}>
          Sign one transaction today. If your account goes quiet for a period you
          choose, someone you named takes it over.
        </p>
        <p className={styles.footnote}>
          Your assets never leave your account. Nothing is held in escrow, and no
          one — including us — can move them early. The network itself does the
          refusing.
        </p>
      </div>
    </main>
  );
}
