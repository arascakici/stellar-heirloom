import { Keypair, nativeToScVal, type rpc, type xdr } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import { Delivery } from "./envelope";
import { concerns, toRegistryEvent, type RegistryEvent } from "./events";
import { PlanMode } from "./registry";

/**
 * The event shapes below are the ones read back off testnet from real
 * emissions, rebuilt here as genuine ScVals rather than mocked — so a change in
 * how the contract publishes would fail these tests rather than slip past them.
 */

const address = (byte: number) =>
  Keypair.fromRawEd25519Seed(new Uint8Array(32).fill(byte)).publicKey();

const OWNER = address(1);
const HEIR = address(2);

const symbol = (value: string) => nativeToScVal(value, { type: "symbol" });
const addr = (value: string) => nativeToScVal(value, { type: "address" });

function rawEvent(topic: xdr.ScVal[], value: xdr.ScVal) {
  return {
    id: "0000123456789-0000000001",
    topic,
    value,
    ledger: 3_782_000,
    ledgerClosedAt: "2026-07-25T18:00:00Z",
    txHash: "f8121bbe5e06e0d96ac6b84728109a23c7236541d06e3fdf16aaca23c6a9ebfd",
  } as unknown as rpc.Api.EventResponse;
}

const registered = () =>
  rawEvent(
    [symbol("registered"), addr(OWNER), addr(HEIR)],
    nativeToScVal(
      { period: 2_592_000n, mode: 0 },
      { type: { period: ["symbol", "u64"], mode: ["symbol", "u32"] } },
    ),
  );

const heartbeat = () =>
  rawEvent(
    [symbol("heartbeat"), addr(OWNER)],
    nativeToScVal(
      { last_seen: 1_785_000_000n },
      { type: { last_seen: ["symbol", "u64"] } },
    ),
  );

const cancelled = () =>
  rawEvent(
    [symbol("cancelled"), addr(OWNER), addr(HEIR)],
    nativeToScVal({}, { type: {} }),
  );

describe("decoding what the registry published", () => {
  it("reads a registration, parties and terms", () => {
    const event = toRegistryEvent(registered())!;

    expect(event.kind).toBe("registered");
    expect(event.owner).toBe(OWNER);
    expect(event.heir).toBe(HEIR);
    expect(event.period).toBe(2_592_000n);
    expect(event.mode).toBe(PlanMode.Standing);
    expect(event.lastSeen).toBeNull();
  });

  it("reads a heartbeat, which names no heir", () => {
    const event = toRegistryEvent(heartbeat())!;

    expect(event.kind).toBe("heartbeat");
    expect(event.owner).toBe(OWNER);
    expect(event.heir).toBeNull();
    expect(event.lastSeen).toBe(1_785_000_000n);
    expect(event.period).toBeNull();
  });

  it("reads a cancellation, which carries no body at all", () => {
    const event = toRegistryEvent(cancelled())!;

    expect(event.kind).toBe("cancelled");
    expect(event.owner).toBe(OWNER);
    expect(event.heir).toBe(HEIR);
    expect(event.period).toBeNull();
    expect(event.mode).toBeNull();
    expect(event.lastSeen).toBeNull();
  });

  it("keeps a period as a bigint, because seconds outlive Number precision", () => {
    const event = toRegistryEvent(registered())!;
    expect(typeof event.period).toBe("bigint");
  });

  it("distinguishes the two modes", () => {
    const sealed = rawEvent(
      [symbol("registered"), addr(OWNER), addr(HEIR)],
      nativeToScVal(
        { period: 60n, mode: 1 },
        { type: { period: ["symbol", "u64"], mode: ["symbol", "u32"] } },
      ),
    );

    expect(toRegistryEvent(sealed)!.mode).toBe(PlanMode.Sealed);
  });

  it("carries through what the feed needs to link and order it", () => {
    const event = toRegistryEvent(registered())!;

    expect(event.id).toBe("0000123456789-0000000001");
    expect(event.ledger).toBe(3_782_000);
    expect(event.at).toBe("2026-07-25T18:00:00Z");
    expect(event.txHash).toMatch(/^f8121bbe/);
  });
});

describe("decoding what the vault published", () => {
  const withDelivery = (name: string, delivery: number) =>
    rawEvent(
      [symbol(name), addr(OWNER), addr(HEIR)],
      nativeToScVal(
        { delivery },
        { type: { delivery: ["symbol", "u32"] } },
      ),
    );

  it("reads a package being sealed, and how it will be delivered", () => {
    const event = toRegistryEvent(withDelivery("sealed", 0))!;

    expect(event.kind).toBe("sealed");
    expect(event.owner).toBe(OWNER);
    expect(event.heir).toBe(HEIR);
    expect(event.delivery).toBe(Delivery.Handover);
  });

  it("tells the two deliveries apart", () => {
    expect(toRegistryEvent(withDelivery("sealed", 1))!.delivery).toBe(
      Delivery.Merge,
    );
  });

  it("reads a package taken back, which carries no body", () => {
    const event = toRegistryEvent(
      rawEvent(
        [symbol("unsealed"), addr(OWNER), addr(HEIR)],
        nativeToScVal({}, { type: {} }),
      ),
    )!;

    expect(event.kind).toBe("unsealed");
    expect(event.heir).toBe(HEIR);
    expect(event.delivery).toBeNull();
  });

  it("reads a package collected — the one entry that cannot be undone", () => {
    const event = toRegistryEvent(withDelivery("claimed", 1))!;

    expect(event.kind).toBe("claimed");
    expect(event.owner).toBe(OWNER);
    expect(event.heir).toBe(HEIR);
    expect(event.delivery).toBe(Delivery.Merge);
  });

  it("leaves delivery null on the registry's own events", () => {
    expect(toRegistryEvent(registered())!.delivery).toBeNull();
    expect(toRegistryEvent(heartbeat())!.delivery).toBeNull();
  });
});

describe("events that are not ours", () => {
  it("skips an unknown event name rather than taking the feed down", () => {
    const stranger = rawEvent(
      [symbol("transfer"), addr(OWNER)],
      nativeToScVal({}, { type: {} }),
    );

    expect(toRegistryEvent(stranger)).toBeNull();
  });

  it("skips an event whose owner topic is not an address", () => {
    const malformed = rawEvent(
      [symbol("heartbeat"), nativeToScVal(42, { type: "u32" })],
      nativeToScVal({}, { type: {} }),
    );

    expect(toRegistryEvent(malformed)).toBeNull();
  });

  it("skips an event with no topics at all", () => {
    expect(toRegistryEvent(rawEvent([], nativeToScVal({}, { type: {} })))).toBeNull();
  });
});

describe("concerns", () => {
  const event = (owner: string, heir: string | null) =>
    ({ owner, heir }) as RegistryEvent;

  it("is true for either side of a plan", () => {
    expect(concerns(event(OWNER, HEIR), OWNER)).toBe(true);
    expect(concerns(event(OWNER, HEIR), HEIR)).toBe(true);
  });

  it("is false for a bystander", () => {
    expect(concerns(event(OWNER, HEIR), address(9))).toBe(false);
  });

  it("does not mistake a missing heir for a match", () => {
    expect(concerns(event(OWNER, null), address(9))).toBe(false);
  });
});
