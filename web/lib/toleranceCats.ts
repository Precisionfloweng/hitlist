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

/** Which tolerance category a BuildingStart item type (sheet name) or Hitlist type belongs to, if any. */
export function categoryOf(itemType: string): ToleranceKey | null {
  const t = itemType.toLowerCase();
  return /air handling|^ahu$|make-up|^mau$/.test(t) ? "ahu"
    : /roof top|^rtu$/.test(t) ? "rtu"
    : /terminal|^vav/.test(t) ? "terminal"
    : /outlet|inlet/.test(t) ? "outlets"
    : /pump/.test(t) ? "pumps"
    : /electric|fan coil|^fcu$/.test(t) ? null        // FCUs have no category of their own (yet)
    : /coil/.test(t) ? "coils"
    : /fan|exhaust/.test(t) ? "fans"
    : null;
}

/** The tolerance that applies to an item type, if the project has one for its category. */
export function toleranceFor(itemType: string, tol: Tolerances): { label: string; pct: string } | null {
  const key = categoryOf(itemType);
  if (!key || !tol[key]) return null;
  return { label: TOLERANCE_CATS.find((c) => c.key === key)!.label, pct: tol[key]! };
}
