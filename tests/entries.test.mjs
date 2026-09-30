import assert from "node:assert/strict";
import { test } from "node:test";

const storage = new Map();
Object.defineProperty(globalThis, "localStorage", { value: {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
}, configurable: true });
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
const { readEntries, writeEntries, mergeEntries, cloudUserId, saveCloudEntry, syncEntries, supabase } = await import("../src/lib/entries.ts");
const entry = { date: "2026-09-01", count: 108, updatedAt: "2026-09-01T12:00:00Z" };

test("account caches do not expose another user's or legacy entries", () => {
  storage.clear();
  storage.set("@jaap-tally/entries", JSON.stringify([{ ...entry, count: 11 }]));
  writeEntries([entry], "user-a");
  assert.deepEqual(readEntries("user-a"), [entry]);
  assert.deepEqual(readEntries("user-b"), []);
  assert.equal(readEntries()[0].count, 11);
  writeEntries([{ ...entry, count: 9 }], "user-b");
  assert.equal(readEntries("user-a")[0].count, 108);
});

test("malformed browser caches do not load", () => {
  storage.set("@jaap-tally/entries/broken", "not JSON");
  assert.deepEqual(readEntries("broken"), []);
  storage.set("@jaap-tally/entries/broken", JSON.stringify([{ ...entry, count: -1 }]));
  assert.deepEqual(readEntries("broken"), []);
});

test("sync retains the latest tally for a date", () => {
  assert.equal(mergeEntries([entry], [{ ...entry, count: 216, updatedAt: "2026-09-02T12:00:00Z" }])[0].count, 216);
});

test("cloud access rejects signed-out, anonymous, and mismatched users", async () => {
  for (const user of [null, { id: "user-a", is_anonymous: true }, { id: "user-b", is_anonymous: false }]) {
    supabase.auth.getSession = async () => ({ data: { session: user ? { user } : null }, error: null });
    await assert.rejects(cloudUserId("user-a"), /log in again/);
  }
  supabase.auth.getSession = async () => ({ data: { session: { user: { id: "user-a", is_anonymous: false } } }, error: null });
  assert.equal(await cloudUserId("user-a"), "user-a");
});

test("save assigns the session user's ID and blocks account switches", async () => {
  let written;
  supabase.from = () => ({ upsert: async (row) => { written = row; return { error: null }; } });
  await saveCloudEntry(entry, "user-a");
  assert.equal(written.user_id, "user-a");
  written = undefined;
  supabase.auth.getSession = async () => ({ data: { session: { user: { id: "user-b", is_anonymous: false } } }, error: null });
  await assert.rejects(saveCloudEntry(entry, "user-a"), /log in again/);
  assert.equal(written, undefined);
});

test("cloud sync reads and caches only the active account", async () => {
  storage.clear();
  let filter;
  let written;
  supabase.auth.getSession = async () => ({ data: { session: { user: { id: "user-a", is_anonymous: false } } }, error: null });
  supabase.from = () => ({
    select: () => ({ eq: async (column, id) => {
      filter = [column, id];
      return { data: [{ entry_date: "2026-08-31", count: 5, updated_at: "2026-08-31T12:00:00Z" }], error: null };
    } }),
    upsert: async (rows) => { written = rows; return { error: null }; },
  });
  const result = await syncEntries([entry], "user-a");
  assert.deepEqual(filter, ["user_id", "user-a"]);
  assert.equal(written[0].user_id, "user-a");
  assert.equal(result.entries.length, 2);
  assert.deepEqual(readEntries("user-b"), []);
  assert.equal(readEntries("user-a").length, 2);
});
