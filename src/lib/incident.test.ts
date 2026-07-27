import { Keypair } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import { redact, toIncident } from "./incident";

/**
 * These are the tests that matter most in the project.
 *
 * Everything else here fails visibly — a wrong count looks wrong, a broken
 * button does not work. A leak does neither: it works perfectly and quietly
 * writes somebody's address into a log. So the check is not "does redaction run"
 * but "is the secret absent from the output", asserted against real keys rather
 * than against strings that look like them.
 */
const keypair = Keypair.random();
const ADDRESS = keypair.publicKey();
const SECRET = keypair.secret();
const CONTRACT = "CANLQE764X2GHPCFHHDIBXPT35PATT2IIYRCFBK77O6EECKS3CPJDHPY";
const HASH = "963443dae5bdf7246285b45c58cff271c92756b9e6fef58ee8d261a7383866ce";

describe("redact", () => {
  it("removes a real account id", () => {
    const out = redact(`could not read ${ADDRESS} from horizon`);
    expect(out).not.toContain(ADDRESS);
    expect(out).toBe("could not read [address] from horizon");
  });

  it("removes a secret seed, and says so loudly", () => {
    const out = redact(`signing with ${SECRET}`);
    expect(out).not.toContain(SECRET);
    // Not merely called "an address": if one ever reaches a log, the log
    // should be impossible to read past.
    expect(out).toContain("[SECRET-KEY-LEAKED]");
  });

  it("removes contract ids and transaction hashes", () => {
    const out = redact(`invoke ${CONTRACT} failed at tx ${HASH}`);
    expect(out).not.toContain(CONTRACT);
    expect(out).not.toContain(HASH);
    expect(out).toBe("invoke [contract] failed at tx [hash]");
  });

  it("removes a signed envelope rather than logging somebody's transaction", () => {
    const xdr = `AAAAAgAAAAA${"B".repeat(120)}=`;
    const out = redact(`bad envelope: ${xdr}`);
    expect(out).not.toContain(xdr);
    expect(out).toContain("[payload]");
  });

  it("removes an email address", () => {
    expect(redact("wrote to a@example.com")).toBe("wrote to [email]");
  });

  it("clears every identifier in one message, not just the first", () => {
    const message = `${ADDRESS} -> ${ADDRESS}, tx ${HASH}, via ${CONTRACT}`;
    const out = redact(message);
    for (const secret of [ADDRESS, HASH, CONTRACT]) {
      expect(out).not.toContain(secret);
    }
  });

  it("leaves an ordinary message alone", () => {
    const message = "The network rejected the transaction.";
    expect(redact(message)).toBe(message);
  });
});

describe("toIncident", () => {
  const at = new Date("2026-07-27T18:45:12.987Z");

  it("keeps what helps and drops what identifies", () => {
    const error = new Error(`account ${ADDRESS} is not funded`);
    const incident = toIncident(error, "page", at);

    expect(incident.name).toBe("Error");
    expect(incident.message).toBe("account [address] is not funded");
    expect(incident.where).toBe("page");
    expect(incident.at).toBe("2026-07-27T18:45:12Z");
  });

  it("redacts the stack as well as the message", () => {
    const error = new Error("boom");
    error.stack = `Error: boom\n    at seal (/app/${ADDRESS}/x.js:1:1)\n    at b (/app/b.js:2:2)`;
    const incident = toIncident(error, "page", at);

    expect(incident.stack).not.toContain(ADDRESS);
    expect(incident.stack).toContain("[address]");
  });

  it("keeps the stack short enough to read", () => {
    const error = new Error("boom");
    error.stack = ["Error: boom", ...Array.from({ length: 40 }, (_, i) => `    at f${i} (/a.js:${i}:1)`)].join("\n");
    const incident = toIncident(error, "page", at);

    expect(incident.stack?.split("at ").length).toBeLessThanOrEqual(5);
  });

  it("carries the digest, which is how a server error is matched up", () => {
    const error = Object.assign(new Error("boom"), { digest: "3141592653" });
    expect(toIncident(error, "page", at).digest).toBe("3141592653");
  });

  it("omits the digest rather than writing the word undefined", () => {
    expect(toIncident(new Error("boom"), "page", at).digest).toBeUndefined();
  });

  it("survives being thrown something that is not an Error", () => {
    const incident = toIncident(`plain string with ${ADDRESS}`, "page", at);
    expect(incident.name).toBe("string");
    expect(incident.message).not.toContain(ADDRESS);
    expect(incident.stack).toBeUndefined();
  });

  it("truncates a message long enough to be a document", () => {
    const incident = toIncident(new Error("x".repeat(5_000)), "page", at);
    expect(incident.message.length).toBeLessThanOrEqual(300);
  });

  it("redacts the label too, since a caller could put anything there", () => {
    expect(toIncident(new Error("boom"), `read:${ADDRESS}`, at).where).not.toContain(
      ADDRESS,
    );
  });
});
