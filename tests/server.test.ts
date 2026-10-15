import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { onRequestPost } from "../functions/api/whatsapp/webhook.ts";
import {
  staffProfile,
  sendMeta,
  type Env,
} from "../functions/api/whatsapp/lib.ts";
const env: Env = {
  SUPABASE_URL: "https://database.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "test-only",
  WHATSAPP_TOKEN: "test-only",
  WHATSAPP_VERIFY_TOKEN: "test-only",
  WHATSAPP_APP_SECRET: "test-secret",
};
const signed = (
  body: string,
  signature = createHmac("sha256", env.WHATSAPP_APP_SECRET!)
    .update(body)
    .digest("hex"),
) =>
  new Request("https://gym.invalid/api/whatsapp/webhook", {
    method: "POST",
    body,
    headers: { "x-hub-signature-256": "sha256=" + signature },
  });
test("webhook rejects unsigned, misconfigured and malformed events", async () => {
  assert.equal(
    (
      await onRequestPost({
        request: signed("{}"),
        env: { ...env, WHATSAPP_APP_SECRET: undefined },
      })
    ).status,
    503,
  );
  assert.equal(
    (await onRequestPost({ request: signed("{}", "0".repeat(64)), env }))
      .status,
    401,
  );
  assert.equal(
    (await onRequestPost({ request: signed("invalid-json"), env })).status,
    400,
  );
  assert.equal(
    (await onRequestPost({ request: signed('{"entry":[]}'), env })).status,
    200,
  );
});
test("webhook requests a retry on persistence failure instead of losing the event", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response("unavailable", { status: 503 });
  try {
    const body = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "123" },
                statuses: [{ id: "test-id", status: "delivered" }],
              },
            },
          ],
        },
      ],
    });
    assert.equal(
      (await onRequestPost({ request: signed(body), env })).status,
      503,
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("disabled staff are excluded and outgoing template parameters keep their positions", async () => {
  const original = globalThis.fetch;
  const requests: { url: string; body?: any }[] = [];
  globalThis.fetch = async (url, init) => {
    requests.push({
      url: String(url),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return new Response(
      JSON.stringify(
        String(url).includes("staff_profiles")
          ? []
          : { messages: [{ id: "provider-id" }] },
      ),
      { status: 200 },
    );
  };
  try {
    assert.equal(await staffProfile(env, "disabled-user"), null);
    assert(requests[0].url.includes("enabled=eq.true"));
    const input = {
      phoneNumberId: "123",
      to: "9876543210",
      templateName: "test",
      language: "en",
      variables: ["gym_name", "member_name", "gym_name"],
      vars: { gym_name: "NGF", member_name: "Tarun" },
      body: "",
    };
    assert.equal((await sendMeta(env, input)).id, "provider-id");
    assert.deepEqual(
      requests[1].body.template.components[0].parameters.map(
        (p: any) => p.text,
      ),
      ["NGF", "Tarun", "NGF"],
    );
    await assert.rejects(
      () =>
        sendMeta(env, {
          ...input,
          vars: { gym_name: "", member_name: "Tarun" },
        }),
      /Missing template value/,
    );
    assert.equal(requests.length, 2);
  } finally {
    globalThis.fetch = original;
  }
});
