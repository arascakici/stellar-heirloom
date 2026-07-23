/**
 * The shape every signed-and-submitted transaction reports back.
 *
 * heartbeat is the first of these; arming a plan and cancelling one will
 * produce the same thing later. Keeping one type means the component that
 * shows a result — hash, explorer link, or why it failed — never has to be
 * rewritten per action.
 */
export type TxFailureReason =
  | { kind: "declined" }
  | { kind: "insufficient-funds" }
  | { kind: "unfunded" }
  | { kind: "network"; message: string };

export type TxOutcome =
  | { ok: true; hash: string }
  | { ok: false; reason: TxFailureReason };
