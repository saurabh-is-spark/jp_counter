"use client";

import { useEffect, useId, useRef, useState } from "react";
import { dateKey, formatDate, fromDateKey, shiftDays } from "@/lib/date";

export function CalendarPicker({ value, today, entries, onChange }: { value: string; today: string; entries: string[]; onChange: (date: string) => void }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(value);
  const [mode, setMode] = useState<"days" | "months" | "years">("days");
  const [yearPage, setYearPage] = useState(2000);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const base = fromDateKey(month || today || "2000-01-01"); base.setDate(1);
  const year = base.getFullYear();
  const maxYear = today ? fromDateKey(today).getFullYear() : year;
  const first = shiftDays(base, -(base.getDay() + 6) % 7);
  const days = Array.from({ length: 42 }, (_, i) => dateKey(shiftDays(first, i)));
  const saved = new Set(entries);
  const nextMonth = new Date(base); nextMonth.setMonth(nextMonth.getMonth() + 1);

  function close() { setOpen(false); trigger.current?.focus(); }
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    root.current?.querySelector<HTMLButtonElement>(`[data-date="${value}"]`)?.focus();
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, value]);

  useEffect(() => {
    if (open && !root.current?.contains(document.activeElement)) {
      root.current?.querySelector<HTMLButtonElement>(".calendar-options button:not(:disabled), .calendar-days button:not(:disabled)")?.focus();
    }
  }, [open, mode, month]);

  function jumpMonth(amount: number) {
    const next = new Date(base); next.setMonth(next.getMonth() + amount);
    if (next.getFullYear() >= 1 && dateKey(next) <= today) setMonth(dateKey(next));
  }
  function navigate(amount: number) {
    if (mode === "years") setYearPage(Math.max(1, yearPage + amount * 12));
    else if (mode === "months") {
      const next = new Date(base); next.setMonth(0); next.setFullYear(year + amount);
      if (year + amount >= 1 && year + amount <= maxYear) setMonth(dateKey(next));
    } else jumpMonth(amount);
  }
  function pick(key: string) { onChange(key); close(); }
  function moveFocus(key: string, amount: number) {
    const next = dateKey(shiftDays(fromDateKey(key), amount));
    if (next < "0001-01-01" || next > today) return;
    setMonth(next);
    requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus());
  }

  return <div className="calendar-root" ref={root} onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); close(); } }}>
    <button ref={trigger} className="calendar-trigger" disabled={!today} aria-label="Choose tally date" aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={() => { setMonth(value || today); setMode("days"); setOpen(!open); }}>◫ <span>{value ? formatDate(value, { day: "numeric", month: "short", year: "numeric" }) : "Choose a date"}</span><span>⌄</span></button>
    {open && <div className="calendar-popup" id={id} role="dialog" aria-label="Choose any past date" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget) && !trigger.current?.contains(event.relatedTarget)) setOpen(false); }}>
      <div className="calendar-heading">
        <button aria-label={mode === "years" ? "Previous 12 years" : mode === "months" ? "Previous year" : "Previous month"} disabled={mode === "years" ? yearPage <= 1 : mode === "months" ? year <= 1 : dateKey(base).slice(0, 7) === "0001-01"} onClick={() => navigate(-1)}>‹</button>
        <button className="calendar-title" onClick={() => { if (mode === "days" || mode === "years") setMode("months"); else { setYearPage(Math.max(1, year - 5)); setMode("years"); } }}>{mode === "days" ? base.toLocaleDateString(undefined, { month: "long", year: "numeric" }) : mode === "months" ? `${year} · Change year` : `${yearPage} – ${Math.min(yearPage + 11, maxYear)}`}</button>
        <button aria-label={mode === "years" ? "Next 12 years" : mode === "months" ? "Next year" : "Next month"} disabled={mode === "years" ? yearPage + 12 > maxYear : mode === "months" ? year >= maxYear : dateKey(nextMonth) > today} onClick={() => navigate(1)}>›</button>
      </div>
      {mode === "years" ? <div className="calendar-options">{Array.from({ length: 12 }, (_, i) => yearPage + i).map(y => <button key={y} disabled={y > maxYear} onClick={() => { const d = new Date(base); d.setFullYear(y); d.setMonth(0); setMonth(dateKey(d)); setMode("months"); }}>{y}</button>)}</div> : mode === "months" ? <div className="calendar-options">{Array.from({ length: 12 }, (_, i) => { const d = new Date(base); d.setMonth(i); return <button key={i} disabled={dateKey(d) > today} onClick={() => { setMonth(dateKey(d)); setMode("days"); }}>{d.toLocaleDateString(undefined, { month: "short" })}</button>; })}</div> : <>
        <div className="calendar-weekdays">{["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map(day => <span key={day}>{day}</span>)}</div>
        <div className="calendar-days">{days.map(key => <button key={key} data-date={key} className={`${key.slice(0, 7) !== dateKey(base).slice(0, 7) ? "outside " : ""}${key === value ? "selected " : ""}${key === today ? "today" : ""}`} disabled={key > today || key < "0001-01-01"} aria-label={`${formatDate(key, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}${saved.has(key) ? ", tally saved" : ""}`} aria-pressed={key === value} onClick={() => pick(key)} onKeyDown={e => { const amount = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, PageUp: -28, PageDown: 28 } as Record<string, number>)[e.key]; if (amount) { e.preventDefault(); moveFocus(key, amount); } }}>{fromDateKey(key).getDate()}<i className={saved.has(key) ? "saved" : ""}/></button>)}</div>
      </>}
      <div className="calendar-footer"><button onClick={() => pick(today)}>Go to today</button><button onClick={close}>Close</button></div>
    </div>}
  </div>;
}
