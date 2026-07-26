import {
  Asset,
  BASE_FEE,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

import { signXdr } from "../wallet/kit";
import { horizon } from "./horizon";
import { network } from "./network";
import type { TxFailureReason, TxOutcome } from "./outcome";

/**
 * Emptying an account you have just inherited.
 *
 * A handover gives the heir control, not possession: the balances stay exactly
 * where they were and the heir's key becomes the only one that can move them.
 * That is the only thing a transaction signed years in advance *can* do — a
 * payment has to name an amount when it is signed, and nobody knows what an
 * account will hold when the day comes.
 *
 * So the last step happens now, when the balances are known: send everything to
 * the heir's own wallet, and where possible close the old account behind it so
 * even the locked reserve comes home.
 */

/** Every Stellar account locks half a lumen per subentry, plus two for itself. */
const BASE_RESERVE = 0.5;

/**
 * What the sweep bids for its own fee, and therefore what has to be left behind
 * to pay it.
 *
 * This is easy to forget and fails loudly when you do: paying out everything
 * above the reserve leaves the account exactly at the reserve, and then the fee
 * pushes it under. The network answers `op_underfunded` — not because the
 * balance moved, but because the sum never added up.
 */
const FEE_STROOPS = Number(BASE_FEE) * 100;
const FEE_XLM = FEE_STROOPS / 10_000_000;

export type SweepAsset = {
  code: string;
  issuer: string;
  amount: string;
};

export type SweepPlan = {
  /** Lumens that will move. The whole balance if the account can be closed. */
  xlm: string;
  /** Assets the heir can receive, because they already trust them. */
  moving: SweepAsset[];
  /** Assets the heir has no trustline for; these cannot be sent anywhere. */
  stuck: SweepAsset[];
  /**
   * Whether the old account can be closed at the end. Only if nothing is left
   * behind — every asset sent on, every trustline dropped.
   */
  closes: boolean;
  /** Lumens currently locked as reserve, freed only if the account closes. */
  reserve: string;
};

function assetOf({ code, issuer }: SweepAsset): Asset {
  return new Asset(code, issuer);
}

/**
 * Work out what a sweep would move, without moving anything. The interface
 * shows this before asking for a signature — inheriting is not a moment for
 * surprises.
 */
export async function planSweep(
  owner: string,
  heir: string,
): Promise<SweepPlan> {
  const [source, destination] = await Promise.all([
    horizon.loadAccount(owner),
    horizon.loadAccount(heir),
  ]);

  const trusted = new Set(
    destination.balances
      .filter((balance) => balance.asset_type !== "native")
      .map((balance) =>
        "asset_code" in balance && "asset_issuer" in balance
          ? `${balance.asset_code}:${balance.asset_issuer}`
          : "",
      ),
  );

  const held: SweepAsset[] = source.balances
    .filter(
      (balance) =>
        balance.asset_type !== "native" &&
        "asset_code" in balance &&
        "asset_issuer" in balance,
    )
    .map((balance) => ({
      code: (balance as { asset_code: string }).asset_code,
      issuer: (balance as { asset_issuer: string }).asset_issuer,
      amount: balance.balance,
    }));

  const moving = held.filter((asset) =>
    trusted.has(`${asset.code}:${asset.issuer}`),
  );
  const stuck = held.filter(
    (asset) => !trusted.has(`${asset.code}:${asset.issuer}`),
  );

  // Trustlines are subentries we can drop once emptied; anything else — an open
  // offer, a data entry — we cannot clear from here, so the account must stay.
  const clearable = held.length;
  const otherSubentries = source.subentry_count - clearable;
  const closes = stuck.length === 0 && otherSubentries === 0;

  const native = source.balances.find(
    (balance) => balance.asset_type === "native",
  );
  const total = Number(native?.balance ?? "0");
  const reserve = (2 + source.subentry_count) * BASE_RESERVE;

  // The fee comes out of this account either way, so it is never part of what
  // moves. A merge carries the reserve across; a payment has to leave it.
  const movable = closes ? total - FEE_XLM : total - reserve - FEE_XLM;

  return {
    xlm: Math.max(movable, 0).toFixed(7),
    moving,
    stuck,
    closes,
    reserve: reserve.toFixed(7),
  };
}

/**
 * Carry the plan out. The transaction's source is the inherited account and its
 * signature is the heir's — which is precisely what the takeover arranged.
 */
export async function sweep(owner: string, heir: string): Promise<TxOutcome> {
  let xdr: string;
  try {
    const plan = await planSweep(owner, heir);
    const source = await horizon.loadAccount(owner);

    const builder = new TransactionBuilder(source, {
      // A transaction must bid at least one base fee per operation, and the
      // count is not known until they are added. Bidding for the maximum
      // hundred costs a thousandth of a lumen; the plan above holds back
      // exactly this much so the bid is always covered.
      fee: String(FEE_STROOPS),
      networkPassphrase: network.passphrase,
    });

    // Counted as we go: `build()` consumes the builder and advances the
    // sequence, so it must be called exactly once.
    let operations = 0;

    for (const asset of plan.moving) {
      if (Number(asset.amount) > 0) {
        builder.addOperation(
          Operation.payment({
            destination: heir,
            asset: assetOf(asset),
            amount: asset.amount,
          }),
        );
        operations += 1;
      }
      // Emptied, the trustline is just a locked half-lumen. Dropping it is what
      // makes closing the account possible.
      builder.addOperation(
        Operation.changeTrust({ asset: assetOf(asset), limit: "0" }),
      );
      operations += 1;
    }

    if (plan.closes) {
      // Takes the reserve with it, which a payment never could.
      builder.addOperation(Operation.accountMerge({ destination: heir }));
      operations += 1;
    } else if (Number(plan.xlm) > 0) {
      builder.addOperation(
        Operation.payment({
          destination: heir,
          asset: Asset.native(),
          amount: plan.xlm,
        }),
      );
      operations += 1;
    }

    if (operations === 0) {
      return {
        ok: false,
        reason: { kind: "network", message: "There is nothing left to move." },
      };
    }

    xdr = builder.setTimeout(180).build().toXDR();
  } catch (error) {
    return { ok: false, reason: explain(error) };
  }

  // Signed by the heir, for an account that is not theirs by address but is
  // theirs by signature.
  const signed = await signXdr(xdr, heir);
  if (!signed.ok) {
    return {
      ok: false,
      reason:
        signed.error.kind === "rejected"
          ? { kind: "declined" }
          : { kind: "network", message: "Your wallet could not sign this." },
    };
  }

  try {
    const response = await horizon.submitTransaction(
      TransactionBuilder.fromXDR(signed.signedXdr, network.passphrase),
    );
    return { ok: true, hash: response.hash };
  } catch (error) {
    return { ok: false, reason: explain(error) };
  }
}

function explain(error: unknown): TxFailureReason {
  const codes = (
    error as {
      response?: {
        data?: {
          extras?: {
            result_codes?: { transaction?: string; operations?: string[] };
          };
        };
      };
    }
  )?.response?.data?.extras?.result_codes;

  const operations = codes?.operations ?? [];

  if (operations.includes("op_no_trust")) {
    return {
      kind: "network",
      message:
        "Your wallet does not hold a trustline for one of these assets, so it cannot receive them.",
    };
  }
  if (operations.includes("op_has_sub_entries")) {
    return {
      kind: "network",
      message:
        "Something is still attached to the account — an open offer, perhaps — so it cannot be closed.",
    };
  }
  if (operations.includes("op_underfunded")) {
    return {
      kind: "network",
      message: "The balance moved while this was being prepared. Try again.",
    };
  }

  return {
    kind: "network",
    message:
      codes?.transaction ||
      (error instanceof Error ? error.message : "The sweep did not go through."),
  };
}
