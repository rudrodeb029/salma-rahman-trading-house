export { exportToPDF } from './pdf-export';
export type { PdfExportOptions, PdfSummaryItem } from './pdf-export';

const inrFormatter = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 0,
});

/**
 * Formats a number in BDT with South Asian lakh/crore grouping.
 * Example: 184250 -> '৳1,84,250', -12500 -> '-৳12,500'
 */
export function formatBDT(n: number): string {
  if (!Number.isFinite(n)) return '৳0';
  const rounded = Math.round(n);
  if (rounded === 0) return '৳0';
  const sign = rounded < 0 ? '-' : '';
  return `${sign}৳${inrFormatter.format(Math.abs(rounded))}`;
}

/**
 * Compact BDT format for KPI cards and chart ticks.
 * Examples: 1840000 -> '৳18.4L', 47000 -> '৳47K', 12500000 -> '৳1.25Cr'
 */
export function formatCompactBDT(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '৳0';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);

  if (abs >= 10_000_000) {
    const val = (abs / 10_000_000).toFixed(2).replace(/\.?0+$/, '');
    return `${sign}৳${val}Cr`;
  }
  if (abs >= 100_000) {
    const val = (abs / 100_000).toFixed(1).replace(/\.0$/, '');
    return `${sign}৳${val}L`;
  }
  if (abs >= 1_000) {
    const val = (abs / 1_000).toFixed(1).replace(/\.0$/, '');
    return `${sign}৳${val}K`;
  }
  return `${sign}৳${Math.round(abs)}`;
}

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/**
 * Formats an ISO date string ('YYYY-MM-DD' or 'YYYY-MM') cleanly without timezone drift.
 */
export function formatDate(iso: string): string {
  if (!iso) return '—';
  const parts = iso.split('-');
  if (parts.length === 2) {
    const year = parts[0];
    const monthIdx = Number(parts[1]) - 1;
    const monthName = SHORT_MONTHS[monthIdx];
    if (year && monthName) return `${monthName} ${year}`;
  }
  if (parts.length >= 3) {
    const year = parts[0];
    const monthIdx = Number(parts[1]) - 1;
    const day = Number(parts[2]?.slice(0, 2));
    const monthName = SHORT_MONTHS[monthIdx];
    if (year && monthName && !Number.isNaN(day)) {
      return `${String(day).padStart(2, '0')} ${monthName} ${year}`;
    }
  }
  return iso;
}

/**
 * Returns today's date as YYYY-MM-DD in local time.
 */
export function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function escapeCSVCell(value: string | number): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Exports tabular data to a UTF-8 CSV file in the browser (SSR-safe).
 */
export function exportToCSV(
  filename: string,
  headers: string[],
  rows: (string | number)[][],
): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const csvLines = [
    headers.map(escapeCSVCell).join(','),
    ...rows.map((row) => row.map(escapeCSVCell).join(',')),
  ];
  const bom = '\uFEFF';
  const blob = new Blob([bom + csvLines.join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
