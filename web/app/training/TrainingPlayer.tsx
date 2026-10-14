"use client";
import { useEffect, useRef, useState } from "react";

type Chapter = { id: string; file: string; title: string; who: "all" | "tech"; dur: string; desc: string; covers: string[] };

const CHAPTERS: Chapter[] = [
  { id: "ch1", file: "ch1-overview.mp4", title: "Overview tour", who: "all", dur: "4:07",
    desc: "What Hitlist does, how the BuildingStart data gets in, and a walk through a job: progress, tolerances, the equipment checklist, deficiencies, AI Tools and the Monday email.",
    covers: ["How the data gets from BuildingStart to Hitlist", "The Projects list and Sync", "A job's Overview, tolerances and equipment checklist", "Deficiencies and the Monday summary email"] },
  { id: "ch2", file: "ch2-install.mp4", title: "Put Hitlist on your phone and PC", who: "all", dur: "1:40",
    desc: "Add Hitlist to the iPhone or iPad home screen, and install it as an app on a Windows PC, so it opens with one tap.",
    covers: ["iPhone and iPad: Add to Home Screen", "Windows PC: install it from Edge or Chrome", "Pin it to the taskbar"] },
  { id: "ch3", file: "ch3-contacts-rules.mp4", title: "Contacts, Rules & Tolerances", who: "tech", dur: "2:59",
    desc: "Keep each job's email list, send the punch list in one tap, set the job's tolerances, and change what's required for one job.",
    covers: ["Add, edit and remove contacts", "On list, To and Cc, and New email", "Tolerances, and the company default (Admin → Settings)", "Required, Optional and Ignore, with change history"] },
  { id: "ch4", file: "ch4-refine-review.mp4", title: "AI Tools: Refine & AI Review", who: "tech", dur: "2:12",
    desc: "Turn rough notes into clear deficiencies, dictate instead of typing, and have the AI check every open deficiency's wording.",
    covers: ["Refine a deficiency or a note", "Blanks for values only you know", "AI Review on the Deficiencies tab", "Keep as is, and items that read well"] },
  { id: "ch5", file: "ch5-documents-suggestions.mp4", title: "AI Tools: Documents & Suggestions", who: "tech", dur: "3:16",
    desc: "Link the job's Dropbox folder, then use the Suggestions list: spec tolerances, TAB requirements, design values from three sources, Out of tolerance and What's left to do.",
    covers: ["How each sync reads the job's Dropbox folder", "Tolerances and TAB requirements from the spec", "Design values: BuildingStart, drawings, submittals, Compare all", "Out of tolerance and What's left to do"] },
  { id: "ch6", file: "ch6-asking.mp4", title: "AI Tools: Asking your own questions", who: "tech", dur: "1:49",
    desc: "Ask anything about the job in plain English, check where each answer came from, follow up with Reply, and find earlier questions.",
    covers: ["Watching the AI work step by step", "[S#] document and [B#] BuildingStart sources", "Reply to follow up or answer its question", "Asked before, and tips for good answers"] },
];
const src = (f: string) => `/training/${f}`;
const WHO = { all: "Everyone", tech: "Techs" };

/** Player plus chapter list; at the end of a chapter an "Up next" card counts down into the next one. */
export default function TrainingPlayer() {
  const [i, setI] = useState(0);
  const [next, setNext] = useState<number | null>(null);     // seconds left before the next chapter, or null
  const offered = useRef(false);                              // "Up next" already shown for this play-through
  const video = useRef<HTMLVideoElement>(null);
  const autoplay = useRef(false);
  const c = CHAPTERS[i];

  useEffect(() => {                                 // open the chapter in the address (#ch3), if any
    const k = CHAPTERS.findIndex((x) => `#${x.id}` === window.location.hash);
    if (k >= 0) setI(k);
  }, []);
  useEffect(() => {                                 // a new chapter: load it, play when asked to
    const v = video.current;
    if (!v) return;
    v.load();
    if (autoplay.current) v.play().catch(() => {});
    autoplay.current = false; offered.current = false;
    history.replaceState(null, "", `#${CHAPTERS[i].id}`);
  }, [i]);
  useEffect(() => {                                 // the countdown
    if (next === null) return;
    if (next <= 0) { setNext(null); go(i + 1, true); return; }
    const t = setTimeout(() => setNext(next - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next]);

  function go(k: number, play: boolean) { setNext(null); autoplay.current = play; setI(k); }
  const total = CHAPTERS.reduce((s, x) => { const [m, sec] = x.dur.split(":").map(Number); return s + m * 60 + sec; }, 0);

  return (
    <div className="training-wrap">
      <section className="card training-player">
        <div className="training-stage">
          <video ref={video} controls playsInline preload="metadata" poster={src(`poster-${c.id}.jpg`)}
            onTimeUpdate={(e) => {                    // "Up next" as the narration ends (the last 1.5 s are quiet)
              const v = e.currentTarget;
              if (!offered.current && v.duration && v.duration - v.currentTime < 1.5 && i < CHAPTERS.length - 1) { offered.current = true; setNext(2); }
            }}
            onEnded={() => { if (!offered.current && i < CHAPTERS.length - 1) { offered.current = true; setNext(2); } }}
            onPlay={(e) => { if (e.currentTarget.duration - e.currentTarget.currentTime > 2) { offered.current = false; setNext(null); } }}>
            <source src={src(c.file)} type="video/mp4" />
          </video>
          {next !== null && i < CHAPTERS.length - 1 && (
            <div className="training-next">
              <div className="training-next-eye">Up next</div>
              <div className="training-next-num">Chapter {i + 2}</div>
              <div className="training-next-title">{CHAPTERS[i + 1].title}</div>
              <div className="training-next-count">Starting in {next} second{next === 1 ? "" : "s"}</div>
              <div className="row" style={{ justifyContent: "center" }}>
                <button className="primary" onClick={() => go(i + 1, true)}>Play now</button>
                <button onClick={() => setNext(null)}>Stay here</button>
              </div>
            </div>
          )}
        </div>
        <div className="training-now">
          <div className="row" style={{ gap: 10 }}>
            <span className="training-eye">Chapter {i + 1}</span>
            <span className={`pill ${c.who === "all" ? "ok" : "gray"}`}>{WHO[c.who]}</span>
            <span className="muted">{c.dur}</span>
          </div>
          <h2>{c.title}</h2>
          <p className="muted">{c.desc}</p>
          <ul className="training-covers">{c.covers.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      </section>
      <aside className="training-list">
        <div className="training-eye">{CHAPTERS.length} chapters · about {Math.round(total / 60)} minutes</div>
        {CHAPTERS.map((x, k) => (
          <button key={x.id} className={`training-ch${k === i ? " on" : ""}`} aria-current={k === i} onClick={() => go(k, true)}>
            <img src={src(`poster-${x.id}.jpg`)} alt="" />
            <span><b>{k + 1}. {x.title}</b><small>{WHO[x.who]} · {x.dur}</small></span>
          </button>
        ))}
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          Filmed on a demo project: every name and reading is made up. In chapters 4 to 6 the AI answers are examples;
          Out of tolerance, What&apos;s left to do and Design values from BuildingStart are the real calculations.
        </p>
      </aside>
    </div>
  );
}
