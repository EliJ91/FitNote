const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");
const history = require("./fitnote-history");

const sessionKey = "sb-test-project-auth-token";

function authHarness(options = {}) {
  const storage = new Map(options.storedSession === false ? [] : [[sessionKey, "saved-session"]]);
  const timers = [];
  const timerCallbacks = [];
  const renders = [];
  let markup = "";
  const node = {
    get innerHTML() { return markup; },
    set innerHTML(value) { markup = value; renders.push(value); },
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    classList: { add() {}, remove() {} },
  };
  let healthStatus = options.healthStatus ?? 503;
  let oauthOptions = null;
  let clientsCreated = 0;
  const window = {
    FITNOTE_SUPABASE: { url: "https://test-project.supabase.co", anonKey: "public-key" },
    FitNoteHistory: history,
    location: { origin: "https://elij91.github.io", pathname: "/FitNote/", search: options.callback ? "?code=test" : "", hash: "" },
    setTimeout(callback, delay) { timers.push(delay); timerCallbacks.push({ callback, delay }); return timers.length; },
    clearTimeout() {},
    addEventListener() {},
    supabase: {
      createClient() {
        clientsCreated++;
        return {
          auth: {
            async signInWithOAuth(options) { oauthOptions = options; return { error: null }; },
            getSession: options.getSession || (async () => ({ data: { session: null } })),
            onAuthStateChange() {},
          },
          from() {
            return {
              select() { return this; },
              eq() { return this; },
              maybeSingle: options.loadCloud || (async () => ({ data: null, error: null })),
              async upsert() { return { error: null }; },
            };
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
    "  window.testAuth = { signInWithGoogle, renderAuthGate, cloudMenu, prepareCloudClient, initCloudAuth };"
  );
  vm.runInContext(source, context);
  return {
    api: window.testAuth,
    storage,
    timers,
    renders,
    get rendered() { return markup; },
    finishStartupPulse() { timerCallbacks.find((timer) => timer.delay === 2400).callback(); },
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

test("returning users see the splash until sign-in and initial cloud loading finish", async () => {
  let finishCloudLoad;
  let notifyCloudLoad;
  const cloudLoad = new Promise((resolve) => { finishCloudLoad = resolve; });
  const cloudStarted = new Promise((resolve) => { notifyCloudLoad = resolve; });
  const harness = authHarness({
    healthStatus: 200,
    getSession: async () => ({ data: { session: { user: { id: "test-user", email: "test@example.com" } } } }),
    loadCloud: () => { notifyCloudLoad(); return cloudLoad; },
  });
  assert.match(harness.rendered, /startup-logo/);
  const initialization = harness.api.initCloudAuth();
  await cloudStarted;
  harness.finishStartupPulse();
  assert.match(harness.rendered, /startup-logo/);
  finishCloudLoad({ data: null, error: null });
  await initialization;
  assert.match(harness.rendered, /Welcome back/);
  assert.ok(harness.renders.every((html) => !html.includes('data-action="sign-in-google"')));
});

test("expired sessions show login only after checking the saved session", async () => {
  let finishSessionCheck;
  const sessionCheck = new Promise((resolve) => { finishSessionCheck = resolve; });
  const harness = authHarness({ healthStatus: 200, getSession: () => sessionCheck });
  const initialization = harness.api.initCloudAuth();
  assert.match(harness.rendered, /startup-logo/);
  assert.doesNotMatch(harness.rendered, /sign-in-google/);
  finishSessionCheck({ data: { session: null } });
  await initialization;
  assert.match(harness.rendered, /startup-logo/);
  harness.finishStartupPulse();
  assert.match(harness.rendered, /sign-in-google/);
  assert.doesNotMatch(harness.rendered, /startup-logo/);
});

test("new visitors see one full glow cycle before login without a cloud check", async () => {
  const harness = authHarness({ storedSession: false });
  assert.match(harness.rendered, /startup-logo/);
  await harness.api.initCloudAuth();
  assert.match(harness.rendered, /startup-logo/);
  harness.finishStartupPulse();
  assert.match(harness.rendered, /sign-in-google/);
  assert.equal(harness.clientsCreated, 0);
});

test("fast saved-session checks still wait for the startup glow before home", async () => {
  const harness = authHarness({
    healthStatus: 200,
    getSession: async () => ({ data: { session: { user: { id: "test-user", email: "test@example.com" } } } }),
  });
  await harness.api.initCloudAuth();
  assert.match(harness.rendered, /startup-logo/);
  assert.doesNotMatch(harness.rendered, /Welcome back/);
  harness.finishStartupPulse();
  assert.match(harness.rendered, /Welcome back/);
});

test("Google callbacks show the splash even without an existing saved session", () => {
  const harness = authHarness({ storedSession: false, callback: true });
  assert.match(harness.rendered, /startup-logo/);
  assert.doesNotMatch(harness.rendered, /sign-in-google/);
});
