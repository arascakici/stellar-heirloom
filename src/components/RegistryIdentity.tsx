import {
  explorerContractUrl,
  network,
} from "@/lib/stellar/network";
import { REGISTRY_ID } from "@/lib/stellar/registry";
import { VAULT_ID } from "@/lib/stellar/vault";

import styles from "./RegistryIdentity.module.css";

/**
 * Where the two contracts actually live. An address is a claim anyone can
 * check, so each is given in full and in the face reserved for what the chain
 * wrote — truncating them here would make them decorative rather than
 * verifiable.
 */
export function RegistryIdentity() {
  return (
    <section className={styles.plate}>
      <dl className={styles.rows}>
        <div className={styles.row}>
          <dt className={styles.key}>Network</dt>
          <dd className={styles.value}>{network.label}</dd>
        </div>
        <Contract label="Record" id={REGISTRY_ID} />
        <Contract label="Vault" id={VAULT_ID} />
      </dl>
    </section>
  );
}

function Contract({ label, id }: { label: string; id: string }) {
  return (
    <div className={styles.row}>
      <dt className={styles.key}>{label}</dt>
      <dd className={styles.value}>
        <a
          className={`${styles.id} mono`}
          href={explorerContractUrl(id)}
          target="_blank"
          rel="noreferrer"
        >
          {id}
        </a>
      </dd>
    </div>
  );
}
