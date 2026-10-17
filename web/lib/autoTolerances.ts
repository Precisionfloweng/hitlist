// After a project's documents are read: if nobody has set its tolerances yet, ask the AI to find them in the
// spec (the same question as AI Tools → Suggestions → Tolerances) and save what it finds, marked as from the spec.
// Runs once per project: never over tolerances someone already saved (by hand or from the spec), and not again
// after it has run (an error is retried after a day). The answer is kept under "Asked before" like any question.
import "server-only";
import type { User } from "./auth";
import { runAgent } from "./agent";
import { loadAutoTol, loadManifest, QUICK, saveAutoTol, saveHistory } from "./docs";
import { loadTolerances, loadTolerancesWithDefaults, saveTolerances } from "./tolerances";
import { specNote } from "./toleranceCats";

const AUTO: User = { email: "Hitlist (automatic)", name: "Hitlist (automatic)", role: "admin", owner: false,
  hasPassword: false, projects: [] };
const SPEC_FOLDER = "Drawings and Specs";
const RETRY_ERROR_MS = 24 * 3600_000;
const RUNNING_MS = 15 * 60_000;                 // a run that never finished (the function was stopped) can go again

export async function autoTolerances(project: string): Promise<string> {
  const manifest = await loadManifest(project);
  if (!manifest?.files.some((f) => f.category === SPEC_FOLDER && f.pages > 0)) return "no spec files";
  if (Object.keys(await loadTolerances(project)).length) return "already set";
  const state = await loadAutoTol(project);
  const age = state ? Date.now() - Date.parse(state.at) : Infinity;
  if (state?.status === "done" || state?.status === "none") return "already ran";
  if (state?.status === "running" && age < RUNNING_MS) return "running";
  if (state?.status === "error" && age < RETRY_ERROR_MS) return "waiting to retry";

  await saveAutoTol(project, { status: "running", at: new Date().toISOString() });
  try {
    const { tol } = await loadTolerancesWithDefaults(project);
    const answer = await runAgent(project, QUICK.tolerances(), AUTO.name, tol);
    await saveHistory(project, answer);
    const found = answer.tolerances && Object.keys(answer.tolerances).length ? answer.tolerances : null;
    // Someone may have typed tolerances while the AI worked: theirs stay.
    if (found && !Object.keys(await loadTolerances(project)).length) {
      await saveTolerances(project, found, AUTO, { kind: "spec", note: specNote(answer.sources) });
    }
    await saveAutoTol(project, { status: found ? "done" : "none", at: new Date().toISOString() });
    return found ? "saved" : "none found";
  } catch (e) {
    const message = (e as Error).message || String(e);
    await saveAutoTol(project, { status: "error", at: new Date().toISOString(), message: message.slice(0, 300) });
    throw e;
  }
}
