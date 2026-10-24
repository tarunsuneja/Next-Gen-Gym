import { dispatchMessage } from "./dispatch";
import {
  json,
  requireEnv,
  rpc,
  authUser,
  staffProfile,
  renderBody,
  sendMeta,
  type Env,
} from "./lib";

type Ctx = { request: Request; env: Env };

type Prepared = {
  member_id: string;
  member_name: string;
  phone: string;
  consent: boolean;
  template_name: string;
  category: string;
  language: string;
  body: string;
  variables: string[];
  phone_number_id: string;
  display_name: string;
  config_enabled: boolean;
  vars: Record<string, unknown>;
};

export const onRequestPost = async ({ request, env }: Ctx) => {
  try {
    requireEnv(env, [
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "WHATSAPP_TOKEN",
    ]);
    const userId = await authUser(env, request);
    if (!userId) return json({ error: "Sign in required." }, 401);
    const profile = await staffProfile(env, userId);
    if (!profile) return json({ error: "No gym access." }, 403);
    if (profile.role !== "owner")
      return json({ error: "Owner permission required." }, 403);
    const body = await request.json().catch(() => ({}));
    const memberId = String(body?.memberId || "");
    const templateName = String(body?.templateName || "");
    if (!memberId || !templateName)
      return json({ error: "memberId and templateName are required." }, 400);
    const prepared = await rpc<Prepared | null>(env, "wa_prepare", {
      p_gym: profile.gym_id,
      p_member: memberId,
      p_template: templateName,
    });
    if (!prepared) return json({ error: "Member or template not found." }, 404);
    if (!prepared.config_enabled)
      return json({ error: "WhatsApp sending is disabled in Settings." }, 400);
    if (!prepared.consent)
      return json({ error: "Member has not given WhatsApp consent." }, 400);
    const rendered = renderBody(prepared.body, prepared.vars || {});
    const requestId = String(body?.requestId || "");
    if (!/^[0-9a-f-]{36}$/i.test(requestId))
      return json({ error: "A valid send request ID is required." }, 400);
    const result = await dispatchMessage(env, {
      key: `manual:${profile.gym_id}:${requestId}`,
      gymId: profile.gym_id,
      memberId,
      phoneNumberId: prepared.phone_number_id,
      to: prepared.phone,
      templateName: prepared.template_name,
      language: prepared.language,
      variables: prepared.variables || [],
      vars: prepared.vars || {},
      body: rendered,
    });
    if (result.status === "failed") return json({ error: result.error }, 502);
    if (result.status === "unknown" || result.status === "skipped")
      return json(
        {
          status: result.status,
          error:
            result.error ||
            "This send request is already being processed or has completed. Check the delivery log.",
        },
        202,
      );
    return json({ ok: true, status: "sent", waMessageId: result.id });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
};

export const onRequestGet = () => json({ error: "Method not allowed." }, 405);
