import assert from "node:assert/strict";
import { test } from "node:test";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
const { supabase } = await import("../src/lib/entries.ts");
const { loadTargets, saveTargets } = await import("../src/lib/targets.ts");
const targets = { weekly: 756, monthly: 3240, goal: 100000 };

test("targets load only from the verified account", async () => {
  for (const user of [null, { id: "b", is_anonymous: false }, { id: "a", is_anonymous: true }]) {
    supabase.auth.getUser = async () => ({ data: { user }, error: null });
    await assert.rejects(loadTargets("a"), /log in again/);
  }
  supabase.auth.getUser = async () => ({ data: { user: { id: "a", user_metadata: { jaap_targets: targets } } }, error: null });
  assert.deepEqual(await loadTargets("a"), targets);
});

test("saving preferences uses account metadata and propagates sync failures", async () => {
  let payload;
  supabase.auth.updateUser = async value => { payload = value; return { error: null }; };
  await saveTargets(targets, "a");
  assert.deepEqual(payload, { data: { jaap_targets: targets } });
  await assert.rejects(saveTargets({ ...targets, weekly: -1 }, "a"), /Invalid/);
  supabase.auth.updateUser = async () => ({ error: new Error("offline") });
  await assert.rejects(saveTargets(targets, "a"), /offline/);
  supabase.auth.getUser = async () => ({ data: { user: { id: "b" } }, error: null });
  payload = undefined;
  await assert.rejects(saveTargets(targets, "a"), /log in again/);
  assert.equal(payload, undefined);
});
