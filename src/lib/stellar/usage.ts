import developmentWallets from "@/data/development-wallets.json";
import snapshot from "@/data/usage.json";

import type { RegistryEvent, RegistryEventKind } from "./events";

/**
 * What the contracts have witnessed, counted.
 *
 * Nothing here phones anybody. The numbers are derived from the same public
 * events the registry page reads out one by one, and every id behind them can be
 * looked up on chain — which is the only reason to show a count at all. A figure
 * on a page is worth exactly as much as the reader's ability to go and check it,
 * and a hosted analytics dashboard offers none.
 *
 * There are two sources and they answer different questions. The snapshot in
 * `src/data/usage.json` is the record over all time, because Soroban RPC keeps
 * events for about a week and a week is not a history. The live window is what
 * has happened since the snapshot was last taken. Merged by event id, so an
 * event present in both counts once.
 */

export type StoredEvent = {
  id: string;
  kind: string;
  owner: string;
  heir?: string;
  period?: number;
  mode?: number;
  delivery?: number;
  ledger: number;
  at: string;
  txHash: string;
};

export type Usage = {
  /** Distinct addresses, either side of a plan. */
  wallets: number;
  /** Of those, the ones that belong to building this rather than using it. */
  developmentWallets: number;
  /** `wallets` minus the development ones — the honest visitor count. */
  visitorWallets: number;
  counts: Record<RegistryEventKind, number>;
  /** Plans recorded that have not since been called off. */
  plansStanding: number;
  /** Packages placed that have not since been taken back. */
  packagesHeld: number;
  events: number;
  /** ISO dates, oldest first, with how many events fell on each. */
  days: { date: string; events: number }[];
  first: string | null;
  last: string | null;
};

const KINDS: RegistryEventKind[] = [
  "registered",
  "heartbeat",
  "cancelled",
  "sealed",
  "unsealed",
  "claimed",
];

const DEVELOPMENT: ReadonlySet<string> = new Set(
  developmentWallets.wallets.map((wallet) => wallet.address),
);

export const developmentWalletCount = developmentWallets.wallets.length;

/** The record as committed, oldest first. */
export function recordedEvents(): StoredEvent[] {
  return snapshot.events as StoredEvent[];
}

export const snapshotContracts = snapshot.contracts;

/**
 * The stored record and the live window as one list, newest last.
 *
 * The live events arrive in the shape the app decodes into; the stored ones are
 * kept closer to the wire. Only the fields counted here are needed, so they meet
 * in the narrower of the two shapes rather than the richer one.
 */
export function mergeEvents(
  stored: StoredEvent[],
  live: RegistryEvent[],
): StoredEvent[] {
  const byId = new Map<string, StoredEvent>();
  for (const event of stored) byId.set(event.id, event);
  for (const event of live) {
    byId.set(event.id, {
      id: event.id,
      kind: event.kind,
      owner: event.owner,
      heir: event.heir ?? undefined,
      period: event.period === null ? undefined : Number(event.period),
      mode: event.mode ?? undefined,
      delivery: event.delivery ?? undefined,
      ledger: event.ledger,
      at: event.at,
      txHash: event.txHash,
    });
  }

  return [...byId.values()].sort((a, b) =>
    a.ledger === b.ledger ? a.id.localeCompare(b.id) : a.ledger - b.ledger,
  );
}

function isKind(value: string): value is RegistryEventKind {
  return (KINDS as string[]).includes(value);
}

export function summarise(events: StoredEvent[]): Usage {
  const counts = Object.fromEntries(KINDS.map((kind) => [kind, 0])) as Record<
    RegistryEventKind,
    number
  >;

  const wallets = new Set<string>();
  const byDay = new Map<string, number>();

  /**
   * Followed rather than counted. A plan registered and then called off is not
   * half a plan, and an owner who seals, takes it back and seals again has one
   * package, not two — so the state is replayed in order instead of subtracting
   * one total from another.
   */
  const standing = new Set<string>();
  const holding = new Set<string>();

  for (const event of events) {
    if (isKind(event.kind)) counts[event.kind] += 1;

    wallets.add(event.owner);
    if (event.heir) wallets.add(event.heir);

    const date = event.at.slice(0, 10);
    byDay.set(date, (byDay.get(date) ?? 0) + 1);

    switch (event.kind) {
      case "registered":
        standing.add(event.owner);
        break;
      case "cancelled":
        standing.delete(event.owner);
        break;
      case "sealed":
        holding.add(event.owner);
        break;
      case "unsealed":
        holding.delete(event.owner);
        break;
    }
  }

  let development = 0;
  for (const wallet of wallets) {
    if (DEVELOPMENT.has(wallet)) development += 1;
  }

  const days = [...byDay.entries()]
    .map(([date, count]) => ({ date, events: count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    wallets: wallets.size,
    developmentWallets: development,
    visitorWallets: wallets.size - development,
    counts,
    plansStanding: standing.size,
    packagesHeld: holding.size,
    events: events.length,
    days,
    first: events.length ? events[0].at : null,
    last: events.length ? events[events.length - 1].at : null,
  };
}
