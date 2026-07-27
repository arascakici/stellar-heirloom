/**
 * Errors, reported without reporting the person.
 *
 * heirloom's whole argument is that you should not have to hand your account to
 * anybody. An error tracker is where that argument usually quietly dies: the
 * default setup ships breadcrumbs, URLs, form values and session replays to a
 * third party, and a wallet address in a stack trace is still a wallet address.
 * So nothing here leaves the deployment, and everything is stripped before it is
 * even written down.
 *
 * Stripping happens twice — once where the error is caught and once again on the
 * server that records it. That is not belt and braces for its own sake: the
 * route is reachable by anyone who can send a POST, so what arrives there cannot
 * be assumed to have been through the first pass.
 *
 * What survives is what is actually useful for fixing something: where it
 * happened, what kind of error it was, and the shape of the message. What does
 * not survive is who it happened to.
 */

export type Incident = {
  /** ISO-8601, second resolution — enough to line up against a deploy. */
  at: string;
  /** Which boundary caught it: a page, the root, a background read. */
  where: string;
  name: string;
  message: string;
  /** Next.js's own id for a server error, which is how it is matched up. */
  digest?: string;
  /** First few frames only, and only file positions. */
  stack?: string;
};

/**
 * Every shape of secret or identifier this app handles.
 *
 * Order matters: a secret key must be caught before the generic strkey rule, so
 * that it is never merely called "an address". If one ever does reach here,
 * that is a bug worth seeing in the log as loudly as possible — hence its own
 * placeholder rather than a shared one.
 */
const RULES: [RegExp, string][] = [
  // Stellar secret seed. Should be impossible; say so unmistakably if not.
  [/\bS[A-Z2-7]{55}\b/g, "[SECRET-KEY-LEAKED]"],
  // Account and muxed account ids.
  [/\b[GM][A-Z2-7]{55,}\b/g, "[address]"],
  // Contract ids.
  [/\bC[A-Z2-7]{55}\b/g, "[contract]"],
  // Transaction hashes and other 64-character hex.
  [/\b[0-9a-fA-F]{64}\b/g, "[hash]"],
  [/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]"],
  // A signed envelope, or any other long base64 run.
  [/[A-Za-z0-9+/]{80,}={0,2}/g, "[payload]"],
];

export function redact(text: string): string {
  let clean = text;
  for (const [pattern, replacement] of RULES) {
    clean = clean.replace(pattern, replacement);
  }
  return clean;
}

/** Long enough to be a message, short enough not to be a document. */
const MAX_MESSAGE = 300;
const MAX_STACK_FRAMES = 4;

/**
 * Frames, with the function names dropped.
 *
 * A file and a line say where to look. A function name adds little and is the
 * part most likely to have been handed an argument worth hiding.
 */
function trimStack(stack: string): string {
  return stack
    .split("\n")
    .slice(1, MAX_STACK_FRAMES + 1)
    .map((line) => redact(line.trim()))
    .join(" ");
}

export function toIncident(
  error: unknown,
  where: string,
  now: Date = new Date(),
): Incident {
  const isError = error instanceof Error;
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String((error as { digest?: unknown }).digest)
      : undefined;

  const incident: Incident = {
    at: `${now.toISOString().slice(0, 19)}Z`,
    where: redact(where).slice(0, 80),
    name: isError ? error.name : typeof error,
    message: redact(isError ? error.message : String(error)).slice(
      0,
      MAX_MESSAGE,
    ),
  };

  if (digest && digest !== "undefined") incident.digest = redact(digest);
  if (isError && error.stack) incident.stack = trimStack(error.stack);

  return incident;
}

/**
 * Tell the deployment something broke.
 *
 * Deliberately fire-and-forget and deliberately silent on failure: an error
 * report that throws its own error, or that shows the person a second failure
 * about the first, has made their day worse for our benefit. `keepalive` so a
 * report survives the navigation that a crash often causes.
 */
export function report(error: unknown, where: string): void {
  if (typeof fetch !== "function") return;

  try {
    void fetch("/api/incident", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(toIncident(error, where)),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Reporting is never worth an exception of its own.
  }
}
