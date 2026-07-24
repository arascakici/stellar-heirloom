/**
 * Turning seconds into words. Plans are written in whole units (30 days, 6
 * hours), so `formatDuration` finds the largest unit that divides evenly and
 * says the period back the way it was set. `humanizeApprox` is for the moving
 * numbers — time since a heartbeat, time left before a takeover — where the
 * count is arbitrary and the largest sensible unit is all anyone reads.
 */

type Unit = { label: string; seconds: bigint };

const UNITS: Unit[] = [
  { label: "day", seconds: 86_400n },
  { label: "hour", seconds: 3_600n },
  { label: "minute", seconds: 60n },
  { label: "second", seconds: 1n },
];

function plural(count: bigint | number, label: string): string {
  return `${count} ${label}${count === 1 || count === 1n ? "" : "s"}`;
}

/** An exact period, phrased in the largest unit that divides it cleanly. */
export function formatDuration(totalSeconds: bigint): string {
  if (totalSeconds <= 0n) return "no time";
  for (const unit of UNITS) {
    if (totalSeconds % unit.seconds === 0n) {
      return plural(totalSeconds / unit.seconds, unit.label);
    }
  }
  return plural(totalSeconds, "second");
}

/** A rough duration for a live figure — the largest whole unit that fits. */
export function humanizeApprox(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const day = 86_400;
  const hour = 3_600;
  const minute = 60;
  if (whole >= day) return plural(Math.floor(whole / day), "day");
  if (whole >= hour) return plural(Math.floor(whole / hour), "hour");
  if (whole >= minute) return plural(Math.floor(whole / minute), "minute");
  return plural(whole, "second");
}
