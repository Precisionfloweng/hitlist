import Header from "../Header";
import { requireStaff } from "@/lib/auth";
import TrainingPlayer from "./TrainingPlayer";

export const dynamic = "force-dynamic";

/** The narrated training videos (files in public/training; demo project only, no client data). */
export default async function TrainingPage() {
  const user = await requireStaff();
  return (
    <>
      <Header user={user} />
      <main className="training">
        <h1>🎬 Training videos</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          How Hitlist works, from the job Overview to the AI Tools. Each chapter is short; when one ends, the next starts by itself.
        </p>
        <TrainingPlayer />
      </main>
    </>
  );
}
