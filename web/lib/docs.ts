// "Ask the documents": a project's Dropbox documents (specs, submittals, drawings, TAB plan, ASIs/RFIs,
// change orders) as page text, sent by the server. A question finds the best-matching pages and only
// those go to Claude, which answers with the file and page for each value.
import "server-only";
import { gunzipSync } from "node:zlib";
import { del, get, list, put } from "@vercel/blob";
import { callClaudeForm } from "./wording";
import { TOLERANCE_CATS, type Tolerances } from "./toleranceCats";

export type DocFile = { id: string; category: string; name: string; path: string; modified: string;
  hash: string; size: number; pages: number; parts: string[] };
export type Manifest = { project: string; folder: { id: string; path: string; name: string }; updated_at: string;
  found: Record<string, number>; files: DocFile[]; skipped: (DocFile & { reason: string })[] };
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

export function findPages(pages: Page[], question: string, mode: Mode, maxChars = 110_000, maxPages = 30) {
  const tags = tagPatterns(question);
  const words = [...new Set(question.toLowerCase().match(/[a-z][a-z0-9/-]{2,}|\d{2,}/g) ?? [])].filter((w) => !STOP.has(w));
  const terms = [...new Set([...words, ...EXTRA[mode]])];
  const df = new Map(terms.map((t) => [t, pages.reduce((n, p) => n + (p.low.includes(t) ? 1 : 0), 0)]));
  const N = pages.length || 1;
  const scored = pages.map((p) => {
    let s = 0;
    let tagHits = 0;
    for (const re of tags) {
      re.lastIndex = 0;
      const n = Math.min((p.low.match(re) ?? []).length, 6);
      if (n) { tagHits++; s += 12 + 3 * n; }
    }
    for (const t of terms) {
      if (!p.low.includes(t)) continue;
      const idf = Math.log(1 + N / (1 + (df.get(t) ?? 0)));
      s += idf * (EXTRA[mode].includes(t) ? 1.5 : 1);
    }
    if (tags.length && !tagHits) s *= 0.4;                    // asked about a unit: pages naming it come first
    if (FAVOR[mode].includes(p.file.category)) s *= 1.4;
    return { p, s };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  const out: Page[] = [];
  let chars = 0;
  for (const { p } of scored) {
    if (out.length >= maxPages || chars + p.text.length > maxChars) break;
    out.push(p);
    chars += p.text.length;
  }
  return out;
}

// ---- asking ---------------------------------------------------------------------------------
const GUIDE = `You answer questions for HVAC test-and-balance technicians at Precision Flow Engineering (PFE), using
ONLY the excerpts from this project's documents given below (specs, submittals, drawings, TAB plan, ASIs/RFIs,
change orders). Each excerpt is labelled like [S3] with its folder, file, page and file date.

Rules:
- Use only the excerpts. Never guess or use typical values. If the answer isn't there, say so plainly
  (found = false) and say where it would usually be (e.g. "the AHU schedule on the mechanical drawings").
- Give every value with its unit, exactly as written, and cite the excerpt after it, e.g. "12,500 CFM [S3]".
- If excerpts disagree (submittal vs drawing schedule, or an ASI/RFI/change order revising a value), give both,
  say which document is newer from the file dates, and note that later ASIs/RFIs/change orders usually govern.
- If the question names one unit, answer for that unit only (don't list other equipment); if its values aren't in
  the excerpts, say so.
- Start with the direct answer, then a few short supporting lines. Plain text, "-" bullets are fine, no headings.
- tolerances: only when the question is about TAB tolerances. Fill a category only when the documents give one
  ± percent that clearly applies to it (keys: ${TOLERANCE_CATS.map((c) => `${c.key} = ${c.label}`).join(", ")});
  value is the number only, e.g. "10". If plus and minus differ (e.g. +10%/-5%), leave that category out and
  explain in the answer. Otherwise leave tolerances out.

Give your reply with the "answer" form.`;

const FORM = {
  type: "object",
  properties: {
    answer: { type: "string", description: "The answer for the tech, plain text, values cited like [S3]." },
    found: { type: "boolean", description: "false when the documents don't contain the answer." },
    sources: { type: "array", items: { type: "string" }, description: "Excerpt ids used, e.g. [\"S1\", \"S4\"]." },
    tolerances: {
      type: "object",
      description: "Only for TAB tolerance questions: ± percent by equipment category, number only. Leave out otherwise.",
      properties: Object.fromEntries(TOLERANCE_CATS.map((c) => [c.key, { type: "string", description: c.label }])),
    },
  },
  required: ["answer", "found", "sources"],
};

export const QUICK: Record<Exclude<Mode, "ask">, (unit?: string) => string> = {
  tolerances: () => "What are the TAB tolerances (± percent of design) in the spec for each type of equipment: air handlers, rooftop units, fans, terminal units, outlets and inlets, pumps and coils?",
  tab: () => "What does the spec require for testing, adjusting and balancing: what must be tested and reported, instrument and certification requirements, and anything unusual the TAB tech should know?",
  design: (unit) => `What are the design values for ${unit || "this unit"}: airflow (CFM), outside air, external/total static pressure, water flow (GPM), motor HP and anything else scheduled for it?`,
};

export async function askDocs(project: string, question: string, mode: Mode, by: string): Promise<Answer> {
  const manifest = await loadManifest(project);
  if (!manifest) throw new Error("This project's documents haven't been read yet. Press Update documents first.");
  const pages = await loadPages(project, manifest);
  const found = findPages(pages, question, mode);
  const at = new Date().toISOString();
  if (!found.length) {
    return { question, answer: "Nothing in this project's documents matches that question. Try other words, or check that the files are in the Drawings and Specs, Submittal, TAB Plan, ASIs and RFIs or Change Orders folders.",
      found: false, sources: [], tolerances: null, at, by };
  }
  const sources: Source[] = found.map((p, i) => ({ id: `S${i + 1}`, category: p.file.category, path: p.file.path,
    name: p.file.name, page: p.page, modified: (p.file.modified || "").slice(0, 10) }));
  const excerpts = found.map((p, i) =>
    `=== [S${i + 1}] ${p.file.category} / ${p.file.path}, page ${p.page} (file dated ${sources[i].modified || "unknown"}) ===\n${p.text}`).join("\n\n");
  const reply = await callClaudeForm(GUIDE, `Question: ${question}\n\nExcerpts:\n\n${excerpts}`, "answer",
    "The answer to the tech's question, from the excerpts.", FORM);
  const r = (typeof reply.text === "string" && reply.answer === undefined ? { answer: reply.text } : reply) as
    { answer?: string; found?: boolean; sources?: string[]; tolerances?: Record<string, unknown> | null };
  const cited = new Set((r.sources ?? []).map(String));
  const answerText = String(r.answer ?? "").trim();
  for (const m of answerText.matchAll(/\[(S\d+)\]/g)) cited.add(m[1]);
  let tolerances: Tolerances | null = null;
  if (r.tolerances && typeof r.tolerances === "object") {
    const t: Tolerances = {};
    for (const c of TOLERANCE_CATS) {
      const v = String((r.tolerances as Record<string, unknown>)[c.key] ?? "").replace(/[^\d.]/g, "");
      if (/^\d{1,2}(\.\d+)?$/.test(v)) t[c.key] = v;
    }
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

async function saveHistory(project: string, a: Answer) {
  const list = [a, ...(await loadHistory(project))].slice(0, 50);
  await put(historyPath(project), JSON.stringify(list), {
    access: "private", allowOverwrite: true, addRandomSuffix: false, contentType: "application/json",
  });
}
