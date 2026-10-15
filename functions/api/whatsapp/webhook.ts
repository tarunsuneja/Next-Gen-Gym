import { json, rpc, type Env } from "./lib";

type Ctx = { request: Request; env: Env };

async function validSignature(env: Env, raw: string, header: string | null) {
  if (!env.WHATSAPP_APP_SECRET) return false;
  if (!header) return false;
  const [scheme, signature] = header.split("=");
  if (scheme !== "sha256" || !/^[a-f0-9]{64}$/.test(signature || ""))
    return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.WHATSAPP_APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(raw),
  );
  const hex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  let mismatch = 0;
  for (let i = 0; i < hex.length; i++)
    mismatch |= hex.charCodeAt(i) ^ signature.charCodeAt(i);
  return mismatch === 0;
}

export const onRequestGet = ({ request, env }: Ctx) => {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge") || "";
  if (mode === "subscribe" && token && token === env.WHATSAPP_VERIFY_TOKEN)
    return new Response(challenge, { status: 200 });
  return new Response("Forbidden", { status: 403 });
};

export const onRequestPost = async ({ request, env }: Ctx) => {
  if (!env.WHATSAPP_APP_SECRET)
    return json({ error: "Messaging webhook is not configured." }, 503);
  const raw = await request.text();
  if (
    !(await validSignature(
      env,
      raw,
      request.headers.get("x-hub-signature-256"),
    ))
  )
    return new Response("Invalid signature", { status: 401 });
  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid JSON payload." }, 400);
  }
  let failed = false;
  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value || {};
      const number = value?.metadata?.phone_number_id || "";
      for (const status of value?.statuses || []) {
        try {
          await rpc(env, "wa_set_status", {
            p_number: number,
            p_wa_id: status.id,
            p_status: status.status,
            p_error: status?.errors?.[0]?.title || "",
          });
        } catch {
          failed = true;
        }
      }
      for (const message of value?.messages || []) {
        try {
          await rpc(env, "wa_record_inbound", {
            p_number: number,
            p_from: message.from,
            p_body: message?.text?.body || message?.button?.text || "",
            p_wa_id: message.id,
          });
        } catch {
          failed = true;
        }
      }
    }
  }
  return new Response(failed ? "Retry delivery" : "EVENT_RECEIVED", {
    status: failed ? 503 : 200,
  });
};
