import { network } from "./network";

export type FundResult = { ok: true } | { ok: false; message: string };

/**
 * Testnet's faucet. Funding is how an address becomes an account at all, so
 * this is the first step of any test run — and, usefully for heirloom, it is
 * also the moment a brand-new account first gets a sequence number.
 */
export async function fundAccount(address: string): Promise<FundResult> {
  const { friendbotUrl } = network;

  // Typed as null off testnet, so this branch is unreachable on mainnet rather
  // than merely discouraged.
  if (!friendbotUrl) {
    return { ok: false, message: "Free funding only exists on testnet." };
  }

  let response: Response;
  try {
    response = await fetch(`${friendbotUrl}?addr=${encodeURIComponent(address)}`);
  } catch {
    return { ok: false, message: "Could not reach the testnet faucet." };
  }

  if (response.ok) return { ok: true };

  // The faucet answers 400 with "account already funded to starting balance"
  // for an account it has topped up before. From the visitor's point of view
  // that is success: the account exists and holds money.
  const body = await response.text();
  if (/already funded|already exist/i.test(body)) {
    return { ok: true };
  }

  return {
    ok: false,
    message: "The testnet faucet turned down the request. Try again shortly.",
  };
}
