const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");
const history = require("./fitnote-history");

const sessionKey = "sb-test-project-auth-token";

function authHarness() {
  const storage = new Map([[sessionKey, "saved-session"]]);
  const timers = [];
  const node = {
    innerHTML: "",
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    classList: { add() {}, remove() {} },
  };
  let healthStatus = 503;
  let oauthOptions = null;
  let clientsCreated = 0;
  const window = {
    FITNOTE_SUPABASE: { url: "https://test-project.supabase.co", anonKey: "public-key" },
    FitNoteHistory: history,
    location: { origin: "https://elij91.github.io", pathname: "/FitNote/", search: "", hash: "" },
    setTimeout(callback, delay) { timers.push(delay); return timers.length; },
    clearTimeout() {},
    addEventListener() {},
    supabase: {
      createClient() {
        clientsCreated++;
        return {
          auth: {
            async signInWithOAuth(options) { oauthOptions = options; return { error: null }; },
          },
        };
      },
    },
  };
  const context = vm.createContext({
    window,
    navigator: {},
    document: { getElementById() { return node; }, addEventListener() {} },
    localStorage: {
      getItem(key) { return storage.get(key) ?? null; },
      setItem(key, value) { storage.set(key, value); },
      removeItem(key) { storage.delete(key); },
    },
    URL,
    AbortController,
    console,
    async fetch() { return { ok: healthStatus === 200, status: healthStatus }; },
  });
  const source = fs.readFileSync(require.resolve("./app.js"), "utf8").replace(
    "  initCloudAuth();",
    "  window.testAuth = { signInWithGoogle, renderAuthGate, cloudMenu, prepareCloudClient };"
  );
  vm.runInContext(source, context);
  return {
    api: window.testAuth,
    storage,
    timers,
    setHealth(status) { healthStatus = status; },
    get oauthOptions() { return oauthOptions; },
    get clientsCreated() { return clientsCreated; },
  };
}

test("backend outage preserves the saved session and leaves sign-in available", async () => {
  const harness = authHarness();
  await harness.api.signInWithGoogle();
  assert.equal(harness.storage.get(sessionKey), "saved-session");
  const button = harness.api.renderAuthGate().match(/<button[^>]*data-action="sign-in-google"[^>]*>/)[0];
  assert.doesNotMatch(button, /disabled/);
  assert.match(harness.api.cloudMenu(), /data-action="sign-in-google"/);
  assert.equal(harness.clientsCreated, 0);
});

test("sign-in works on retry after the backend recovers, without reloading", async () => {
  const harness = authHarness();
  await harness.api.signInWithGoogle();
  harness.setHealth(200);
  await harness.api.signInWithGoogle();
  assert.equal(harness.clientsCreated, 1);
  assert.equal(harness.oauthOptions.provider, "google");
  assert.equal(harness.oauthOptions.options.redirectTo, "https://elij91.github.io/FitNote/");
  assert.equal(harness.storage.get(sessionKey), "saved-session");
  assert.ok(harness.timers.filter((delay) => delay >= 10000).length >= 3);
});

test("an unauthorized health response does not start OAuth", async () => {
  const harness = authHarness();
  harness.setHealth(401);
  await harness.api.signInWithGoogle();
  assert.equal(harness.clientsCreated, 0);
  assert.equal(harness.oauthOptions, null);
});
