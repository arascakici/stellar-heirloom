"use client";

import { useEffect, useState } from "react";

import { report } from "@/lib/incident";
import { fetchAllRegistryEvents } from "@/lib/stellar/events";
import {
  mergeEvents,
  recordedEvents,
  summarise,
  type StoredEvent,
} from "@/lib/stellar/usage";

import styles from "./UsageBoard.module.css";

/**
 * Usage, counted from the chain and from nowhere else.
 *
 * The committed record renders first, with no network in the way — it ships
 * with the page, so the numbers are there before anything is fetched. Then the
 * live window is merged on top, which only ever adds what has happened since
 * the record was last written.
 *
 * A wallet counts as a wallet. This is testnet, where a key costs nothing and
 * the point of the page is what the contracts have actually been put through —
 * so an address that sealed a plan is an address that sealed a plan, whoever
 * holds it.
 */

const KIND_LABEL: Record<string, string> = {
  registered: "plans recorded",
  heartbeat: "clocks wound",
  cancelled: "seals broken",
  sealed: "packages left",
  unsealed: "packages taken back",
  claimed: "packages collected",
};

export function UsageBoard() {
  const [events, setEvents] = useState<StoredEvent[]>(recordedEvents);
  /** "settled" once the live window has been folded in, or has failed to be. */
  const [live, setLive] = useState<"reading" | "settled" | "failed">("reading");

  useEffect(() => {
    let cancelled = false;
    fetchAllRegistryEvents()
      .then((fresh) => {
        if (cancelled) return;
        setEvents((known) => mergeEvents(known, fresh));
        setLive("settled");
      })
      .catch((error) => {
        report(error, "read:usage");
        if (!cancelled) setLive("failed");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const usage = summarise(events);
  const busiest = usage.days.reduce((most, day) => Math.max(most, day.events), 0);

  return (
    <div className={styles.board}>
      <section className={styles.headline}>
        <p className={styles.figure}>{usage.wallets}</p>
        <h2 className={styles.figureLabel}>wallets have used heirloom</h2>
        <p className={styles.note}>
          Distinct addresses that have appeared on either side of a plan — as
          the one who sealed it, or as the one named to inherit.
        </p>
      </section>

      <section className={styles.group}>
        <h3 className={styles.groupTitle}>What the contracts have witnessed</h3>
        <dl className={styles.rows}>
          {Object.entries(usage.counts).map(([kind, count]) => (
            <div className={styles.row} key={kind}>
              <dt className={styles.key}>{KIND_LABEL[kind] ?? kind}</dt>
              <dd className={`${styles.value} mono`}>{count}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={styles.group}>
        <h3 className={styles.groupTitle}>Standing right now</h3>
        <dl className={styles.rows}>
          <div className={styles.row}>
            <dt className={styles.key}>plans in force</dt>
            <dd className={`${styles.value} mono`}>{usage.plansStanding}</dd>
          </div>
          <div className={styles.row}>
            <dt className={styles.key}>packages waiting in the vault</dt>
            <dd className={`${styles.value} mono`}>{usage.packagesHeld}</dd>
          </div>
        </dl>
        <p className={styles.note}>
          Followed through the events in order rather than subtracted from
          totals: a plan recorded and then called off is not half a plan, and an
          owner who seals, takes it back and seals again has left one package.
        </p>
      </section>

      {usage.days.length > 0 && (
        <section className={styles.group}>
          <h3 className={styles.groupTitle}>By the day</h3>
          <ol className={styles.strip}>
            {usage.days.map((day) => (
              <li className={styles.day} key={day.date} title={`${day.date} — ${day.events}`}>
                <span
                  className={styles.bar}
                  style={{ height: `${Math.max(8, (day.events / busiest) * 100)}%` }}
                />
                <span className={styles.dayLabel}>{day.date.slice(5)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <p className={styles.provenance}>
        {usage.events} events, the earliest on {usage.first?.slice(0, 10)}.{" "}
        {live === "reading"
          ? "Reading the last seven days off the network…"
          : live === "failed"
            ? "The network could not be reached, so this is the committed record alone."
            : "Up to date with the network."}{" "}
        The record lives in the repository because Soroban RPC keeps events for
        about a week, and a week is not a history. Every id in it can be looked
        up on chain — which is the only thing that makes a number on a page worth
        anything.
      </p>
    </div>
  );
}
