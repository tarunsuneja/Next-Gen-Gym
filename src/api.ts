import { prepareMemberPhoto } from "./data/photos";
import { affectedSections, supportsScopedReads } from "./data/invalidation";
import {
  parseWorkspace,
  mergeWorkspaceSections,
} from "./data/workspaceContract";
import { commitAndRefresh } from "./data/commandResult";
import type { Action } from "./data/commands";
export type { Action } from "./data/commands";
import { type Data, id } from "./domain";
import { supabase } from "./data/client";
export { supabase } from "./data/client";



export async function sendWhatsApp(payload: {
  memberId: string;
  templateName: string;
  requestId?: string;
}) {
  if (!supabase) throw Error("Connect Supabase to send WhatsApp messages.");
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch("/api/whatsapp/send", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(session?.access_token
        ? { authorization: `Bearer ${session.access_token}` }
        : {}),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error)
    throw Error(body?.error || "WhatsApp send failed.");
  return body as { ok?: boolean; status?: string; error?: string };
}
export async function liveLoad(
  signal?: AbortSignal,
  full = true,
): Promise<Data> {
  if (!supabase) throw Error("Supabase is not configured.");
  if (!full) {
    const query = supabase.rpc("get_gym_dashboard");
    const result = await (signal ? query.abortSignal(signal) : query);
    if (!result.error) return parseWorkspace(result.data);
    if (result.error.code !== "PGRST202" && result.error.code !== "42883")
      throw result.error;
  }
  const query = supabase.rpc("get_gym_data");
  const { data, error } = await (signal ? query.abortSignal(signal) : query);
  if (error) throw error;
  return parseWorkspace(data);
}
export async function liveRefresh(
  previous: Data,
  sections: string[],
): Promise<Data> {
  if (previous.dashboard || !supportsScopedReads(previous)) return liveLoad();
  const { data, error } = await supabase!.rpc("get_gym_sections", {
    p_sections: sections,
  });
  if (error) throw error;
  return mergeWorkspaceSections(previous, data, sections);
}
export async function liveAction(a: Action, previous?: Data) {
  const requestId = a.requestId || id();
  const command = await prepareMemberPhoto(a, previous);
  return commitAndRefresh(
    requestId,
    async () => {
      if (!supabase) throw Error("Supabase is not configured.");
      const { error } = await supabase.rpc("gym_action", {
        action_type: command.type,
        payload: command.payload,
        request_id: requestId,
      });
      if (error) throw error;
    },
    async () => {
      if (!previous || !supportsScopedReads(previous)) return liveLoad();
      return liveRefresh(previous, affectedSections(a));
    },
  );
}
export async function logExport(kind: string) {
  if (!supabase) return;
  const { error } = await supabase.rpc("gym_action", {
    action_type: "export",
    payload: { kind },
    request_id: id(),
  });
  if (error) throw error;
}
