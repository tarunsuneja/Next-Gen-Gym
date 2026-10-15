import { json, requireEnv, rpc, renderBody, sendMeta, type Env } from "./lib";

type Ctx = { request: Request; env: Env };

type DueMessage = {
  gym_id: string;
  member_id: string;
  member_name: string;
  phone: string;
  template_name: string;
  category: string;
  language: string;
  body: string;
  variables: string[];
  phone_number_id: string;
  vars: Record<string, unknown>;
};

export const onRequestPost = async ({ request, env }: Ctx) => {
  try {
    requireEnv(env, [
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "WHATSAPP_TOKEN",
      "CRON_SECRET",
    ]);
    const secret =
      request.headers.get("x-cron-secret") ||
      (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (secret !== env.CRON_SECRET)
      return json({ error: "Unauthorized." }, 401);
    const limit = 200;
    const due = await rpc<DueMessage[]>(env, "wa_due_messages", {
      p_limit: limit,
    });
    let sent = 0,
      failed = 0;
    for (const item of due || []) {
      const rendered = renderBody(item.body, item.vars || {});
      try {
        const result = await sendMeta(env, {
          phoneNumberId: item.phone_number_id,
          to: item.phone,
          templateName: item.template_name,
          language: item.language,
          variables: item.variables || [],
          vars: item.vars || {},
          body: rendered,
        });
        await rpc(env, "wa_record", {
          p_gym: item.gym_id,
          p_member: item.member_id,
          p_direction: "out",
          p_template: item.template_name,
          p_wa_id: result.id,
          p_phone: item.phone,
          p_body: rendered,
          p_status: "sent",
          p_error: "",
        });
        sent++;
      } catch (error) {
        await rpc(env, "wa_record", {
          p_gym: item.gym_id,
          p_member: item.member_id,
          p_direction: "out",
          p_template: item.template_name,
          p_wa_id: "",
          p_phone: item.phone,
          p_body: rendered,
          p_status: "failed",
          p_error: (error as Error).message,
        });
        failed++;
      }
    }
    return json({ ok: true, due: (due || []).length, sent, failed });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
};

export const onRequestGet = () => json({ error: "Method not allowed." }, 405);
