import { AccountPanel } from "@/components/AccountPanel";
import { Feedback } from "@/components/Feedback";
import { Landing } from "@/components/Landing";

import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.page}>
      <div className={styles.plate}>
        <Landing />
        <AccountPanel />
      </div>
      <Feedback />
    </main>
  );
}
