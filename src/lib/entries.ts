import { createClient } from "@supabase/supabase-js";

export type Entry = { date: string; count: number; updatedAt: string };
const storageKey = "@jaap-tally/entries";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// The publishable key may be exposed to the browser; never use a service-role key here.
export const supabase = url && key ? createClient(url, key) : null;

export function sortEntries(entries: Entry[]) {
  return [...entries].sort((a, b) => b.date.localeCompare(a.date));
}

export function readEntries(): Entry[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return sortEntries(raw.filter((item): item is Entry =>
      typeof item === "object" && item !== null &&
      typeof item.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.date) &&
      Number.isSafeInteger(item.count) && item.count >= 0 &&
      typeof item.updatedAt === "string"));
  } catch {
    return [];
  }
}

export function writeEntries(entries: Entry[]) {
  localStorage.setItem(storageKey, JSON.stringify(sortEntries(entries)));
}

export function mergeEntries(local: Entry[], remote: Entry[]) {
  const byDate = new Map<string, Entry>();
  for (const entry of [...remote, ...local]) {
    const previous = byDate.get(entry.date);
    if (!previous || entry.updatedAt >= previous.updatedAt) byDate.set(entry.date, entry);
  }
  return sortEntries([...byDate.values()]);
}

export async function cloudUserId() {
  if (!supabase) return null;
  const { data: session, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (session.session?.user) return session.session.user.id;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.user?.id ?? null;
}

export async function syncEntries(local: Entry[]) {
  if (!supabase) return { entries: local, connected: false };
  const userId = await cloudUserId();
  if (!userId) throw new Error("Unable to start a cloud session.");
  const { data, error } = await supabase.from("jaap_entries")
    .select("entry_date,count,updated_at").eq("user_id", userId);
  if (error) throw error;
  const remote: Entry[] = (data ?? []).map((row) => ({
    date: row.entry_date, count: row.count, updatedAt: row.updated_at,
  }));
  const merged = mergeEntries(local, remote);
  const remoteByDate = new Map(remote.map((entry) => [entry.date, entry]));
  const toUpload = merged.filter((entry) => {
    const existing = remoteByDate.get(entry.date);
    return !existing || entry.updatedAt > existing.updatedAt;
  });
  if (toUpload.length) {
    const { error: uploadError } = await supabase.from("jaap_entries").upsert(
      toUpload.map((entry) => ({ user_id: userId, entry_date: entry.date, count: entry.count, updated_at: entry.updatedAt })),
      { onConflict: "user_id,entry_date" },
    );
    if (uploadError) throw uploadError;
  }
  writeEntries(merged);
  return { entries: merged, connected: true };
}

export async function saveCloudEntry(entry: Entry) {
  if (!supabase) return false;
  const userId = await cloudUserId();
  if (!userId) throw new Error("Unable to start a cloud session.");
  const { error } = await supabase.from("jaap_entries").upsert(
    { user_id: userId, entry_date: entry.date, count: entry.count, updated_at: entry.updatedAt },
    { onConflict: "user_id,entry_date" },
  );
  if (error) throw error;
  return true;
}
