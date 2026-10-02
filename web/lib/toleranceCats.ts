// Project tolerance categories (shared by the website pages and the AI prompts).
export const TOLERANCE_CATS = [
  { key: "ahu", label: "AHUs" },
  { key: "rtu", label: "RTUs" },
  { key: "fans", label: "Fans" },
  { key: "terminal", label: "Terminal Units" },
  { key: "outlets", label: "Outlets & Inlets" },
  { key: "pumps", label: "Pumps" },
  { key: "coils", label: "Coils" },
] as const;
export type ToleranceKey = (typeof TOLERANCE_CATS)[number]["key"];
export type Tolerances = Partial<Record<ToleranceKey, string>>;   // "5" means ±5 %

/** Which tolerance applies to a BuildingStart item type (sheet name) or Hitlist type key, if any. */
export function toleranceFor(itemType: string, tol: Tolerances): { label: string; pct: string } | null {
  const t = itemType.toLowerCase();
  const key: ToleranceKey | null =
    /air handling|^ahu$|make-up|^mau$/.test(t) ? "ahu"
    : /roof top|^rtu$/.test(t) ? "rtu"
    : /terminal|^vav/.test(t) ? "terminal"
    : /outlet|inlet/.test(t) ? "outlets"
    : /pump/.test(t) ? "pumps"
    : /electric/.test(t) ? null
    : /coil/.test(t) ? "coils"
    : /fan|exhaust/.test(t) ? "fans"
    : null;
  if (!key || !tol[key]) return null;
  return { label: TOLERANCE_CATS.find((c) => c.key === key)!.label, pct: tol[key]! };
}
