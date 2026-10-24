import { rpc, sendMeta, type Env, type SendInput } from "./lib";
import { ProviderRejectedError } from "./transport";
export type DispatchInput = SendInput & {
  key: string;
  gymId: string;
  memberId: string;
};
export type DispatchResult = {
  status: "sent" | "skipped" | "unknown" | "failed";
  id?: string;
  error?: string;
};
/** Claim before contacting the provider. Unknown outcomes never automatically retry. */
export async function dispatchMessage(
  env: Env,
  input: DispatchInput,
): Promise<DispatchResult> {
  const claimed = await rpc<boolean>(env, "wa_claim_dispatch", {
    p_key: input.key,
    p_gym: input.gymId,
    p_member: input.memberId,
    p_template: input.templateName,
  });
  if (!claimed) return { status: "skipped" };
  let providerId = "";
  try {
    const result = await sendMeta(env, input);
    providerId = result.id;
    await finish("accepted");
    return { status: "sent", id: providerId };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Messaging transport failed";
    const state =
      error instanceof ProviderRejectedError && !providerId
        ? "failed"
        : "unknown";
    try {
      await finish(state, message);
    } catch {
      console.error(
        JSON.stringify({
          event: "whatsapp_dispatch_persistence_failed",
          key: input.key,
          providerId: providerId || undefined,
        }),
      );
    }
    return {
      status: state,
      error:
        state === "unknown"
          ? "WhatsApp delivery outcome is uncertain. Check the delivery log before sending again."
          : message,
    };
  }
  async function finish(state: string, error = "") {
    await rpc(env, "wa_finish_dispatch", {
      p_key: input.key,
      p_gym: input.gymId,
      p_member: input.memberId,
      p_template: input.templateName,
      p_phone: input.to,
      p_body: input.body,
      p_state: state,
      p_provider: providerId,
      p_error: error,
    });
  }
}
