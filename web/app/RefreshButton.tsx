"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RefreshButton({ project, queue }: { project: string; queue: "queued" | "running" | null }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");
  if (queue === "running") return <span className="pill warn">Syncing…</span>;
  if (queue === "queued") return <span className="pill gray">Waiting in line</span>;
  return (
    <button disabled={state === "sending"} title="Pull the latest data from BuildingStart"
      onClick={async () => {
        setState("sending");
        const r = await fetch("/api/refresh", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ project }) });
        setState(r.ok ? "idle" : "error");
        router.refresh();
      }}>
      {state === "sending" ? "Queuing…" : state === "error" ? "Try again" : "Refresh"}
    </button>
  );
}
