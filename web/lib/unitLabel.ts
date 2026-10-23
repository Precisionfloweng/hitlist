// The small grey line under a unit's tag. For grilles (Supply Outlet, Return Inlet, Exhaust Inlet) it names the unit
// the grille is on, from its BuildingStart Full Path ("AHU-1/VAV-1-04/S-09" → "VAV-1-04"), then its area — so two
// grilles both tagged S-09 can be told apart. Other equipment: just the area. Client-safe.
import { isOutletSheet } from "./tolCheck";

/** The unit a grille is on: the part of its Full Path just above the grille itself ("" if none). */
export function parentTag(path: string | null | undefined): string {
  const segs = String(path ?? "").split("/").map((s) => s.trim()).filter(Boolean);
  return segs.length > 1 ? segs[segs.length - 2] : "";
}

export function unitWhere(sheet: string, path: string | null | undefined, area?: string | null): string {
  const a = String(area ?? "").trim();
  if (!isOutletSheet(sheet)) return a;
  return [parentTag(path), a].filter(Boolean).join(" · ");
}
