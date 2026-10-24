import { dispatchMessage } from "./dispatch";
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
    const health = await rpc<{ recovered: number; unknown: number }>(
      env,
      "wa_dispatch_health",
      {},
    );
    if (health.unknown > 0)
      console.warn(
        JSON.stringify({
          event: "whatsapp_reconciliation_required",
          ...health,
        }),
      );
    const due = await rpc<DueMessage[]>(env, "wa_due_messages", {
      p_limit: limit,
    });
    let sent = 0,
      failed = 0,
      unknown = 0,
      skipped = 0;
    const started = Date.now();
    let processed = 0;
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    for (const item of (due || []).slice(0, limit)) {
      // Unstarted jobs remain eligible for the next invocation. Never interrupt an active send.
      if (Date.now() - started >= 45000) break;
      const result = await dispatchMessage(env, {
        key: `scheduled:${day}:${item.gym_id}:${item.member_id}:${item.template_name}`,
        gymId: item.gym_id,
        memberId: item.member_id,
        phoneNumberId: item.phone_number_id,
        to: item.phone,
        templateName: item.template_name,
        language: item.language,
        variables: item.variables || [],
        vars: item.vars || {},
        body: renderBody(item.body, item.vars || {}),
      });
      if (result.status === "sent") sent++;
      else if (result.status === "failed") failed++;
      else if (result.status === "unknown") unknown++;
      else skipped++;
      processed++;
    }
    return json({
      ok: true,
      due: Math.min((due || []).length, limit),
      sent,
      failed,
      unknown,
      skipped,
      processed,
      deferred: Math.min((due || []).length, limit) - processed,
      reconciliation: health,
    });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
};

export const onRequestGet = () => json({ error: "Method not allowed." }, 405);
