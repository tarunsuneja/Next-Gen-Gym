import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
const origin = "https://gym.invalid";
function environment() {
  const stores = new Map(),
    handlers = new Map();
  let fetches = 0,
    skipWaiting = 0;
  const key = (request) =>
    new URL(typeof request === "string" ? request : request.url, origin).href;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async put(request, response) {
          store.set(key(request), response.clone());
        },
        async addAll(paths) {
          for (const path of paths) store.set(key(path), new Response("shell"));
        },
        async keys() {
          return [...store.keys()].map((url) => new Request(url));
        },
        async delete(request) {
          return store.delete(key(request));
        },
        async match(request) {
          return store.get(key(request))?.clone();
        },
      };
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name) {
      return stores.delete(name);
    },
    async match(request) {
      for (const store of stores.values()) {
        const response = store.get(key(request));
        if (response) return response.clone();
      }
    },
  };
  const context = vm.createContext({
    URL,
    Promise,
    Response,
    caches,
    self: {
      location: { origin },
      addEventListener: (name, handler) => handlers.set(name, handler),
      skipWaiting: async () => {
        skipWaiting++;
      },
      clients: { claim: async () => {} },
    },
    fetch: async () => {
      fetches++;
      const response = new Response("network");
      Object.defineProperty(response, "type", { value: "basic" });
      return response;
    },
  });
  async function dispatch(name, request) {
    const waits = [];
    let response;
    handlers.get(name)({
      request,
      waitUntil: (promise) => waits.push(promise),
      respondWith: (promise) => (response = promise),
    });
    const value = await response;
    await Promise.all(waits);
    return value;
  }
  return {
    context,
    stores,
    caches,
    dispatch,
    get fetches() {
      return fetches;
    },
    get skipped() {
      return skipWaiting;
    },
  };
}
test("service worker bounds cached assets, preserves shell and excludes authenticated writes/API", async () => {
  const env = environment();
  vm.runInContext(await readFile("public/sw.js", "utf8"), env.context);
  const legacy = await env.caches.open("ngf-shell-old");
  await legacy.put("/assets/legacy.js", new Response("legacy"));
  await env.caches.open("unrelated-cache");
  await env.dispatch("install");
  await env.dispatch("activate");
  assert(!env.stores.has("ngf-shell-old"));
  assert(env.stores.has("unrelated-cache"));
  assert(
    env.stores.get("ngf-assets-v1").has(`${origin}/assets/legacy.js`),
    "Open tabs retain previously cached legacy chunks",
  );
  for (let i = 0; i < 110; i++)
    assert.equal(
      (
        await env.dispatch(
          "fetch",
          new Request(`${origin}/assets/chunk-${i}.js`),
        )
      ).status,
      200,
    );
  assert.equal(env.stores.get("ngf-assets-v1").size, 96);
  assert(env.stores.get("ngf-shell-v5").has(`${origin}/index.html`));
  const before = env.fetches;
  await env.dispatch("fetch", new Request(`${origin}/assets/chunk-109.js`));
  assert.equal(env.fetches, before, "Cached assets avoid a network fetch");
  assert.equal(
    await env.dispatch(
      "fetch",
      new Request(`${origin}/api/whatsapp/send`, { method: "POST" }),
    ),
    undefined,
  );
  assert.equal(
    await env.dispatch("fetch", new Request(`${origin}/api/private`)),
    undefined,
  );
  assert.equal(
    await env.dispatch(
      "fetch",
      new Request("https://database.invalid/rest/v1/rpc/get_gym_data"),
    ),
    undefined,
  );
  assert.equal(env.fetches, before);
});
test("failed shell installation does not activate an incomplete offline shell", async () => {
  const env = environment();
  env.caches.open = async () => ({
    addAll: async () => {
      throw Error("offline");
    },
  });
  vm.runInContext(await readFile("public/sw.js", "utf8"), env.context);
  await assert.rejects(() => env.dispatch("install"), /offline/);
  assert.equal(env.skipped, 0);
});
