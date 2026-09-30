import { supabase } from "./entries.ts";
import { parseTargets, type Targets } from "./analytics.ts";

async function targetUser(expectedId: string) {
  if (!supabase) throw new Error("Account connection unavailable.");
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user || data.user.id !== expectedId || data.user.is_anonymous) throw new Error("Please log in again to access your targets.");
  return data.user;
}

export async function loadTargets(userId: string) {
  const user = await targetUser(userId);
  return parseTargets(user.user_metadata?.jaap_targets);
}

export async function saveTargets(targets: Targets, userId: string) {
  await targetUser(userId);
  const valid = parseTargets(targets);
  if (Object.keys(valid).some(key => valid[key as keyof Targets] !== targets[key as keyof Targets])) throw new Error("Invalid target value.");
  const { error } = await supabase!.auth.updateUser({ data: { jaap_targets: valid } });
  if (error) throw error;
}
