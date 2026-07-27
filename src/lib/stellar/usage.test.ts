import { describe, expect, it } from "vitest";

import type { RegistryEvent } from "./events";
import {
  mergeEvents,
  recordedEvents,
  summarise,
  type StoredEvent,
} from "./usage";

let ledger = 100;

function stored(
  kind: string,
  owner: string,
  extra: Partial<StoredEvent> = {},
): StoredEvent {
  ledger += 1;
  return {
    id: `${ledger}-0`,
    kind,
    owner,
    ledger,
    at: "2026-07-27T10:00:00Z",
    txHash: `hash-${ledger}`,
    ...extra,
  };
}

describe("summarise", () => {
  it("counts a wallet once however often it appears", () => {
    const usage = summarise([
      stored("registered", "OWNER", { heir: "HEIR" }),
      stored("heartbeat", "OWNER"),
      stored("sealed", "OWNER", { heir: "HEIR" }),
    ]);

    expect(usage.wallets).toBe(2);
    expect(usage.events).toBe(3);
  });

  it("follows plans and packages rather than subtracting totals", () => {
    // Sealing, taking it back and sealing again is one package, not two — and
    // a plan called off is not half a plan.
    const usage = summarise([
      stored("registered", "A", { heir: "H" }),
      stored("registered", "B", { heir: "H" }),
      stored("cancelled", "B", { heir: "H" }),
      stored("sealed", "A", { heir: "H" }),
      stored("unsealed", "A", { heir: "H" }),
      stored("sealed", "A", { heir: "H" }),
    ]);

    expect(usage.plansStanding).toBe(1);
    expect(usage.packagesHeld).toBe(1);
    expect(usage.counts.sealed).toBe(2);
    expect(usage.counts.unsealed).toBe(1);
  });

  it("holds a collected package, since collecting does not empty the vault", () => {
    const usage = summarise([
      stored("registered", "A", { heir: "H" }),
      stored("sealed", "A", { heir: "H" }),
      stored("claimed", "A", { heir: "H" }),
    ]);

    expect(usage.packagesHeld).toBe(1);
    expect(usage.counts.claimed).toBe(1);
  });

  it("groups by the day the ledger closed, oldest first", () => {
    const usage = summarise([
      { ...stored("registered", "A"), at: "2026-07-26T23:59:00Z" },
      { ...stored("heartbeat", "A"), at: "2026-07-25T01:00:00Z" },
      { ...stored("heartbeat", "A"), at: "2026-07-26T00:01:00Z" },
    ]);

    expect(usage.days).toEqual([
      { date: "2026-07-25", events: 1 },
      { date: "2026-07-26", events: 2 },
    ]);
  });

  it("says nothing rather than zero for an empty record", () => {
    const usage = summarise([]);
    expect(usage.wallets).toBe(0);
    expect(usage.first).toBeNull();
    expect(usage.last).toBeNull();
    expect(usage.days).toEqual([]);
  });

  it("ignores a kind it does not know instead of miscounting it", () => {
    const usage = summarise([stored("invented", "A")]);
    expect(usage.events).toBe(1);
    expect(Object.values(usage.counts).every((n) => n === 0)).toBe(true);
  });

  it("counts the committed record without needing the network", () => {
    const usage = summarise(recordedEvents());
    expect(usage.events).toBe(recordedEvents().length);
    expect(usage.wallets).toBeGreaterThan(0);
  });
});

describe("mergeEvents", () => {
  const live = (id: string, over: Partial<RegistryEvent> = {}): RegistryEvent =>
    ({
      id,
      kind: "registered",
      owner: "OWNER",
      heir: "HEIR",
      period: 500n,
      mode: 0,
      lastSeen: null,
      delivery: null,
      ledger: 500,
      at: "2026-07-27T12:00:00Z",
      txHash: "live",
      ...over,
    }) as RegistryEvent;

  it("counts an event present in both sources once", () => {
    const merged = mergeEvents([stored("registered", "OWNER")], [live("101-0")]);
    const ids = merged.map((event) => event.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the two sources in ledger order, not source order", () => {
    const old = { ...stored("registered", "A"), ledger: 10, id: "10-0" };
    const merged = mergeEvents([old], [live("900-0", { ledger: 900 })]);
    expect(merged.map((event) => event.ledger)).toEqual([10, 900]);
  });

  it("carries a live event's bigint period across as a plain number", () => {
    const [event] = mergeEvents([], [live("1-0", { period: 2_592_000n })]);
    expect(event.period).toBe(2_592_000);
  });

  it("drops nulls rather than storing them as answers", () => {
    const [event] = mergeEvents(
      [],
      [live("1-0", { heir: null, period: null, mode: null, delivery: null })],
    );
    expect(event.heir).toBeUndefined();
    expect(event.period).toBeUndefined();
    expect(event.delivery).toBeUndefined();
  });
});

describe("the committed record", () => {
  it("is in ledger order, so merging and rendering can rely on it", () => {
    const ledgers = recordedEvents().map((event) => event.ledger);
    expect([...ledgers].sort((a, b) => a - b)).toEqual(ledgers);
  });

  it("has a unique id per event, which is what makes the merge idempotent", () => {
    const ids = recordedEvents().map((event) => event.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
