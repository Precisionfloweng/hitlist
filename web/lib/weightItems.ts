// Item weights for one equipment type, as the admin sees them (Admin → Completion weights): a weighted item is a
// single field, or a named group of fields counted together (e.g. "Unit Data"). Stored per field on the Rules tab
// (weight, weight_group); every member of a group carries the group's weight. Client-safe.

export type FieldWeight = { order: number; field: string; weight: number | null; group: string };
export type WeightItem = { key: string; name: string; weight: number | null; group: boolean; members: { order: number; field: string }[] };

const gkey = (name: string) => `group:${name.trim().toLowerCase()}`;

/** The weighted items of a type: groups first, then single fields, each by weight (highest first). `keep`: fields to
 *  list even with no weight yet (just added, or being typed over). */
export function weightItems(fields: FieldWeight[], keep?: Set<number>): WeightItem[] {
  const groups = new Map<string, WeightItem>();
  const singles: WeightItem[] = [];
  for (const f of fields) {
    const g = f.group.trim();
    if (g) {
      const it = groups.get(gkey(g)) ?? { key: gkey(g), name: g, weight: null, group: true, members: [] };
      it.members.push({ order: f.order, field: f.field });
      if (f.weight) it.weight = Math.max(it.weight ?? 0, f.weight);
      groups.set(gkey(g), it);
    } else if (f.weight || keep?.has(f.order)) {
      singles.push({ key: `field:${f.order}`, name: f.field, weight: f.weight, group: false, members: [{ order: f.order, field: f.field }] });
    }
  }
  const byWeight = (a: WeightItem, b: WeightItem) => (b.weight ?? 0) - (a.weight ?? 0);
  return [...[...groups.values()].sort(byWeight), ...singles.sort(byWeight)];
}

/** Fields with no weight and not in a group: what "Add an item" can pick from. */
export const unweighted = <F extends FieldWeight>(fields: F[]): F[] => fields.filter((f) => !f.group.trim() && !f.weight);

/** One line per item for the change history, e.g. "22% · 43 fields" or "4%". */
export function describeItems(fields: FieldWeight[]): Map<string, string> {
  return new Map(weightItems(fields).map((it) => [it.name,
    `${it.weight ?? 0}%${it.group ? ` · ${it.members.length} field${it.members.length === 1 ? "" : "s"}` : ""}`]));
}
