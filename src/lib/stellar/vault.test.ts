import { Keypair } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import { buildEnvelope, Delivery } from "./envelope";
import { PlanMode } from "./registry";
import { base64ToBytes, bytesToBase64 } from "./vault";

/**
 * The chain holds a package as raw bytes and the rest of Stellar hands
 * transactions around as base64. That conversion is the one place a package
 * could be quietly corrupted, so it is pinned down here.
 */

const address = (byte: number) =>
  Keypair.fromRawEd25519Seed(new Uint8Array(32).fill(byte)).publicKey();

describe("carrying a package across the byte boundary", () => {
  it("returns exactly what went in", () => {
    const original = "AAAAAgAAAABhZWlvdQ==";
    expect(bytesToBase64(base64ToBytes(original))).toBe(original);
  });

  it("survives every byte value, not just printable ones", () => {
    const all = new Uint8Array(256).map((_, i) => i);
    expect(Array.from(base64ToBytes(bytesToBase64(all)))).toEqual(
      Array.from(all),
    );
  });

  it("handles the empty case without inventing bytes", () => {
    expect(bytesToBase64(new Uint8Array(0))).toBe("");
    expect(base64ToBytes("")).toHaveLength(0);
  });

  it("carries a real takeover transaction through unchanged", () => {
    const tx = buildEnvelope({
      owner: address(1),
      heir: address(2),
      period: 2_592_000n,
      mode: PlanMode.Standing,
      delivery: Delivery.Handover,
      sequence: 1_000_000_000_000n,
    });

    const xdrIn = tx.toXDR();
    const xdrOut = bytesToBase64(base64ToBytes(xdrIn));

    expect(xdrOut).toBe(xdrIn);
  });

  it("produces bytes, not a string of characters", () => {
    const bytes = base64ToBytes("AAAA");
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes).toHaveLength(3);
  });
});
