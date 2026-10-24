import { createClient } from "@supabase/supabase-js";
import { type Data, id } from "./domain";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: {
          flowType: "pkce",
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;
export async function sendWhatsApp(payload: {
  memberId: string;
  templateName: string;
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
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Error(body?.error || "WhatsApp send failed.");
  return body as { ok?: boolean; status?: string; error?: string };
}
export async function liveLoad(): Promise<Data> {
  const { data, error } = await supabase!.rpc("get_gym_data");
  if (error) throw error;
  return data;
}
export type Action = {
  type: string;
  payload: Record<string, unknown>;
  requestId?: string;
};
export async function liveAction(a: Action) {
  const { error } = await supabase!.rpc("gym_action", {
    action_type: a.type,
    payload: a.payload,
    request_id: a.requestId || id(),
  });
  if (error) throw error;
  return liveLoad();
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
