import { notFound, redirect } from "next/navigation";
import Header from "../../../Header";
import ProjectHeader from "../ProjectHeader";
import { canEdit, canSee, requireUser } from "@/lib/auth";
import { getProject } from "@/lib/data";
import { loadResults, type Note } from "@/lib/results";

export const dynamic = "force-dynamic";

/** The export's Note sheet: general project notes first, then notes by unit (in path order). */
export default async function NotesPage({ params }: { params: Promise<{ number: string }> }) {
  const user = await requireUser();
  const number = decodeURIComponent((await params).number);
  if (user.role === "customer") redirect(`/projects/${encodeURIComponent(number)}`);
  const [data, results] = await Promise.all([getProject(number), loadResults(number)]);
  if (!data || !canSee(user, data.project.id)) notFound();
  const p = data.project;
  const notes = results?.notes ?? [];
  const general = notes.filter((n) => !n.path);
  const byUnit = new Map<string, Note[]>();
  for (const n of notes.filter((n) => n.path)) {
    const key = n.path.split("/").map((x) => x.trim()).filter(Boolean).join(" / ");
    byUnit.set(key, [...(byUnit.get(key) ?? []), n]);
  }
  const units = [...byUnit.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  const detail = (n: Note) => [n.reading && `${n.reading}${n.units ? ` ${n.units}` : ""}`, n.comments].filter(Boolean).join(" · ");

  return (
    <>
      <Header user={user} />
      <main>
        <ProjectHeader user={{ customer: false, canSync: canEdit(user) }} project={p} tab="notes"
          missingRequired={results?.summary.missing_required} notes={notes.length} />
        {!results ? (
          <div className="card">This project hasn&apos;t been synced yet. Press <b>Sync</b> to pull it from BuildingStart.</div>
        ) : results.notes === undefined ? (
          <div className="card">Notes appear after the next <b>Sync</b>.</div>
        ) : notes.length === 0 ? (
          <div className="card muted">No notes in BuildingStart for this project.</div>
        ) : (
          <>
            {general.length > 0 && (
              <section className="card notes-card">
                <h2>Project notes</h2>
                <ul className="notes-list">
                  {general.map((n, i) => (
                    <li key={i}>{n.text}{detail(n) && <div className="muted">{detail(n)}</div>}</li>
                  ))}
                </ul>
              </section>
            )}
            {units.length > 0 && (
              <section className="card notes-card">
                <h2>Notes by unit</h2>
                {units.map(([path, list]) => (
                  <div key={path} className="notes-unit">
                    <div className="notes-path"><b>{path}</b>{list[0].item_type && <span className="muted"> · {list[0].item_type}</span>}</div>
                    <ul className="notes-list">
                      {list.map((n, i) => (
                        <li key={i}>{n.text}{detail(n) && <div className="muted">{detail(n)}</div>}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}
