import assert from "node:assert/strict";
import { test } from "node:test";
import { periodBounds, daysBetween, summarize, streaks, forecast, targetProgress, parseTargets } from "../src/lib/analytics.ts";
const entry = (date, count) => ({ date, count, updatedAt: `${date}T12:00:00Z` });

test("calendar weeks cross years; leap February and full years have correct bounds", () => {
  assert.deepEqual(periodBounds("2027-01-01", "week"), { start: "2026-12-28", end: "2027-01-03" });
  assert.deepEqual(periodBounds("2024-02-20", "month"), { start: "2024-02-01", end: "2024-02-29" });
  assert.deepEqual(periodBounds("2026-09-30", "year"), { start: "2026-01-01", end: "2026-12-31" });
  assert.equal(daysBetween("2024-03-09", "2024-03-11"), 2);
});

test("current analytics includes zero days and compares the same elapsed days", () => {
  const result = summarize([entry("2026-09-28", 108), entry("2026-09-29", 0), entry("2026-09-21", 54), entry("2026-09-24", 900), entry("2026-10-01", 999)], "2026-09-30", "2026-09-30", "week");
  assert.equal(result.total, 108); assert.equal(result.days, 3); assert.equal(result.average, 36);
  assert.equal(result.active, 1); assert.equal(Math.round(result.consistency), 33);
  assert.equal(result.previous, 54); assert.equal(result.change, 100);
  assert.equal(result.points[3].future, true); assert.equal(result.points[3].value, 0);
});

test("historical periods compare full periods and empty data does not create a trend", () => {
  const result = summarize([entry("2026-08-31", 50)], "2026-09-30", "2026-08-10", "month");
  assert.equal(result.days, 31); assert.equal(result.total, 50); assert.equal(result.change, null);
  assert.equal(summarize([], "2026-09-30", "2026-09-30", "year").points.length, 12);
});

test("streaks tolerate today's unfinished tally but stop at missed days", () => {
  const entries = [entry("2026-09-29", 10), entry("2026-09-28", 20), entry("2026-09-27", 30), entry("2026-09-25", 1), entry("2026-09-30", 0)];
  assert.deepEqual(streaks(entries, "2026-09-30"), { current: 3, longest: 3 });
  assert.equal(streaks(entries, "2026-10-01").current, 0);
});

test("target pacing counts today and clamps achieved targets", () => {
  const entries = [entry("2026-09-28", 100)];
  const month = targetProgress(entries, "2026-09-30", "month", 208);
  assert.equal(month.daysLeft, 1); assert.equal(month.required, 108);
  const week = targetProgress(entries, "2026-09-30", "week", 50);
  assert.equal(week.daysLeft, 5); assert.equal(week.remaining, 0); assert.equal(week.percent, 100);
});

test("forecast uses completed calendar days, includes gaps, excludes future tallies", () => {
  const entries = [entry("2026-09-26", 100), entry("2026-09-29", 100), entry("2026-09-30", 50), entry("2026-10-01", 10000)];
  const result = forecast(entries, "2026-09-30", 1000);
  assert.equal(result.allTime, 250); assert.equal(result.sampleDays, 4); assert.equal(result.pace, 50);
  assert.equal(result.daysToGo, 15); assert.equal(result.estimatedDate, "2026-10-15");
  assert.equal(forecast(entries, "2026-09-30", 1000, 100).daysToGo, 8);
  assert.equal(forecast(entries, "2026-09-30", 200).reached, true);
  assert.equal(forecast([], "2026-09-30", 1000).estimatedDate, null);
  assert.equal(forecast([entry("2026-09-30", 100)], "2026-09-30", 1000).pace, 0);
});

test("forecast caps history at 28 days and sanitizes untrusted target preferences", () => {
  const result = forecast([entry("2026-01-01", 90000), entry("2026-09-29", 280)], "2026-09-30", 100000);
  assert.equal(result.sampleDays, 28); assert.equal(result.pace, 10);
  assert.deepEqual(parseTargets({ weekly: -1, monthly: "300", goal: 1e14 }), { weekly: 0, monthly: 0, goal: 0 });
});
