/**
 * "3 minutes ago", "yesterday", "2 weeks ago".
 *
 * Returns null for a missing or unparseable timestamp — sessions written before a
 * field existed are a real case, so nothing about the shape is assumed.
 *
 * Lives here rather than beside one of its callers: the saved-project trees and the
 * full listing both show it, and importing between two sibling components to share
 * a formatter is how import cycles start.
 */
export function lastTouched(iso: string | null): string | null {
  if (iso === null) {
    return null;
  }

  const then = new Date(iso).getTime();

  if (Number.isNaN(then)) {
    return null;
  }

  const seconds = Math.round((then - Date.now()) / 1000);
  const format = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3600],
    ["minute", 60],
  ];

  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) {
      return format.format(Math.round(seconds / size), unit);
    }
  }

  return format.format(0, "minute");
}
