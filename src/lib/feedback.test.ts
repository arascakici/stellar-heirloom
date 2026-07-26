import { Keypair } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import { checkFeedback, FEEDBACK_FIELDS, submitUrl, toFormBody } from "./feedback";

const ADDRESS = Keypair.random().publicKey();

describe("checkFeedback", () => {
  it("insists on an address, because a note it cannot place is only an opinion", () => {
    expect(checkFeedback({ address: "", usefulness: 4 })).toBe("address-missing");
    expect(checkFeedback({ address: "   ", usefulness: 4 })).toBe(
      "address-missing",
    );
  });

  it("rejects something that merely looks like one", () => {
    // Right length, right first letter, wrong checksum.
    const mangled = `G${"A".repeat(55)}`;
    expect(mangled).toHaveLength(56);
    expect(checkFeedback({ address: mangled, usefulness: 4 })).toBe(
      "address-invalid",
    );
    // A secret key is a valid strkey, but not the kind being asked for.
    expect(
      checkFeedback({ address: Keypair.random().secret(), usefulness: 4 }),
    ).toBe("address-invalid");
  });

  it("accepts a real public key, with or without stray whitespace", () => {
    expect(checkFeedback({ address: ADDRESS, usefulness: 1 })).toBeNull();
    expect(checkFeedback({ address: `  ${ADDRESS}  `, usefulness: 5 })).toBeNull();
  });

  it("insists on a score, and only one the form actually offers", () => {
    expect(checkFeedback({ address: ADDRESS, usefulness: null })).toBe(
      "usefulness-missing",
    );
    expect(checkFeedback({ address: ADDRESS, usefulness: 0 })).toBe(
      "usefulness-missing",
    );
    expect(checkFeedback({ address: ADDRESS, usefulness: 6 })).toBe(
      "usefulness-missing",
    );
    expect(checkFeedback({ address: ADDRESS, usefulness: 3.5 })).toBe(
      "usefulness-missing",
    );
  });
});

describe("toFormBody", () => {
  const full = {
    address: `  ${ADDRESS}  `,
    usefulness: 4,
    notes: "  the sealing step asked me to sign three times  ",
    name: " Aras ",
    email: " a@example.com ",
  };

  it("puts every answer under the name the form knows it by", () => {
    const body = toFormBody(full);
    expect(body.get(FEEDBACK_FIELDS.address)).toBe(ADDRESS);
    expect(body.get(FEEDBACK_FIELDS.usefulness)).toBe("4");
    expect(body.get(FEEDBACK_FIELDS.notes)).toBe(
      "the sealing step asked me to sign three times",
    );
    expect(body.get(FEEDBACK_FIELDS.name)).toBe("Aras");
    expect(body.get(FEEDBACK_FIELDS.email)).toBe("a@example.com");
  });

  it("leaves an unanswered optional out rather than sending it empty", () => {
    const body = toFormBody({ ...full, notes: "   ", name: "", email: "" });
    expect(body.has(FEEDBACK_FIELDS.notes)).toBe(false);
    expect(body.has(FEEDBACK_FIELDS.name)).toBe(false);
    expect(body.has(FEEDBACK_FIELDS.email)).toBe(false);
    // The two the form requires are still there.
    expect(body.has(FEEDBACK_FIELDS.address)).toBe(true);
    expect(body.has(FEEDBACK_FIELDS.usefulness)).toBe(true);
  });

  it("sends nothing the form did not ask for", () => {
    const asked = new Set<string>(Object.values(FEEDBACK_FIELDS));
    for (const key of toFormBody(full).keys()) {
      expect(asked.has(key)).toBe(true);
    }
  });
});

describe("submitUrl", () => {
  it("posts to formResponse, not to the page a person would read", () => {
    expect(submitUrl("FORM")).toBe(
      "https://docs.google.com/forms/d/e/FORM/formResponse",
    );
    expect(submitUrl()).not.toContain("viewform");
  });
});
