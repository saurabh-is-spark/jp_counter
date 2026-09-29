"use client";

import { useEffect, useState } from "react";
import { dateKey, formatDate, fromDateKey, shiftDays } from "@/lib/date";
import { Entry, readEntries, saveCloudEntry, sortEntries, syncEntries, writeEntries } from "@/lib/entries";

type View = "log" | "insights";
type Period = "week" | "month" | "year";
type Point = { label: string; detail: string; value: number };

function pointsFor(entries: Entry[], period: Period, today: Date): Point[] {
  const counts = new Map(entries.map((entry) => [entry.date, entry.count]));
  if (period === "week") return Array.from({ length: 7 }, (_, index) => {
    const day = shiftDays(today, index - 6);
    const key = dateKey(day);
    return { label: day.toLocaleDateString(undefined, { weekday: "short" }), detail: formatDate(key, { weekday: "long", month: "short", day: "numeric" }), value: counts.get(key) ?? 0 };
  });
  if (period === "month") {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return Array.from({ length: Math.ceil(last.getDate() / 7) }, (_, index) => {
      const start = shiftDays(first, index * 7);
      const end = new Date(Math.min(shiftDays(start, 6).getTime(), last.getTime()));
      return { label: `Week ${index + 1}`, detail: `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`, value: entries.reduce((sum, entry) => sum + (entry.date >= dateKey(start) && entry.date <= dateKey(end) ? entry.count : 0), 0) };
    });
  }
  return Array.from({ length: 12 }, (_, index) => {
    const start = dateKey(new Date(today.getFullYear(), index, 1));
    const end = dateKey(new Date(today.getFullYear(), index + 1, 0));
    return { label: new Date(today.getFullYear(), index, 1).toLocaleDateString(undefined, { month: "short" }), detail: new Date(today.getFullYear(), index, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" }), value: entries.reduce((sum, entry) => sum + (entry.date >= start && entry.date <= end ? entry.count : 0), 0) };
  });
}

function streakFor(entries: Entry[], today: Date) {
  const active = new Set(entries.filter((entry) => entry.count > 0).map((entry) => entry.date));
  const cursor = new Date(today);
  if (!active.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (active.has(dateKey(cursor))) { streak++; cursor.setDate(cursor.getDate() - 1); }
  return streak;
}

export function JaapApp() {
  const [todayKey, setTodayKey] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [count, setCount] = useState("0");
  const [view, setView] = useState<View>("log");
  const [period, setPeriod] = useState<Period>("week");
  const [dark, setDark] = useState(false);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [showAllEntries, setShowAllEntries] = useState(false);

  useEffect(() => {
    let mounted = true;
    Promise.resolve().then(async () => {
      const today = dateKey();
      const local = readEntries();
      if (!mounted) return;
      setTodayKey(today);
      setSelectedDate(today);
      setCount(String(local.find((entry) => entry.date === today)?.count ?? 0));
      setDark(localStorage.getItem("@jaap-tally/theme") === "dark");
      setEntries(local);
      try {
        const { entries: synced, connected: isConnected } = await syncEntries(local);
        if (mounted) {
          setEntries(synced);
          setCount(String(synced.find((entry) => entry.date === today)?.count ?? 0));
          setConnected(isConnected);
        }
      } catch {
        if (mounted) setConnected(false);
      } finally {
        if (mounted) setLoading(false);
      }
    });
    return () => { mounted = false; };
  }, []);

  const selectedEntry = entries.find((entry) => entry.date === selectedDate);

  const numericCount = Math.max(0, Number.parseInt(count, 10) || 0);
  const recentDays = todayKey ? Array.from({ length: 7 }, (_, i) => dateKey(shiftDays(fromDateKey(todayKey), i - 6))) : [];
  const today = todayKey ? fromDateKey(todayKey) : new Date(2000, 0, 1);
  const points = pointsFor(entries, period, today);
  const periodTotal = points.reduce((sum, point) => sum + point.value, 0);
  const activePeriods = points.filter((point) => point.value > 0).length;
  const allTime = entries.reduce((sum, entry) => sum + entry.count, 0);
  const maxPoint = Math.max(...points.map((point) => point.value), 1);
  const periodLabel = period === "week" ? "this week" : period === "month" ? "this month" : "this year";
  const activeLabel = period === "week" ? "active days" : period === "month" ? "active weeks" : "active months";

  function chooseDate(key: string) {
    if (!todayKey || !/^\d{4}-\d{2}-\d{2}$/.test(key) || key > todayKey || dateKey(fromDateKey(key)) !== key) return;
    setSelectedDate(key);
    setCount(String(entries.find((entry) => entry.date === key)?.count ?? 0));
    setView("log");
    setNotice("");
  }

  function toggleTheme() {
    setDark((current) => {
      localStorage.setItem("@jaap-tally/theme", current ? "light" : "dark");
      return !current;
    });
  }

  async function save() {
    if (!selectedDate || selectedDate > todayKey || saving || !/^\d+$/.test(count) || !Number.isSafeInteger(Number(count))) {
      setNotice("Enter a valid whole number before saving.");
      return;
    }
    setSaving(true);
    setNotice("");
    const entry: Entry = { date: selectedDate, count: numericCount, updatedAt: new Date().toISOString() };
    const next = sortEntries([...entries.filter((item) => item.date !== selectedDate), entry]);
    try {
      writeEntries(next);
      setEntries(next);
      try {
        const synced = await saveCloudEntry(entry);
        setConnected(synced);
        setNotice(synced ? "Tally saved and synced." : "Tally saved on this browser.");
      } catch {
        setConnected(false);
        setNotice("Tally saved on this browser. Cloud sync will retry when you reopen the app.");
      }
    } catch {
      setNotice("Could not save this tally. Please check browser storage and try again.");
    } finally {
      setSaving(false);
    }
  }

  return <div className={`app-shell${dark ? " dark" : ""}`}>
    <aside className="sidebar">
      <div className="brand"><span className="brand-icon">✦</span><div><strong>Jaap Tally</strong><small>YOUR DAILY PRACTICE</small></div></div>
      <div className="sidebar-group-label">WORKSPACE</div>
      <nav aria-label="Main navigation" className="nav">
        <button className={view === "log" ? "nav-link active" : "nav-link"} onClick={() => setView("log")}><span className="nav-symbol">◫</span> Daily log</button>
        <button className={view === "insights" ? "nav-link active" : "nav-link"} onClick={() => setView("insights")}><span className="nav-symbol">▥</span> Insights</button>
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-note"><span className="sidebar-note-icon">✧</span><strong>One day at a time.</strong><p>Every count is a moment of intention.</p></div>
        <button className="theme-button" onClick={toggleTheme} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}><span>{dark ? "☀" : "☾"}</span>{dark ? "Light mode" : "Dark mode"}<span className="theme-toggle"><i /></span></button>
      </div>
    </aside>

    <div className="main-area">
      <header className="topbar"><div className="mobile-brand">✦ <strong>Jaap Tally</strong></div><span className="topbar-label">A SPACE FOR STILLNESS</span><div className="topbar-right"><span className={`status-dot${connected ? " online" : ""}`} /><span>{connected ? "Cloud connected" : "Saved in this browser"}</span><span className="avatar">J</span></div></header>
      <main className="content">
        {view === "log" ? <>
          <div className="page-heading"><div><span className="eyebrow">DAILY PRACTICE <span className="eyebrow-line" /></span><h1>Keep your rhythm<span className="accent">.</span></h1><p>A calm place to show up for your daily jaap.</p></div><div className="heading-decoration" aria-hidden="true">✦</div></div>
          <div className="log-grid">
            <section className="primary-column" aria-label="Log a tally">
              <div className="section-heading"><div><h2>Select a day</h2><p>Choose when you practiced</p></div><span className="section-meta">LAST 7 DAYS</span></div>
              <div className="day-grid">{recentDays.map((key) => <button key={key} className={`day-card${selectedDate === key ? " selected" : ""}`} onClick={() => chooseDate(key)} aria-pressed={selectedDate === key}><span>{key === todayKey ? "TODAY" : formatDate(key, { weekday: "short" }).toUpperCase()}</span><strong>{fromDateKey(key).getDate()}</strong><i className={entries.some((entry) => entry.date === key) ? "filled" : ""} /></button>)}</div>
              <div className="date-picker-row"><div><label htmlFor="entry-date">Choose any past date</label><span>Add a new tally or update one you saved earlier.</span></div><input id="entry-date" type="date" max={todayKey || undefined} value={selectedDate} onChange={(event) => chooseDate(event.target.value)} /></div>
              <section className="counter-card"><div className="card-top"><div><span className="card-eyebrow">{selectedEntry ? "SAVED ENTRY" : "TODAY'S INTENTION"}</span><h2>{selectedDate ? formatDate(selectedDate, { weekday: "long", month: "long", day: "numeric" }) : "Today"}</h2></div><span className="sparkle">✧</span></div><div className="counter-body"><p>How many jaap did you complete?</p><div className="counter-control"><button aria-label="Decrease count" onClick={() => setCount(String(Math.max(0, numericCount - 1)))}>−</button><input aria-label="Jaap count" type="number" min="0" step="1" value={count} onChange={(event) => setCount(event.target.value)} /><button aria-label="Increase count" onClick={() => setCount(String(numericCount + 1))}>+</button></div><div className="quick-add" aria-label="Quick add">{[1, 11, 108].map((amount) => <button key={amount} onClick={() => setCount(String(numericCount + amount))}>+ {amount}</button>)}</div><button className="save-button" disabled={saving || loading} onClick={save}>{saving ? "Saving…" : selectedEntry ? "Update tally" : "Save tally"}<span aria-hidden="true">↗</span></button><p className="save-notice" role="status">{notice || "Your practice, at your pace."}</p></div></section>
            </section>
            <section className="secondary-column" aria-label="Recent tallies"><div className="section-heading"><div><h2>Recent tallies</h2><p>Your practice, day by day</p></div><span className="section-meta">{entries.length} SAVED</span></div><div className="history-card">{loading ? <div className="empty-history">Loading your tallies…</div> : entries.length ? (showAllEntries ? entries : entries.slice(0, 8)).map((entry) => <button className="history-row" key={entry.date} onClick={() => chooseDate(entry.date)}><span className="date-tile"><strong>{fromDateKey(entry.date).getDate()}</strong><small>{formatDate(entry.date, { month: "short" }).toUpperCase()}</small></span><span className="history-date"><strong>{formatDate(entry.date, { weekday: "long" })}</strong><small>{formatDate(entry.date, { month: "long", day: "numeric", year: "numeric" })}</small></span><strong className="history-count">{entry.count.toLocaleString()}</strong><span className="row-arrow">›</span></button>) : <div className="empty-history"><span>✦</span><strong>Your first tally starts here.</strong><p>Choose a number and save it when you are ready.</p></div>}{entries.length > 8 && <button className="show-all-button" onClick={() => setShowAllEntries((current) => !current)}>{showAllEntries ? "Show recent tallies" : `Show all ${entries.length} tallies`}</button>}</div><div className="quiet-card"><span>✦</span><p>“Small moments, repeated daily, become a meaningful practice.”</p></div></section>
          </div>
        </> : <>
          <div className="page-heading"><div><span className="eyebrow">YOUR SPACE <span className="eyebrow-line" /></span><h1>Practice overview<span className="accent">.</span></h1><p>See the rhythm you have built, one day at a time.</p></div><div className="all-time"><strong>{allTime.toLocaleString()}</strong><span>ALL-TIME JAAP</span></div></div>
          <div className="insights-grid"><div className="insights-main"><div className="period-tabs" role="group" aria-label="Time period">{(["week", "month", "year"] as Period[]).map((value) => <button key={value} className={period === value ? "active" : ""} onClick={() => setPeriod(value)} aria-pressed={period === value}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div><section className="total-card"><div className="total-glow"/><span>TOTAL {periodLabel.toUpperCase()}</span><strong>{periodTotal.toLocaleString()}</strong><p><i />{activePeriods ? `${activePeriods} ${activeLabel} with a saved tally` : `No tallies saved ${periodLabel} yet`}</p><b>✦</b></section><div className="metrics"><div className="metric featured"><strong>{activePeriods}</strong><span>{activeLabel}</span></div><div className="metric"><strong>{activePeriods ? Math.round(periodTotal / activePeriods).toLocaleString() : "0"}</strong><span>per active {period === "year" ? "month" : period === "month" ? "week" : "day"}</span></div><div className="metric"><strong>{streakFor(entries, today)}</strong><span>day streak</span></div></div><div className="section-heading chart-heading"><div><h2>{period === "week" ? "Daily" : period === "month" ? "Weekly" : "Monthly"} rhythm</h2><p>Your progress {periodLabel}</p></div><span className="section-meta">{period === "week" ? "7 DAYS" : period === "month" ? "THIS MONTH" : today.getFullYear()}</span></div><div className="chart-card"><div className="chart">{points.map((point, index) => <div className="bar-column" key={`${point.detail}-${index}`} title={`${point.detail}: ${point.value.toLocaleString()}`}><span className="bar-value">{point.value || ""}</span><div className="bar-track"><div className={`bar${index === points.length - 1 && period !== "year" ? " current" : ""}`} style={{ height: `${point.value ? Math.max(5, point.value / maxPoint * 100) : 2}%` }} /></div><span className="bar-label">{point.label}</span></div>)}</div><div className="chart-footer"><span><i /> Jaap count</span><span>{periodLabel}</span></div></div></div><div className="insights-side"><div className="section-heading"><div><h2>Recent activity</h2><p>The moments that add up</p></div></div><div className="activity-card">{points.slice().reverse().map((point, index) => <div className="activity-row" key={`${point.detail}-${index}`}><i className={point.value ? "active" : ""}/><span><strong>{point.detail}</strong><small>{point.value ? "Tally saved" : "No tally saved"}</small></span><b>{point.value ? point.value.toLocaleString() : "—"}</b></div>)}</div></div></div>
        </>}
      </main>
    </div>
    <nav className="mobile-nav" aria-label="Mobile navigation"><button className={view === "log" ? "active" : ""} onClick={() => setView("log")}>◫ <span>Daily log</span></button><button className={view === "insights" ? "active" : ""} onClick={() => setView("insights")}>▥ <span>Insights</span></button><button onClick={toggleTheme}>{dark ? "☀" : "☾"}<span>{dark ? "Light" : "Dark"}</span></button></nav>
  </div>;
}
