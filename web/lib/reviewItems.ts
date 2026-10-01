// What "Review wording" works on: open deficiencies or notes, in one common shape.
import type { Deficiency, Note } from "./results";

export type Kind = "deficiencies" | "notes";
export type ReviewItem = {
  key: string;          // deficiency number, or "<unit path>#<n>" for the n-th note on a unit
  label: string;        // "#0011" or "" for notes
  equipment: string;    // unit / sub-item name ("Project note" for general notes)
  itemType: string;
  path: string;
  text: string;
  priority?: string; role?: string; contact?: string;   // deficiencies only
};

export function deficiencyItems(defs: Deficiency[]): ReviewItem[] {
  return defs.filter((d) => d.open && d.text.trim()).map((d) => ({
    key: d.number, label: `#${d.number}`, equipment: d.equipment, itemType: d.item_type, path: d.path, text: d.text,
    priority: d.priority, role: d.role, contact: d.contact,
  }));
}

export function noteItems(notes: Note[]): ReviewItem[] {
  const seen = new Map<string, number>();
  return notes.filter((n) => n.text.trim()).map((n) => {
    const path = n.path.split("/").map((x) => x.trim()).filter(Boolean).join("/");
    const i = seen.get(path) ?? 0;
    seen.set(path, i + 1);
    return { key: `${path || "project"}#${i}`, label: "", equipment: path ? n.equipment || path : "Project note",
      itemType: n.item_type, path, text: n.text };
  });
}
