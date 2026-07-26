import {
  checkFeedback,
  describeProblem,
  submitUrl,
  toFormBody,
} from "@/lib/feedback";

/**
 * The one thing in heirloom that goes through a server of ours.
 *
 * Not for secrecy — the form takes anonymous answers and holds no key. It is
 * that a browser cannot post to Google Forms and read what came back: the
 * request is cross-origin, so it either fails outright or is sent opaquely,
 * where every outcome looks identical. Telling someone their note was received
 * when we have no idea would be worse than not offering the form at all. A hop
 * through here can read the status and say something true.
 *
 * Everything arriving here is untrusted, including the address — this route is
 * reachable by anyone who can send a POST, form or no form. Answers are checked
 * again on this side and capped in length. What it cannot do is stop someone
 * determined to write junk into a public form; that is the cost of a form that
 * needs no account, and it is paid at the reading end rather than by making
 * every honest person sign in first.
 */

/** Generous for a sentence, mean enough that nobody pastes a novel through it. */
const MAX_LENGTHS = {
  address: 56,
  notes: 4000,
  name: 200,
  email: 320,
} as const;

export async function POST(request: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return problem("That wasn’t readable.");
  }

  if (typeof payload !== "object" || payload === null) {
    return problem("That wasn’t readable.");
  }

  const body = payload as Record<string, unknown>;
  const address = text(body.address, MAX_LENGTHS.address);
  const notes = text(body.notes, MAX_LENGTHS.notes);
  const name = text(body.name, MAX_LENGTHS.name);
  const email = text(body.email, MAX_LENGTHS.email);
  const usefulness =
    typeof body.usefulness === "number" ? body.usefulness : null;

  const wrong = checkFeedback({ address, usefulness });
  if (wrong) return problem(describeProblem(wrong));

  let answered: Response;
  try {
    answered = await fetch(submitUrl(), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: toFormBody({
        address,
        usefulness: usefulness as number,
        notes,
        name,
        email,
      }),
    });
  } catch {
    return problem("The form could not be reached. Try again in a moment.", 502);
  }

  if (!answered.ok) {
    return problem("The form turned it away. Try again in a moment.", 502);
  }

  return Response.json({ ok: true });
}

function text(value: unknown, limit: number): string {
  return typeof value === "string" ? value.slice(0, limit) : "";
}

function problem(message: string, status = 400): Response {
  return Response.json({ ok: false, message }, { status });
}
