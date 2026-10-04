// The BuildingStart values (every reading the techs entered), sent by the server after each sync, as a
// source for Search the Documents next to the Dropbox documents. Stored privately in Blob as values/<key>.
// Also the helpers the AI's lookup tools use (lib/agent.ts): picking columns, locations, progress per type.
import "server-only";
import { gunzipSync } from "node:zlib";
import { del, get, put } from "@vercel/blob";
import type { Results, TypeResult } from "./results";
import { categoriesFor, fmtTol, TOLERANCE_CATS, type Tolerances } from "./toleranceCats";

export type BsValue = string | number | boolean;
export type BsUnit = { name: string; path: string; v: Record<string, BsValue> };
export type BsSheet = { sheet: string; headers: string[]; units: BsUnit[] };
export type BsValues = { schema: number; project: string; synced_at: string; sheets: BsSheet[];
  counts: { units: number; values: number } };

const safe = (project: string) => project.replace(/[^A-Za-z0-9_.-]/g, "_");
const pathFor = (project: string) => `values/${safe(project)}`;

/** Count what arrived (the server checks these against what it sent). */
export function countValues(v: BsValues) {
  return { units: v.sheets.reduce((n, s) => n + s.units.length, 0),
    values: v.sheets.reduce((n, s) => n + s.units.reduce((m, u) => m + Object.keys(u.v ?? {}).length, 0), 0) };
}

/** Save the server's gzipped values file. Returns the units and values counted, for the server to confirm. */
export async function saveValues(project: string, body: Buffer) {
  const data = JSON.parse(gunzipSync(body).toString("utf8")) as BsValues;
  if (data.schema !== 1 || !Array.isArray(data.sheets)) throw new Error("Unexpected values file");
  const counts = countValues(data);
  await put(pathFor(project), body, { access: "private", allowOverwrite: true, addRandomSuffix: false, contentType: "application/gzip" });
  return counts;
}

export async function loadValues(project: string): Promise<BsValues | null> {
  try {
    const r = await get(pathFor(project), { access: "private", useCache: false });
    if (!r || r.statusCode !== 200 || !r.stream) return null;
    return JSON.parse(gunzipSync(Buffer.from(await new Response(r.stream).arrayBuffer())).toString("utf8")) as BsValues;
  } catch {
    return null;
  }
}

export async function deleteValues(project: string) {
  try { await del(pathFor(project)); } catch { /* none */ }
}

// ---- checking what arrived -------------------------------------------------------------------
export type ValuesCheck = { units: number; values: number; types: number; synced: string; missing: number; ok: boolean; problem: string };

/** Every unit in the last sync's Hitlist results should be in the values (both come from the same export). */
export function checkValues(values: BsValues | null, results: Results | null, lastSync: string, valuesUpdated: string,
  valuesStatus: string): ValuesCheck {
  const empty = { units: 0, values: 0, types: 0, synced: "", missing: 0 };
  if (valuesStatus.startsWith("failed")) {
    return { ...empty, ...(values ? countValues(values) : {}), types: values?.sheets.length ?? 0, synced: values?.synced_at ?? "",
      ok: false, problem: `Last send failed: ${valuesStatus.replace(/^failed:\s*/, "")}. It will try again on the next sync.` };
  }
  if (!values) {
    return { ...empty, ok: false, problem: lastSync ? "Not received yet. They're sent on the next sync." : "Sync the project first." };
  }
  const have = new Set(values.sheets.flatMap((s) => s.units.flatMap((u) => [`p:${u.path}`, `n:${u.name}`])));
  const missing = (results?.types ?? []).reduce((n, t) =>
    n + t.units.filter((u) => !have.has(`p:${u.path}`) && !have.has(`n:${u.name}`)).length, 0);
  const c = countValues(values);
  // The server sends the values right after the results; an older confirmation means this sync's send didn't land.
  const stale = !!lastSync && !!valuesUpdated && valuesUpdated < lastSync;
  const problem = missing ? `${missing} unit${missing === 1 ? "" : "s"} from the last sync aren't in the BuildingStart data. Sync again.`
    : stale ? "Older than the last sync. They'll be sent again on the next sync." : "";
  return { ...c, types: values.sheets.length, synced: valuesUpdated || values.synced_at, missing, ok: !problem, problem };
}

// ---- choosing what a question needs ----------------------------------------------------------
const MAX_CHARS = 60_000;            // BuildingStart part of one question (the documents get their own share)
const MAX_UNITS = 15;                // units named in one question

/** Words for each kind of equipment, matched to the export's sheet names. */
export const TYPE_WORDS: { q: RegExp; sheet: RegExp }[] = [
  { q: /\b(vavs?|terminal units?|tus?|boxes|box|fpbs?|fptus?|fan powered)\b/, sheet: /terminal|vav|fan powered/i },
  { q: /\b(ahus?|air handl\w*|rtus?|roof ?tops?|doas|maus?|make-?up air|crahs?|cracs?)\b/, sheet: /air handl|roof ?top|doas|make-?up/i },
  { q: /\b(fcus?|fan coils?)\b/, sheet: /fan coil/i },
  { q: /\b(pumps?)\b/, sheet: /pump/i },
  { q: /\b(exhaust fans?|efs?|supply fans?|return fans?|fans)\b/, sheet: /^(?!.*coil).*fan/i },
  { q: /\b(outlets?|inlets?|diffusers?|grilles?|registers?|devices?)\b/, sheet: /outlet|inlet/i },
  { q: /\b(coils?)\b/, sheet: /coil/i },
  { q: /\b(electric heat|edh|electric coils?|duct heaters?)\b/, sheet: /electric/i },
  { q: /\b(heat pumps?|wshps?)\b/, sheet: /heat pump/i },
  { q: /\b(chillers?)\b/, sheet: /chiller/i },
  { q: /\b(boilers?)\b/, sheet: /boiler/i },
  { q: /\b(cooling towers?)\b/, sheet: /cooling tower/i },
];

const STOP = new Set(("the and for are what with that this from have has was were will would should could there their about which " +
  "when where who how does did any all can into per each than then them they its is of to in on at by be or an as a i me my we our " +
  "you your give list show tell find value values please many much more left still need needs project units unit done do").split(" "));

// Question words that also mean these column words (lower case, matched inside header names).
export const COL_SYN: Record<string, string[]> = {
  cfm: ["airflow", "air flow", "cfm"], airflow: ["airflow", "air flow", "cfm"], air: ["airflow"], gpm: ["gpm", "flow"],
  water: ["gpm", "water", "flow"], amps: ["amp"], amp: ["amp"], volts: ["volt"], voltage: ["volt"], static: ["static", "sp"],
  pressure: ["pressure", "static", "psi", "head"], rpm: ["rpm"], speed: ["rpm", "speed", "hz"], hp: ["hp", "horsepower"],
  motor: ["motor"], sheave: ["sheave"], belt: ["belt"], min: ["min"], minimum: ["min"], max: ["max"], maximum: ["max"],
  outside: ["o/a", "outside", "oa"], oa: ["o/a", "outside", "oa"], reheat: ["reheat", "coil", "gpm"], heat: ["heat", "kw"],
  kw: ["kw"], temp: ["temp", "°"], temperature: ["temp"], velocity: ["velocity", "fpm"], model: ["model"], manufacturer: ["manufacturer", "mfg"],
  size: ["size"], filter: ["filter"], completed: ["completed"], design: ["design", "des"], actual: ["actual", "act"],
};

export const sheetKey = (n: string) => n.replace(/\s+/g, "").toLowerCase();
export const show = (v: BsValue) => (typeof v === "boolean" ? (v ? "yes" : "no") : String(v));
const ESC = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type Loc = { label: string; test: (u: { area?: unknown; zone?: unknown; path?: string }) => boolean };
/** Location in the question: "floor 3", "level 3", "3rd floor", "L3". Matches a unit's Area, Zone or path. */
export function locationFilter(q: string): Loc | null {
  const m = /\b(?:floor|level|lvl|fl)\.?\s*([a-z]?\d{1,2}[a-z]?)\b/i.exec(q) ?? /\b(\d{1,2})(?:st|nd|rd|th)\s+(?:floor|level)\b/i.exec(q)
    ?? /\bL(\d{1,2})\b/.exec(q);
  if (!m) return null;
  const n = m[1].toLowerCase().replace(/^0+(?=\d)/, "");
  const re = new RegExp(`(?:\\b(?:floor|level|lvl|fl|l)\\.?\\s*-?0*${ESC(n)}\\b|\\b0*${ESC(n)}(?:st|nd|rd|th)\\s*(?:floor|level)\\b)`, "i");
  return { label: m[0], test: (u) => [u.area, u.zone, u.path].some((x) => x !== undefined && x !== null && re.test(String(x))) };
}

/** Columns the question is about; otherwise the main design/actual airflow and water columns. */
export function pickColumns(sheet: BsSheet, words: string[]): string[] {
  const used = new Set(sheet.units.flatMap((u) => Object.keys(u.v)));
  const headers = sheet.headers.filter((h) => used.has(h) && h !== "Area" && h !== "Zone");
  const terms = [...new Set(words.flatMap((w) => COL_SYN[w] ?? COL_SYN[w.replace(/s$/, "")] ?? (w.length >= 3 ? [w.replace(/s$/, "")] : [])))]
    .filter((t) => !["design", "des", "actual", "act"].includes(t));
  let cols = terms.length ? headers.filter((h) => terms.some((t) => h.toLowerCase().includes(t))) : [];
  if (!cols.length) cols = headers.filter((h) => /airflow|air flow|cfm|gpm|o\/a|outside air/i.test(h));
  if (!cols.length) cols = headers.slice(0, 10);
  const lead = ["Area", "Zone"].filter((h) => used.has(h));
  const done = headers.find((h) => /^completed$/i.test(h));
  return [...lead, ...cols.slice(0, 14), ...(done && !cols.includes(done) ? [done] : [])];
}

export function resultUnit(results: Results | null, sheet: string, u: BsUnit) {
  for (const t of results?.types ?? []) {
    if (t.export_sheet.replace(/\s+/g, "").toLowerCase() !== sheet.replace(/\s+/g, "").toLowerCase()) continue;
    const r = t.units.find((x) => (u.path && x.path === u.path) || x.name === u.name);
    if (r) return { type: t, unit: r };
  }
  return null;
}

export const missingFields = (t: TypeResult, codes: string) => t.fields.filter((f, i) => codes[i] === "R").map((f) => f.label);

export function tolLine(sheet: string, unitName: string, tol: Tolerances): string {
  const keys = categoriesFor(sheet, unitName).filter((k) => tol[k]);
  return keys.map((k) => `${TOLERANCE_CATS.find((c) => c.key === k)!.full} ${fmtTol(tol[k])}${tol[k].isDefault ? " (company default)" : ""}`).join("; ");
}

/** Hitlist progress per type (from the last sync's results): what's done and what's left, counted in code.
 *  For the types the question is about, the unfinished units are listed (only those at the location asked about). */
export function progressBlock(results: Results, focus: Set<string>, loc: Loc | null): string {
  const lines = [`Synced ${results.generated_at.slice(0, 10)}. "Complete" = every required field filled in. "Not started" = none of its required fields filled in.`];
  type RU = TypeResult["units"][number];
  const count = (units: RU[]) => {
    const left = units.filter((u) => u.required_filled < u.required);
    const none = left.filter((u) => u.required > 0 && u.required_filled === 0);
    return { left, none, text: `${units.length} units, ${units.length - left.length} complete, ${left.length} left (${none.length} not started, ${left.length - none.length} partly done)` };
  };
  for (const t of results.types) {
    const all = count(t.units);
    lines.push(`${t.name} (BuildingStart sheet "${t.export_sheet}"): ${all.text}`);
    if (!focus.has(t.key)) continue;
    let c = all;
    if (loc) {
      const here = t.units.filter((u) => loc.test({ area: u.area, zone: u.zone, path: u.path }));
      if (here.length) { c = count(here); lines.push(`  On ${loc.label}: ${c.text}`); }
      else lines.push(`  No ${t.name} have "${loc.label}" in their Area, Zone or path, so all are listed below.`);
    }
    if (!c.left.length) continue;
    const counts = new Map<string, number>();
    for (const u of c.left) for (const f of missingFields(t, u.codes)) counts.set(f, (counts.get(f) ?? 0) + 1);
    const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([f, n]) => `${f} (${n})`).join(", ");
    if (top) lines.push(`  Most often missing: ${top}`);
    if (c.none.length) lines.push(`  Not started: ${c.none.map((u) => u.name).join(", ")}`);
    const part = c.left.filter((u) => !c.none.includes(u));
    if (part.length) lines.push(`  Partly done: ${part.map((u) => `${u.name} (missing ${missingFields(t, u.codes).join(", ")})`).join("; ")}`);
  }
  return lines.join("\n");
}
