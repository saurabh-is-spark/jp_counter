"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { dateKey, formatDate, fromDateKey, shiftDays } from "@/lib/date";
import { Entry, readEntries, saveCloudEntry, sortEntries, syncEntries, writeEntries } from "@/lib/entries";

import { CalendarPicker } from "./calendar-picker";
import { AnalyticsDashboard } from "./analytics-dashboard";

type View = "log" | "insights";
export function JaapApp({ user, onLogout }: { user: User; onLogout: () => Promise<void> }) {
  const [todayKey, setTodayKey] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [count, setCount] = useState("0");
  const [view, setView] = useState<View>("log");
  const [dark, setDark] = useState(false);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [showAllEntries, setShowAllEntries] = useState(false);
  const [legacyCount, setLegacyCount] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const currentDate = useRef("");

  useEffect(() => {
    let mounted = true;
    Promise.resolve().then(async () => {
      const today = dateKey();
      const local = readEntries(user.id);
      if (!mounted) return;
      setTodayKey(today);
      setSelectedDate(today);
      currentDate.current = today;
      setCount(String(local.find((entry) => entry.date === today)?.count ?? 0));
      setDark(localStorage.getItem("@jaap-tally/theme") === "dark");
      setEntries(local);
      setLegacyCount(localStorage.getItem(`@jaap-tally/imported/${user.id}`) ? 0 : readEntries().length);
      try {
        const { entries: synced, connected: isConnected } = await syncEntries(local, user.id);
        if (mounted) {
          setEntries(synced);
          setCount(String(synced.find((entry) => entry.date === currentDate.current)?.count ?? 0));
          setConnected(isConnected);
        }
      } catch {
        if (mounted) { setConnected(false); setNotice("Cloud sync is unavailable. Your account's browser copy is still available."); }
      } finally {
        if (mounted) setLoading(false);
      }
    });
    return () => { mounted = false; };
  }, [user.id]);

  const selectedEntry = entries.find((entry) => entry.date === selectedDate);

  const numericCount = Math.max(0, Number.parseInt(count, 10) || 0);
  const recentDays = todayKey ? Array.from({ length: 7 }, (_, i) => dateKey(shiftDays(fromDateKey(todayKey), i - 6))) : [];
  function chooseDate(key: string) {
    if (!todayKey || !/^\d{4}-\d{2}-\d{2}$/.test(key) || key > todayKey || dateKey(fromDateKey(key)) !== key) return;
    currentDate.current = key;
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
      writeEntries(next, user.id);
      setEntries(next);
      try {
        const synced = await saveCloudEntry(entry, user.id);
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

  async function logout() {
    setLoggingOut(true);
    try { await onLogout(); }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : "Could not log out. Please try again."); }
    finally { setLoggingOut(false); }
  }

  async function importLegacy() {
    setSaving(true);
    try {
      // Refresh the account first so old browser entries cannot replace cloud dates.
      const current = await syncEntries(readEntries(user.id), user.id);
      const existingDates = new Set(current.entries.map((entry) => entry.date));
      const missing = readEntries().filter((entry) => !existingDates.has(entry.date));
      const next = sortEntries([...current.entries, ...missing]);
      writeEntries(next, user.id);
      setEntries(next);
      setCount(String(next.find((entry) => entry.date === selectedDate)?.count ?? 0));
      const synced = await syncEntries(next, user.id);
      setEntries(synced.entries);
      localStorage.setItem(`@jaap-tally/imported/${user.id}`, "true");
      setLegacyCount(0);
      setNotice(`${missing.length} old browser tallies imported. Existing account dates were kept.`);
    } catch {
      setNotice("Import could not finish. Your old tallies are still saved in this browser; try again.");
    } finally { setSaving(false); }
  }

  return <div className={`app-shell${dark ? " dark" : ""}`}>
    <aside className="sidebar">
      <div className="brand"><span className="brand-icon">✦</span><div><strong>Jaap Tally</strong><small>YOUR DAILY PRACTICE</small></div></div>
      <div className="sidebar-group-label">WORKSPACE</div>
      <nav aria-label="Main navigation" className="nav">
        <button className={view === "log" ? "nav-link active" : "nav-link"} onClick={() => setView("log")}><span className="nav-symbol">◫</span> Daily log</button>
        <button className={view === "insights" ? "nav-link active" : "nav-link"} onClick={() => setView("insights")}><span className="nav-symbol">▥</span> Dashboard</button>
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-note"><span className="sidebar-note-icon">✧</span><strong>One day at a time.</strong><p>Every count is a moment of intention.</p></div>
        <button className="theme-button" onClick={toggleTheme} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}><span>{dark ? "☀" : "☾"}</span>{dark ? "Light mode" : "Dark mode"}<span className="theme-toggle"><i /></span></button>
      </div>
    </aside>

    <div className="main-area">
      <header className="topbar"><div className="mobile-brand">✦ <strong>Jaap Tally</strong></div><span className="topbar-label">A SPACE FOR STILLNESS</span><div className="topbar-right"><span className={`status-dot${connected ? " online" : ""}`} /><span>{connected ? "Cloud connected" : "Saved in this browser"}</span><details className="account-details"><summary>{user.email ?? "My account"}</summary><div><strong>{user.email}</strong><small>User ID</small><code>{user.id}</code></div></details><button className="logout-button" disabled={loggingOut || saving} onClick={logout}>{loggingOut ? "Logging out…" : "Log out"}</button></div></header>
      <main className="content">
        {legacyCount > 0 && <div className="legacy-banner"><div><strong>Bring your old browser tallies into this account</strong><p>{legacyCount} tallies are saved from before login was added. Import only if these belong to you. Dates already in your account will be kept.</p></div><button disabled={loading || saving || !connected} onClick={importLegacy}>{saving ? "Please wait…" : "Import old tallies"}</button></div>}
        {view === "log" ? <>
          <div className="page-heading"><div><span className="eyebrow">DAILY PRACTICE <span className="eyebrow-line" /></span><h1>Keep your rhythm<span className="accent">.</span></h1><p>A calm place to show up for your daily jaap.</p></div><div className="heading-decoration" aria-hidden="true">✦</div></div>
          <div className="log-grid">
            <section className="primary-column" aria-label="Log a tally">
              <div className="section-heading"><div><h2>Select a day</h2><p>Choose when you practiced</p></div><span className="section-meta">LAST 7 DAYS</span></div>
              <div className="day-grid">{recentDays.map((key) => <button key={key} className={`day-card${selectedDate === key ? " selected" : ""}`} onClick={() => chooseDate(key)} aria-pressed={selectedDate === key}><span>{key === todayKey ? "TODAY" : formatDate(key, { weekday: "short" }).toUpperCase()}</span><strong>{fromDateKey(key).getDate()}</strong><i className={entries.some((entry) => entry.date === key) ? "filled" : ""} /></button>)}</div>
              <div className="date-picker-row"><div><strong>Choose any past date</strong><span>Add a new tally or update one you saved earlier.</span></div><CalendarPicker value={selectedDate} today={todayKey} entries={entries.map(entry => entry.date)} onChange={chooseDate}/></div>
              <section className="counter-card"><div className="card-top"><div><span className="card-eyebrow">{selectedEntry ? "SAVED ENTRY" : selectedDate === todayKey ? "TODAY'S INTENTION" : "PAST PRACTICE"}</span><h2>{selectedDate ? formatDate(selectedDate, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : "Today"}</h2></div><span className="sparkle">✧</span></div><div className="counter-body"><p>How many jaap did you complete?</p><div className="counter-control"><button aria-label="Decrease count" onClick={() => setCount(String(Math.max(0, numericCount - 1)))}>−</button><input aria-label="Jaap count" type="number" min="0" step="1" value={count} onChange={(event) => setCount(event.target.value)} /><button aria-label="Increase count" onClick={() => setCount(String(numericCount + 1))}>+</button></div><div className="quick-add" aria-label="Quick add">{[1, 11, 108].map((amount) => <button key={amount} onClick={() => setCount(String(numericCount + amount))}>+ {amount}</button>)}</div><button className="save-button" disabled={saving || loading} onClick={save}>{saving ? "Saving…" : selectedEntry ? "Update tally" : "Save tally"}<span aria-hidden="true">↗</span></button><p className="save-notice" role="status">{notice || "Your practice, at your pace."}</p></div></section>
            </section>
            <section className="secondary-column" aria-label="Recent tallies"><div className="section-heading"><div><h2>Recent tallies</h2><p>Your practice, day by day</p></div><span className="section-meta">{entries.length} SAVED</span></div><div className="history-card">{loading ? <div className="empty-history">Loading your tallies…</div> : entries.length ? (showAllEntries ? entries : entries.slice(0, 8)).map((entry) => <button className="history-row" key={entry.date} onClick={() => chooseDate(entry.date)}><span className="date-tile"><strong>{fromDateKey(entry.date).getDate()}</strong><small>{formatDate(entry.date, { month: "short" }).toUpperCase()}</small></span><span className="history-date"><strong>{formatDate(entry.date, { weekday: "long" })}</strong><small>{formatDate(entry.date, { month: "long", day: "numeric", year: "numeric" })}</small></span><strong className="history-count">{entry.count.toLocaleString()}</strong><span className="row-arrow">›</span></button>) : <div className="empty-history"><span>✦</span><strong>Your first tally starts here.</strong><p>Choose a number and save it when you are ready.</p></div>}{entries.length > 8 && <button className="show-all-button" onClick={() => setShowAllEntries((current) => !current)}>{showAllEntries ? "Show recent tallies" : `Show all ${entries.length} tallies`}</button>}</div><div className="quiet-card"><span>✦</span><p>“Small moments, repeated daily, become a meaningful practice.”</p></div></section>
          </div>
        </> : todayKey ? <AnalyticsDashboard entries={entries} today={todayKey} user={user} onChooseDate={chooseDate} loading={loading}/> : <p role="status">Loading your dashboard…</p>}
      </main>
    </div>
    <nav className="mobile-nav" aria-label="Mobile navigation"><button className={view === "log" ? "active" : ""} onClick={() => setView("log")}>◫ <span>Daily log</span></button><button className={view === "insights" ? "active" : ""} onClick={() => setView("insights")}>▥ <span>Dashboard</span></button><button onClick={toggleTheme}>{dark ? "☀" : "☾"}<span>{dark ? "Light" : "Dark"}</span></button></nav>
  </div>;
}
