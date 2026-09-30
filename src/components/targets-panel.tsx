"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { forecast, parseTargets, targetProgress, type Targets } from "@/lib/analytics";
import { formatDate } from "@/lib/date";
import type { Entry } from "@/lib/entries";
import { loadTargets, saveTargets } from "@/lib/targets";

export function TargetsPanel({ entries, today, user }: { entries: Entry[]; today: string; user: User }) {
  const [targets, setTargets] = useState<Targets>(() => parseTargets(user.user_metadata?.jaap_targets));
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ weekly: "", monthly: "", goal: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);
  const [plannedPace, setPlannedPace] = useState("");

  useEffect(() => {
    let mounted = true;
    // Fetch current account preferences so another device's edits are visible.
    Promise.resolve().then(async () => {
      try {
        const saved = await loadTargets(user.id);
        if (mounted) { setTargets(saved); setReady(true); }
      } catch { if (mounted) setMessage("Targets could not load. Reopen the dashboard to try again."); }
    });
    return () => { mounted = false; };
  }, [user.id]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const values = Object.values(draft);
    if (values.some(v => v !== "" && (!/^\d+$/.test(v) || !Number.isSafeInteger(Number(v)) || Number(v) > 1e12))) { setMessage("Use whole numbers from 0 to 1,000,000,000,000. Leave blank to turn a target off."); return; }
    const next = parseTargets(Object.fromEntries(Object.entries(draft).map(([k, v]) => [k, Number(v)])));
    setBusy(true); setMessage("");
    try {
      await saveTargets(next, user.id);
      setTargets(next); setEditing(false); setMessage("Targets saved to your account.");
    } catch { setMessage("Targets could not save. Check your connection and try again."); }
    finally { setBusy(false); }
  }

  const projection = forecast(entries, today, targets.goal);
  const planned = /^\d+$/.test(plannedPace) && Number(plannedPace) > 0 && Number(plannedPace) <= 1e12 ? forecast(entries, today, targets.goal, Number(plannedPace)) : null;
  const shown = planned ?? projection;
  return <section className="targets-section" aria-label="Targets and goal">
    <div className="section-heading"><div><h2>Your next milestones</h2><p>Small commitments. Meaningful progress.</p></div><button className="outline-button" disabled={!ready || busy} onClick={() => { setDraft(Object.fromEntries(Object.entries(targets).map(([k, v]) => [k, v ? String(v) : ""])) as typeof draft); setEditing(!editing); setMessage(""); }}>{editing ? "Cancel" : "Edit targets"}</button></div>
    {editing && <form className="target-editor" onSubmit={save}><p>Targets repeat every calendar week and month. Your overall goal is your lifetime jaap total.</p><div className="target-inputs">{(["weekly", "monthly", "goal"] as const).map(key => <label key={key}>{key === "weekly" ? "Weekly target" : key === "monthly" ? "Monthly target" : "Overall goal"}<input type="text" inputMode="numeric" autoComplete="off" value={draft[key]} placeholder="No target" disabled={busy} onChange={e => setDraft({ ...draft, [key]: e.target.value })}/></label>)}</div><button className="outline-button" disabled={busy} type="submit">{busy ? "Saving…" : "Save targets"}</button><small>Leave blank or enter 0 to turn a target off.</small></form>}
    <p className="target-status" role="status">{message || (!ready ? "Loading account targets…" : "")}</p>
    <div className="target-grid">{(["week", "month"] as const).map(period => {
      const target = targets[period === "week" ? "weekly" : "monthly"];
      const progress = targetProgress(entries, today, period, target);
      return <article className="dashboard-card target-card" key={period}><span className="card-kicker">THIS {period.toUpperCase()}</span><h3>{progress.total.toLocaleString()} <small>/ {target ? target.toLocaleString() : "No target"}</small></h3><div className="progress-track" role="progressbar" aria-label={`${period} target progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.percent)}><i style={{ width: `${progress.percent}%` }}/></div><p>{!target ? "Set a target to give your practice direction." : progress.remaining === 0 ? "Target reached. Keep your rhythm going!" : `${progress.remaining.toLocaleString()} to go · ${progress.required.toLocaleString()} per day needed`}</p><small>{formatDate(progress.start, { month: "short", day: "numeric" })} – {formatDate(progress.end, { month: "short", day: "numeric" })} · {progress.daysLeft} days left, including today</small></article>;
    })}</div>
    <article className="goal-card"><div><span className="card-kicker">THE BIGGER PICTURE</span><h2>{targets.goal ? `${targets.goal.toLocaleString()} jaap` : "Give your practice a destination."}</h2><p>{targets.goal ? `${projection.allTime.toLocaleString()} completed · ${projection.remaining.toLocaleString()} remaining` : "Set an overall goal, then see when your current pace could take you there."}</p><div className="progress-track" role="progressbar" aria-label="Overall goal progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={targets.goal ? Math.min(100, Math.round(projection.allTime / targets.goal * 100)) : 0}><i style={{ width: `${targets.goal ? Math.min(100, projection.allTime / targets.goal * 100) : 0}%` }}/></div></div><div className="goal-estimate"><span>{projection.reached ? "GOAL REACHED" : "ESTIMATED ARRIVAL"}</span><strong>{projection.reached ? "You did it ✦" : !targets.goal ? "Set your goal" : shown.estimatedDate ? formatDate(shown.estimatedDate, { day: "numeric", month: "short", year: "numeric" }) : "Build your pace"}</strong><p>{projection.reached ? "Every day contributed to this milestone." : shown.daysToGo !== null && shown.estimatedDate ? `About ${shown.daysToGo.toLocaleString()} days at ${Math.round(shown.pace).toLocaleString()} jaap/day` : "Save positive tallies on completed days to get an estimate."}</p></div>{targets.goal > 0 && !projection.reached && <div className="forecast-detail"><p>Recent pace: {Math.round(projection.pace).toLocaleString()} jaap/day across {projection.sampleDays} completed days (up to 28), including days without a tally. Estimates change with your practice.{projection.sampleDays < 7 ? " Early estimate: fewer than 7 days of history." : ""}</p><label>Try a daily pace<input type="text" inputMode="numeric" value={plannedPace} onChange={e => setPlannedPace(e.target.value)} placeholder="e.g. 108"/><span>{planned ? "Showing your planned pace" : "Showing your recent pace"}</span></label></div>}</article>
  </section>;
}
