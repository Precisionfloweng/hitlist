// Search the Documents, the AI way: instead of code guessing which excerpts a question needs, the AI gets lookup
// tools (equipment index, find units, readings, Hitlist's tolerance check, progress, document search) and decides
// what to fetch, a few rounds at most, then answers with sources. Follow-ups (replies) get the earlier turns of
// the thread as context. Math (tolerances, counts) is always done by Hitlist, never by the AI.
import "server-only";
import { loadManifest, loadPages, findPages, type Answer, type Page, type Source } from "./docs";
import {
  COL_SYN, loadValues, locationFilter, missingFields, pickColumns, progressBlock, resultUnit, sheetKey, show, tolLine,
  TYPE_WORDS, type BsSheet, type BsUnit, type BsValues,
} from "./bsvalues";
import { loadResults, type Results } from "./results";
import { toleranceReport } from "./reports";
import { checkAmps, checkUnit, describe, describeAmps, tolerancePairs } from "./tolCheck";
import { fmtTol, normalizeTolerances, TOLERANCE_CATS, TOLERANCE_GROUPS, type Tolerances } from "./toleranceCats";
import { request, type Block } from "./wording";

const MAX_ROUNDS = 8;               // lookups rounds before it must answer
const TIME_BUDGET = 200_000;        // ms; then it answers with what it has (the route allows 300 s)
const RESULT_CHARS = 40_000;        // one lookup's result
const MAX_FULL_UNITS = 15;          // units shown with every field

type Ctx = {
  values: BsValues | null; results: Results | null; tol: Tolerances; pages: Page[];
  folders: Record<string, number>; sources: Source[]; pageIds: Map<string, string>; synced: string;
  onlyFolders?: string[];            // a Suggestion limited to some folders (e.g. Drawings only)
};
export type Step = (label: string) => void;

// ---- tools ---------------------------------------------------------------------------------------
const TOOLS = [
  { name: "equipment_index", description: "Start here. Lists every BuildingStart sheet (equipment type) with its unit count and tag families " +
      "(e.g. CRAH-XX100-01…36), the Hitlist progress per type, the project's tolerances and the document folders with file counts.",
    input_schema: { type: "object", properties: {} } },
  { name: "find_units", description: "Find units by tag, tag start (prefix), sheet and/or location. Returns names, sheets and locations only (no readings).",
    input_schema: { type: "object", properties: {
      tag: { type: "string", description: "A full tag (CRAH-XX100-07) or its start (CRAH-XX100) as written in BuildingStart." },
      sheet: { type: "string", description: "Sheet / equipment type, e.g. 'Terminal Unit', 'VAV', 'pumps'." },
      location: { type: "string", description: "Floor/level/area, e.g. 'level 3' or an Area/Zone name." } } } },
  { name: "unit_readings", description: "The readings entered in BuildingStart. Name up to 15 units for every field of each, or give a tag start / sheet / " +
      "location for a table of many units with the columns you ask for. Every table includes Hitlist's tolerance check for its airflow/water pairs.",
    input_schema: { type: "object", properties: {
      units: { type: "array", items: { type: "string" }, description: "Exact unit names (up to 15) for all their fields." },
      tag: { type: "string", description: "Tag start for a table, e.g. CRAH-XX100." },
      sheet: { type: "string" }, location: { type: "string" },
      columns: { type: "array", items: { type: "string" }, description: "Words for the columns wanted, e.g. ['airflow'], ['amps'], ['gpm', 'reheat']. Default: airflow and water columns." } } } },
  { name: "tolerance_check", description: "Hitlist's out-of-tolerance check (exact, done in code): airflow and water flow as % of design against the project " +
      "tolerances, motor amps above design (× number of motors on fan arrays), heater amps outside ±10%. Optionally limited to a tag start, sheet or location.",
    input_schema: { type: "object", properties: { tag: { type: "string" }, sheet: { type: "string" }, location: { type: "string" } } } },
  { name: "progress", description: "What's complete and what's left (counted by Hitlist from the last sync): per type, with the unfinished units and what they're missing.",
    input_schema: { type: "object", properties: { sheet: { type: "string", description: "Type/sheet to list in detail." }, location: { type: "string" } } } },
  { name: "search_documents", description: "Search the project's Dropbox documents (Drawings and Specs, Submittal, ASIs and RFIs, Change Orders, Deficiency Reports = punch lists sent). " +
      "Returns the best-matching pages. Use the words a document would use (tags, model numbers, 'schedule', spec section words).",
    input_schema: { type: "object", properties: {
      query: { type: "string" },
      folders: { type: "array", items: { type: "string" }, description: "Only these folders (optional)." } }, required: ["query"] } },
];

const ANSWER_TOOL = {
  name: "answer", description: "Give the final answer to the tech (ends the turn).",
  input_schema: {
    type: "object",
    properties: {
      working: { type: "string", description: "Scratch notes. Never shown to the tech." },
      answer: { type: "string", description: "The answer for the tech, plain text, values cited like [S3] or [B1]. Or, when the question is unclear, a short question back offering the choices you found." },
      found: { type: "boolean", description: "false when the data doesn't contain the answer." },
      sources: { type: "array", items: { type: "string" }, description: "Source ids used, e.g. [\"S1\", \"B2\"]." },
      table: { type: "object", description: "Optional table shown under the answer (e.g. a side-by-side comparison). Cite in the cells like \"12,500 [S3]\".",
        properties: { columns: { type: "array", items: { type: "string" } },
          rows: { type: "array", items: { type: "array", items: { type: "string" } } } }, required: ["columns", "rows"] },
      tolerances: {
        type: "object",
        description: "Only for TAB tolerance questions: percent of design by category, \"10\" for ±10 or \"+10/-0\". Leave out otherwise.",
        properties: Object.fromEntries(TOLERANCE_CATS.map((c) => [c.key, { type: "string", description: c.full }])),
      },
    },
    required: ["working", "answer", "found", "sources"],
  },
};

const GUIDE = `You help HVAC test-and-balance technicians at Precision Flow Engineering (PFE) with one project. You can look
things up with tools: the BuildingStart TAB report data (design and actual values entered per unit, as of the last
sync), Hitlist's calculated checks (tolerances, amps, progress), and the project's documents (specs, drawings,
submittals, ASIs/RFIs, change orders, and Deficiency Reports = punch lists PFE already sent, one per round).

How to work:
- Start with equipment_index unless the question is only about the documents. Use it to turn the tech's words into
  the right sheet, tag family or unit names (e.g. "the CRAH units" → the CRAH-… families on the Air Handling Unit sheet).
- Look things up before answering. If a lookup finds nothing, try another way (a tag start instead of a sheet, other
  search words, another folder) before giving up.
- If the question is unclear and the index shows several possible meanings, don't guess: answer with a short question
  back that offers the choices you found (e.g. "Do you mean the 36 CRAH-XX100 units or all 160 units on the Air
  Handling Unit sheet?"). If you can't answer, say exactly what you need from the tech.
- Results come back labelled [B#] (BuildingStart / Hitlist) or [S#] (document pages). Cite every value like
  "12,500 CFM [S3]" or "11,980 CFM [B2]". Never guess or use typical values.

Rules:
- Counts of done / left / not started: use the progress tool's numbers exactly; don't count rows yourself.
- Tolerances and amps: use Hitlist's check results exactly as given (they're exact); never recalculate. Give readings
  as percent of design, e.g. "108% of design (allowed 90–110%)", never "+8%". Motor amps are flagged when the
  highest reading is above design (× number of motors on fan arrays); heater amps are always ±10%. When one unit has
  several problems, list them together under that unit. If there are none, say so; you may name the closest ones.
- Comparing BuildingStart to the documents: give both values with their sources and say clearly whether they match.
- If documents disagree (submittal vs schedule, or an ASI/RFI/change order revising a value), give both, say which
  is newer from the file dates; later ASIs/RFIs/change orders usually govern.
- Submittals usually name units by model number, not the engineer's tag: match them through the model on the
  schedule and say which model you matched by.
- Punch lists: a Deficiency Reports file is one round of the punch list sent, dated by its file date.
- If a result says TRUNCATED, say the answer covers only part and suggest a narrower question.
- The "answer" is only your final result: no thinking out loud, no "re-checking", no corrections. Start with the
  direct answer, then short supporting lines. Plain text, "-" bullets are fine, no headings.
- Design values for a unit: cover airflow (CFM), outside air, external/total static pressure, fan RPM, motor HP/BHP,
  volts/phase, FLA, water flow (GPM), and every coil that belongs to the unit (in BuildingStart coils are usually
  sub-items under the unit's path, e.g. "AHU-3/AHU-3 CC"; on drawings they're on the unit's schedule row or a coil
  schedule). Say each coil's type and give the values for that type:
  chilled/hot water: GPM, EWT/LWT, water pressure drop, EAT/LAT DB/WB, air pressure drop, capacity (MBH), rows/fins,
  face area, face velocity; DX: EAT/LAT DB/WB, air pressure drop, capacity (MBH or tons), rows/fins, face area, face
  velocity, refrigerant and stages if listed; electric heat: kW, amps, volts/phase, stages, EAT/LAT, airflow.
  (Steam coils aren't tested; skip them.) Leave out values a source doesn't give rather than guessing.
- tolerances (in the answer form): only for TAB tolerance questions from the spec. Keys: ${TOLERANCE_CATS.map((c) => `${c.key} = ${c.full}`).join("; ")}.
  "10" for ±10%, "+10/-0" when they differ. One spec value can fill several categories. Read the direction exactly:
  "0 to plus 10 percent" / "+10%/-0%" is "+10/-0"; "minus 10 to 0" is "0/-10"; only "plus or minus 10" is "10".
  If the tolerance depends on size, use the value for units above the size limit and state both in the answer.`;

// ---- helpers -------------------------------------------------------------------------------------
const cap = (text: string) => text.length <= RESULT_CHARS ? text
  : `${text.slice(0, RESULT_CHARS)}\nTRUNCATED: too much to show; narrow it (a tag start, one sheet or a floor).`;
const low = (s: unknown) => String(s ?? "").toLowerCase();
const squash = (s: unknown) => low(s).replace(/[\s_-]+/g, "");

function addSource(ctx: Ctx, label: string): string {
  const id = `B${ctx.sources.filter((s) => s.category === "BuildingStart").length + 1}`;
  ctx.sources.push({ id, category: "BuildingStart", path: label, name: label, page: 0, modified: ctx.synced });
  return id;
}

function sheetMatches(sheet: string, want: string | undefined): boolean {
  if (!want) return true;
  const w = low(want).trim();
  if (squash(sheet).includes(squash(w)) || squash(w).includes(squash(sheet))) return true;
  return TYPE_WORDS.some((t) => t.q.test(w) && t.sheet.test(sheet));
}

function inPlace(u: BsUnit, where: string | undefined): boolean {
  if (!where) return true;
  const loc = locationFilter(where);
  if (loc) return loc.test({ area: u.v.Area, zone: u.v.Zone, path: u.path });
  const w = low(where);
  return [u.v.Area, u.v.Zone, u.path].some((x) => low(x).includes(w));
}

function tagMatches(name: string, tag: string | undefined): boolean {
  if (!tag) return true;
  const n = low(name), t = low(tag).trim();
  return n === t || n.startsWith(t) || squash(n).startsWith(squash(t));
}

function pick(ctx: Ctx, a: { tag?: string; sheet?: string; location?: string; units?: string[] }): [BsSheet, BsUnit][] {
  const out: [BsSheet, BsUnit][] = [];
  const names = new Set((a.units ?? []).map((n) => squash(n)));
  for (const s of ctx.values?.sheets ?? []) {
    if (!names.size && !sheetMatches(s.sheet, a.sheet)) continue;
    for (const u of s.units) {
      if (names.size ? names.has(squash(u.name)) : tagMatches(u.name, a.tag) && inPlace(u, a.location)) out.push([s, u]);
    }
  }
  return out;
}

/** Tag families on a sheet: names with their trailing number taken off (CRAH-XX100-07 → CRAH-XX100). */
function families(units: BsUnit[]): string {
  const fam = new Map<string, string[]>();
  for (const u of units) {
    const k = u.name.replace(/[-.\s]*\d+[a-z]?$/i, "") || u.name;
    fam.set(k, [...(fam.get(k) ?? []), u.name]);
  }
  const list = [...fam].sort((a, b) => b[1].length - a[1].length);
  const shown = list.slice(0, 30).map(([k, n]) => n.length === 1 ? n[0] : `${k}… (${n.length}: ${n[0]} to ${n[n.length - 1]})`);
  return shown.join(", ") + (list.length > 30 ? `, and ${list.length - 30} more families` : "");
}

// ---- tool runners --------------------------------------------------------------------------------
function equipmentIndex(ctx: Ctx): string {
  const lines: string[] = [];
  if (ctx.values) {
    lines.push(`BuildingStart data synced ${ctx.synced || "unknown"}. Sheets:`);
    for (const s of ctx.values.sheets) lines.push(`- ${s.sheet}: ${s.units.length} units. Tags: ${families(s.units)}`);
  } else lines.push("No BuildingStart data has arrived for this project yet (it's sent on the next sync).");
  if (ctx.results) {
    lines.push("", "Hitlist progress (last sync):");
    for (const t of ctx.results.types) lines.push(`- ${t.name} (sheet "${t.export_sheet}"): ${t.summary.units_complete} of ${t.units.length} complete`);
  }
  lines.push("", "Project tolerances: " + TOLERANCE_GROUPS.map((g) => `${g.label}: ${g.items.map((i) => `${i.label} ${ctx.tol[i.key] ? fmtTol(ctx.tol[i.key]) : "-"}${ctx.tol[i.key]?.isDefault ? " (default)" : ""}`).join(", ")}`).join("; "));
  lines.push("", "Documents: " + (Object.keys(ctx.folders).length
    ? Object.entries(ctx.folders).map(([f, n]) => `${f} ${n} file${n === 1 ? "" : "s"}`).join(", ") : "none read yet"));
  return lines.join("\n");
}

function findUnits(ctx: Ctx, a: { tag?: string; sheet?: string; location?: string }): string {
  const hits = pick(ctx, a);
  if (!hits.length) return "No units match. Check the equipment index for the sheet names and tag families.";
  const bySheet = new Map<string, BsUnit[]>();
  for (const [s, u] of hits) bySheet.set(s.sheet, [...(bySheet.get(s.sheet) ?? []), u]);
  return cap([...bySheet].map(([sheet, us]) => `${sheet}: ${us.length} units\n` + us.slice(0, 400).map((u) =>
    `${u.name}${u.v.Area ? ` · ${show(u.v.Area)}` : ""}${u.v.Zone ? ` · ${show(u.v.Zone)}` : ""}`).join("\n")
    + (us.length > 400 ? `\n…and ${us.length - 400} more` : "")).join("\n\n"));
}

function unitReadings(ctx: Ctx, a: { units?: string[]; tag?: string; sheet?: string; location?: string; columns?: string[] }): string {
  const hits = pick(ctx, a);
  if (!hits.length) return "No units match. Use find_units or the equipment index to get the exact names.";
  const id = addSource(ctx, a.units?.length ? `BuildingStart – ${hits.slice(0, 3).map(([, u]) => u.name).join(", ")}${hits.length > 3 ? "…" : ""}`
    : `BuildingStart – ${[a.tag, a.sheet, a.location].filter(Boolean).join(" · ") || "units"}`);
  const head = `[${id}] BuildingStart data, synced ${ctx.synced}. "?" = BuildingStart can't calculate it yet; a field not listed was left blank.`;
  if (a.units?.length || hits.length <= 3) {
    return cap(head + "\n\n" + hits.slice(0, MAX_FULL_UNITS).map(([s, u]) => {
      const r = resultUnit(ctx.results, s.sheet, u);
      const miss = r ? missingFields(r.type, r.unit.codes) : [];
      const tl = tolLine(s.sheet, u.name, ctx.tol);
      return [`Unit ${u.name} (sheet "${s.sheet}", path ${u.path || u.name})`,
        ...Object.entries(u.v).map(([h, v]) => `${h}: ${show(v)}`),
        r ? (miss.length ? `Hitlist: required fields still missing: ${miss.join(", ")}` : "Hitlist: all required fields filled in") : "",
        tl ? `Project tolerance: ${tl}` : "",
        ...checkUnit(s.sheet, u.name, u.v, tolerancePairs(s.headers), ctx.tol).map((c) => `Tolerance check (Hitlist): ${c.pair}: design ${c.design}, actual ${c.actual ?? "not entered"} = ${describe(c)}`),
        ...checkAmps(s.sheet, u.v).map((c) => `Amps check (Hitlist): ${c.label}: ${describeAmps(c)}`),
      ].filter(Boolean).join("\n");
    }).join("\n\n") + (hits.length > MAX_FULL_UNITS ? `\n\nTRUNCATED: ${hits.length} units match; only ${MAX_FULL_UNITS} shown in full.` : ""));
  }
  // A table per sheet with the columns asked for, plus Hitlist's check of its airflow/water pairs.
  const words = (a.columns ?? []).flatMap((c) => low(c).split(/[^a-z0-9/]+/)).filter(Boolean);
  const bySheet = new Map<BsSheet, BsUnit[]>();
  for (const [s, u] of hits) bySheet.set(s, [...(bySheet.get(s) ?? []), u]);
  const parts = [...bySheet].map(([s, units]) => {
    let cols = pickColumns(s, words);
    const pairs = tolerancePairs(s.headers).filter((p) => cols.includes(p.design) || cols.includes(p.actual));
    cols = [...cols, ...pairs.flatMap((p) => [p.design, p.actual]).filter((c, i, arr) => !cols.includes(c) && arr.indexOf(c) === i)];
    const wantsAmps = words.some((w) => /amp/.test(w));
    const rows = units.map((u) => {
      const checks = checkUnit(s.sheet, u.name, u.v, pairs, ctx.tol);
      const amps = wantsAmps ? checkAmps(s.sheet, u.v) : [];
      return [u.name, ...cols.map((c) => (u.v[c] === undefined ? "" : show(u.v[c]))),
        ...pairs.map((p) => { const c = checks.find((x) => x.pair === p.name); return c ? describe(c) : ""; }),
        ...amps.map(describeAmps)].join(" | ");
    });
    const ampCols = wantsAmps ? [...new Set(units.flatMap((u) => checkAmps(s.sheet, u.v).map((c) => `${c.label} check`)))] : [];
    return `${s.sheet}: ${units.length} units. Columns: Unit | ${[...cols, ...pairs.map((p) => `${p.name} check (Hitlist)`), ...ampCols].join(" | ")}\n` +
      (tolLine(s.sheet, "", ctx.tol) ? `Project tolerance: ${tolLine(s.sheet, "", ctx.tol)}\n` : "") + rows.join("\n");
  });
  return cap(head + "\n\n" + parts.join("\n\n"));
}

function toleranceCheck(ctx: Ctx, a: { tag?: string; sheet?: string; location?: string }): string {
  if (!ctx.values) return "No BuildingStart data for this project yet.";
  const keep = new Set(pick(ctx, a).map(([, u]) => u));
  const filtered: BsValues = { ...ctx.values, sheets: ctx.values.sheets.map((s) => ({ ...s, units: s.units.filter((u) => keep.has(u)) })).filter((s) => s.units.length) };
  const r = toleranceReport(filtered, ctx.results, ctx.tol);
  const id = addSource(ctx, `Hitlist tolerance check${[a.tag, a.sheet, a.location].some(Boolean) ? ` – ${[a.tag, a.sheet, a.location].filter(Boolean).join(" · ")}` : ""}`);
  const lines = [`[${id}] Hitlist's tolerance check (exact; use as given), BuildingStart data synced ${ctx.synced}. ` +
    `${r.outside} units with readings outside, ${r.checked} units checked, ${r.unchecked} with no actual reading yet.`];
  for (const g of r.groups) {
    lines.push(`${g.sheet}: ${g.checked} checked, ${g.rows.length} flagged${g.unchecked.length ? `, ${g.unchecked.length} with no reading yet (${g.unchecked.map((u) => u.unit).join(", ")})` : ""}`);
    for (const x of g.rows) lines.push(`  ${x.unit}: ${x.items.map((i) => i.kind === "amps"
      ? `${i.reading} ${i.actual} A over design ${i.design} A${i.note ? ` (${i.note})` : ""}`
      : `${i.reading} ${i.pct} of design (design ${i.design}${i.kind === "heater" ? " A" : ""}, actual ${i.actual}${i.kind === "heater" ? " A" : ""}, allowed ${i.allowed}${i.isDefault ? ", company default" : ""})`).join("; ")}`);
  }
  return cap(lines.join("\n"));
}

function progress(ctx: Ctx, a: { sheet?: string; location?: string }): string {
  if (!ctx.results) return "No Hitlist results yet: the project hasn't been synced.";
  const focus = new Set(ctx.results.types.filter((t) => a.sheet ? sheetMatches(t.export_sheet, a.sheet) || sheetMatches(t.name, a.sheet) : true).map((t) => t.key));
  const id = addSource(ctx, `Hitlist progress${a.sheet ? ` – ${a.sheet}` : ""}${a.location ? ` · ${a.location}` : ""}`);
  return cap(`[${id}] ` + progressBlock(ctx.results, focus, a.location ? locationFilter(a.location) ?? {
    label: a.location, test: (u) => [u.area, u.zone, u.path].some((x) => low(x).includes(low(a.location))) } : null));
}

function searchDocuments(ctx: Ctx, a: { query?: string; folders?: string[] }): string {
  if (!ctx.pages.length) return "No documents have been read for this project yet (press Find documents on AI Tools).";
  let want = (a.folders ?? []).map(squash);
  if (ctx.onlyFolders) {                // a limited Suggestion: never outside its folders
    const allowed = ctx.onlyFolders.map(squash);
    want = want.length ? want.filter((f) => allowed.some((x) => x.includes(f) || f.includes(x))) : allowed;
    if (!want.length) want = allowed;
  }
  const pages = want.length ? ctx.pages.filter((p) => want.some((f) => squash(p.file.category).includes(f) || f.includes(squash(p.file.category)))) : ctx.pages;
  const found = findPages(pages, String(a.query ?? ""), "ask", 30_000, 10);
  if (!found.length) return "No pages match. Try other words (a tag, model number, 'schedule', a spec section) or another folder.";
  return cap(found.map((p) => {
    const key = `${p.file.id}#${p.page}`;
    let id = ctx.pageIds.get(key);
    if (!id) {
      id = `S${ctx.pageIds.size + 1}`;
      ctx.pageIds.set(key, id);
      ctx.sources.push({ id, category: p.file.category, path: p.file.path, name: p.file.name, page: p.page, modified: (p.file.modified || "").slice(0, 10) });
    }
    return `=== [${id}] ${p.file.category} / ${p.file.path}, page ${p.page} (file dated ${(p.file.modified || "").slice(0, 10) || "unknown"}) ===\n${p.text}`;
  }).join("\n\n"));
}

function runTool(ctx: Ctx, name: string, input: Record<string, unknown>): string {
  const a = input as Record<string, never>;
  switch (name) {
    case "equipment_index": return equipmentIndex(ctx);
    case "find_units": return findUnits(ctx, a);
    case "unit_readings": return unitReadings(ctx, a);
    case "tolerance_check": return toleranceCheck(ctx, a);
    case "progress": return progress(ctx, a);
    case "search_documents": return searchDocuments(ctx, a);
    default: return `Unknown tool ${name}.`;
  }
}

/** What the tech sees while it works. */
function stepLabel(name: string, input: Record<string, unknown>): string {
  const what = [input.tag, input.sheet, input.location].filter(Boolean).join(" · ");
  switch (name) {
    case "equipment_index": return "Reading the equipment list…";
    case "find_units": return `Finding units${what ? `: ${what}` : ""}…`;
    case "unit_readings": return `Reading BuildingStart values${Array.isArray(input.units) ? `: ${(input.units as string[]).slice(0, 3).join(", ")}` : what ? `: ${what}` : ""}…`;
    case "tolerance_check": return `Running the tolerance check${what ? `: ${what}` : ""}…`;
    case "progress": return "Counting what's left…";
    case "search_documents": return `Searching the documents: ${String(input.query ?? "").slice(0, 60)}…`;
    default: return "Working…";
  }
}

// ---- the conversation ----------------------------------------------------------------------------
type Msg = { role: "user" | "assistant"; content: string | Record<string, unknown>[] };

/** Answer one question (with the earlier turns of its thread, if it's a reply). */
export async function runAgent(project: string, question: string, by: string, tol: Tolerances,
  thread: Answer[] = [], step: Step = () => {}, onlyFolders?: string[]): Promise<Answer> {
  const [manifest, values, results] = await Promise.all([loadManifest(project), loadValues(project), loadResults(project)]);
  if (!manifest && !values && !results) {
    throw new Error("Nothing to search yet: press Find documents to read the project's files, and sync the project for its BuildingStart data.");
  }
  const ctx: Ctx = {
    values, results, tol, pages: manifest ? await loadPages(project, manifest) : [],
    folders: manifest?.found ?? {}, sources: [], pageIds: new Map(), onlyFolders,
    synced: (values?.synced_at || results?.generated_at || "").slice(0, 10),
  };
  return converse(ctx, question, by, thread, step);
}

/** The lookup loop: the AI calls tools until it answers (or runs out of rounds or time). */
async function converse(ctx: Ctx, question: string, by: string, thread: Answer[], step: Step): Promise<Answer> {
  const messages: Msg[] = [];
  for (const t of thread) {                              // earlier turns: questions and answers only (it looks things up again)
    messages.push({ role: "user", content: t.question });
    messages.push({ role: "assistant", content: t.answer });
  }
  messages.push({ role: "user", content: question });
  const tools = [...TOOLS, { ...ANSWER_TOOL, cache_control: { type: "ephemeral" } }];
  const started = Date.now();
  let final: Record<string, unknown> | null = null;
  for (let round = 0; round <= MAX_ROUNDS && !final; round++) {
    const mustAnswer = round === MAX_ROUNDS || Date.now() - started > TIME_BUDGET;
    if (mustAnswer) messages.push({ role: "user", content: "That's all the lookups there's time for: answer now with what you have, and say what you couldn't check." });
    if (round === 0) step("Thinking…");
    else if (mustAnswer) step("Writing the answer…");
    const blocks: Block[] = await request({ system: GUIDE, messages, tools, max_tokens: 6000,
      tool_choice: mustAnswer ? { type: "tool", name: "answer" } : { type: "any" } });
    const uses = blocks.filter((b) => b.type === "tool_use");
    const ans = uses.find((b) => b.name === "answer");
    if (ans?.input) { final = ans.input; break; }
    if (!uses.length) { final = { answer: blocks.map((b) => b.text ?? "").join("").trim(), found: true, sources: [] }; break; }
    messages.push({ role: "assistant", content: blocks as unknown as Record<string, unknown>[] });
    const results_: Record<string, unknown>[] = [];
    for (const u of uses) {
      step(stepLabel(u.name ?? "", u.input ?? {}));
      let out: string;
      try { out = runTool(ctx, u.name ?? "", u.input ?? {}); } catch (e) { out = `That lookup failed: ${(e as Error).message}`; }
      results_.push({ type: "tool_result", tool_use_id: u.id, content: out });
    }
    messages.push({ role: "user", content: results_ });
  }
  const r = (final ?? {}) as { answer?: string; found?: boolean; sources?: string[]; tolerances?: Record<string, unknown> | null;
    table?: { columns?: unknown; rows?: unknown } };
  const answerText = String(r.answer ?? "").trim();
  const cited = new Set((r.sources ?? []).map(String));
  const table = Array.isArray(r.table?.columns) && Array.isArray(r.table?.rows)
    ? { columns: (r.table!.columns as unknown[]).map(String), rows: (r.table!.rows as unknown[]).filter(Array.isArray).map((row) => (row as unknown[]).map(String)) }
    : undefined;
  for (const m of [answerText, ...(table?.rows.flat() ?? [])].join(" ").matchAll(/\[([SB]\d+)\]/g)) cited.add(m[1]);
  let tolerances: Tolerances | null = null;
  if (r.tolerances && typeof r.tolerances === "object") {
    const t = normalizeTolerances(r.tolerances as Record<string, unknown>);
    tolerances = Object.keys(t).length ? t : null;
  }
  return { question, answer: answerText || "No answer came back. Try again.", found: r.found !== false,
    sources: ctx.sources.filter((s) => cited.has(s.id)), tolerances, at: new Date().toISOString(), by, ...(table ? { table } : {}) };
}

export const _test = { converse, pick, families, equipmentIndex, findUnits, unitReadings, toleranceCheck, progress, searchDocuments, COL_SYN, sheetKey };
