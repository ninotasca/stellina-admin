const USD_WHOLE_DOLLARS = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

/** Format a dollar amount without cents, always rounding down first. */
export const formatWholeDollars = (amount: number): string =>
  USD_WHOLE_DOLLARS.format(Math.floor(amount));

/** Compact whole-dollar display used by chart axes (for example, $12k). */
export const formatWholeDollarsCompact = (amount: number): string => {
  if (Math.abs(amount) < 1000) return formatWholeDollars(amount);

  const thousands = Math.floor(amount / 1000);
  const sign = thousands < 0 ? '-' : '';
  return `${sign}$${Math.abs(thousands).toLocaleString('en-US')}k`;
};
