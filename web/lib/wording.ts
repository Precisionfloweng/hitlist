// "Review wording": Claude suggests clearer deficiency or note text. Suggestions are saved per project (one file
// for deficiencies, one for notes) in the private Blob store, keyed by item, so each wording is reviewed (and paid
// for) only once.
import "server-only";
import { get, put } from "@vercel/blob";
import type { Kind, ReviewItem } from "./reviewItems";
import { toleranceFor, type Tolerances } from "./toleranceCats";

export type Review = {
  number: string;        // the item's key (deficiency number, or unit path + "#n" for notes)
  text: string;          // the wording that was reviewed
  ok: boolean;           // true = reads well, no change needed
  suggestion: string;    // rewritten text ("" when ok); ___ marks a value the tech must fill in
  why: string;           // one short line: what the rewrite adds or fixes
  other: string;         // a problem that isn't wording (e.g. assigned to own company with no contact), or ""
  kept?: { by: string; at: string };   // someone chose to keep this wording as is
};
export type WordingFile = { reviewedAt: string; items: Record<string, Review> };

const MODEL = process.env.WORDING_MODEL || "claude-sonnet-5";
const BATCH = 25;
const pathFor = (project: string, kind: Kind) =>
  `${kind === "notes" ? "wording-notes" : "wording"}/${project.replace(/[^A-Za-z0-9_.-]/g, "_")}.json`;

export async function loadWording(project: string, kind: Kind = "deficiencies"): Promise<WordingFile> {
  try {
    const r = await get(pathFor(project, kind), { access: "private", useCache: false });
    if (r && r.statusCode === 200 && r.stream) return JSON.parse(await new Response(r.stream).text()) as WordingFile;
  } catch { /* none yet */ }
  return { reviewedAt: "", items: {} };
}

async function saveWording(project: string, kind: Kind, file: WordingFile) {
  await put(pathFor(project, kind), JSON.stringify(file), {
    access: "private", allowOverwrite: true, addRandomSuffix: false, contentType: "application/json",
  });
}

const NOTES_GUIDE = `You review field notes written by HVAC test-and-balance / commissioning technicians at Precision Flow
Engineering (PFE) in BuildingStart. Notes record conditions, settings, test methods and explanations (e.g. why a
reading is low, where a damper was set, what a marker in the report means). The customer may read them in reports.

For each note decide:
- ok = true if it already reads clearly. Do not rewrite for style alone.
- ok = false if it is unclear, incomplete, hard to follow or has spelling/grammar problems, and write a suggestion:
  * Keep every fact, number, unit and tag the tech wrote. Never invent readings, settings or causes.
  * Where something needed to understand the note is missing (a value, which damper...), put ___ in its place.
  * Do NOT start with or repeat the equipment ID/tag of the unit the note is on: BuildingStart shows it already.
  * Plain, professional language, complete sentences, no markdown, no quotes around it. Keep line breaks in lists.
  * If the item has a "tolerance" and the note's own numbers show a reading outside it, you may say so
    ("outside the ±5% tolerance"). Never mention a tolerance that isn't given.
- why: one short line saying what the suggestion fixes (e.g. "Clearer sentence; spells out the abbreviation.").
- other: "" (leave empty).

Reply with ONLY a JSON array, one object per item, in the same order:
[{"number": "...", "ok": true|false, "suggestion": "...", "why": "...", "other": "..."}]`;

const GUIDE = `You review punch-list deficiencies written by HVAC test-and-balance / commissioning technicians at
Precision Flow Engineering (PFE). Contractors and the building owner read them, so each one must be clear on its own.

A good deficiency says: WHAT is wrong, WHERE (which part of the unit), the MEASURED value against the EXPECTED or
design value when there is one, WHAT is needed (repair, replace, adjust, provide, verify...) and WHO should act
(Mechanical, Controls, Electrical, GC...).

For each item decide:
- ok = true if it already reads clearly and says what is needed. Do not rewrite for style alone.
- ok = false otherwise, and write a suggestion:
  * Keep every fact, number and tag the tech wrote. Never invent readings, design values, fault codes or causes.
  * Where a needed value is missing (design GPM/CFM, fault code, which valve...), put ___ in its place.
  * Do NOT start with or repeat the equipment ID/tag (e.g. "AHU-2", "FCU-3 CC", "VAV-1-04"):
    BuildingStart adds the equipment ID to the punch list itself. Refer to the part instead ("the cooling coil",
    "the right-hand valve", "fans 2 and 3", "the pump"). Keep other tags the tech wrote (outlet S-1, fan F2...).
  * Plain, professional field language, one to three short sentences, no markdown, no quotes around it.
  * Fix spelling and grammar. Use the trade from the assigned role when it fits.
  * If the item has a "tolerance" (the project's spec, e.g. "±5% (Terminal Units)") and the tech's own numbers
    show a reading outside it, say so ("outside the ±5% tolerance"). Never mention a tolerance that isn't given.
- why: one short line saying what the suggestion adds or fixes (e.g. "Adds the design value and what's needed.").
- other: only for a problem that isn't the wording, e.g. "Assigned to your own company with no contact." Otherwise "".

Reply with ONLY a JSON array, one object per item, in the same order:
[{"number": "...", "ok": true|false, "suggestion": "...", "why": "...", "other": "..."}]`;

function payloadFor(kind: Kind, d: ReviewItem, tol: Tolerances) {
  const t = toleranceFor(d.itemType, tol);
  const tolerance = t ? `±${t.pct}% (${t.label})` : undefined;
  return kind === "notes"
    ? { number: d.key, equipment: d.equipment, equipment_type: d.itemType, path: d.path, tolerance, text: d.text }
    : { number: d.key, equipment: d.equipment, equipment_type: d.itemType, path: d.path, tolerance,
        priority: d.priority, assigned_role: d.role, assigned_contact: d.contact, text: d.text };
}

/** One call to Claude; returns the text of its reply. */
export async function callClaude(system: string, user: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("The Anthropic API key isn't set on the website yet (ANTHROPIC_API_KEY in Vercel).");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 8000, system, messages: [{ role: "user", content: user }] }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.error?.message || `HTTP ${r.status}`;
    if (/credit balance/i.test(msg)) throw new Error("The Anthropic account is out of credit. Add credit in the Anthropic Console.");
    throw new Error(`The AI request failed: ${msg}`);
  }
  return (data.content ?? []).map((c: { text?: string }) => c.text ?? "").join("");
}

/** The first {...} object in a reply. */
export function parseObject(text: string): Record<string, unknown> {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("The AI reply came back in an unexpected format. Try again.");
  return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
}

function parseArray(text: string): Partial<Review>[] {
  const start = text.indexOf("["), end = text.lastIndexOf("]");
  if (start < 0 || end < start) throw new Error("The AI reply came back in an unexpected format. Try again.");
  return JSON.parse(text.slice(start, end + 1)) as Partial<Review>[];
}

async function askClaude(kind: Kind, items: ReviewItem[], tol: Tolerances = {}): Promise<Omit<Review, "text">[]> {
  const payload = items.map((d) => payloadFor(kind, d, tol));
  const text = await callClaude(kind === "notes" ? NOTES_GUIDE : GUIDE,
    `${kind === "notes" ? "Notes" : "Deficiencies"} to review:\n${JSON.stringify(payload, null, 1)}`);
  const parsed = parseArray(text);
  return parsed.map((p) => ({
    number: String(p.number ?? ""), ok: !!p.ok, suggestion: p.ok ? "" : String(p.suggestion ?? "").trim(),
    why: String(p.why ?? "").trim(), other: String(p.other ?? "").trim(),
  }));
}

/** Review the items and save. Normally skips wording already reviewed; `all` reviews everything again. */
export async function reviewWording(project: string, kind: Kind, items: ReviewItem[], all = false,
                                    tol: Tolerances = {}): Promise<WordingFile> {
  const file = await loadWording(project, kind);
  const todo = items.filter((d) => d.text.trim() && (all || file.items[d.key]?.text !== d.text));
  const batches: ReviewItem[][] = [];
  for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
  const answers = await Promise.all(batches.map((b) => askClaude(kind, b, tol)));   // batches run side by side
  batches.forEach((batch, b) => {
    for (const d of batch) {
      const a = answers[b].find((x) => x.number === d.key);
      if (a) file.items[d.key] = { ...a, number: d.key, text: d.text, ok: a.ok || !a.suggestion };
    }
  });
  file.reviewedAt = new Date().toISOString();
  await saveWording(project, kind, file);
  return file;
}

/** "Keep as is" (or undo it) for one item's current wording. Returns the updated file. */
export async function setKept(project: string, kind: Kind, key: string, text: string, by: string, keep: boolean): Promise<WordingFile> {
  const file = await loadWording(project, kind);
  const r = file.items[key];
  if (!r || r.text !== text) throw new Error("This item's wording has changed since it was reviewed. Review it again first.");
  if (keep) r.kept = { by, at: new Date().toISOString() };
  else delete r.kept;
  await saveWording(project, kind, file);
  return file;
}

/** AI Tools "Refine": one deficiency or note typed or dictated by a tech, with what we know about the unit. */
export async function refineText(kind: Kind, text: string, unit: ReviewItem | null, existing: string[],
                                 tol: Tolerances): Promise<{ suggestion: string; why: string; other: string }> {
  const item: ReviewItem = unit ? { ...unit, key: "1", text } :
    { key: "1", label: "", equipment: "", itemType: "", path: "", text };
  const payload = { ...payloadFor(kind, item, tol), existing_on_this_unit: existing.length ? existing : undefined };
  const extra = `

This time the item was typed or dictated by a tech in the field just now, so it may be rough, abbreviated or have
dictation mistakes ("see FM" for CFM, "two hundred" for 200...). Clean it up into what they meant.
ALWAYS give a suggestion, even if the text is already fine (then fix only spelling/punctuation) - ok may be true.
If existing_on_this_unit has an item that already says the same thing, set other to e.g.
"Looks like this is already entered on this unit." Reply with a JSON array holding exactly one object.`;
  const reply = await callClaude((kind === "notes" ? NOTES_GUIDE : GUIDE) + extra,
    `${kind === "notes" ? "Note" : "Deficiency"} to refine:\n${JSON.stringify([payload], null, 1)}`);
  const p = parseArray(reply)[0] ?? {};
  return { suggestion: String(p.suggestion || text).trim(), why: String(p.why ?? "").trim(), other: String(p.other ?? "").trim() };
}
