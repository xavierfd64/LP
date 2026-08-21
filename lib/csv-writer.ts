/**
 * Minimal, dependency-free CSV writer — the app has no CSV library and
 * none is needed for this: comma/quote/newline escaping per RFC 4180 is a
 * handful of lines. Rows already carry their final display values (the
 * caller decides string vs. number per cell); this only handles escaping.
 */
function escapeCell(value: string | number): string {
  const s = typeof value === "number" ? String(value) : value;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildCsv(rows: (string | number)[][]): string {
  return rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
}
