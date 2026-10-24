/**
 * Minimal RFC 4180 CSV writer used by in-app exports.
 *
 * Two rules matter for data that came from user input:
 * 1. any field containing a comma, quote, CR or LF is wrapped in quotes and its
 *    inner quotes are doubled, so one row of data can never split into two;
 * 2. fields that start with a spreadsheet formula character are neutralised with
 *    a leading apostrophe so Excel/Sheets treat them as text, not as a formula.
 */

const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

export type CsvCell = string | number | boolean | null | undefined;

function escapeField(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  let text = typeof value === "string" ? value : String(value);
  if (FORMULA_PREFIXES.some((prefix) => text.startsWith(prefix))) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  return [headers, ...rows].map((row) => row.map(escapeField).join(",")).join("\r\n") + "\r\n";
}

/** UTF-8 byte-order mark so Excel opens exported files with accents intact. */
export const CSV_BOM = "\uFEFF";
