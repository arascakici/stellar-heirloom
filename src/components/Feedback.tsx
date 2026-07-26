"use client";

import { useWallet } from "@/lib/wallet/WalletProvider";

import styles from "./Feedback.module.css";

/**
 * A way to say what went wrong, kept out of the ceremony's way.
 *
 * It sits under the plate rather than inside it. The one moment a person has
 * the strongest opinion is the moment they have just sealed a plan — but that
 * is also the moment the chest is shutting over it, and interrupting that to
 * ask for a rating would cheapen the thing the whole screen is for. So the line
 * waits at the bottom, reachable from every state and demanding nothing.
 *
 * The form asks for the wallet address and asks for it outright, so the address
 * is carried over rather than left to be retyped from memory — nobody
 * transcribes fifty-six characters of base32 correctly, and a form that is hard
 * to finish collects nothing. It is prefilled, not hidden: the field is visible
 * and editable on the other side, so the person can see exactly what is being
 * sent and clear it if they would rather not say.
 *
 * Defaults in code with an environment override, the same way the contract ids
 * work, so the link is live out of the box. Both values belong together — a URL
 * pointing at one form and a field id belonging to another would prefill
 * nothing, silently.
 */
const FEEDBACK_URL =
  process.env.NEXT_PUBLIC_FEEDBACK_URL ??
  "https://docs.google.com/forms/d/e/1FAIpQLSd4l89Kd8bgjJ1-fuHWcJbDMuOIWasTU8Ljj8NaxDEH9kx0cA/viewform";

/** The form's own name for its wallet-address question. */
const ADDRESS_FIELD =
  process.env.NEXT_PUBLIC_FEEDBACK_ADDRESS_FIELD ?? "entry.1892039617";

/** `usp=pp_url` is what tells Google Forms to read the entry parameters at all. */
function formUrl(address: string | null): string {
  if (!address || !ADDRESS_FIELD) return FEEDBACK_URL;
  const separator = FEEDBACK_URL.includes("?") ? "&" : "?";
  return `${FEEDBACK_URL}${separator}usp=pp_url&${ADDRESS_FIELD}=${encodeURIComponent(address)}`;
}

export function Feedback() {
  const { address } = useWallet();

  // Setting the variable to an empty string is how a fork turns the line off,
  // rather than being made to carry a link to someone else's form.
  if (!FEEDBACK_URL) return null;

  return (
    <footer className={styles.footer}>
      <p className={styles.line}>
        heirloom is new, and this is testnet.{" "}
        <a
          className={styles.link}
          href={formUrl(address)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Tell me what confused you
        </a>
      </p>
      <p className={styles.aside}>
        {address
          ? "Five questions, two minutes. Your address goes with you, so what you say can be read against the plans you actually made."
          : "Five questions, two minutes. It asks for the wallet address you tried this with."}
      </p>
    </footer>
  );
}
