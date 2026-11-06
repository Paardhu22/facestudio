const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/** Binary-prefix size, e.g. `1.5 MB`. Whole numbers below 10 keep one decimal for readability. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 10 ? 0 : 1;
  return `${value.toFixed(digits)} ${UNITS[unit]}`;
}

const countFormat = new Intl.NumberFormat('en-US');

export function formatCount(count: number): string {
  return countFormat.format(count);
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatCount(count)} ${count === 1 ? singular : plural}`;
}
