import { redact, type Incident } from "@/lib/incident";

/**
 * Where a broken thing gets written down.
 *
 * "Written down" means one line on the deployment's own standard error, which
 * is what the host already collects and shows. That is the entire monitoring
 * stack, and it is enough: an error tracker's value is somebody reading it, not
 * the vendor it is bought from — and every hosted one would mean shipping stack
 * traces from a wallet app to a company nobody here has any reason to trust.
 *
 * Everything arriving is untrusted and stripped again, because this route is
 * reachable by anyone who can send a POST and nothing that got here can be
 * assumed to have been through the client's own pass.
 *
 * The answer is always 204. There is nothing for the caller to learn, and a
 * report that fails should never turn into a second error in front of somebody
 * already looking at a first one.
 */

const LIMITS = {
  where: 80,
  name: 40,
  message: 300,
  digest: 64,
  stack: 600,
} as const;

export async function POST(request: Request): Promise<Response> {
  try {
    const payload: unknown = await request.json();
    if (typeof payload === "object" && payload !== null) {
      console.error(`[incident] ${JSON.stringify(clean(payload))}`);
    }
  } catch {
    // Unreadable body. Nothing to record and nothing to say about it.
  }

  return new Response(null, { status: 204 });
}

function field(value: unknown, limit: number): string | undefined {
  if (typeof value !== "string" || value === "") return undefined;
  return redact(value).slice(0, limit);
}

function clean(payload: object): Incident {
  const body = payload as Record<string, unknown>;
  const incident: Incident = {
    // Stamped here rather than taken from the caller: a timestamp the client
    // chose is a timestamp anyone can choose.
    at: `${new Date().toISOString().slice(0, 19)}Z`,
    where: field(body.where, LIMITS.where) ?? "unknown",
    name: field(body.name, LIMITS.name) ?? "Error",
    message: field(body.message, LIMITS.message) ?? "",
  };

  const digest = field(body.digest, LIMITS.digest);
  if (digest) incident.digest = digest;

  const stack = field(body.stack, LIMITS.stack);
  if (stack) incident.stack = stack;

  return incident;
}
