import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { REGISTRY_ID } from "./registry";
import { VAULT_ID } from "./vault";

/**
 * The watchtower is a standalone script — plain JavaScript, run by a GitHub
 * Action with no bundler and no import from the app — so it carries its own
 * copy of the contract addresses. That copy has already gone stale once: the
 * vault was redeployed for the Joint delivery mode, the frontend followed, and
 * the script kept walking the superseded address for days. Nothing failed
 * loudly, because an empty vault and an unwatched one look exactly alike.
 *
 * So the two copies are pinned to each other here. This is the cheapest place
 * to catch it: a redeploy that updates one and not the other stops CI instead
 * of quietly turning off automatic delivery.
 */
const script = readFileSync("scripts/watchtower.mjs", "utf8");

function defaultId(variable: string): string | null {
  const found = script.match(
    new RegExp(`${variable}\\s*=\\s*[\\s\\S]{0,80}?'([A-Z0-9]{56})'`),
  );
  return found ? found[1] : null;
}

describe("the watchtower's contract addresses", () => {
  it("names the same registry the app does", () => {
    expect(defaultId("const REGISTRY")).toBe(REGISTRY_ID);
  });

  it("names the same vault the app does", () => {
    expect(defaultId("const VAULT")).toBe(VAULT_ID);
  });
});
