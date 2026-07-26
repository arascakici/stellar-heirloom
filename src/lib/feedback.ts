import { StrKey } from "@stellar/stellar-sdk";

/**
 * Feedback, on the way to a Google Form.
 *
 * The form stays where it is — it is where the answers are read, and there is
 * no reason to build a second place for that. What changes is where it is
 * filled in. A white Google iframe dropped into this page would announce that
 * you had left the product; the questions are few enough to ask in heirloom's
 * own voice and post behind the scenes.
 *
 * Shaping the answer is kept apart from sending it, the same way building a
 * transaction is kept apart from signing one. A body that goes to the right
 * fields is the part that can be got quietly wrong, so it is the part that is
 * tested, without anything having to be posted to prove it.
 */

/** The published form. Answers land in its responses sheet, nowhere else. */
export const FEEDBACK_FORM_ID =
  "1FAIpQLSd4l89Kd8bgjJ1-fuHWcJbDMuOIWasTU8Ljj8NaxDEH9kx0cA";

/**
 * The form's own names for its questions. These come from the form itself and
 * mean nothing without it — repointing at another form means replacing all of
 * them together, which is why they live in one object rather than five
 * environment variables that could drift apart.
 */
export const FEEDBACK_FIELDS = {
  name: "entry.1957471552",
  email: "entry.1759093621",
  address: "entry.1892039617",
  usefulness: "entry.1572784825",
  notes: "entry.1784582130",
} as const;

/** The two questions the form marks required. */
export const USEFULNESS_CHOICES = [1, 2, 3, 4, 5] as const;

export type Feedback = {
  /** The wallet this was tried with. Required, so a note can be read against a plan. */
  address: string;
  usefulness: number;
  notes: string;
  name: string;
  email: string;
};

export type FeedbackProblem =
  | "address-missing"
  | "address-invalid"
  | "usefulness-missing";

export function checkFeedback(input: {
  address: string;
  usefulness: number | null;
}): FeedbackProblem | null {
  const address = input.address.trim();
  if (!address) return "address-missing";
  if (!StrKey.isValidEd25519PublicKey(address)) return "address-invalid";
  if (input.usefulness === null) return "usefulness-missing";
  if (!USEFULNESS_CHOICES.includes(input.usefulness as 1 | 2 | 3 | 4 | 5)) {
    return "usefulness-missing";
  }
  return null;
}

export function describeProblem(problem: FeedbackProblem): string {
  switch (problem) {
    case "address-missing":
      return "The address is needed, so what you say can be read against what you did.";
    case "address-invalid":
      return "That isn’t a Stellar address — they start with G and run 56 characters.";
    case "usefulness-missing":
      return "Pick a number first.";
  }
}

/**
 * The answers as the form expects them. Empty optional answers are left out
 * rather than sent blank, so an untouched question reads as unanswered in the
 * responses rather than as an answer of nothing.
 */
export function toFormBody(feedback: Feedback): URLSearchParams {
  const body = new URLSearchParams();
  body.set(FEEDBACK_FIELDS.address, feedback.address.trim());
  body.set(FEEDBACK_FIELDS.usefulness, String(feedback.usefulness));

  const notes = feedback.notes.trim();
  if (notes) body.set(FEEDBACK_FIELDS.notes, notes);

  const name = feedback.name.trim();
  if (name) body.set(FEEDBACK_FIELDS.name, name);

  const email = feedback.email.trim();
  if (email) body.set(FEEDBACK_FIELDS.email, email);

  return body;
}

export function submitUrl(formId: string = FEEDBACK_FORM_ID): string {
  return `https://docs.google.com/forms/d/e/${formId}/formResponse`;
}
