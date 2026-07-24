import {
  explorerContractUrl,
  network,
} from "@/lib/stellar/network";
import { REGISTRY_ID } from "@/lib/stellar/registry";

import styles from "./RegistryIdentity.module.css";

/**
 * Where the registry actually lives. An address is a claim anyone can check, so
 * it is given in full and in the face reserved for what the chain wrote —
 * truncating it here would make it decorative rather than verifiable.
 */
export function RegistryIdentity() {
  return (
    <section className={styles.plate}>
      <dl className={styles.rows}>
        <div className={styles.row}>
          <dt className={styles.key}>Network</dt>
          <dd className={styles.value}>{network.label}</dd>
        </div>
        <div className={styles.row}>
          <dt className={styles.key}>Contract</dt>
          <dd className={styles.value}>
            <a
              className={`${styles.id} mono`}
              href={explorerContractUrl(REGISTRY_ID)}
              target="_blank"
              rel="noreferrer"
            >
              {REGISTRY_ID}
            </a>
          </dd>
        </div>
      </dl>
    </section>
  );
}
