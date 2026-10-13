// How Hitlist shows certain values, whatever BuildingStart or the AI wrote. RPM (design, actual, motor, fan…) is
// always a whole number with no thousands comma: 1400, never 1,400.0.
const isRpm = (field: string) => /rpm/i.test(field);

/** 1,400.0 / "1400.4" / 1400 → "1400"; anything that isn't a number is left as it is. */
export function wholeNumber(v: unknown): string {
  const t = String(v ?? "").trim();
  const n = Number(t.replace(/,/g, ""));
  return t !== "" && /^-?[\d,]+(\.\d+)?$/.test(t) && isFinite(n) ? String(Math.round(n)) : t;
}

/** A value for display, given its field (column) name. */
export function displayValue(field: string, v: unknown): string {
  if (typeof v === "boolean") return v ? "yes" : "no";
  return isRpm(field) ? wholeNumber(v) : String(v);
}

/** RPM numbers inside text: "1,400.0 RPM" / "RPM 1,400.0" / "RPM: 1,150.0" → whole numbers, no comma. */
export function cleanRpmText(text: string): string {
  return text
    .replace(/(\d[\d,]*(?:\.\d+)?)(\s*RPM)/gi, (_, n, u) => wholeNumber(n) + u)
    .replace(/(RPM\b[^\d\n]{0,12})(\d[\d,]*(?:\.\d+)?)/gi, (_, a, n) => a + wholeNumber(n));
}

/** A comparison table: in rows about RPM, every number is a whole number with no comma (citations kept). */
export function cleanRpmTable(t: { columns: string[]; rows: string[][] }) {
  return { ...t, rows: t.rows.map((r) => (isRpm(r[0] ?? "") ? r.map((c, i) => (i === 0 ? c : c.replace(/\d[\d,]*(?:\.\d+)?/g, (n) => wholeNumber(n)))) : r)) };
}
