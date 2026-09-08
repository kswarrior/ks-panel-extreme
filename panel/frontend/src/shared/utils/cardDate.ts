/**
 * Card-date helpers with a Go zero-time guard.
 *
 * The API sometimes returns Go's zero time ("0001-01-01T00:00:00Z") for
 * missing timestamps. `new Date("0001-01-01T00:00:00Z")` is a *valid* Date
 * (year 1), so a truthiness check (`if (x.updated_at)`) still passes and
 * cards render "Jan 1, 1" / "1/1/1". These helpers treat missing, unparseable
 * (NaN), or year <= 1 dates as invalid.
 */

export function cardTimeMs(iso?: string | null): number {
  if (!iso) return 0;
  const d = new Date(iso);
  if (isNaN(d.getTime()) || d.getFullYear() <= 1) return 0;
  return d.getTime();
}

export function formatCardDate(
  iso?: string | null,
  opts?: Intl.DateTimeFormatOptions,
): string | null {
  if (!cardTimeMs(iso)) return null;
  return new Date(iso as string).toLocaleDateString(
    undefined,
    opts ?? { year: 'numeric', month: 'short', day: 'numeric' },
  );
}

export function formatCardDateTime(iso?: string | null): string | null {
  if (!cardTimeMs(iso)) return null;
  return new Date(iso as string).toLocaleString();
}
