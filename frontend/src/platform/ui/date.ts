// Parses date-only strings (YYYY-MM-DD) as local time. `new Date('2025-07-13')`
// is interpreted as midnight UTC and shifts to the previous day in any negative
// timezone, so dates round down by one. This helper avoids that.
export const parseLocalDate = (v: string | Date): Date => {
  if (v instanceof Date) return v;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(v);
};

export const formatDate = (
  v: string | null | undefined,
  opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' },
  fallback = '—',
): string => {
  if (!v) return fallback;
  return parseLocalDate(v).toLocaleDateString('en-US', opts);
};
