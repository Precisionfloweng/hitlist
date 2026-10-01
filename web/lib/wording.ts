// "Review wording": Claude suggests clearer deficiency text. Suggestions are saved per project in the
// private Blob store, keyed by deficiency number, so each wording is only reviewed (and paid for) once.
import "server-only";
import { get, put } from "@vercel/blob";
import type { Deficiency } from "./results";

export type Review = {
  number: string;
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
const pathFor = (project: string) => `wording/${project.replace(/[^A-Za-z0-9_.-]/g, "_")}.json`;

export async function loadWording(project: string): Promise<WordingFile> {
  try {
    const r = await get(pathFor(project), { access: "private", useCache: false });
    if (r && r.statusCode === 200 && r.stream) return JSON.parse(await new Response(r.stream).text()) as WordingFile;
  } catch { /* none yet */ }
  return { reviewedAt: "", items: {} };
}

async function saveWording(project: string, file: WordingFile) {
  await put(pathFor(project), JSON.stringify(file), {
    access: "private", allowOverwrite: true, addRandomSuffix: false, contentType: "application/json",
  });
}

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
  * Do NOT start with or repeat the equipment ID/tag (e.g. "AHU-2", "CRAH-DH1100-09 CC", "VAV-0122-01"):
    BuildingStart adds the equipment ID to the punch list itself. Refer to the part instead ("the cooling coil",
    "the right-hand valve", "fans MS7-MS9", "the pump"). Keep other tags the tech wrote (outlet S-01, fan MS7...).
  * Plain, professional field language, one to three short sentences, no markdown, no quotes around it.
  * Fix spelling and grammar. Use the trade from the assigned role when it fits.
- why: one short line saying what the suggestion adds or fixes (e.g. "Adds the design value and what's needed.").
- other: only for a problem that isn't the wording, e.g. "Assigned to your own company with no contact." Otherwise "".

Reply with ONLY a JSON array, one object per item, in the same order:
[{"number": "...", "ok": true|false, "suggestion": "...", "why": "...", "other": "..."}]`;

async function askClaude(items: Deficiency[]): Promise<Omit<Review, "text">[]> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("The Anthropic API key isn't set on the website yet (ANTHROPIC_API_KEY in Vercel).");
  const payload = items.map((d) => ({
    number: d.number, equipment: d.equipment, equipment_type: d.item_type, path: d.path,
    priority: d.priority, assigned_role: d.role, assigned_contact: d.contact, text: d.text,
  }));
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL, max_tokens: 8000, system: GUIDE,
      messages: [{ role: "user", content: `Deficiencies to review:\n${JSON.stringify(payload, null, 1)}` }],
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.error?.message || `HTTP ${r.status}`;
    if (/credit balance/i.test(msg)) throw new Error("The Anthropic account is out of credit. Add credit in the Anthropic Console.");
    throw new Error(`The wording review failed: ${msg}`);
  }
  const text: string = (data.content ?? []).map((c: { text?: string }) => c.text ?? "").join("");
  const start = text.indexOf("["), end = text.lastIndexOf("]");
  if (start < 0 || end < start) throw new Error("The wording review came back in an unexpected format. Try again.");
  const parsed = JSON.parse(text.slice(start, end + 1)) as Partial<Review>[];
  return parsed.map((p) => ({
    number: String(p.number ?? ""), ok: !!p.ok, suggestion: p.ok ? "" : String(p.suggestion ?? "").trim(),
    why: String(p.why ?? "").trim(), other: String(p.other ?? "").trim(),
  }));
}

/** Review the open deficiencies and save. Normally skips wording already reviewed; `all` reviews everything again. */
export async function reviewWording(project: string, items: Deficiency[], all = false): Promise<WordingFile> {
  const file = await loadWording(project);
  const todo = items.filter((d) => d.open && d.text.trim() && (all || file.items[d.number]?.text !== d.text));
  const batches: Deficiency[][] = [];
  for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
  const answers = await Promise.all(batches.map(askClaude));         // batches run side by side
  batches.forEach((batch, b) => {
    for (const d of batch) {
      const a = answers[b].find((x) => x.number === d.number);
      if (a) file.items[d.number] = { ...a, number: d.number, text: d.text, ok: a.ok || !a.suggestion };
    }
  });
  file.reviewedAt = new Date().toISOString();
  await saveWording(project, file);
  return file;
}

/** "Keep as is" (or undo it) for one deficiency's current wording. Returns the updated file. */
export async function setKept(project: string, number: string, text: string, by: string, keep: boolean): Promise<WordingFile> {
  const file = await loadWording(project);
  const r = file.items[number];
  if (!r || r.text !== text) throw new Error("This item's wording has changed since it was reviewed. Review it again first.");
  if (keep) r.kept = { by, at: new Date().toISOString() };
  else delete r.kept;
  await saveWording(project, file);
  return file;
}
