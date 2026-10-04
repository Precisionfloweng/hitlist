// "Search the Documents": a project's Dropbox documents (specs, submittals, drawings, ASIs/RFIs, change
// orders, deficiency reports) as page text, sent by the server, the page search the AI uses (lib/agent.ts), and
// the saved questions and answers.
import "server-only";
import { gunzipSync } from "node:zlib";
import { del, get, list, put } from "@vercel/blob";
import type { Tolerances } from "./toleranceCats";

export type DocFile = { id: string; category: string; name: string; path: string; modified: string;
  hash: string; size: number; pages: number; parts: string[] };
export type Manifest = { project: string; folder: { id: string; path: string; name: string }; updated_at: string;
  found: Record<string, number>; missing?: string[]; other_types?: Record<string, string[]>;
  files: DocFile[]; skipped: (DocFile & { reason: string })[] };
/** A cited excerpt: a document page ([S#]) or BuildingStart data ([B#], category "BuildingStart", page 0). */
export type Source = { id: string; category: string; path: string; name: string; page: number; modified: string };
/** One question and its answer; a thread's follow-ups are in replies (each one an Answer too). */
export type Answer = { question: string; answer: string; found: boolean; sources: Source[]; replies?: Answer[];
  table?: { columns: string[]; rows: string[][] };
  tolerances: Tolerances | null; at: string; by: string };
export type Mode = "ask" | "tolerances" | "tab" | "design" | "dv_drawings" | "dv_submittals" | "dv_compare";
/** Folders a Suggestion may search (the AI's document search is limited to these). */
export const MODE_FOLDERS: Partial<Record<Mode, string[]>> = {
  dv_drawings: ["Drawings and Specs", "ASIs and RFIs", "Change Orders"],
  dv_submittals: ["Submittal", "ASIs and RFIs", "Change Orders"],
};

const safe = (project: string) => project.replace(/[^A-Za-z0-9_.-]/g, "_");
const dir = (project: string) => `docs/${safe(project)}/`;

async function readBlob(path: string): Promise<Buffer | null> {
  try {
    const r = await get(path, { access: "private", useCache: false });
    if (!r || r.statusCode !== 200 || !r.stream) return null;
    return Buffer.from(await new Response(r.stream).arrayBuffer());
  } catch {
    return null;
  }
}

/** Save one gzipped part from the server. After the manifest, delete parts it no longer uses. */
export async function saveDocsPart(project: string, part: string, body: Buffer) {
  const manifest = part === "manifest" ? (JSON.parse(gunzipSync(body).toString("utf8")) as Manifest) : null;
  await put(dir(project) + part, body, {
    access: "private", allowOverwrite: true, addRandomSuffix: false, contentType: "application/gzip",
  });
  if (manifest) {
    cache.delete(project);
    const keep = new Set(["manifest", ...manifest.files.flatMap((f) => f.parts)]);
    const old: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: dir(project), cursor, limit: 1000 });
      for (const b of page.blobs) if (!keep.has(b.pathname.slice(dir(project).length))) old.push(b.url);
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    if (old.length) await del(old);
  }
}

export async function loadManifest(project: string): Promise<Manifest | null> {
  const b = await readBlob(dir(project) + "manifest");
  return b ? (JSON.parse(gunzipSync(b).toString("utf8")) as Manifest) : null;
}

export type Page = { file: DocFile; page: number; text: string; low: string };
const cache = new Map<string, { updated: string; pages: Page[] }>();

export async function loadPages(project: string, manifest: Manifest): Promise<Page[]> {
  const hit = cache.get(project);
  if (hit && hit.updated === manifest.updated_at) return hit.pages;
  const pages: Page[] = [];
  await Promise.all(manifest.files.flatMap((file) => file.parts.map(async (part) => {
    const b = await readBlob(dir(project) + part);
    if (!b) return;
    const data = JSON.parse(gunzipSync(b).toString("utf8")) as { start: number; pages: string[] };
    data.pages.forEach((text, i) => {
      if (text.trim()) pages.push({ file, page: data.start + i + 1, text, low: text.toLowerCase().replace(/\s+/g, " ") });
    });
  })));
  cache.set(project, { updated: manifest.updated_at, pages });
  return pages;
}

// ---- finding the right pages ----------------------------------------------------------------
const STOP = new Set(("the and for are what with that this from have has was were will would should could there their " +
  "about which when where who how does did any all can into per each than then them they its it's is of to in on at " +
  "by be or an as a i me my we our you your give list show tell find value values please").split(" "));
const EQUIP = new Set(("ahu rtu fcu vav ef sf rf cu hp wshp crah crac doas mau erv hrv ch chwp hwp cwp ct uh cuh fpb fptu " +
  "b p pp sp gp ac rh eh vfd fc").split(" "));
const ESC = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Equipment tags in the question (AHU-16, ahu 16, VAV 2-04...), as patterns matching how documents write them. */
export function tagPatterns(q: string): RegExp[] {
  const out: RegExp[] = [];
  // Whole tags exactly as typed (AHU-B2-01, VAV-2-04): letters and digits joined by dashes/dots.
  for (const m of q.matchAll(/\b[A-Za-z]+[\s-]?[A-Za-z]*\d[\w]*(?:[-.][\w]+)+\b/g)) {
    const parts = m[0].toLowerCase().split(/[\s.-]+/).map(ESC);
    out.push(new RegExp(`(?<![a-z0-9])${parts.join("[\\s.-]?")}(?![a-z0-9])`, "g"));
  }
  for (const m of q.matchAll(/\b([A-Za-z]{1,6})[\s-]?(\d{1,4}[A-Za-z]?(?:[-.]\d{1,3}[A-Za-z]?)*)\b/g)) {
    const [, letters, num] = m;
    if (letters !== letters.toUpperCase() && !EQUIP.has(letters.toLowerCase())) continue;
    const n = num.toLowerCase().replace(/^0+(?=\d)/, "");
    const numPat = n.split(/[-.]/).map(ESC).join("[-.]");
    out.push(new RegExp(`(?<![a-z0-9])${ESC(letters.toLowerCase())}[\\s-]?0*${numPat}(?![0-9])`, "g"));
  }
  return out;
}

const EXTRA: Record<Mode, string[]> = {
  ask: [],
  tolerances: ["tolerance", "tolerances", "plus or minus", "±", "+/-", "percent", "balancing", "23 05 93", "design"],
  tab: ["testing, adjusting", "balancing", "23 05 93", "tab", "report", "submit", "instrument", "certified"],
  design: ["cfm", "gpm", "schedule", "airflow", "static", "outside air", "hp", "rpm"],
  dv_drawings: [], dv_submittals: [], dv_compare: [],
};
const FAVOR: Record<Mode, string[]> = {
  ask: [], tolerances: ["Drawings and Specs"], tab: ["Drawings and Specs"],
  design: ["Submittal", "Drawings and Specs"], dv_drawings: [], dv_submittals: [], dv_compare: [],
};

// Field shorthand: a word in the question also matches these (lower weight).
const SYN: Record<string, string[]> = {
  velocity: ["vel", "fpm"], area: ["ft2", "ft²", "sq ft", "sq. ft", "sqft"], airflow: ["cfm", "air vol", "air volume", "scfm"],
  cfm: ["airflow", "air vol"], gpm: ["flow rate", "fluid flow", "gal/min", "water flow"], static: ["esp", "tsp", "in. wg", "in wg", "w.g."],
  pressure: ["in. wg", "in wg", "psi", "head"], motor: ["hp", "bhp", "fla"], horsepower: ["hp", "bhp"],
  outside: ["oa ", "outdoor air"], coil: ["chw", "hw coil", "cooling coil"], fan: ["fan wheel", "rpm"],
};

/** Words that sit next to the unit's tag (in the same schedule row) and are rare in the project: usually its
 *  model number and manufacturer, which is how submittals name the unit instead of the engineer's tag. */
function modelTerms(pages: Page[], tags: RegExp[], skip: Set<string>, df: (t: string) => number, N: number): string[] {
  const near = new Map<string, number>();
  const withTag = pages.filter((p) => tags.some((re) => { re.lastIndex = 0; return re.test(p.low); })).slice(0, 60);
  for (const p of withTag) {
    const lines = p.text.toLowerCase().split("\n");
    lines.forEach((line, i) => {
      if (!tags.some((re) => { re.lastIndex = 0; return re.test(line); })) return;
      for (const l of lines.slice(i, i + 20)) {
        for (const tok of l.match(/[a-z0-9][a-z0-9-]{2,}/g) ?? []) {
          if (!/[a-z]/.test(tok) || STOP.has(tok) || skip.has(tok) || tags.some((re) => { re.lastIndex = 0; return re.test(tok); })) continue;
          near.set(tok, (near.get(tok) ?? 0) + 1);
        }
      }
    });
  }
  return [...near.keys()]
    .map((t) => ({ t, d: df(t) }))
    .filter((x) => x.d > 0 && x.d / N < 0.03)                // rare in the project = specific to this unit or model
    .sort((a, b) => a.d - b.d || (near.get(b.t) ?? 0) - (near.get(a.t) ?? 0))
    .slice(0, 8).map((x) => x.t);
}

export function findPages(pages: Page[], question: string, mode: Mode, maxChars = 140_000, maxPages = 40) {
  const N = pages.length || 1;
  const dfCache = new Map<string, number>();
  const df = (t: string) => {
    if (!dfCache.has(t)) dfCache.set(t, pages.reduce((n, p) => n + (p.low.includes(t) ? 1 : 0), 0));
    return dfCache.get(t)!;
  };
  const idf = (t: string) => Math.log(1 + N / (1 + df(t)));
  const tags = tagPatterns(question);
  const words = [...new Set(question.toLowerCase().match(/[a-z][a-z0-9/-]{2,}|\d{2,}/g) ?? [])].filter((w) => !STOP.has(w));
  const main = [...new Set([...words, ...EXTRA[mode]])];
  const syn = [...new Set(words.flatMap((w) => SYN[w] ?? []))].filter((t) => !main.includes(t));
  const models = tags.length ? modelTerms(pages, tags, new Set([...main, ...syn]), df, N) : [];

  const scored = pages.map((p) => {
    let s = 0;
    let tagHits = 0;
    for (const re of tags) {
      re.lastIndex = 0;
      const n = Math.min((p.low.match(re) ?? []).length, 6);
      if (n) { tagHits++; s += 12 + 3 * n; }
    }
    for (const t of main) if (p.low.includes(t)) s += idf(t) * (EXTRA[mode].includes(t) ? 1.5 : 1);
    for (const t of syn) if (p.low.includes(t)) s += idf(t) * 0.7;
    let modelHits = 0;
    for (const t of models) if (p.low.includes(t)) { modelHits++; s += idf(t) * 1.2; }
    if (modelHits >= 2 && p.file.category === "Submittal") s *= 1.3;
    if (tags.length && !tagHits && !modelHits) s *= 0.4;      // asked about a unit: pages naming it (or its model) first
    if (FAVOR[mode].includes(p.file.category)) s *= 1.4;
    return { p, s };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);

  // A few of the best pages from every folder first, so one folder can't crowd out the others, then the rest by score.
  const picked = new Set<Page>();
  const byCat = new Map<string, { p: Page; s: number }[]>();
  for (const x of scored) byCat.set(x.p.file.category, [...(byCat.get(x.p.file.category) ?? []), x]);
  const top = scored[0]?.s ?? 0;
  for (const list of byCat.values()) list.filter((x) => x.s >= top * 0.15).slice(0, 4).forEach((x) => picked.add(x.p));
  const order = [...scored.filter((x) => picked.has(x.p)), ...scored.filter((x) => !picked.has(x.p))];
  const out: Page[] = [];
  let chars = 0;
  for (const { p } of order) {
    if (out.length >= maxPages) break;
    if (chars + p.text.length > maxChars) continue;
    out.push(p);
    chars += p.text.length;
  }
  return out;
}

// ---- quick questions (the ✨ Suggestions) -----------------------------------------------------
export const QUICK: Record<Exclude<Mode, "ask">, (unit?: string) => string> = {
  tolerances: () => "What are the TAB tolerances (plus and minus percent of design) in the spec for each kind of equipment: air handlers and rooftop units (supply, return and outside air), supply/return/exhaust fans, supply/return/exhaust outlets and inlets, terminal units (max and min airflow), fan coils/heat pumps/split systems/unit heaters (airflow), pumps, coils and terminal-unit/FCU coils?",
  tab: () => "What does the spec require for testing, adjusting and balancing: what must be tested and reported, instrument and certification requirements, and anything unusual the TAB tech should know?",
  design: (unit) => `What are the design values for ${unit || "this unit"}: airflow (CFM), outside air, external/total static pressure, water flow (GPM), motor HP and anything else scheduled for it?`,
  dv_drawings: (unit) => `Design values for ${unit} from the DRAWINGS only (equipment schedules in Drawings and Specs, and any ASI/RFI/change order that revised them). Don't use BuildingStart values or submittals for the answer (you may look up the unit in BuildingStart only to find its model or coils). Cover the design value list, including every coil that belongs to the unit.`,
  dv_submittals: (unit) => `Design values for ${unit} from the SUBMITTALS only (the Submittal folder, and any ASI/RFI/change order that revised them). Submittals usually name the unit by model number: find the model (from the schedule or BuildingStart) and match it, and say which model you matched by. Don't use BuildingStart values for the answer. Cover the design value list, including every coil that belongs to the unit.`,
  dv_compare: (unit) => `Compare the design values for ${unit} across all three sources: BuildingStart (what's entered), the drawings (schedule) and the submittal. Put them in the answer form's table: one row per value, columns Value | BuildingStart | Drawings | Submittal | Match ("✓" when the sources that give it agree, "Mismatch" when they don't), "not found" where a source doesn't give it, each value cited; group coils as their own rows (e.g. "CC – EWT"). Then list the mismatches in the answer text. Cover the design value list, including every coil that belongs to the unit.`,
};

// ---- questions already asked -----------------------------------------------------------------
const historyPath = (project: string) => `docs-qa/${safe(project)}.json`;

export async function loadHistory(project: string): Promise<Answer[]> {
  const b = await readBlob(historyPath(project));
  try { return b ? (JSON.parse(b.toString("utf8")) as Answer[]) : []; } catch { return []; }
}

export async function writeHistory(project: string, list: Answer[]) {
  await put(historyPath(project), JSON.stringify(list), {
    access: "private", allowOverwrite: true, addRandomSuffix: false, contentType: "application/json",
  });
}

export async function saveHistory(project: string, a: Answer) {
  await writeHistory(project, [a, ...(await loadHistory(project))].slice(0, 50));
}

/** Remove one answer for good (it's identified by when it was asked). Returns the remaining list. */
export async function removeAnswer(project: string, at: string): Promise<Answer[]> {
  const list = await loadHistory(project);
  const left = list.filter((a) => a.at !== at);
  if (left.length !== list.length) await writeHistory(project, left);
  return left;
}

/** Remove everything stored for a deleted project: document text, its file list and the question history. */
export async function deleteProjectDocs(project: string) {
  const urls: string[] = [];
  let cursor: string | undefined;
  try {
    do {
      const page = await list({ prefix: dir(project), cursor, limit: 1000 });
      urls.push(...page.blobs.map((b) => b.url));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    if (urls.length) await del(urls);
  } catch { /* nothing stored */ }
  try { await del(historyPath(project)); } catch { /* none */ }
  cache.delete(project);
}
