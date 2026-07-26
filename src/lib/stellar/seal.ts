import { signXdr } from "../wallet/kit";
import { buildEnvelope, Delivery } from "./envelope";
import { fetchAccountFacts } from "./horizon";
import type { TxOutcome } from "./outcome";
import { PlanMode, register } from "./registry";
import { sealEnvelope } from "./vault";

/**
 * Sealing a plan, end to end.
 *
 * Three signatures, because Soroban allows one contract call per transaction
 * and the takeover itself is a transaction of its own:
 *
 *   1. record the plan in the registry
 *   2. sign the takeover — the one nobody submits
 *   3. put it in the vault
 *
 * They cannot be folded together, so the interface says so plainly rather than
 * springing three wallet prompts on someone who expected one.
 */

export type SealStep = "recording" | "signing" | "storing";

export type SealParams = {
  owner: string;
  heir: string;
  period: bigint;
  mode: PlanMode;
  delivery: Delivery;
  onStep?: (step: SealStep) => void;
  /**
   * Skip the registry, because a previous attempt already got that far. The
   * first step is the one that cannot be repeated — an owner may hold only one
   * active plan — so resuming has to start after it.
   */
  alreadyRecorded?: boolean;
};

export type SealResult = {
  outcome: TxOutcome;
  /**
   * Whether the plan reached the registry. A failure after this point leaves a
   * plan on the record with no package behind it: it looks healthy and can
   * never fire, so the interface has to be able to tell the two failures apart
   * and offer to finish rather than start again.
   */
  recorded: boolean;
};

/**
 * How many of the owner's sequence numbers are still to be spent after the
 * takeover is signed: exactly one, for the transaction that stores it.
 *
 * This matters for a sealed plan, whose transaction claims the *very next*
 * sequence number. Built against the sequence as it reads now, the act of
 * storing it would consume that slot and void the package on the spot. So the
 * envelope is built against the sequence the account will be on once the
 * storing transaction has landed.
 */
const PENDING_SEQUENCE_SPEND = 1n;

export async function sealPlan({
  owner,
  heir,
  period,
  mode,
  delivery,
  onStep,
  alreadyRecorded = false,
}: SealParams): Promise<SealResult> {
  if (!alreadyRecorded) {
    onStep?.("recording");
    const written = await register(owner, heir, period, mode);
    if (!written.ok) return { outcome: written, recorded: false };
  }

  onStep?.("signing");

  // Read the sequence *after* recording: that transaction has just spent one.
  const facts = await fetchAccountFacts(owner);
  if (!facts) {
    return {
      recorded: true,
      outcome: {
        ok: false,
        reason: { kind: "network", message: "Could not read the account back." },
      },
    };
  }

  let takeoverXdr: string;
  try {
    takeoverXdr = buildEnvelope({
      owner,
      heir,
      period,
      mode,
      delivery,
      sequence: facts.sequence + PENDING_SEQUENCE_SPEND,
    }).toXDR();
  } catch (error) {
    return {
      recorded: true,
      outcome: {
        ok: false,
        reason: {
          kind: "network",
          message:
            error instanceof Error
              ? error.message
              : "Could not build the takeover.",
        },
      },
    };
  }

  const signed = await signXdr(takeoverXdr, owner);
  if (!signed.ok) {
    return {
      recorded: true,
      outcome: {
        ok: false,
        reason:
          signed.error.kind === "rejected"
            ? { kind: "declined" }
            : {
                kind: "network",
                message: "Your wallet could not sign the takeover.",
              },
      },
    };
  }

  onStep?.("storing");
  return {
    recorded: true,
    outcome: await sealEnvelope(owner, heir, delivery, signed.signedXdr),
  };
}
