"use client";

import { useEffect, useState } from "react";

/**
 * The current unix time, in seconds, that re-renders on a slow tick. A plan's
 * countdown moves in minutes and days, so half a minute between ticks is plenty
 * to keep "last seen" and "takeover in" honest without spinning the CPU.
 *
 * Only ever mounted behind a connected wallet, so the initial `Date.now()` runs
 * on the client — no server render reads it, and there is nothing to mismatch.
 */
export function useNowSeconds(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const id = setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      intervalMs,
    );
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
