// One results file per project, kept in a PRIVATE Vercel Blob store.
import "server-only";
import { del, get, put } from "@vercel/blob";

export type TypeResult = {
  key: string; name: string; export_sheet: string;
  fields: { label: string; status: string }[];
  units: { name: string; path: string; parent: string | null; area: string | null; zone: string | null;
    codes: string; required: number; required_filled: number; optional: number; optional_filled: number }[];
  summary: Summary;
};
export type Summary = { units: number; units_complete: number; required_fields: number; required_filled: number;
  missing_required: number; missing_optional: number; fields_pct: number; units_pct: number };
export type Deficiency = { equipment: string; path: string; item_type: string; number: string; text: string;
  status: string; priority: string; role: string; contact: string; date_due: string; date_completed: string; open: boolean };
/** A row of BuildingStart's Note sheet. Blank path = a general note for the whole project. */
export type Note = { equipment: string; path: string; item_type: string; category: string; number: string; text: string;
  reading: string; units: string; comments: string };
export type Results = {
  project_number: string; generated_at: string; summary: Summary; types: TypeResult[];
  untracked_sheets: Record<string, number>; deficiencies: Deficiency[]; notes?: Note[];
  gap_flags?: { type: string; unit: string; kind: string; fields: string[] }[]; warnings: string[];
};

const pathFor = (project: string) => `results/${project.replace(/[^A-Za-z0-9_.-]/g, "_")}.json`;

export async function saveResults(project: string, body: string) {
  await put(pathFor(project), body, {
    access: "private", allowOverwrite: true, addRandomSuffix: false, contentType: "application/json",
  });
}

export async function loadResults(project: string): Promise<Results | null> {
  try {
    const r = await get(pathFor(project), { access: "private", useCache: false });
    if (!r || r.statusCode !== 200 || !r.stream) return null;
    return JSON.parse(await new Response(r.stream).text()) as Results;
  } catch {
    return null;
  }
}

export async function deleteResults(project: string) {
  try { await del(pathFor(project)); } catch { /* already gone */ }
}
