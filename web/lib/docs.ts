// "Search the Documents": a project's Dropbox documents (specs, submittals, drawings, TAB plan, ASIs/RFIs,
// change orders) as page text, sent by the server. A question finds the best-matching pages and only
// those go to Claude, which answers with the file and page for each value.
import "server-only";
import { gunzipSync } from "node:zlib";
import { del, get, list, put } from "@vercel/blob";
import { callClaudeForm } from "./wording";
import { normalizeTolerances, TOLERANCE_CATS, type Tolerances } from "./toleranceCats";
import { bsExcerpts, loadValues } from "./bsvalues";
import { loadResults } from "./results";

export type DocFile = { id: string; category: string; name: string; path: string; modified: string;
  hash: string; size: number; pages: number; parts: string[] };
export type Manifest = { project: string; folder: { id: string; path: string; name: string }; updated_at: string;
  found: Record<string, number>; missing?: string[]; other_types?: Record<string, string[]>;
  files: DocFile[]; skipped: (DocFile & { reason: string })[] };
/** A cited excerpt: a document page ([S#]) or BuildingStart data ([B#], category "BuildingStart", page 0). */
export type Source = { id: string; category: string; path: string; name: string; page: number; modified: string };
export type Answer = { question: string; answer: string; found: boolean; sources: Source[];
  tolerances: Tolerances | null; at: string; by: string };
export type Mode = "ask" | "tolerances" | "tab" | "design";

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

type Page = { file: DocFile; page: number; text: string; low: string };
const cache = new Map<string, { updated: string; pages: Page[] }>();

async function loadPages(project: string, manifest: Manifest): Promise<Page[]> {
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
};
const FAVOR: Record<Mode, string[]> = {
  ask: [], tolerances: ["Drawings and Specs", "TAB Plan"], tab: ["Drawings and Specs", "TAB Plan"],
  design: ["Submittal", "Drawings and Specs"],
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

// ---- asking ---------------------------------------------------------------------------------
const GUIDE = `You answer questions for HVAC test-and-balance technicians at Precision Flow Engineering (PFE), using
ONLY the excerpts given below. There are two kinds:
- [S#] excerpts: pages from this project's documents (specs, submittals, drawings, TAB plan, ASIs/RFIs, change
  orders), labelled with folder, file, page and file date.
- [B#] excerpts: the project's BuildingStart TAB report data as of the last sync: the design and actual values the
  techs entered per unit, tables of one equipment type, and the Hitlist progress (units complete / left, counted
  for you). "?" means BuildingStart can't calculate it yet; a field not listed was left blank.

Rules:
- For "how many are left / done / not started" questions, use the counts and lists in the Hitlist progress excerpt
  exactly as given; don't count rows yourself.
- Comparing BuildingStart to the documents (e.g. the design CFM entered vs the schedule or submittal): give both
  values with their sources and say clearly whether they match.
- Readings outside tolerance: Hitlist has already calculated them. Use the TOLERANCE CHECK lines and the "check"
  column / "Tolerance check" lines in the [B#] excerpts exactly as given; never recalculate or second-guess them.
  List only the units marked OUTSIDE (with design, actual and percent off); if there are none, say so, and you may
  name the ones closest to the limit as a separate line.
- If an excerpt says TRUNCATED, or the question covers more units than the excerpts hold, say plainly that the
  question is too broad to answer completely, answer for what's shown, and suggest a narrower question (one
  equipment type, one floor, or one unit).
- Use only the excerpts. Never guess or use typical values. If the answer isn't there, say so plainly
  (found = false) and say where it would usually be (e.g. "the AHU schedule on the mechanical drawings").
- Give every value with its unit, exactly as written, and cite the excerpt after it, e.g. "12,500 CFM [S3]" or
  "11,980 CFM [B1]".
- If excerpts disagree (submittal vs drawing schedule, or an ASI/RFI/change order revising a value), give both,
  say which document is newer from the file dates, and note that later ASIs/RFIs/change orders usually govern.
- Manufacturer submittals usually name units by model number, not the engineer's tag. If a schedule/drawing excerpt
  gives the unit's model and a submittal excerpt shows that model, use the submittal's data for the unit (coil face
  area, face velocity, fan curves, motor data...) and say which model you matched it by.
- If the question names one unit, answer for that unit only (don't list other equipment); if its values aren't in
  the excerpts, say so.
- Work things out in the "working" field first (the tech never sees it). The "answer" is only your final result:
  no thinking out loud, no "re-checking", no corrections, and never list an item and then say it doesn't belong.
- Start with the direct answer, then a few short supporting lines. Plain text, "-" bullets are fine, no headings.
- tolerances: only when the question is about TAB tolerances. Fill each category the documents clearly give a
  tolerance for (keys: ${TOLERANCE_CATS.map((c) => `${c.key} = ${c.full}`).join("; ")}). Write the value as "10"
  for ±10%, or "+10/-0" when plus and minus differ (e.g. supply +10%/-0%, exhaust 0/-10 is "0/-10"). One spec value
  can fill several categories (e.g. "all air devices ±10%" fills supply, return and exhaust outlets). Leave out
  categories the documents don't cover. Otherwise leave tolerances out.
  Read the direction exactly: "0 to plus 10 percent", "plus 10, minus 0" or "+10%/-0%" is "+10/-0" (nothing allowed
  below design); "minus 10 to 0" is "0/-10"; only "plus or minus 10" / "±10" is "10". Never turn a one-sided range
  into ±. If the tolerance depends on size (e.g. up to 5,000 cfm one value, above it another), fill the category with
  the value for units above the size limit and state both in the answer, so the tech can adjust smaller units.

Give your reply with the "answer" form.`;

const FORM = {
  type: "object",
  properties: {
    working: { type: "string", description: "Your scratch work: find the values and check them here before answering. Never shown to the tech." },
    answer: { type: "string", description: "The answer for the tech, plain text, values cited like [S3] or [B1]." },
    found: { type: "boolean", description: "false when the documents don't contain the answer." },
    sources: { type: "array", items: { type: "string" }, description: "Excerpt ids used, e.g. [\"S1\", \"B2\"]." },
    tolerances: {
      type: "object",
      description: "Only for TAB tolerance questions: percent of design by category, \"10\" for ±10 or \"+10/-0\". Leave out otherwise.",
      properties: Object.fromEntries(TOLERANCE_CATS.map((c) => [c.key, { type: "string", description: c.full }])),
    },
  },
  required: ["working", "answer", "found", "sources"],
};

export const QUICK: Record<Exclude<Mode, "ask">, (unit?: string) => string> = {
  tolerances: () => "What are the TAB tolerances (plus and minus percent of design) in the spec for each kind of equipment: air handlers and rooftop units (supply, return and outside air), supply/return/exhaust fans, supply/return/exhaust outlets and inlets, terminal units (max and min airflow), pumps, coils and terminal-unit/FCU coils?",
  tab: () => "What does the spec require for testing, adjusting and balancing: what must be tested and reported, instrument and certification requirements, and anything unusual the TAB tech should know?",
  design: (unit) => `What are the design values for ${unit || "this unit"}: airflow (CFM), outside air, external/total static pressure, water flow (GPM), motor HP and anything else scheduled for it?`,
};

export async function askDocs(project: string, question: string, mode: Mode, by: string, tol: Tolerances = {}): Promise<Answer> {
  const [manifest, values, results] = await Promise.all([loadManifest(project), loadValues(project), loadResults(project)]);
  if (!manifest && !values && !results) {
    throw new Error("Nothing to search yet: press Find documents to read the project's files, and sync the project for its BuildingStart data.");
  }
  const pages = manifest ? await loadPages(project, manifest) : [];
  const found = pages.length ? findPages(pages, question, mode) : [];
  // BuildingStart data only helps the questions about units (not the spec-only quick buttons).
  const bs = mode === "tolerances" || mode === "tab" ? { blocks: [], tooBig: false }
    : bsExcerpts(values, results, question, tagPatterns(question), tol);
  const at = new Date().toISOString();
  const onlyProgress = bs.blocks.length === 1 && bs.blocks[0].label === "Hitlist progress" && !/\b(left|done|complete|finished|remaining|started|progress|how many)\b/i.test(question);
  if (!found.length && (!bs.blocks.length || onlyProgress)) {
    return { question, answer: "Nothing in this project's documents or BuildingStart data matches that question. Try other words, or check that the files are in the Drawings and Specs, Submittal, TAB Plan, ASIs and RFIs or Change Orders folders.",
      found: false, sources: [], tolerances: null, at, by };
  }
  const synced = (values?.synced_at || results?.generated_at || "").slice(0, 10);
  const sources: Source[] = [
    ...found.map((p, i) => ({ id: `S${i + 1}`, category: p.file.category, path: p.file.path,
      name: p.file.name, page: p.page, modified: (p.file.modified || "").slice(0, 10) })),
    ...bs.blocks.map((b) => ({ id: b.id, category: "BuildingStart", path: b.label, name: b.label, page: 0, modified: synced })),
  ];
  const excerpts = [
    ...found.map((p, i) =>
      `=== [S${i + 1}] ${p.file.category} / ${p.file.path}, page ${p.page} (file dated ${sources[i].modified || "unknown"}) ===\n${p.text}`),
    ...bs.blocks.map((b) => `=== [${b.id}] ${b.label} (BuildingStart, synced ${synced || "unknown"}) ===\n${b.text}`),
  ].join("\n\n");
  const note = bs.tooBig ? "\n\nNOTE: the BuildingStart data for this question was too large to include in full." : "";
  const reply = await callClaudeForm(GUIDE, `Question: ${question}${note}\n\nExcerpts:\n\n${excerpts}`, "answer",
    "The answer to the tech's question, from the excerpts.", FORM);
  const r = (typeof reply.text === "string" && reply.answer === undefined ? { answer: reply.text } : reply) as
    { answer?: string; found?: boolean; sources?: string[]; tolerances?: Record<string, unknown> | null };
  const cited = new Set((r.sources ?? []).map(String));
  const answerText = String(r.answer ?? "").trim();
  for (const m of answerText.matchAll(/\[([SB]\d+)\]/g)) cited.add(m[1]);
  let tolerances: Tolerances | null = null;
  if (r.tolerances && typeof r.tolerances === "object") {
    const t = normalizeTolerances(r.tolerances as Record<string, unknown>);
    tolerances = Object.keys(t).length ? t : null;
  }
  const answer: Answer = { question, answer: answerText || "No answer came back. Try again.", found: r.found !== false,
    sources: sources.filter((s) => cited.has(s.id)), tolerances, at, by };
  await saveHistory(project, answer);
  return answer;
}

// ---- questions already asked -----------------------------------------------------------------
const historyPath = (project: string) => `docs-qa/${safe(project)}.json`;

export async function loadHistory(project: string): Promise<Answer[]> {
  const b = await readBlob(historyPath(project));
  try { return b ? (JSON.parse(b.toString("utf8")) as Answer[]) : []; } catch { return []; }
}

async function writeHistory(project: string, list: Answer[]) {
  await put(historyPath(project), JSON.stringify(list), {
    access: "private", allowOverwrite: true, addRandomSuffix: false, contentType: "application/json",
  });
}

async function saveHistory(project: string, a: Answer) {
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
