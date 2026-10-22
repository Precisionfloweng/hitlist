// What a customer sees of the equipment: only the main units (not their fans, coils, filters…), each Done,
// In progress or Not started from the readings of the unit and all its sub-items, and whether it has an
// open punch item. No field-by-field detail. Client-safe (no server imports).
import type { Deficiency, TypeResult } from "./results";
import { byTypeOrder } from "./typeOrder";

export type CustStatus = "done" | "progress" | "none";
export type CustUnit = { name: string; path: string; location: string; status: CustStatus; punch: number };
export type CustType = { key: string; name: string; export_sheet: string; units: CustUnit[]; done: number };
export const STATUS_LABEL: Record<CustStatus, string> = { done: "Done", progress: "In progress", none: "Not started" };

const norm = (path: string | null | undefined) => String(path ?? "").split("/").map((x) => x.trim()).filter(Boolean).join("/");

/** Types that belong to a unit rather than being one: rolled into the unit above them (by BuildingStart path). */
const SUB_KEYS = new Set(["vav_electric_heat", "duct_traverse", "face_velocity", "coil_test", "ach",
  "temp_sensor", "flow_sensor", "pressure_sensor", "autoflow_valve"]);
export const isSubType = (t: { key: string; name: string }) => /sub-item/i.test(t.name) || SUB_KEYS.has(t.key);

/** The deepest of `paths` that is `path` itself or above it (a/b/c → a/b/c, a/b, a). */
function nearest(path: string, paths: Set<string>): string | null {
  const segs = path.split("/");
  for (let i = segs.length; i > 0; i--) { const k = segs.slice(0, i).join("/"); if (paths.has(k)) return k; }
  return null;
}

export function customerTypes(types: TypeResult[], deficiencies: Deficiency[] = []): CustType[] {
  const all = types.flatMap((t) => t.units.map((u) => ({ ...u, key: norm(u.path), sub: isSubType(t) })));
  const mainPaths = new Set(all.filter((u) => !u.sub && u.key).map((u) => u.key));
  // A sub-item shows on its own only when there's no unit above it.
  const shown = new Set([...mainPaths, ...all.filter((u) => u.sub && u.key && !nearest(u.key.split("/").slice(0, -1).join("/"), mainPaths)).map((u) => u.key)]);
  const rolled = new Map<string, { req: number; filled: number }>();
  for (const u of all) {
    const owner = u.key ? (shown.has(u.key) ? u.key : nearest(u.key, mainPaths)) : null;
    if (!owner) continue;
    const r = rolled.get(owner) ?? { req: 0, filled: 0 };
    r.req += u.required; r.filled += u.required_filled; rolled.set(owner, r);
  }
  const punchBy = new Map<string, number>(), punchByName = new Map<string, number>();
  for (const d of deficiencies.filter((x) => x.open)) {
    const owner = d.path ? nearest(norm(d.path), shown) : null;
    if (owner) punchBy.set(owner, (punchBy.get(owner) ?? 0) + 1);
    else if (d.equipment) punchByName.set(d.equipment, (punchByName.get(d.equipment) ?? 0) + 1);
  }
  const out: CustType[] = [];
  for (const t of [...types].sort(byTypeOrder)) {
    const units: CustUnit[] = [];
    for (const u of t.units) {
      const k = norm(u.path);
      if (k ? !shown.has(k) : isSubType(t)) continue;               // a sub-item: counted with its unit
      const r = (k && rolled.get(k)) || { req: u.required, filled: u.required_filled };
      const status: CustStatus = r.req === 0 || r.filled >= r.req ? "done" : r.filled === 0 ? "none" : "progress";
      const punch = (k ? punchBy.get(k) ?? 0 : 0) + (punchByName.get(u.name) ?? 0);
      units.push({ name: u.name, path: u.path, location: [u.area, u.zone].filter(Boolean).join(" · "), status, punch });
    }
    if (units.length) out.push({ key: t.key, name: t.name, export_sheet: t.export_sheet, units,
      done: units.filter((u) => u.status === "done").length });
  }
  return out;
}
