"use client";

import { formatDuration, humanizeApprox } from "@/lib/stellar/duration";
import { Delivery } from "@/lib/stellar/envelope";
import type { RegistryEvent } from "@/lib/stellar/events";
import { explorerTxUrl, shortenAddress } from "@/lib/stellar/network";
import { useAccountPlans } from "@/lib/stellar/PlanProvider";
import { PlanMode } from "@/lib/stellar/registry";
import { useRegistryEvents } from "@/lib/stellar/useRegistryEvents";
import { useNowSeconds } from "@/lib/useNow";
import { useWallet } from "@/lib/wallet/WalletProvider";

import styles from "./RegistryFeed.module.css";

/**
 * What the registry has witnessed, as it happens.
 *
 * The contract is a notary: it never holds anything, it only writes down what
 * was done in front of it. This is that record, read back off the chain every
 * few seconds. An entry that concerns the connected account is marked as
 * theirs — and quietly refreshes their plan, so a seal broken on another device
 * shows up here without a reload.
 */
export function RegistryFeed() {
  const { address } = useWallet();
  const { refresh } = useAccountPlans();
  const { events, loading, error } = useRegistryEvents({
    address,
    onOwnEvent: refresh,
  });
  // One clock for the whole book, rather than one per line.
  const now = useNowSeconds();

  return (
    <section className={styles.feed} aria-live="polite">
      <h2 className={styles.title}>What the registry has witnessed</h2>

      {error ? (
        <p className={styles.status}>{error}</p>
      ) : loading ? (
        <p className={styles.status}>Reading the record…</p>
      ) : events.length === 0 ? (
        <p className={styles.status}>
          Nothing in the last few hours. Seal a plan and it will be written here.
        </p>
      ) : (
        <ol className={styles.list}>
          {events.map((event) => (
            <Entry key={event.id} event={event} address={address} now={now} />
          ))}
        </ol>
      )}
    </section>
  );
}

function Entry({
  event,
  address,
  now,
}: {
  event: RegistryEvent;
  address: string | null;
  now: number;
}) {
  const mine =
    address !== null && (event.owner === address || event.heir === address);
  const ago = humanizeApprox(now - Math.floor(Date.parse(event.at) / 1000));

  return (
    <li className={styles.entry} data-kind={event.kind} data-mine={mine || undefined}>
      <span className={styles.mark} aria-hidden />
      <span className={styles.line}>
        <Sentence event={event} mine={mine} />
      </span>
      <a
        className={styles.when}
        href={explorerTxUrl(event.txHash)}
        target="_blank"
        rel="noreferrer"
        title={event.at}
      >
        {ago} ago
      </a>
    </li>
  );
}

/** One plain sentence per event, in the terms the chest uses. */
function Sentence({ event, mine }: { event: RegistryEvent; mine: boolean }) {
  const who = mine ? "You" : shortenAddress(event.owner, 4);
  const whoClass = mine ? styles.you : `${styles.who} mono`;

  switch (event.kind) {
    case "registered":
      return (
        <>
          <span className={whoClass}>{who}</span> sealed a{" "}
          {event.mode === PlanMode.Sealed ? "sealed" : "standing"} plan
          {event.period !== null && <> after {formatDuration(event.period)}</>},
          naming{" "}
          <span className={`${styles.who} mono`}>
            {shortenAddress(event.heir ?? "", 4)}
          </span>
          .
        </>
      );
    case "heartbeat":
      return (
        <>
          <span className={whoClass}>{who}</span> wound the clock.
        </>
      );
    case "cancelled":
      return (
        <>
          <span className={whoClass}>{who}</span> broke the seal.
        </>
      );
    case "sealed":
      return (
        <>
          <span className={whoClass}>{who}</span> left a package for{" "}
          <span className={`${styles.who} mono`}>
            {shortenAddress(event.heir ?? "", 4)}
          </span>
          {event.delivery === Delivery.Merge
            ? ", to be merged into their wallet."
            : event.delivery === Delivery.Joint
              ? ", to join them to the account."
              : ", to hand the account over."}
        </>
      );
    case "unsealed":
      return (
        <>
          <span className={whoClass}>{who}</span> took the package back.
        </>
      );
    case "claimed":
      // The moment the whole thing exists for.
      return (
        <>
          <span className={`${styles.who} mono`}>
            {shortenAddress(event.heir ?? "", 4)}
          </span>{" "}
          collected the package left by{" "}
          <span className={whoClass}>{who}</span>.
        </>
      );
  }
}
