"use client";
import { useState } from "react";

type Group = { type: string; href: string; items: { unit: string; fields: string[] }[] };

const LIMIT = 15;

/** "Possible issues found": grouped by equipment type; the first 15, then a Show all button. */
export default function IssuesList({ groups, total }: { groups: Group[]; total: number }) {
  const [all, setAll] = useState(false);
  let left = all ? Infinity : LIMIT;
  const shown = groups.map((g) => {
    const items = g.items.slice(0, Math.max(0, left));
    left -= items.length;
    return { ...g, items };
  }).filter((g) => g.items.length > 0);

  return (
    <>
      {shown.map((g) => (
        <div key={g.type} className="issue-group">
          <div className="issue-type">
            <a href={g.href}>{g.type}</a>
            <span className="muted"> · {groups.find((x) => x.type === g.type)!.items.length} unit
              {groups.find((x) => x.type === g.type)!.items.length === 1 ? "" : "s"}</span>
          </div>
          <ul>
            {g.items.map((it, i) => (
              <li key={i}><b>{it.unit}</b>: Ticked Complete but missing {it.fields.join(", ")}</li>
            ))}
          </ul>
        </div>
      ))}
      {total > LIMIT && (
        <button type="button" onClick={() => setAll(!all)} style={{ marginTop: 8 }}>
          {all ? "Show fewer" : `Show all ${total}`}
        </button>
      )}
    </>
  );
}
