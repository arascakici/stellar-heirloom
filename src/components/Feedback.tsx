"use client";

import { useId, useState } from "react";

import {
  checkFeedback,
  describeProblem,
  USEFULNESS_CHOICES,
} from "@/lib/feedback";
import { useWallet } from "@/lib/wallet/WalletProvider";

import styles from "./Feedback.module.css";

/**
 * A way to say what went wrong, kept out of the ceremony's way.
 *
 * It sits under the plate rather than inside it. The moment a person has the
 * strongest opinion is the moment they have just sealed a plan — but that is
 * also the moment the chest is shutting over it, and interrupting that to ask
 * for a rating would cheapen the thing the whole screen is for. So the line
 * waits at the bottom, folded shut, reachable from every state and demanding
 * nothing until it is asked for.
 *
 * The questions are the form's, asked here in heirloom's own voice. Handing
 * someone a white Google panel in the middle of a dark room would tell them
 * they had left; five fields are few enough to lay out properly and post behind
 * the scenes.
 *
 * The address is required, because a note that cannot be placed against a plan
 * on the ledger is only an opinion. It is filled in from the connected wallet
 * rather than retyped — nobody transcribes fifty-six characters of base32
 * correctly — but it is shown in a field the person can edit or empty, not
 * carried along out of sight.
 */

type Stage = "shut" | "open" | "sending" | "sent";

export function Feedback() {
  const { address } = useWallet();
  const fieldId = useId();

  const [stage, setStage] = useState<Stage>("shut");
  const [usefulness, setUsefulness] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [failure, setFailure] = useState<string | null>(null);

  /**
   * `null` until the person types, so a wallet that connects while the form is
   * open still fills the field — and stops filling it the moment they take it
   * over. Derived here rather than corrected in an effect, which React 19
   * rightly refuses.
   */
  const [typedAddress, setTypedAddress] = useState<string | null>(null);
  const addressValue = typedAddress ?? address ?? "";

  async function send(event: React.FormEvent) {
    event.preventDefault();

    const wrong = checkFeedback({ address: addressValue, usefulness });
    if (wrong) {
      setFailure(describeProblem(wrong));
      return;
    }

    setStage("sending");
    setFailure(null);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: addressValue.trim(),
          usefulness,
          notes,
          name,
          email,
        }),
      });

      if (!response.ok) {
        const said = await response.json().catch(() => null);
        setStage("open");
        setFailure(
          typeof said?.message === "string"
            ? said.message
            : "It didn’t go through. Try again in a moment.",
        );
        return;
      }

      setStage("sent");
    } catch {
      setStage("open");
      setFailure("It didn’t go through. Try again in a moment.");
    }
  }

  if (stage === "sent") {
    return (
      <footer className={styles.footer}>
        <p className={styles.line}>Thank you — it landed.</p>
        <p className={styles.aside}>
          Nothing else is asked of you. If you think of something later, the line
          comes back on your next visit.
        </p>
      </footer>
    );
  }

  if (stage === "shut") {
    return (
      <footer className={styles.footer}>
        <p className={styles.line}>
          heirloom is new, and this is testnet.{" "}
          <button
            type="button"
            className={styles.open}
            aria-expanded={false}
            onClick={() => setStage("open")}
          >
            Tell me what confused you
          </button>
        </p>
        <p className={styles.aside}>
          Two questions and a box, answered here. It asks which wallet you tried
          it with.
        </p>
      </footer>
    );
  }

  const sending = stage === "sending";

  return (
    <footer className={styles.footer}>
      <form className={styles.form} onSubmit={send}>
        <fieldset className={styles.scale} disabled={sending}>
          <legend className={styles.label}>How useful is heirloom?</legend>
          <div className={styles.marks}>
            {USEFULNESS_CHOICES.map((score) => (
              <label
                key={score}
                className={styles.mark}
                data-on={usefulness === score || undefined}
              >
                <input
                  type="radio"
                  name="usefulness"
                  className={styles.srOnly}
                  value={score}
                  checked={usefulness === score}
                  onChange={() => setUsefulness(score)}
                />
                {score}
              </label>
            ))}
          </div>
          <p className={styles.ends}>
            <span>not at all</span>
            <span>I&rsquo;d use it</span>
          </p>
        </fieldset>

        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${fieldId}-notes`}>
            What worked, and what should change?
          </label>
          <textarea
            id={`${fieldId}-notes`}
            className={styles.textarea}
            rows={3}
            value={notes}
            disabled={sending}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor={`${fieldId}-address`}>
            The wallet you tried it with
          </label>
          <input
            id={`${fieldId}-address`}
            className={`${styles.input} mono`}
            value={addressValue}
            placeholder="G…"
            spellCheck={false}
            autoComplete="off"
            disabled={sending}
            onChange={(event) => setTypedAddress(event.target.value)}
          />
        </div>

        <div className={styles.pair}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${fieldId}-name`}>
              Name <span className={styles.optional}>optional</span>
            </label>
            <input
              id={`${fieldId}-name`}
              className={styles.input}
              value={name}
              disabled={sending}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor={`${fieldId}-email`}>
              Email <span className={styles.optional}>optional</span>
            </label>
            <input
              id={`${fieldId}-email`}
              type="email"
              className={styles.input}
              value={email}
              disabled={sending}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
        </div>

        {failure && (
          <p className={styles.failed} role="alert">
            {failure}
          </p>
        )}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.back}
            disabled={sending}
            onClick={() => setStage("shut")}
          >
            Never mind
          </button>
          <button type="submit" className={styles.send} disabled={sending}>
            {sending ? "Sending…" : "Send it"}
          </button>
        </div>
      </form>
    </footer>
  );
}
