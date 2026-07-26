import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import {
  buildEnvelope,
  canMerge,
  Delivery,
  ENVELOPE_FEE,
  SEQ_RESERVE,
} from "./envelope";
import { network } from "./network";
import { PlanMode } from "./registry";

// Plain Uint8Array, not Buffer: under jsdom a Buffer comes from another realm
// and the ed25519 library refuses it.
const seed = (byte: number) => new Uint8Array(32).fill(byte);

const OWNER = Keypair.fromRawEd25519Seed(seed(1)).publicKey();
const HEIR = Keypair.fromRawEd25519Seed(seed(2)).publicKey();
const SEQUENCE = 1_000_000_000_000n;
const THIRTY_DAYS = 2_592_000n;

function build(overrides: Partial<Parameters<typeof buildEnvelope>[0]> = {}) {
  return buildEnvelope({
    owner: OWNER,
    heir: HEIR,
    period: THIRTY_DAYS,
    mode: PlanMode.Standing,
    delivery: Delivery.Handover,
    sequence: SEQUENCE,
    ...overrides,
  });
}

describe("the silence the chain enforces", () => {
  it("asks for exactly the period the plan named", () => {
    const tx = build({ period: THIRTY_DAYS });
    expect(tx.minAccountSequenceAge).toBe(THIRTY_DAYS);
  });

  it("never expires, so a plan cannot quietly lapse", () => {
    const tx = build();
    // An upper bound of 0 is the SDK's way of saying "no bound at all".
    expect(tx.timeBounds?.maxTime ?? "0").toBe("0");
  });

  it("refuses a silence of nothing", () => {
    expect(() => build({ period: 0n })).toThrow(/longer than nothing/);
  });

  it("refuses to name the owner as their own heir", () => {
    expect(() => build({ heir: OWNER })).toThrow(/inherit from itself/);
  });
});

describe("standing mode", () => {
  it("reserves a distant sequence slot and pins minSeqNum to today", () => {
    const tx = build({ mode: PlanMode.Standing });

    expect(BigInt(tx.sequence)).toBe(SEQUENCE + SEQ_RESERVE);
    expect(tx.minAccountSequence).toBe(String(SEQUENCE));
  });

  it("leaves room for ordinary use to pass underneath it", () => {
    const tx = build({ mode: PlanMode.Standing });

    // Whatever the owner does in the meantime lands between minSeqNum and the
    // reserved slot, which is precisely why the plan survives it.
    const room = BigInt(tx.sequence) - BigInt(tx.minAccountSequence!);
    expect(room).toBe(SEQ_RESERVE);
  });
});

describe("sealed mode", () => {
  it("claims the very next slot, so any transaction voids it", () => {
    const tx = build({ mode: PlanMode.Sealed });

    expect(BigInt(tx.sequence)).toBe(SEQUENCE + 1n);
  });

  it("sets no minSeqNum, which is what makes it one-shot", () => {
    const sealed = build({ mode: PlanMode.Sealed });
    const standing = build({ mode: PlanMode.Standing });

    expect(sealed.minAccountSequence).toBeUndefined();
    // Guard against the assertion above passing for the wrong reason.
    expect(standing.minAccountSequence).toBeDefined();
  });
});

describe("handover delivery", () => {
  it("makes the heir a signer and stands the owner's key down", () => {
    const tx = build({ delivery: Delivery.Handover });

    expect(tx.operations).toHaveLength(1);
    const op = tx.operations[0];
    expect(op.type).toBe("setOptions");

    const options = op as Extract<typeof op, { type: "setOptions" }>;
    expect(options.signer).toEqual({ ed25519PublicKey: HEIR, weight: 1 });
    expect(options.masterWeight).toBe(0);
  });

  it("lowers every threshold so one heir signature is enough", () => {
    const tx = build({ delivery: Delivery.Handover });
    const op = tx.operations[0] as Extract<
      (typeof tx.operations)[number],
      { type: "setOptions" }
    >;

    expect(op.lowThreshold).toBe(1);
    expect(op.medThreshold).toBe(1);
    expect(op.highThreshold).toBe(1);
  });

  it("moves no assets — control changes, custody does not", () => {
    const tx = build({ delivery: Delivery.Handover });

    expect(tx.operations.some((op) => op.type === "payment")).toBe(false);
    expect(tx.operations.some((op) => op.type === "accountMerge")).toBe(false);
  });
});

describe("merge delivery", () => {
  it("sends the whole account to the heir's own wallet", () => {
    const tx = build({ delivery: Delivery.Merge });

    expect(tx.operations).toHaveLength(1);
    const op = tx.operations[0];
    expect(op.type).toBe("accountMerge");
    expect((op as Extract<typeof op, { type: "accountMerge" }>).destination).toBe(
      HEIR,
    );
  });

  it("is offered only to an account carrying no subentries", () => {
    // One trustline is enough for the chain to answer op_has_sub_entries.
    expect(canMerge(0)).toBe(true);
    expect(canMerge(1)).toBe(false);
    expect(canMerge(7)).toBe(false);
  });
});

describe("the envelope as a whole", () => {
  it("carries a fee high enough to outlive years of congestion", () => {
    const tx = build();
    expect(tx.fee).toBe(ENVELOPE_FEE);
  });

  it("is built for the network the app is configured for", () => {
    const tx = build();
    expect(tx.networkPassphrase).toBe(network.passphrase);
  });

  it("survives a round trip through XDR, which is how it is stored", () => {
    const tx = build();
    const restored = TransactionBuilder.fromXDR(
      tx.toXDR(),
      network.passphrase,
    ) as typeof tx;

    expect(restored.sequence).toBe(tx.sequence);
    expect(restored.minAccountSequenceAge).toBe(THIRTY_DAYS);
    expect(restored.minAccountSequence).toBe(String(SEQUENCE));
    expect(restored.operations[0].type).toBe(tx.operations[0].type);
  });
});
