import type { Instrumentation } from "next";

import { toIncident } from "@/lib/incident";

/**
 * Server-side errors, written down the same way the browser's are.
 *
 * Next.js hands these over before they reach anybody, so this is the only place
 * a failure inside a route handler or a server render is visible at all. It goes
 * to standard error, which the host already collects — no agent, no vendor, and
 * nothing that could carry an address off the deployment even by accident.
 *
 * `request.path` is deliberately not recorded. heirloom has no dynamic routes
 * carrying an account in them today, and writing the rule down now is cheaper
 * than remembering it on the day somebody adds `/plan/[owner]`.
 */
export const onRequestError: Instrumentation.onRequestError = (
  error,
  _request,
  context,
) => {
  const incident = toIncident(error, `server:${context.routeType}`);
  console.error(`[incident] ${JSON.stringify(incident)}`);
};
