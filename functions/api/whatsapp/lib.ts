export type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  WHATSAPP_TOKEN: string;
  WHATSAPP_VERIFY_TOKEN: string;
  WHATSAPP_APP_SECRET?: string;
  WHATSAPP_API_VERSION?: string;
  CRON_SECRET?: string;
};

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

export function requireEnv(env: Env, keys: (keyof Env)[]) {
  for (const key of keys)
    if (!env[key]) throw new Error(`Missing server setting: ${key}`);
}

export async function rpc<T = unknown>(
  env: Env,
  fn: string,
  args: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(args),
  });
  const text = await res.text();
  if (!res.ok)
    throw new Error(`Database call ${fn} failed (${res.status}): ${text}`);
  return (text ? JSON.parse(text) : null) as T;
}

export async function authUser(
  env: Env,
  request: Request,
): Promise<string | null> {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) return null;
  const user = await res.json();
  return user?.id || null;
}

export async function staffProfile(
  env: Env,
  userId: string,
): Promise<{ role: string; gym_id: string } | null> {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/staff_profiles?user_id=eq.${encodeURIComponent(
      userId,
    )}&enabled=eq.true&select=role,gym_id`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  );
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

export const renderBody = (body: string, vars: Record<string, unknown>) =>
  body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) =>
    String(vars[key] ?? ""),
  );

export function metaPhone(phone: string) {
  let digits = String(phone || "").replace(/[^0-9]/g, "");
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) digits = "91" + digits;
  return digits;
}

export type SendInput = {
  phoneNumberId: string;
  to: string;
  templateName: string;
  language: string;
  variables: string[];
  vars: Record<string, unknown>;
  body: string;
};

export async function sendMeta(
  env: Env,
  input: SendInput,
): Promise<{ id: string }> {
  const version = env.WHATSAPP_API_VERSION || "v21.0";
  const params = input.variables.map((v) => {
    const text = String(input.vars[v] ?? "").trim();
    if (!text)
      throw new Error(
        `Missing template value: ${v}. Update the gym or member details before sending.`,
      );
    return { type: "text", text };
  });
  const payload = {
    messaging_product: "whatsapp",
    to: metaPhone(input.to),
    type: "template",
    template: {
      name: input.templateName,
      language: { code: input.language || "en" },
      ...(params.length
        ? { components: [{ type: "body", parameters: params }] }
        : {}),
    },
  };
  const res = await fetch(
    `https://graph.facebook.com/${version}/${input.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error)
    throw new Error(
      data?.error?.message || `WhatsApp API error (${res.status})`,
    );
  if (!data?.messages?.[0]?.id)
    throw new Error("WhatsApp did not return a message ID.");
  return { id: data.messages[0].id };
}
