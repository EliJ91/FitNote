(() => {
  "use strict";

  const STORAGE_KEY = "fitNote.web.v1";
  const LEGACY_STORAGE_KEY = ["workout", String.fromCharCode(80), "lanner.web.v1"].join("");
  const USER_STORAGE_PREFIX = `${STORAGE_KEY}.user.`;
  const LEGACY_USER_STORAGE_PREFIX = `${LEGACY_STORAGE_KEY}.user.`;
  const GUEST_MODE_KEY = `${STORAGE_KEY}.guestMode`;
  const LEGACY_GUEST_MODE_KEY = `${LEGACY_STORAGE_KEY}.guestMode`;
  const APP_VERSION = "1.3.46";
  const TODAY = new Date().toISOString().slice(0, 10);
  const SUPABASE_TABLE = "fitnote_data";
  const LEGACY_SUPABASE_TABLE = "workout_planner_data";
  const AUTH_CHECK_TIMEOUT_MS = 1200;
  const CLOUD_REQUEST_TIMEOUT_MS = 5000;

  const INITIAL_DATA = {
    settings: { text_size: "normal", routine_columns: "two" },
    selected_routine: "Pull Day",
    routines: {
      "Push Day": [
        { exercise: "Incline Barbell Bench Press", weight: "125", reps: "3x8", track_pb: false },
        { exercise: "Seated Dumbbell Shoulder Press", weight: "67.5", reps: "3x10", track_pb: false },
        { exercise: "Cable Chest Fly", weight: "40", reps: "3x8", track_pb: false },
        { exercise: "Cable Lateral Raise", weight: "15", reps: "3x8", track_pb: false },
        { exercise: "Cable Triceps Pushdown", weight: "45", reps: "3x10", track_pb: false },
        { exercise: "Overhead Cable Triceps Extension", weight: "40", reps: "2x15", track_pb: false },
      ],
      "Pull Day": [
        { exercise: "Barbell Bent-Over Row", weight: "100", reps: "3x8", track_pb: false },
        { exercise: "Wide-Grip Lat Pulldown", weight: "100", reps: "3x6", track_pb: false },
        { exercise: "Single-Arm Cable Row", weight: "40", reps: "3x8", track_pb: false },
        { exercise: "Face Pull", weight: "40", reps: "3x12", track_pb: false },
        { exercise: "EZ-Bar Preacher Curl", weight: "30", reps: "3x10", track_pb: false },
        { exercise: "Dumbbell Hammer Curl", weight: "15", reps: "2x10", track_pb: false },
      ],
    },
    routine_logs: [],
  };

  const app = document.getElementById("app");
  const importFile = document.getElementById("import-file");
  const toast = document.getElementById("toast");
  const cloudConfig = window.FITNOTE_SUPABASE || {};
  const workoutHistory = window.FitNoteHistory;
  const ROUTINE_IMAGE_LABELS = {
    Abdominals: "Abdominals",
    Biceps: "Biceps",
    Calves: "Calves",
    Chest: "Chest",
    Forearms: "Forearms",
    FrontDelts: "Front Delts",
    FullLegs: "Full Legs",
    Glutes: "Glutes",
    Hamstrings: "Hamstrings",
    Lats: "Lats",
    LowerBack: "Lower Back",
    Pull: "Pull",
    Push: "Push",
    Quads: "Quads",
    RearDelts: "Rear Delts",
    Traps: "Traps",
    Triceps: "Triceps",
  };
  const canAttemptCloud = Boolean(window.supabase && cloudConfig.url && cloudConfig.anonKey);
  const cloudProjectRef = projectRefFromUrl(cloudConfig.url);
  const supabaseStorageKey = cloudProjectRef ? `sb-${cloudProjectRef}-auth-token` : "";
  let supabaseClient = null;

  let authSession = null;
  let state = loadState();
  let cloudWriteTable = SUPABASE_TABLE;
  let currentSessionId = null;
  let currentPage = "home";
  let routinesSearchTerm = "";
  let newRoutineNameDraft = "";
  let newRoutineImageId = "";
  let routineImagePickerOpen = false;
  let expandedWorkoutExerciseId = "";
  let editMode = false;
  let editSnapshot = null;
  let guestMode = localStorage.getItem(GUEST_MODE_KEY) === "true" || localStorage.getItem(LEGACY_GUEST_MODE_KEY) === "true";
  let authReady = true;
  let cloudSaveTimer = null;
  let cloudLoadActive = false;
  let cloudStatus = canAttemptCloud ? "Browser storage only" : "Local only";
  let cloudUnavailable = !canAttemptCloud;
  let cloudDatabaseFull = false;
  let selectedHistory = new Set();
  let dataSelection = {
    kind: "routine",
    value: state.selected_routine,
  };
  let toastTimer = null;
  let confirmResolver = null;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/\n/g, "&#10;");
  }

  function projectRefFromUrl(url) {
    try {
      return new URL(url).hostname.split(".")[0] || "";
    } catch (_error) {
      return "";
    }
  }

  function cloudAuthHealthUrl() {
    return `${String(cloudConfig.url || "").replace(/\/$/, "")}/auth/v1/health`;
  }

  function hasAuthRedirectParams() {
    const text = `${window.location.search} ${window.location.hash}`;
    return /access_token|refresh_token|code=|error=/.test(text);
  }

  function hasStoredSupabaseSession() {
    if (supabaseStorageKey && localStorage.getItem(supabaseStorageKey)) return true;
    return false;
  }

  function clearSupabaseAuthStorage() {
    if (supabaseStorageKey) localStorage.removeItem(supabaseStorageKey);
  }

  function resetCloudClient() {
    supabaseClient = null;
    clearSupabaseAuthStorage();
  }

  function withTimeout(promise, ms, message) {
    let timer = null;
    const timeout = new Promise((_resolve, reject) => {
      timer = window.setTimeout(() => reject(new Error(message)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
  }

  async function isCloudReachable(timeoutMs = AUTH_CHECK_TIMEOUT_MS) {
    if (!canAttemptCloud) return false;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(cloudAuthHealthUrl(), {
        cache: "no-store",
        headers: { apikey: cloudConfig.anonKey },
        signal: controller.signal,
      });
      return response.ok || (response.status > 0 && response.status < 500);
    } catch (_error) {
      return false;
    } finally {
      window.clearTimeout(timer);
    }
  }

  function markCloudUnavailable() {
    cloudUnavailable = true;
    authSession = null;
    authReady = true;
    cloudStatus = "Cloud unavailable";
    clearSupabaseAuthStorage();
    window.clearTimeout(cloudSaveTimer);
  }

  async function prepareCloudClient({ force = false, timeoutMs = AUTH_CHECK_TIMEOUT_MS } = {}) {
    if (supabaseClient) return supabaseClient;
    if (!canAttemptCloud) return null;
    if (cloudUnavailable && !force) return null;
    cloudUnavailable = false;
    cloudStatus = "Checking cloud...";
    updateMenuStatus();
    if (!(await isCloudReachable(timeoutMs))) {
      markCloudUnavailable();
      return null;
    }
    try {
      supabaseClient = window.supabase.createClient(cloudConfig.url, cloudConfig.anonKey, {
        auth: {
          autoRefreshToken: true,
          detectSessionInUrl: true,
          persistSession: true,
          storageKey: supabaseStorageKey || undefined,
        },
      });
      return supabaseClient;
    } catch (_error) {
      markCloudUnavailable();
      return null;
    }
  }

  function iconSvg(name) {
    const icons = {
      calendar:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 2v4"></path><path d="M16 2v4"></path><rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M3 10h18"></path><path d="M8 14h.01"></path><path d="M12 14h.01"></path><path d="M16 14h.01"></path></svg>',
      check:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"></path></svg>',
      checkCircle:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M16 9l-5.5 5.5L8 12"></path></svg>',
      chevronDown:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>',
      edit:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l11-11-4-4L4 16v4z"></path><path d="M14 6l4 4"></path></svg>',
      cancel:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12"></path><path d="M18 6L6 18"></path></svg>',
      minus:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"></path></svg>',
      more:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.4"></circle><circle cx="12" cy="12" r="1.4"></circle><circle cx="12" cy="19" r="1.4"></circle></svg>',
      plus:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>',
      plusCircle:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 8v8"></path><path d="M8 12h8"></path></svg>',
      trash:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"></path><path d="M9 7V5h6v2"></path><path d="M7 7l1 13h8l1-13"></path><path d="M10 11v5"></path><path d="M14 11v5"></path></svg>',
      trend:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17l6-6 4 4 7-8"></path><path d="M14 7h6v6"></path></svg>',
      up:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5"></path><path d="M5 12l7-7 7 7"></path></svg>',
      down:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"></path><path d="M19 12l-7 7-7-7"></path></svg>',
      download:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M5 21h14"></path></svg>',
      upload:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21V9"></path><path d="m17 14-5-5-5 5"></path><path d="M5 3h14"></path></svg>',
      checkSquare:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"></rect><path d="m8 12 3 3 5-6"></path></svg>',
      square:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"></rect></svg>',
      chevronRight:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"></path></svg>',
      user:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7" r="4"></circle><path d="M5 21v-2a7 7 0 0 1 14 0v2"></path></svg>',
      search:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>',
      bars:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V11"></path><path d="M12 19V5"></path><path d="M19 19V8"></path></svg>',
      clock:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>',
      home:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"></path></svg>',
      history:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path><path d="M3 12H1"></path><path d="m4 7-1-1"></path></svg>',
      settings:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v2"></path><path d="M12 19v2"></path><path d="m4.22 4.22 1.42 1.42"></path><path d="m18.36 18.36 1.42 1.42"></path><path d="M3 12h2"></path><path d="M19 12h2"></path><path d="m4.22 19.78 1.42-1.42"></path><path d="m18.36 5.64 1.42-1.42"></path><circle cx="12" cy="12" r="4"></circle></svg>',
      play:
        '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7z" fill="currentColor" stroke="none"></path></svg>',
    };
    return icons[name] || "";
  }

  function boolFromData(value) {
    if (typeof value === "string") {
      return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
    }
    return Boolean(value);
  }

  function formatWeight(value) {
    if (value === "" || value === null || value === undefined) return "";
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return String(value);
    const rounded = Math.round(parsed * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }

  function formatWhole(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? String(Math.round(parsed)) : "0";
  }

  function isTwoPointFiveStep(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return false;
    return parsed >= 0;
  }

  function isValidWeight(value) {
    if (String(value).trim() === "") return false;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0;
  }

  function normalizeTextSize(value) {
    return workoutHistory.normalizeTextSize ? workoutHistory.normalizeTextSize(value) : ["small", "large"].includes(value) ? value : "normal";
  }

  function normalizeRoutineColumns(value) {
    return workoutHistory.normalizeRoutineColumns ? workoutHistory.normalizeRoutineColumns(value) : value === "one" ? "one" : "two";
  }

  function normalizeRoutineDescription(value) {
    return workoutHistory.normalizeRoutineDescription ? workoutHistory.normalizeRoutineDescription(value) : String(value || "").replace(/\s+/g, " ").trim().slice(0, 30);
  }

  function currentTextSize() {
    return normalizeTextSize(state?.settings?.text_size);
  }

  function currentRoutineColumns() {
    return normalizeRoutineColumns(state?.settings?.routine_columns);
  }

  function applyAppShellClass() {
    app.className = `app-shell text-size-${currentTextSize()} routine-columns-${currentRoutineColumns()}`;
  }

  function normalizeData(input) {
    const source = input && typeof input === "object" ? input : {};
    const data = workoutHistory.ensureHistoricalModel(source, { today: TODAY });
    data.settings = {
      text_size: normalizeTextSize(data.settings?.text_size || source.settings?.text_size),
      routine_columns: normalizeRoutineColumns(data.settings?.routine_columns || source.settings?.routine_columns),
    };
    return data;
  }

  function routineImageOptions() {
    return workoutHistory.routineImageIds().map((id) => ({
      id,
      label: ROUTINE_IMAGE_LABELS[id] || id,
    }));
  }

  function routineImageById(id) {
    const normalized = workoutHistory.normalizeRoutineImageId(id);
    return routineImageOptions().find((option) => option.id === normalized) || routineImageOptions()[0];
  }

  function routineDefinition(name) {
    return (state.routine_definitions || []).find((routine) => routine.name === name) || null;
  }

  function routineDescription(name) {
    return workoutHistory.routineDescriptionFor(name, state.routines[name] || [], routineDefinition(name)?.description);
  }

  function setRoutineDescription(name, description) {
    const text = normalizeRoutineDescription(description);
    state = workoutHistory.ensureHistoricalModel(state, { today: TODAY });
    const definition = routineDefinition(name);
    if (!definition) return false;
    definition.description = text || workoutHistory.routineDescriptionFor(name, state.routines[name] || []);
    return true;
  }

  function routineImageId(name) {
    return workoutHistory.routineImageIdFor(name, state.routines[name] || [], routineDefinition(name)?.image_id);
  }

  function routineImagePath(id) {
    const image = routineImageById(id);
    return `assets/routine-images/${image.id}.png`;
  }

  function setRoutineImageId(name, imageId) {
    const selected = workoutHistory.normalizeRoutineImageId(imageId);
    if (!selected || !state.routines[name]) return false;
    state = workoutHistory.ensureHistoricalModel(state, { today: TODAY });
    const definition = routineDefinition(name);
    if (!definition) return false;
    definition.image_id = selected;
    return true;
  }

  function userStorageKey(userId) {
    return `${USER_STORAGE_PREFIX}${userId}`;
  }

  function legacyUserStorageKey(userId) {
    return `${LEGACY_USER_STORAGE_PREFIX}${userId}`;
  }

  function currentStorageKey() {
    return authSession?.user?.id ? userStorageKey(authSession.user.id) : STORAGE_KEY;
  }

  function loadMigratedState(primaryKey, fallbackKey) {
    const stored = loadStoredState(primaryKey);
    if (stored) return stored;
    const migrated = fallbackKey ? loadStoredState(fallbackKey) : null;
    if (migrated) localStorage.setItem(primaryKey, JSON.stringify(migrated));
    return migrated;
  }

  function loadStoredState(key) {
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (!parsed.history_version || parsed.history_version < workoutHistory.HISTORY_SCHEMA_VERSION) {
          const backupKey = `${key}.backup.${TODAY}.${Date.now()}`;
          localStorage.setItem(backupKey, stored);
          parsed.migration_metadata = { ...(parsed.migration_metadata || {}), backup_key: backupKey };
        }
        const normalized = normalizeData(parsed);
        const normalizedText = JSON.stringify(normalized);
        if (normalizedText !== stored) localStorage.setItem(key, normalizedText);
        return normalized;
      }
    } catch (_error) {
      localStorage.removeItem(key);
    }
    return null;
  }

  function loadState(key = STORAGE_KEY) {
    const fallbackKey = key === STORAGE_KEY ? LEGACY_STORAGE_KEY : "";
    const stored = loadMigratedState(key, fallbackKey);
    if (stored) return stored;
    return normalizeData(INITIAL_DATA);
  }

  function saveState(options = {}) {
    state = normalizeData(state);
    localStorage.setItem(currentStorageKey(), JSON.stringify(state));
    if (options.cloud !== false) queueCloudSave();
  }

  function applyLoadedState(nextState) {
    state = normalizeData(nextState);
    currentSessionId = null;
    dataSelection = { kind: "routine", value: state.selected_routine };
    selectedHistory = new Set();
  }

  function cloudUserLabel() {
    if (!authSession?.user) return "";
    return authSession.user.user_metadata?.full_name || authSession.user.email || "Google user";
  }

  function hasCloudIdentity() {
    return Boolean(authSession?.user);
  }

  function canCreateRoutines() {
    return hasCloudIdentity();
  }

  function canEnterApp() {
    return hasCloudIdentity() || guestMode;
  }

  function localStorageStatus() {
    return guestMode ? "Guest mode<br>Browser storage only" : "Not signed in<br>Browser storage only";
  }

  function authRedirectUrl() {
    return `${window.location.origin}${window.location.pathname}`;
  }

  async function signInWithGoogle() {
    resetCloudClient();
    const client = await prepareCloudClient({ force: true, timeoutMs: 2200 });
    if (!client) {
      render();
      showToast(canAttemptCloud ? "Google sign in is unavailable right now." : "Cloud sync is not configured.");
      return;
    }
    guestMode = false;
    localStorage.removeItem(GUEST_MODE_KEY);
    cloudStatus = "Opening Google...";
    updateMenuStatus();
    try {
      const { error } = await withTimeout(
        client.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: authRedirectUrl() },
        }),
        AUTH_CHECK_TIMEOUT_MS,
        "Google sign in timed out"
      );
      if (!error) return;
      cloudStatus = "Sign in failed";
    } catch (_error) {
      resetCloudClient();
      cloudStatus = (await isCloudReachable(2200)) ? "Browser storage only" : "Cloud unavailable";
      cloudUnavailable = cloudStatus === "Cloud unavailable";
    } finally {
      render();
    }
    showToast("Google sign in failed.");
  }

  function enterGuestMode() {
    guestMode = true;
    localStorage.setItem(GUEST_MODE_KEY, "true");
    localStorage.removeItem(LEGACY_GUEST_MODE_KEY);
    cloudStatus = "Browser storage only";
    applyLoadedState(loadState(STORAGE_KEY));
    currentPage = "home";
    render();
    showToast("Guest mode saves to this browser only.");
  }

  function leaveGuestMode() {
    guestMode = false;
    localStorage.removeItem(GUEST_MODE_KEY);
    cloudStatus = "Browser storage only";
    render();
  }

  function cloudMenu() {
    if (!canAttemptCloud || cloudUnavailable) {
      return '<button class="menu-item menu-status" type="button" disabled>Cloud sync unavailable</button>';
    }
    if (!authSession) {
      return `
        <button class="menu-item" type="button" data-action="sign-in-google">Sign in with Google</button>
        ${
          guestMode
            ? '<button class="menu-item" type="button" data-action="leave-guest">Leave Guest Mode</button>'
            : '<button class="menu-item" type="button" data-action="guest-sign-in">Guest Sign In</button>'
        }
      `;
    }
    return `
      <button class="menu-item" type="button" data-action="sign-out-google">Sign out</button>
    `;
  }

  function cloudFooterStatus() {
    if (authSession) {
      return `<button class="menu-item menu-status" type="button" disabled data-cloud-status>${escapeHtml(cloudUserLabel())} ${escapeHtml(cloudStatus)}</button>`;
    }
    if (guestMode || cloudStatus !== "Browser storage only") {
      return `<button class="menu-item menu-status" type="button" disabled data-cloud-status>${localStorageStatus()}</button>`;
    }
    return "";
  }

  function isDatabaseFullError(error) {
    const status = String(error?.status || error?.code || "");
    const message = String(error?.message || error?.details || error || "").toLowerCase();
    return (
      ["402", "413", "507", "53100", "53200", "53300", "53400", "54000"].includes(status) ||
      /quota|limit|exceeded|database.*full|storage.*full|disk|insufficient resources|row is too big/.test(message)
    );
  }

  function queueCloudSave() {
    if (!supabaseClient || !authSession || cloudLoadActive || cloudDatabaseFull || cloudUnavailable) return;
    window.clearTimeout(cloudSaveTimer);
    cloudSaveTimer = window.setTimeout(() => saveCloudData({ quiet: true }), 650);
  }

  async function saveCloudData({ quiet = false } = {}) {
    if (!supabaseClient || !authSession) return { ok: false, skipped: true };
    if (cloudDatabaseFull) {
      if (!quiet) showToast("Database is full. Saved on this device only.");
      return { ok: false, databaseFull: true };
    }
    window.clearTimeout(cloudSaveTimer);
    cloudStatus = "Syncing...";
    try {
      const payload = normalizeData(state);
      let firstError = null;
      const tables = Array.from(new Set([cloudWriteTable, SUPABASE_TABLE, LEGACY_SUPABASE_TABLE].filter(Boolean)));
      for (const tableName of tables) {
        const { error } = await withTimeout(
          supabaseClient.from(tableName).upsert(
            {
              user_id: authSession.user.id,
              payload,
            },
            { onConflict: "user_id" }
          ),
          CLOUD_REQUEST_TIMEOUT_MS,
          "Cloud save timed out"
        );
        if (!error) {
          cloudWriteTable = tableName;
          cloudStatus = "Synced";
          return { ok: true };
        }
        firstError = firstError || error;
        if (isDatabaseFullError(error)) throw error;
      }
      throw firstError;
    } catch (error) {
      if (isDatabaseFullError(error)) {
        cloudDatabaseFull = true;
        cloudStatus = "Database full";
        showToast("Database is full. Saved on this device only.");
        return { ok: false, databaseFull: true };
      }
      if (/failed to fetch|network|timed out|abort/i.test(String(error?.message || error))) {
        markCloudUnavailable();
      } else {
        cloudStatus = "Cloud sync failed";
      }
      if (!quiet) showToast("Saved on this device. Cloud sync failed.");
      return { ok: false, error };
    } finally {
      updateMenuStatus();
    }
  }

  async function loadCloudPayload(tableName) {
    return withTimeout(
      supabaseClient.from(tableName).select("payload").eq("user_id", authSession.user.id).maybeSingle(),
      CLOUD_REQUEST_TIMEOUT_MS,
      "Cloud load timed out"
    );
  }

  async function loadCloudData() {
    if (!supabaseClient || !authSession) return;
    cloudLoadActive = true;
    cloudStatus = "Loading cloud...";
    updateMenuStatus();
    try {
      let { data, error } = await loadCloudPayload(SUPABASE_TABLE);
      if (error && LEGACY_SUPABASE_TABLE) {
        const legacyResult = await loadCloudPayload(LEGACY_SUPABASE_TABLE);
        if (legacyResult.error) throw error;
        data = legacyResult.data;
        cloudWriteTable = LEGACY_SUPABASE_TABLE;
      } else if (error) {
        throw error;
      } else {
        cloudWriteTable = SUPABASE_TABLE;
      }
      if (data?.payload) {
        const rawPayload = JSON.stringify(data.payload);
        applyLoadedState(data.payload);
        saveState({ cloud: false });
        cloudStatus = "Synced";
        if (JSON.stringify(state) !== rawPayload) {
          cloudLoadActive = false;
          await saveCloudData({ quiet: true });
          cloudLoadActive = true;
        }
      } else {
        const userLocalState = loadMigratedState(userStorageKey(authSession.user.id), legacyUserStorageKey(authSession.user.id));
        applyLoadedState(userLocalState || INITIAL_DATA);
        saveState({ cloud: false });
        cloudLoadActive = false;
        await saveCloudData({ quiet: true });
        cloudLoadActive = true;
      }
    } catch (error) {
      console.error("FitNote cloud load failed", error);
      cloudStatus = isDatabaseFullError(error) ? "Database full" : "Cloud sync failed";
      if (isDatabaseFullError(error)) cloudDatabaseFull = true;
      if (/failed to fetch|network|timed out|abort/i.test(String(error?.message || error))) markCloudUnavailable();
      showToast(cloudDatabaseFull ? "Database is full. Saved on this device only." : "Cloud data unavailable.");
    } finally {
      cloudLoadActive = false;
      render();
    }
  }

  function updateMenuStatus() {
    const statusNode = app.querySelector("[data-cloud-status]");
    if (statusNode) {
      statusNode.innerHTML = authSession ? `${escapeHtml(cloudUserLabel())} ${escapeHtml(cloudStatus)}` : localStorageStatus();
    }
  }

  async function initCloudAuth() {
    if (!canAttemptCloud || (!hasStoredSupabaseSession() && !hasAuthRedirectParams())) {
      authReady = true;
      render();
      return;
    }
    const client = await prepareCloudClient({ timeoutMs: AUTH_CHECK_TIMEOUT_MS });
    if (!client) {
      render();
      return;
    }
    try {
      const { data } = await withTimeout(client.auth.getSession(), AUTH_CHECK_TIMEOUT_MS, "Auth check timed out");
      authSession = data.session;
      authReady = true;
      if (authSession) {
        guestMode = false;
        localStorage.removeItem(GUEST_MODE_KEY);
        cloudStatus = "Signed in";
        await loadCloudData();
      } else {
        cloudStatus = "Browser storage only";
        render();
      }
      client.auth.onAuthStateChange((_event, session) => {
        authSession = session;
        authReady = true;
        cloudDatabaseFull = false;
        if (session) {
          guestMode = false;
          localStorage.removeItem(GUEST_MODE_KEY);
          cloudStatus = "Signed in";
          loadCloudData();
        } else {
          cloudStatus = "Browser storage only";
          window.clearTimeout(cloudSaveTimer);
          applyLoadedState(loadState(STORAGE_KEY));
          render();
        }
      });
    } catch (_error) {
      resetCloudClient();
      authSession = null;
      authReady = true;
      cloudStatus = (await isCloudReachable(2200)) ? "Browser storage only" : "Cloud unavailable";
      cloudUnavailable = cloudStatus === "Cloud unavailable";
      render();
    }
  }

  function routineNames() {
    return Object.keys(state.routines).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }

  function currentRoutine() {
    if (!state.routines[state.selected_routine]) {
      state.selected_routine = routineNames()[0];
      saveState();
    }
    return state.selected_routine;
  }

  function currentRows() {
    return state.routines[currentRoutine()] || [];
  }

  function existingExerciseOptions() {
    return workoutHistory.presetExerciseNames().map((name) => ({ id: workoutHistory.presetExerciseId(name), name }));
  }

  function findExistingExerciseByName(name) {
    const normalized = String(name || "").trim();
    if (!normalized) return null;
    return existingExerciseOptions().find((exercise) => exercise.name.localeCompare(normalized, undefined, { sensitivity: "accent" }) === 0) || null;
  }

  function currentWorkoutSession() {
    if (editMode) return null;
    const routine = currentRoutine();
    const existing =
      currentSessionId && state.workout_sessions.find((session) => session.id === currentSessionId && session.routine_name === routine);
    if (existing && String(existing.started_at || existing.completed_at || "").slice(0, 10) === TODAY) {
      if (workoutHistory.syncWorkoutSessionWithRoutine(state, existing.id, { includeCompleted: true })) saveState();
      return existing;
    }
    const session = workoutHistory.startWorkoutSession(state, routine, { today: TODAY });
    currentSessionId = session.id;
    if (workoutHistory.syncWorkoutSessionWithRoutine(state, session.id, { includeCompleted: true })) saveState();
    saveState();
    return session;
  }

  function currentWorkoutRows() {
    const session = currentWorkoutSession();
    return session ? workoutHistory.sessionRows(state, session.id) : [];
  }

  function historySessions() {
    return state.workout_sessions
      .filter((session) => session.status === "completed")
      .sort((a, b) => String(b.completed_at || b.started_at || "").localeCompare(String(a.completed_at || a.started_at || "")));
  }

  function deleteWorkoutSession(sessionId) {
    const session = state.workout_sessions.find((item) => item.id === sessionId);
    const exerciseIds = new Set(state.workout_exercises.filter((item) => item.workout_session_id === sessionId).map((item) => item.id));
    state.workout_sessions = state.workout_sessions.filter((item) => item.id !== sessionId);
    state.workout_exercises = state.workout_exercises.filter((item) => item.workout_session_id !== sessionId);
    state.workout_sets = state.workout_sets.filter((item) => !exerciseIds.has(item.workout_exercise_id));
    state.routine_logs = state.routine_logs.filter((log, index) => {
      if (log.session_id === sessionId) return false;
      if (!session) return true;
      const legacyId = workoutHistory.stableId("session", "legacy-log", log.date, log.routine, index);
      return legacyId !== sessionId;
    });
    if (currentSessionId === sessionId) currentSessionId = null;
  }

  function setPage(page) {
    if (!canEnterApp()) {
      render();
      return;
    }
    if (page === "new" && !canCreateRoutines()) {
      currentPage = "routine";
      closeEditMode(false);
      selectedHistory = new Set();
      render();
      showToast("Sign in with Google to create routines.");
      return;
    }
    if (page === "new") {
      newRoutineNameDraft = "";
      newRoutineImageId = "";
      routineImagePickerOpen = false;
    }
    if (page === "routine" && currentPage !== "routine") expandedWorkoutExerciseId = "";
    if (page !== "new" && page !== "routine") routineImagePickerOpen = false;
    currentPage = page;
    if (page !== "routine") closeEditMode(false);
    if (page !== "routine") expandedWorkoutExerciseId = "";
    selectedHistory = new Set();
    render();
  }

  function renderAppBrandHeader(options = {}) {
    const name = options.userName ? homeDisplayName() : "";
    return `
      <header class="app-brand-header ${name ? "with-user" : ""}">
        <div class="app-brand-lockup">
          <img class="app-brand-logo" src="icons/fitnote-app-logo.png" alt="FitNote">
          <span>FitNote</span>
        </div>
        ${name ? `<span class="app-user-name">${escapeHtml(name)}</span>` : ""}
      </header>
    `;
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("visible");
    toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 1800);
  }

  function confirmDialog(title, message, okText = "OK") {
    const backdrop = document.getElementById("confirm-backdrop");
    const titleNode = document.getElementById("confirm-title");
    const messageNode = document.getElementById("confirm-message");
    const okButton = document.getElementById("confirm-ok");
    const cancelButton = document.getElementById("confirm-cancel");
    titleNode.textContent = title;
    messageNode.textContent = message;
    okButton.textContent = okText;
    backdrop.hidden = false;
    okButton.focus();
    return new Promise((resolve) => {
      confirmResolver = resolve;
      const finish = (result) => {
        backdrop.hidden = true;
        okButton.onclick = null;
        cancelButton.onclick = null;
        confirmResolver = null;
        resolve(result);
      };
      okButton.onclick = () => finish(true);
      cancelButton.onclick = () => finish(false);
      backdrop.onclick = (event) => {
        if (event.target === backdrop) finish(false);
      };
    });
  }

  function closeEditMode(saveChanges) {
    if (!editMode) return;
    if (!saveChanges && editSnapshot) {
      const snapshotRows = Array.isArray(editSnapshot) ? editSnapshot : editSnapshot.rows;
      state.routines[state.selected_routine] = snapshotRows;
      if (!Array.isArray(editSnapshot)) setRoutineDescription(state.selected_routine, editSnapshot.description);
      if (!Array.isArray(editSnapshot)) setRoutineImageId(state.selected_routine, editSnapshot.image_id);
      saveState();
    }
    editMode = false;
    editSnapshot = null;
  }

  function renderRoutineEditButton() {
    if (editMode) return "";
    return `<button class="routine-title-edit" type="button" data-action="toggle-edit" aria-label="Edit routine" title="Edit Routine">${iconSvg("edit")}</button>`;
  }

  function renderPageTitle(title) {
    if (currentPage !== "routine") return `<h1>${escapeHtml(title)}</h1>`;
    return `
      <div class="routine-title-row">
        <h1>${escapeHtml(title)}</h1>
        ${renderRoutineEditButton()}
      </div>
    `;
  }

  function shell(title, body) {
    return `
      <section class="screen">
        <header class="topbar app-page-header">
          ${renderAppBrandHeader()}
          ${renderPageTitle(title)}
        </header>
        <main class="page-body">${body}</main>
        ${renderBottomNav(currentPage)}
      </section>
    `;
  }

  function authShell(body) {
    return `
      <section class="screen auth-screen">
        <main class="auth-body">${body}</main>
      </section>
    `;
  }

  function renderAuthGate() {
    if (!authReady) {
      return authShell(`
        <section class="auth-panel">
          <img class="auth-logo" src="icons/fitnote-landing-logo.png" alt="FitNote">
          <p class="auth-copy">Checking sign in...</p>
        </section>
      `);
    }
    return authShell(`
        <section class="auth-panel">
          <img class="auth-logo" src="icons/fitnote-landing-logo.png" alt="FitNote">
        <div class="auth-actions">
          <button class="btn btn-primary auth-btn" type="button" data-action="sign-in-google" ${cloudUnavailable ? "disabled" : ""}><span class="auth-btn-icon auth-google-mark">G</span><span>Sign in with Google</span>${iconSvg("chevronRight")}</button>
          <button class="btn btn-secondary auth-btn" type="button" data-action="guest-sign-in"><span class="auth-btn-icon">${iconSvg("user")}</span><span>Continue as Guest</span>${iconSvg("chevronRight")}</button>
        </div>
        <p class="auth-copy">${cloudUnavailable ? "Cloud sign in is unavailable. Guest mode still works." : "Cloud storage requires Google sign in."}</p>
        <p class="auth-version">Version ${escapeHtml(APP_VERSION)}</p>
      </section>
    `);
  }

  function render() {
    applyAppShellClass();
    if (!canEnterApp()) {
      closeEditMode(false);
      app.innerHTML = renderAuthGate();
      bindAuthGate();
      return;
    }
    if (currentPage === "home") {
      app.innerHTML = renderHomePage();
      bindHomePage();
      return;
    }
    if (currentPage === "routines") {
      app.innerHTML = renderRoutinesPage();
      bindRoutinesPage();
      return;
    }
    const title = titleForPage(currentPage);
    app.innerHTML = shell(title, bodyForPage(currentPage));
    bindShell();
    if (currentPage === "routine") bindRoutinePage();
    if (currentPage === "new") bindNewRoutinePage();
    if (currentPage === "history") bindHistoryPage();
    if (currentPage === "data") bindDataPage();
    if (currentPage === "settings") bindSettingsPage();
  }

  function bindAuthGate() {
    const signIn = app.querySelector("[data-action='sign-in-google']");
    if (signIn) signIn.addEventListener("click", signInWithGoogle);
    const guestSignIn = app.querySelector("[data-action='guest-sign-in']");
    if (guestSignIn) guestSignIn.addEventListener("click", enterGuestMode);
  }

  function titleForPage(page) {
    if (page === "routine") return currentRoutine() || "Workout";
    return {
      home: "FitNote",
      routines: "Routines",
      new: "New Routine",
      history: "History",
      data: "Data",
      settings: "Settings",
    }[page] || "FitNote";
  }

  function bodyForPage(page) {
    if (page === "home") return renderHomePage();
    if (page === "routines") return renderRoutinesPage();
    if (page === "new") return renderNewRoutinePage();
    if (page === "history") return renderHistoryPage();
    if (page === "data") return renderDataPage();
    if (page === "settings") return renderSettingsPage();
    return renderRoutinePage();
  }

  function homeDisplayName() {
    const metadata = authSession?.user?.user_metadata || {};
    const name = metadata.first_name || metadata.given_name || metadata.full_name || "";
    if (name) return String(name).trim().split(/\s+/)[0];
    const email = authSession?.user?.email || "";
    return email ? email.split("@")[0] : "";
  }

  function homeDateLabel(date) {
    if (!date) return "";
    const parsed = new Date(`${date}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function homeSuggestedRoutine(lastSession) {
    const routines = routineNames();
    if (!routines.length) return "Create a routine";
    if (!lastSession) return currentRoutine();
    const lastIndex = routines.indexOf(lastSession.routine_name);
    return routines[(lastIndex + 1 + routines.length) % routines.length] || currentRoutine();
  }

  function homeWorkoutCountThisWeek() {
    return historySessions().filter((session) => {
      const date = String(session.completed_at || session.started_at || "").slice(0, 10);
      if (!date) return false;
      const today = new Date(`${TODAY}T12:00:00`);
      const completed = new Date(`${date}T12:00:00`);
      const days = Math.floor((today - completed) / 86400000);
      return days >= 0 && days < 7;
    }).length;
  }

  function homeTopLift() {
    const session = historySessions()[0];
    if (!session) return { exercise: "No lift data", weight: "-" };
    const points = workoutHistory
      .sessionRows(state, session.id)
      .flatMap((row) => row.sets.filter((set) => boolFromData(set.completed)).map((set) => ({ exercise: row.exercise, weight: Number(set.weight) || 0 })));
    const point = points.sort((a, b) => b.weight - a.weight)[0];
    return point ? { exercise: point.exercise, weight: `${formatWeight(point.weight)} lb` } : { exercise: "No lift data", weight: "-" };
  }

  function homeMostImproved() {
    const byExercise = new Map();
    historySessions().forEach((session) => {
      const date = String(session.completed_at || session.started_at || "").slice(0, 10);
      workoutHistory.sessionRows(state, session.id).forEach((row) => {
        const weights = row.sets.filter((set) => boolFromData(set.completed)).map((set) => Number(set.weight) || 0).filter((weight) => weight > 0);
        if (!weights.length) return;
        const history = byExercise.get(row.exercise) || [];
        if (!history.some((item) => item.date === date)) history.push({ date, weight: Math.max(...weights) });
        byExercise.set(row.exercise, history);
      });
    });
    let best = null;
    byExercise.forEach((history, exercise) => {
      if (history.length < 2) return;
      const improvement = history[0].weight - history[1].weight;
      if (!best || improvement > best.improvement) best = { exercise, improvement };
    });
    if (!best || best.improvement <= 0) return { exercise: "Keep building", value: "Log another workout" };
    return { exercise: best.exercise, value: `+${formatWeight(best.improvement)} lb` };
  }

  function routineExerciseCount(name) {
    const count = (state.routines[name] || []).filter((row) => row.exercise && row.active !== false).length;
    return `${count} ${count === 1 ? "exercise" : "exercises"}`;
  }

  function routineLastCompletedLabel(name) {
    const session = historySessions().find((item) => item.routine_name === name);
    const date = session ? String(session.completed_at || session.started_at || "").slice(0, 10) : "";
    if (!date) return "Never done";
    const today = new Date(`${TODAY}T12:00:00`);
    const previous = new Date(`${date}T12:00:00`);
    const days = Math.max(0, Math.floor((today - previous) / 86400000));
    if (days === 0) return "Done today";
    if (days === 1) return "Done yesterday";
    if (days < 7) return `Done ${days} days ago`;
    const weeks = Math.max(1, Math.round(days / 7));
    return `Done ${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
  }

  function filteredRoutineNames() {
    const query = routinesSearchTerm.trim().toLocaleLowerCase();
    return routineNames().filter((name) => !query || `${name} ${routineDescription(name)}`.toLocaleLowerCase().includes(query));
  }

  function renderRoutinesPage() {
    const routines = filteredRoutineNames();
    return `
      <section class="routines-page">
        <div class="routines-content">
          ${renderAppBrandHeader()}
          <div class="routines-heading-row">
            <div class="routines-heading">
              <h1>Select Routine</h1>
              <p>Pick a routine to start today.</p>
            </div>
            <button class="routines-create" type="button" data-nav="new" aria-label="Create routine" title="Create Routine" ${canCreateRoutines() ? "" : "disabled"}>${iconSvg("plus")}</button>
          </div>
          <label class="routine-search">
            ${iconSvg("search")}
            <input type="search" value="${escapeAttr(routinesSearchTerm)}" placeholder="Search routines..." aria-label="Search routines" data-routines-search>
          </label>
          <div class="routine-card-grid">
            ${
              routines.length
                ? routines.map((name) => renderRoutineLandingCard(name)).join("")
                : '<p class="routines-empty">No routines match your search.</p>'
            }
          </div>
        </div>
        ${renderBottomNav("routines")}
      </section>
    `;
  }

  function renderRoutineLandingCard(name) {
    const imageId = routineImageId(name);
    return `
      <button class="routine-card-tile" type="button" data-routine-start="${escapeAttr(name)}">
        <span class="routine-card-art" aria-hidden="true"><img src="${escapeAttr(routineImagePath(imageId))}" alt=""></span>
        <span class="routine-card-copy">
          <strong>${escapeHtml(name)}</strong>
          <small>${escapeHtml(routineDescription(name))}</small>
        </span>
        <span class="routine-card-chevron">${iconSvg("chevronRight")}</span>
        <span class="routine-card-detail-row">
          <span class="routine-card-meta">
            <span>${iconSvg("plusCircle")}${escapeHtml(routineExerciseCount(name))}</span>
            <span>${iconSvg("clock")}${escapeHtml(routineLastCompletedLabel(name))}</span>
          </span>
        </span>
      </button>
    `;
  }

  function renderHomePage() {
    const completed = historySessions();
    const lastSession = completed[0] || null;
    const lastDate = lastSession ? String(lastSession.completed_at || lastSession.started_at || "").slice(0, 10) : "";
    const topLift = homeTopLift();
    const improved = homeMostImproved();
    return `
      <section class="home-page">
        <div class="home-content">
          ${renderAppBrandHeader()}
          <h1 class="home-welcome">Welcome back</h1>

          <section class="home-panel snapshot-panel">
            <div class="home-section-heading">
              <span class="home-section-icon">${iconSvg("bars")}</span>
              <h2>Today's Snapshot</h2>
            </div>
            <div class="snapshot-grid">
              <div class="snapshot-item">
                <span>Last Workout</span>
                <strong>${escapeHtml(lastSession?.routine_name || "No workouts yet")}</strong>
                <small>${lastDate ? `Completed: ${escapeHtml(homeDateLabel(lastDate))}` : "Start your first workout"}</small>
              </div>
              <div class="snapshot-item">
                <span>Next Suggested</span>
                <strong>${escapeHtml(homeSuggestedRoutine(lastSession))}</strong>
                <small>${lastSession ? "Keep your rotation moving" : "Ready when you are"}</small>
              </div>
            </div>
          </section>

          <button class="home-start" type="button" data-nav="routines">
            <span class="home-start-icon">${iconSvg("play")}</span>
            <span class="home-start-copy"><strong>Start Workout</strong><small>Go to Select Routine / Workout</small></span>
            ${iconSvg("chevronRight")}
          </button>

          <section class="home-panel highlights-panel">
            <div class="home-section-heading home-section-heading-action">
              <span class="home-section-icon">${iconSvg("bars")}</span>
              <h2>Progress Highlights</h2>
              <button class="home-see-all" type="button" data-nav="data">See All ${iconSvg("chevronRight")}</button>
            </div>
            <div class="highlight-grid">
              <div class="highlight-tile"><span>Workouts This Week</span><strong>${homeWorkoutCountThisWeek()}</strong></div>
              <div class="highlight-tile"><span>Top Lift Recently</span><strong>${escapeHtml(topLift.exercise)}</strong><small>${escapeHtml(topLift.weight)}</small></div>
              <div class="highlight-tile"><span>Most Improved</span><strong>${escapeHtml(improved.exercise)}</strong><small class="highlight-positive">${escapeHtml(improved.value)}</small></div>
            </div>
          </section>
        </div>
        ${renderBottomNav("home")}
      </section>
    `;
  }

  function renderBottomNav(activePage) {
    const active = activePage === "routine" || activePage === "new" ? "routines" : activePage;
    return `
      <nav class="home-nav" aria-label="Primary navigation">
        <button class="home-nav-item ${active === "home" ? "active" : ""}" type="button" data-nav="home" ${active === "home" ? 'aria-current="page"' : ""}>${iconSvg("home")}<span>Home</span></button>
        <button class="home-nav-item ${active === "routines" ? "active" : ""}" type="button" data-nav="routines" ${active === "routines" ? 'aria-current="page"' : ""}>${iconSvg("play")}<span>Routines</span></button>
        <button class="home-nav-item ${active === "data" ? "active" : ""}" type="button" data-nav="data" ${active === "data" ? 'aria-current="page"' : ""}>${iconSvg("bars")}<span>Progress</span></button>
        <button class="home-nav-item ${active === "settings" ? "active" : ""}" type="button" data-nav="settings" ${active === "settings" ? 'aria-current="page"' : ""}>${iconSvg("settings")}<span>Settings</span></button>
      </nav>
    `;
  }

  function bindHomePage() {
    app.querySelectorAll("[data-nav]").forEach((button) => {
      button.addEventListener("click", () => setPage(button.dataset.nav));
    });
  }

  function bindRoutinesPage() {
    app.querySelectorAll("[data-nav]").forEach((button) => {
      button.addEventListener("click", () => setPage(button.dataset.nav));
    });
    const search = app.querySelector("[data-routines-search]");
    if (search) {
      search.addEventListener("input", () => {
        routinesSearchTerm = search.value;
        render();
        const nextSearch = app.querySelector("[data-routines-search]");
        if (nextSearch) {
          nextSearch.focus();
          nextSearch.setSelectionRange(nextSearch.value.length, nextSearch.value.length);
        }
      });
    }
    app.querySelectorAll("[data-routine-start]").forEach((button) => {
      button.addEventListener("click", () => {
        const routine = button.dataset.routineStart;
        if (!routine || !state.routines[routine]) return;
        state.selected_routine = routine;
        currentSessionId = null;
        saveState();
        setPage("routine");
      });
    });
  }

  function bindShell() {
    app.querySelectorAll("[data-nav]").forEach((button) => {
      button.addEventListener("click", () => setPage(button.dataset.nav));
    });
  }

  function bindCloudSettings() {
    const signIn = app.querySelector("[data-action='sign-in-google']");
    if (signIn) signIn.addEventListener("click", signInWithGoogle);
    const guestSignIn = app.querySelector("[data-action='guest-sign-in']");
    if (guestSignIn) guestSignIn.addEventListener("click", enterGuestMode);
    const leaveGuest = app.querySelector("[data-action='leave-guest']");
    if (leaveGuest) leaveGuest.addEventListener("click", leaveGuestMode);
    const signOut = app.querySelector("[data-action='sign-out-google']");
    if (signOut) {
      signOut.addEventListener("click", async () => {
        if (!supabaseClient) return;
        await supabaseClient.auth.signOut();
        authSession = null;
        guestMode = false;
        localStorage.removeItem(GUEST_MODE_KEY);
        cloudStatus = "Browser storage only";
        cloudDatabaseFull = false;
        window.clearTimeout(cloudSaveTimer);
        applyLoadedState(loadState(STORAGE_KEY));
        render();
      });
    }
  }

  function renderRoutinePage() {
    const rows = editMode ? currentRows() : currentWorkoutRows();
    const session = editMode ? null : currentWorkoutSession();
    const routine = currentRoutine();
    return `
      <section class="routine-page">
        ${renderRoutineDescriptionPanel(routine)}
        ${editMode ? renderRoutineImageDialog(routineImageId(routine)) : ""}
        <div class="routine-list" data-routine-list>
          ${rows.map((row, index) => renderExerciseCard(row, index)).join("")}
        </div>
        <div class="bottom-actions">
          ${editMode ? `<button class="btn btn-secondary action-add" type="button" data-action="add-exercise">${iconSvg("plusCircle")}<span>Add Exercise</span></button>` : ""}
          <button class="btn btn-primary complete-btn" type="button" data-action="save-routine">${iconSvg(editMode ? "check" : "checkCircle")}<span>${editMode ? "Save Changes" : session?.status === "completed" ? "Update Workout" : "Complete Workout"}</span></button>
        </div>
        <div class="scroll-float" data-scroll-float></div>
      </section>
    `;
  }

  function renderRoutineDescriptionPanel(routine) {
    const description = routineDescription(routine);
    if (editMode) {
      return `
        <section class="routine-edit-overview">
          ${renderRoutineImageEditButton(routine)}
          <label class="routine-description-panel edit">
            <textarea class="routine-description-input" maxlength="30" rows="2" data-routine-description aria-label="Routine description">${escapeHtml(description)}</textarea>
          </label>
        </section>
      `;
    }
    return `<p class="routine-description-panel">${escapeHtml(description)}</p>`;
  }

  function renderRoutineImageEditButton(routine) {
    const selected = routineImageById(routineImageId(routine));
    return `
      <button class="routine-image-edit" type="button" data-action="open-routine-image-picker" aria-label="Change routine image" title="Change Image">
        <span class="routine-image-edit-thumb"><img src="${escapeAttr(routineImagePath(selected.id))}" alt=""></span>
      </button>
    `;
  }

  function renderExerciseCard(row, index) {
    if (!editMode) return renderWorkoutExerciseCard(row, index);
    const exerciseOptions = existingExerciseOptions();
    return `
      <article class="exercise-card template-card" data-index="${index}">
        <div class="card-title-row">
          <div class="exercise-name-controls" data-exercise-picker>
            <input class="text-input exercise-name-input" data-field="exercise" data-index="${index}" value="${escapeAttr(row.exercise)}" autocomplete="off" aria-label="Exercise search" placeholder="Search exercises">
            <div class="exercise-option-menu" data-exercise-option-menu hidden>
              ${exerciseOptions
                .map(
                  (exercise) =>
                    `<button class="exercise-option" type="button" data-action="select-existing-exercise" data-index="${index}" data-exercise-id="${escapeAttr(exercise.id)}" data-exercise-name="${escapeAttr(exercise.name)}">${escapeHtml(exercise.name)}</button>`
                )
                .join("")}
            </div>
          </div>
          <div class="mini-actions">
            <button class="icon-btn card-icon-btn" type="button" data-action="move-exercise" data-direction="up" data-index="${index}" aria-label="Move exercise up" title="Move up" ${index === 0 ? "disabled" : ""}>${iconSvg("up")}</button>
            <button class="icon-btn card-icon-btn" type="button" data-action="move-exercise" data-direction="down" data-index="${index}" aria-label="Move exercise down" title="Move down" ${index === currentRows().length - 1 ? "disabled" : ""}>${iconSvg("down")}</button>
            <button class="delete-mini icon-only" type="button" data-action="delete-exercise" data-index="${index}" aria-label="Delete exercise" title="Delete Exercise">${iconSvg("trash")}</button>
            <button class="pb-btn ${row.track_pb ? "active" : ""}" type="button" data-action="toggle-pb" data-index="${index}">PB</button>
          </div>
        </div>
        <div class="template-grid full-row">
          <div class="field-label">Weight (lb)</div>
          <div class="field-label">Reps</div>
          <input class="text-input template-input" inputmode="decimal" data-field="weight" data-index="${index}" value="${escapeAttr(row.weight)}" aria-label="Template weight">
          <input class="text-input template-input" data-field="reps" data-index="${index}" value="${escapeAttr(row.reps)}" aria-label="Template reps">
        </div>
      </article>
    `;
  }

  function renderCollapsedSetSummary(row) {
    const firstSet = row.sets[0] || {};
    const weight = String(firstSet.weight ?? "").trim();
    const reps = String(firstSet.reps ?? "").trim();
    const completed = boolFromData(firstSet.completed);
    return `
      <div class="collapsed-set-summary full-row" aria-label="First set">
        <span>Set 1</span>
        <strong>${escapeHtml(weight ? `${weight} lb` : "- lb")}</strong>
        <strong>${escapeHtml(reps ? `${reps} reps` : "- reps")}</strong>
        <span class="${completed ? "complete" : ""}">${completed ? "Done" : "Not done"}</span>
      </div>
    `;
  }

  function renderExerciseTitleButton(row, isExpanded) {
    return `
      <h2 class="exercise-title">
        <button class="exercise-title-button" type="button" data-action="toggle-exercise-collapse" data-workout-exercise-id="${escapeAttr(row.workout_exercise_id)}" aria-expanded="${isExpanded ? "true" : "false"}">
          ${escapeHtml(row.exercise)}
        </button>
      </h2>
    `;
  }

  function renderWorkoutExerciseCard(row, index) {
    const isExpanded = expandedWorkoutExerciseId === row.workout_exercise_id;
    return `
      <article class="exercise-card workout-card ${isExpanded ? "expanded" : "collapsed"}" data-workout-exercise-id="${escapeAttr(row.workout_exercise_id)}">
        <div class="card-title-row">
          ${renderExerciseTitleButton(row, isExpanded)}
          <div class="mini-actions">
            ${
              isExpanded
                ? `<button class="pb-btn ${row.track_pb ? "active" : ""}" type="button" data-action="toggle-pb" data-workout-exercise-id="${escapeAttr(row.workout_exercise_id)}">PB</button>`
                : ""
            }
            <button class="icon-btn more-btn" type="button" data-action="toggle-exercise-menu" aria-label="Exercise actions" title="Exercise Actions">${iconSvg("more")}</button>
          </div>
          <div class="exercise-menu" data-exercise-menu hidden>
            <button class="card-menu-item" type="button" data-action="move-exercise" data-direction="up" data-workout-exercise-id="${escapeAttr(row.workout_exercise_id)}" ${index === 0 ? "disabled" : ""}>Move Up</button>
            <button class="card-menu-item" type="button" data-action="move-exercise" data-direction="down" data-workout-exercise-id="${escapeAttr(row.workout_exercise_id)}" ${index === currentWorkoutRows().length - 1 ? "disabled" : ""}>Move Down</button>
            <button class="card-menu-item danger" type="button" data-action="delete-workout-exercise" data-workout-exercise-id="${escapeAttr(row.workout_exercise_id)}">Delete Exercise</button>
          </div>
        </div>
        ${
          isExpanded
            ? `<div class="set-grid full-row">
                <div class="set-head">Set</div>
                <div class="set-head">Weight (lb)</div>
                <div class="set-head">Reps</div>
                <div class="set-head">Done</div>
                <div class="set-head"></div>
                ${row.sets.map((set) => renderSetRow(set)).join("")}
              </div>
              <button class="btn btn-secondary add-set-btn full-row" type="button" data-action="add-set" data-workout-exercise-id="${escapeAttr(row.workout_exercise_id)}">${iconSvg("plus")}<span>Add Set</span></button>`
            : renderCollapsedSetSummary(row)
        }
      </article>
    `;
  }

  function renderSetRow(set) {
    return `
      <div class="set-number">${escapeHtml(set.set_number)}</div>
      <div class="weight-stepper">
        <button class="step-btn" type="button" data-action="adjust-set-weight" data-delta="-5" data-set-id="${escapeAttr(set.id)}" aria-label="Decrease weight" title="Decrease Weight">${iconSvg("minus")}</button>
        <input class="text-input set-input weight-input" inputmode="decimal" data-set-field="weight" data-set-id="${escapeAttr(set.id)}" value="${escapeAttr(set.weight)}" aria-label="Set weight">
        <button class="step-btn" type="button" data-action="adjust-set-weight" data-delta="5" data-set-id="${escapeAttr(set.id)}" aria-label="Increase weight" title="Increase Weight">${iconSvg("plus")}</button>
      </div>
      <input class="text-input set-input reps-input" inputmode="numeric" data-set-field="reps" data-set-id="${escapeAttr(set.id)}" value="${escapeAttr(set.reps)}" aria-label="Set reps">
      <label class="set-check">
        <input type="checkbox" data-set-complete data-set-id="${escapeAttr(set.id)}" ${set.completed ? "checked" : ""}>
        <span class="set-check-visual">${iconSvg("check")}</span>
      </label>
      <button class="delete-mini set-delete" type="button" data-action="delete-set" data-set-id="${escapeAttr(set.id)}" aria-label="Delete set" title="Delete Set">${iconSvg("trash")}</button>
    `;
  }

  function bindRoutinePage() {
    app.querySelector("[data-action='save-routine']").addEventListener("click", saveRoutineButton);
    const editButton = app.querySelector("[data-action='toggle-edit']");
    if (editButton) editButton.addEventListener("click", toggleEditMode);
    const addButton = app.querySelector("[data-action='add-exercise']");
    if (addButton) addButton.addEventListener("click", addExercise);
    const imageButton = app.querySelector("[data-action='open-routine-image-picker']");
    if (imageButton) {
      imageButton.addEventListener("click", () => {
        syncEditFieldsFromDom();
        routineImagePickerOpen = true;
        render();
      });
    }
    const closeRoutineImagePicker = () => {
      syncEditFieldsFromDom();
      routineImagePickerOpen = false;
      render();
    };
    const backdrop = app.querySelector("[data-routine-image-backdrop]");
    if (backdrop) {
      backdrop.addEventListener("click", (event) => {
        if (event.target === backdrop) closeRoutineImagePicker();
      });
    }
    const closeButton = app.querySelector("[data-action='close-routine-image-picker']");
    if (closeButton) closeButton.addEventListener("click", closeRoutineImagePicker);
    app.querySelectorAll("[data-routine-image]").forEach((button) => {
      button.addEventListener("click", () => {
        setRoutineImageId(currentRoutine(), button.dataset.routineImage || "");
        routineImagePickerOpen = false;
        saveState();
        render();
      });
    });
    const descriptionInput = app.querySelector("[data-routine-description]");
    if (descriptionInput) {
      descriptionInput.addEventListener("input", () => {
        const text = normalizeRoutineDescription(descriptionInput.value);
        if (descriptionInput.value !== text) descriptionInput.value = text;
        setRoutineDescription(currentRoutine(), text);
        saveState();
      });
    }

    app.querySelectorAll("[data-field]").forEach((input) => {
      input.addEventListener("input", () => {
        const row = currentRows()[Number(input.dataset.index)];
        input.classList.remove("is-invalid");
        input.closest(".exercise-card")?.classList.remove("has-invalid");
        if (input.dataset.field === "exercise") {
          const existing = findExistingExerciseByName(input.value);
          row.exercise_id = existing ? existing.id : "";
          row.exercise = existing ? existing.name : "";
          filterExerciseOptions(input);
          if (existing) saveState();
          return;
        }
        row[input.dataset.field] = input.value;
        saveState();
      });
    });

    app.querySelectorAll(".exercise-name-input").forEach((input) => {
      input.addEventListener("focus", () => filterExerciseOptions(input));
      input.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        const menu = input.closest("[data-exercise-picker]")?.querySelector("[data-exercise-option-menu]");
        if (menu) menu.hidden = true;
      });
    });

    app.querySelectorAll("[data-action='select-existing-exercise']").forEach((button) => {
      const selectExercise = () => {
        const row = currentRows()[Number(button.dataset.index)];
        row.exercise_id = button.dataset.exerciseId || "";
        row.exercise = button.dataset.exerciseName || row.exercise;
        const input = button.closest(".exercise-card")?.querySelector("[data-field='exercise']");
        if (input) {
          input.value = row.exercise;
          input.classList.remove("is-invalid");
          input.closest(".exercise-card")?.classList.remove("has-invalid");
        }
        const menu = button.closest("[data-exercise-option-menu]");
        if (menu) menu.hidden = true;
        saveState();
      };
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        selectExercise();
      });
      button.addEventListener("click", () => {
        selectExercise();
      });
    });

    app.querySelectorAll("[data-action='toggle-exercise-menu']").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const card = button.closest(".exercise-card");
        const menu = card?.querySelector("[data-exercise-menu]");
        if (!menu) return;
        app.querySelectorAll("[data-exercise-menu]").forEach((otherMenu) => {
          if (otherMenu !== menu) otherMenu.hidden = true;
        });
        menu.hidden = !menu.hidden;
      });
    });

    app.querySelectorAll("[data-action='toggle-exercise-collapse']").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const id = button.dataset.workoutExerciseId || "";
        expandedWorkoutExerciseId = expandedWorkoutExerciseId === id ? "" : id;
        app.querySelectorAll("[data-exercise-menu]").forEach((menu) => {
          menu.hidden = true;
        });
        render();
      });
    });

    app.querySelectorAll(".workout-card").forEach((card) => {
      card.addEventListener("click", (event) => {
        if (
          event.target.closest(
            "[data-action='toggle-exercise-menu'], [data-action='toggle-exercise-collapse'], [data-exercise-menu]"
          )
        ) {
          return;
        }
        const id = card.dataset.workoutExerciseId || "";
        if (!id || expandedWorkoutExerciseId === id) return;
        expandedWorkoutExerciseId = id;
        render();
      });
    });

    app.querySelector(".routine-page").addEventListener("click", (event) => {
      if (event.target.closest("[data-action='toggle-exercise-menu'], [data-exercise-menu], [data-exercise-picker]")) return;
      app.querySelectorAll("[data-exercise-menu]").forEach((menu) => {
        menu.hidden = true;
      });
      app.querySelectorAll("[data-exercise-option-menu]").forEach((menu) => {
        menu.hidden = true;
      });
    });

    app.querySelectorAll("[data-action='toggle-pb']").forEach((button) => {
      button.addEventListener("click", () => {
        if (editMode) {
          const row = currentRows()[Number(button.dataset.index)];
          row.track_pb = !row.track_pb;
        } else {
          const row = state.workout_exercises.find((item) => item.id === button.dataset.workoutExerciseId);
          if (row) row.track_pb = !row.track_pb;
        }
        saveState();
        render();
      });
    });

    app.querySelectorAll("[data-action='delete-exercise']").forEach((button) => {
      button.addEventListener("click", () => deleteExercise(Number(button.dataset.index)));
    });

    app.querySelectorAll("[data-action='move-exercise']").forEach((button) => {
      button.addEventListener("click", () => {
        if (editMode) moveExercise(Number(button.dataset.index), button.dataset.direction);
        else {
          workoutHistory.moveWorkoutExercise(state, button.dataset.workoutExerciseId, button.dataset.direction);
          saveState();
          render();
        }
      });
    });

    app.querySelectorAll("[data-set-field]").forEach((input) => {
      input.addEventListener("input", () => {
        workoutHistory.updateWorkoutSet(state, input.dataset.setId, input.dataset.setField, input.value);
        saveState();
      });
    });

    app.querySelectorAll("[data-action='adjust-set-weight']").forEach((button) => {
      button.addEventListener("click", () => {
        const set = state.workout_sets.find((item) => item.id === button.dataset.setId);
        const currentWeight = Number(String(set?.weight || "").trim());
        const delta = Number(button.dataset.delta || 0);
        const nextWeight = Math.max(0, (Number.isFinite(currentWeight) ? currentWeight : 0) + delta);
        const updatedSet = workoutHistory.updateWorkoutSet(state, button.dataset.setId, "weight", formatWeight(nextWeight));
        saveState();
        const input = button.closest(".weight-stepper")?.querySelector("[data-set-field='weight']");
        if (input && updatedSet) input.value = updatedSet.weight;
      });
    });

    app.querySelectorAll("[data-set-complete]").forEach((input) => {
      input.addEventListener("change", () => {
        workoutHistory.updateWorkoutSet(state, input.dataset.setId, "completed", input.checked);
        saveState();
      });
    });

    app.querySelectorAll("[data-action='add-set']").forEach((button) => {
      button.addEventListener("click", () => {
        const list = app.querySelector("[data-routine-list]");
        const scrollTop = list?.scrollTop ?? 0;
        const pageScrollTop = document.scrollingElement?.scrollTop ?? 0;
        workoutHistory.addWorkoutSet(state, button.dataset.workoutExerciseId);
        saveState();
        render();
        const nextList = app.querySelector("[data-routine-list]");
        if (nextList) nextList.scrollTop = scrollTop;
        if (document.scrollingElement) document.scrollingElement.scrollTop = pageScrollTop;
      });
    });

    app.querySelectorAll("[data-action='delete-set']").forEach((button) => {
      button.addEventListener("click", () => {
        const list = app.querySelector("[data-routine-list]");
        const scrollTop = list?.scrollTop ?? 0;
        const pageScrollTop = document.scrollingElement?.scrollTop ?? 0;
        workoutHistory.deleteWorkoutSet(state, button.dataset.setId);
        saveState();
        render();
        const nextList = app.querySelector("[data-routine-list]");
        if (nextList) nextList.scrollTop = scrollTop;
        if (document.scrollingElement) document.scrollingElement.scrollTop = pageScrollTop;
      });
    });

    app.querySelectorAll("[data-action='delete-workout-exercise']").forEach((button) => {
      button.addEventListener("click", () => deleteExercise(button.dataset.workoutExerciseId));
    });

    const list = app.querySelector("[data-routine-list]");
    const float = app.querySelector("[data-scroll-float]");
    bindFloatingScroll(list, float);
  }

  function moveExercise(index, direction) {
    const rows = currentRows();
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= rows.length) return;
    [rows[index], rows[targetIndex]] = [rows[targetIndex], rows[index]];
    saveState();
    render();
  }

  function filterExerciseOptions(input) {
    const menu = input.closest("[data-exercise-picker]")?.querySelector("[data-exercise-option-menu]");
    if (!menu) return;
    app.querySelectorAll("[data-exercise-option-menu]").forEach((otherMenu) => {
      if (otherMenu !== menu) otherMenu.hidden = true;
    });
    const query = input.value.trim().toLocaleLowerCase();
    let visibleCount = 0;
    menu.querySelectorAll("[data-action='select-existing-exercise']").forEach((option) => {
      const name = option.dataset.exerciseName || "";
      const visible = !query || name.toLocaleLowerCase().includes(query);
      option.hidden = !visible;
      if (visible) visibleCount += 1;
    });
    menu.hidden = visibleCount === 0;
  }

  function toggleEditMode() {
    if (currentPage !== "routine") {
      currentPage = "routine";
    }
    if (editMode) {
      closeEditMode(false);
    } else {
      editSnapshot = {
        rows: clone(currentRows()),
        description: routineDescription(currentRoutine()),
        image_id: routineImageId(currentRoutine()),
      };
      editMode = true;
    }
    render();
  }

  async function saveRoutineButton() {
    if (editMode) {
      syncEditFieldsFromDom();
      if (!validateRows()) return;
      const editedRoutine = currentRoutine();
      editMode = false;
      editSnapshot = null;
      state = workoutHistory.ensureHistoricalModel(state, { today: TODAY });
      const activeSession = workoutHistory.todaySession(state, editedRoutine, TODAY);
      if (activeSession) {
        workoutHistory.syncWorkoutSessionWithRoutine(state, activeSession.id, { includeCompleted: true });
        currentSessionId = activeSession.id;
      }
      saveState();
      render();
      if (!hasCloudIdentity()) {
        showToast(`${currentRoutine()} was updated in this browser.`);
        return;
      }
      const result = await saveCloudData({ quiet: true });
      showToast(result.databaseFull ? "Database is full. Saved on this device only." : `${currentRoutine()} was updated.`);
      return;
    }
    if (!validateWorkoutRows()) return;
    const ok = await confirmDialog("Complete workout", "Save this workout to History?", "Complete");
    if (!ok) return;
    const session = currentWorkoutSession();
    workoutHistory.completeWorkoutSession(state, session.id);
    saveState();
    if (!hasCloudIdentity()) {
      showToast(`${currentRoutine()} was saved to this browser.`);
      return;
    }
    const result = await saveCloudData({ quiet: true });
    showToast(result.databaseFull ? "Database is full. Saved on this device only." : `${currentRoutine()} was saved for ${TODAY}.`);
  }

  function validateRows() {
    clearInvalidFields();
    let firstInvalid = null;
    for (const [index, row] of currentRows().entries()) {
      const exercise = String(row.exercise ?? "").trim();
      const reps = String(row.reps ?? "").trim();
      const selectedExercise = findExistingExerciseByName(exercise);
      const invalidFields = [];
      if (!exercise || !selectedExercise || row.exercise_id !== selectedExercise.id) invalidFields.push("exercise");
      if (String(row.weight ?? "").trim() === "") invalidFields.push("weight");
      if (!reps) invalidFields.push("reps");
      if (invalidFields.length) {
        markInvalidFields(index, invalidFields);
        if (!firstInvalid) firstInvalid = { index, invalidFields };
      }
    }
    if (firstInvalid) {
        showToast("Select an exercise, then enter reps and weight.");
        return false;
    }
    return true;
  }

  function syncEditFieldsFromDom() {
    const descriptionInput = app.querySelector("[data-routine-description]");
    if (descriptionInput) setRoutineDescription(currentRoutine(), descriptionInput.value);
    app.querySelectorAll("[data-field]").forEach((input) => {
      const row = currentRows()[Number(input.dataset.index)];
      if (!row) return;
      if (input.dataset.field === "exercise") {
        const existing = findExistingExerciseByName(input.value);
        row.exercise_id = existing ? existing.id : "";
        row.exercise = existing ? existing.name : "";
        return;
      }
      row[input.dataset.field] = input.value;
    });
    currentRows().forEach((row) => {
      const exercise = String(row.exercise ?? "").trim();
      if (exercise || !row.exercise_id) return;
      const existing = (state.exercises || []).find((item) => item.id === row.exercise_id);
      if (existing?.name) row.exercise = existing.name;
    });
  }

  function clearInvalidFields() {
    app.querySelectorAll(".is-invalid").forEach((node) => node.classList.remove("is-invalid"));
    app.querySelectorAll(".has-invalid").forEach((node) => node.classList.remove("has-invalid"));
  }

  function markInvalidFields(index, fields) {
    const card = app.querySelector(`.exercise-card[data-index="${index}"]`);
    if (!card) return;
    card.classList.add("has-invalid");
    fields.forEach((field) => {
      const input = card.querySelector(`[data-field="${field}"]`);
      if (input) input.classList.add("is-invalid");
    });
  }

  function validateWorkoutRows() {
    const rows = currentWorkoutRows();
    for (const row of rows) {
      if (!row.exercise.trim()) {
        showToast("Each exercise needs a name.");
        return false;
      }
      for (const set of row.sets) {
        if (!String(set.reps ?? "").trim() || !isValidWeight(set.weight)) {
          showToast("Each set needs reps and a valid weight.");
          return false;
        }
      }
    }
    return true;
  }

  function addExercise() {
    if (!editMode) {
      workoutHistory.addWorkoutExercise(state, currentWorkoutSession().id);
      saveState();
      render();
      return;
    }
    currentRows().push({
      exercise_id: "",
      exercise: "",
      weight: "",
      reps: "",
      track_pb: false,
    });
    saveState();
    render();
  }

  async function deleteExercise(index) {
    if (!editMode) {
      const row = state.workout_exercises.find((item) => item.id === index);
      if (!row) return;
      if (workoutHistory.sessionRows(state, currentWorkoutSession().id).length <= 1) {
        showToast("Each workout needs at least one exercise.");
        return;
      }
      const ok = await confirmDialog("Delete exercise", `Delete ${row.exercise_name}?`, "Delete");
      if (!ok) return;
      workoutHistory.deleteWorkoutExercise(state, index);
      if (expandedWorkoutExerciseId === index) expandedWorkoutExerciseId = "";
      saveState();
      render();
      return;
    }
    if (currentRows().length <= 1) {
      showToast("Each routine needs at least one exercise.");
      return;
    }
    const ok = await confirmDialog("Delete exercise", `Delete ${currentRows()[index].exercise}?`, "Delete");
    if (!ok) return;
    currentRows().splice(index, 1);
    saveState();
    render();
  }

  async function deleteRoutine(routine) {
    if (routineNames().length <= 1) {
      showToast("You need at least one routine.");
      return;
    }
    const ok = await confirmDialog("Delete routine", `Delete ${routine}?`, "Delete");
    if (!ok) return;
    if (editMode) closeEditMode(true);
    delete state.routines[routine];
    state.routine_definitions = state.routine_definitions.map((item) =>
      item.name === routine ? { ...item, active: false } : item
    );
    if (state.selected_routine === routine) {
      state.selected_routine = routineNames()[0];
      currentSessionId = null;
      dataSelection = { kind: "routine", value: state.selected_routine };
    }
    saveState();
    render();
  }

  function renderRoutineImagePicker(selectedId) {
    const normalizedSelectedId = workoutHistory.normalizeRoutineImageId(selectedId);
    return routineImageOptions()
      .map((image) => {
        const selected = image.id === normalizedSelectedId;
        return `
          <button class="routine-image-choice ${selected ? "selected" : ""}" type="button" data-routine-image="${escapeAttr(image.id)}" aria-pressed="${selected ? "true" : "false"}">
            <span class="routine-image-thumb"><img src="${escapeAttr(routineImagePath(image.id))}" alt=""></span>
            <span>${escapeHtml(image.label)}</span>
          </button>
        `;
      })
      .join("");
  }

  function renderSelectedRoutineImageButton() {
    const selectedId = workoutHistory.normalizeRoutineImageId(newRoutineImageId);
    const selected = selectedId ? routineImageById(selectedId) : null;
    return `
      <button class="routine-image-select ${selected ? "has-selection" : ""}" type="button" data-action="open-routine-image-picker" aria-label="Choose routine image">
        ${
          selected
            ? `<span class="routine-image-selected-thumb"><img src="${escapeAttr(routineImagePath(selected.id))}" alt=""></span>
               <span class="routine-image-selected-copy"><strong>${escapeHtml(selected.label)}</strong><small>Change image</small></span>`
            : `<span class="routine-image-selected-thumb empty">${iconSvg("plus")}</span>
               <span class="routine-image-selected-copy"><strong>Choose Image</strong><small>Select from routine images</small></span>`
        }
        ${iconSvg("chevronRight")}
      </button>
    `;
  }

  function renderRoutineImageDialog(selectedId = newRoutineImageId) {
    if (!routineImagePickerOpen) return "";
    return `
      <div class="routine-image-backdrop" data-routine-image-backdrop>
        <section class="routine-image-dialog" role="dialog" aria-modal="true" aria-label="Choose routine image">
          <div class="routine-image-dialog-header">
            <h2>Choose Routine Image</h2>
            <button class="icon-btn card-icon-btn" type="button" data-action="close-routine-image-picker" aria-label="Close image picker" title="Close">${iconSvg("cancel")}</button>
          </div>
          <div class="routine-image-picker in-dialog" data-routine-image-picker>
            ${renderRoutineImagePicker(selectedId)}
          </div>
        </section>
      </div>
    `;
  }

  function renderNewRoutinePage() {
    if (!canCreateRoutines()) {
      return `
        <section class="form-page">
          <p class="section-label">Google Sign In Required</p>
          <div class="status">New routines need a Google account. Workouts still save to this browser in guest mode.</div>
          <button class="btn btn-primary" type="button" data-action="sign-in-google">Sign in with Google</button>
        </section>
      `;
    }
    return `
      <section class="form-page create-routine-page">
        <div>
          <p class="section-label">Routine Name</p>
          <input class="text-input" data-new-routine-name autocomplete="off" value="${escapeAttr(newRoutineNameDraft)}">
        </div>
        <div class="routine-image-field">
          <p class="section-label">Routine Image</p>
          ${renderSelectedRoutineImageButton()}
        </div>
        <div class="status" data-status></div>
        <button class="btn btn-primary" type="button" data-action="create-routine">Create Routine</button>
        ${renderRoutineImageDialog()}
      </section>
    `;
  }

  function bindNewRoutinePage() {
    if (!canCreateRoutines()) {
      const signIn = app.querySelector("[data-action='sign-in-google']");
      if (signIn) signIn.addEventListener("click", signInWithGoogle);
      return;
    }
    const input = app.querySelector("[data-new-routine-name]");
    const create = app.querySelector("[data-action='create-routine']");
    const status = app.querySelector("[data-status]");
    const openImagePicker = app.querySelector("[data-action='open-routine-image-picker']");
    if (openImagePicker) {
      openImagePicker.addEventListener("click", () => {
        newRoutineNameDraft = input.value;
        routineImagePickerOpen = true;
        render();
      });
    }
    const closeImagePicker = () => {
      newRoutineNameDraft = input.value;
      routineImagePickerOpen = false;
      render();
    };
    const backdrop = app.querySelector("[data-routine-image-backdrop]");
    if (backdrop) {
      backdrop.addEventListener("click", (event) => {
        if (event.target === backdrop) closeImagePicker();
      });
    }
    const closeButton = app.querySelector("[data-action='close-routine-image-picker']");
    if (closeButton) closeButton.addEventListener("click", closeImagePicker);
    app.querySelectorAll("[data-routine-image]").forEach((button) => {
      button.addEventListener("click", () => {
        newRoutineNameDraft = input.value;
        newRoutineImageId = button.dataset.routineImage || "";
        routineImagePickerOpen = false;
        render();
      });
    });
    const createRoutine = () => {
      const name = input.value.trim();
      if (!name) {
        status.textContent = "Enter a routine name.";
        return;
      }
      if (!workoutHistory.normalizeRoutineImageId(newRoutineImageId)) {
        status.textContent = "Choose a routine image.";
        return;
      }
      if (state.routines[name]) {
        status.textContent = "That routine already exists.";
        return;
      }
      state.routines[name] = [{ exercise_id: "", exercise: "", weight: "", reps: "", track_pb: false }];
      setRoutineImageId(name, newRoutineImageId);
      state.selected_routine = name;
      dataSelection = { kind: "routine", value: name };
      newRoutineNameDraft = "";
      routineImagePickerOpen = false;
      editMode = true;
      editSnapshot = {
        rows: clone(state.routines[name]),
        description: routineDescription(name),
        image_id: routineImageId(name),
      };
      saveState();
      currentPage = "routine";
      render();
    };
    create.addEventListener("click", createRoutine);
    input.addEventListener("input", () => {
      newRoutineNameDraft = input.value;
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") createRoutine();
    });
  }

  function renderSettingsPage() {
    const textSize = currentTextSize();
    const routineColumns = currentRoutineColumns();
    const textSizes = [
      { id: "small", label: "Small" },
      { id: "normal", label: "Normal" },
      { id: "large", label: "Large" },
    ];
    const routineColumnOptions = [
      { id: "two", label: "2 Columns" },
      { id: "one", label: "1 Column" },
    ];
    return `
      <section class="settings-page">
        <section class="settings-section">
          <p class="section-label">Navigate</p>
          <div class="settings-actions">
            <button class="settings-action" type="button" data-nav="home">${iconSvg("home")}<span>Home</span></button>
            <button class="settings-action" type="button" data-nav="routines">${iconSvg("play")}<span>Routines</span></button>
            <button class="settings-action" type="button" data-nav="routine">${iconSvg("play")}<span>Workout</span></button>
            <button class="settings-action" type="button" data-nav="history">${iconSvg("history")}<span>History</span></button>
            <button class="settings-action" type="button" data-nav="data">${iconSvg("bars")}<span>Progress</span></button>
          </div>
        </section>
        <section class="settings-section">
          <p class="section-label">Account &amp; Sync</p>
          <div class="settings-account">
            ${cloudMenu()}
            ${cloudFooterStatus()}
          </div>
        </section>
        <section class="settings-section">
          <p class="section-label">Text Size</p>
          <div class="text-size-control" role="group" aria-label="Text size">
            ${textSizes
              .map(
                (item) =>
                  `<button class="text-size-option ${textSize === item.id ? "active" : ""}" type="button" data-text-size="${escapeAttr(item.id)}" aria-pressed="${textSize === item.id ? "true" : "false"}">${escapeHtml(item.label)}</button>`
              )
              .join("")}
          </div>
        </section>
        <section class="settings-section">
          <p class="section-label">Routine Layout</p>
          <div class="text-size-control routine-layout-control" role="group" aria-label="Routine layout">
            ${routineColumnOptions
              .map(
                (item) =>
                  `<button class="text-size-option ${routineColumns === item.id ? "active" : ""}" type="button" data-routine-columns="${escapeAttr(item.id)}" aria-pressed="${routineColumns === item.id ? "true" : "false"}">${escapeHtml(item.label)}</button>`
              )
              .join("")}
          </div>
        </section>
        <p class="settings-version">FitNote Version ${escapeHtml(APP_VERSION)}</p>
      </section>
    `;
  }

  function bindSettingsPage() {
    bindCloudSettings();
    app.querySelectorAll("[data-text-size]").forEach((button) => {
      button.addEventListener("click", () => {
        state.settings = { ...(state.settings || {}), text_size: normalizeTextSize(button.dataset.textSize) };
        saveState();
        render();
      });
    });
    app.querySelectorAll("[data-routine-columns]").forEach((button) => {
      button.addEventListener("click", () => {
        state.settings = {
          ...(state.settings || {}),
          routine_columns: normalizeRoutineColumns(button.dataset.routineColumns),
        };
        saveState();
        render();
      });
    });
  }

  function renderHistoryPage() {
    const rows = historySessions()
      .map((session) => {
        const selected = selectedHistory.has(session.id);
        const exercises = state.workout_exercises.filter((row) => row.workout_session_id === session.id);
        const setCount = state.workout_sets.filter((set) => set.completed && exercises.some((row) => row.id === set.workout_exercise_id)).length;
        return `
          <tr class="history-row ${selected ? "selected" : ""}" data-history-id="${escapeAttr(session.id)}">
            <td>${escapeHtml(String(session.completed_at || session.started_at || "").slice(0, 10))}</td>
            <td>${escapeHtml(session.routine_name)}</td>
            <td>${escapeHtml(exercises.length)}</td>
            <td>${escapeHtml(setCount)}</td>
          </tr>
        `;
      })
      .join("");
    return `
      <section class="history-page">
        <div class="history-actions">
          <div class="history-action-row">
            <button class="btn btn-secondary history-action" type="button" data-action="export-data">${iconSvg("download")}<span>Export</span></button>
            <button class="btn btn-secondary history-action" type="button" data-action="import-data">${iconSvg("upload")}<span>Import</span></button>
          </div>
          <div class="history-action-row">
            <button class="btn btn-secondary history-action" type="button" data-action="select-all">${iconSvg("checkSquare")}<span>Select All</span></button>
            <button class="btn btn-secondary history-action" type="button" data-action="deselect-all">${iconSvg("square")}<span>Deselect</span></button>
          </div>
        </div>
        <div class="history-list">
          <table>
            <thead><tr><th>Date</th><th>Routine</th><th>Exercises</th><th>Sets</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="4" class="muted">No saved workouts yet.</td></tr>'}</tbody>
          </table>
        </div>
        <button class="btn btn-danger history-delete" type="button" data-action="delete-history">${iconSvg("trash")}<span>Delete</span></button>
      </section>
    `;
  }

  function bindHistoryPage() {
    app.querySelector("[data-action='export-data']").addEventListener("click", exportData);
    app.querySelector("[data-action='import-data']").addEventListener("click", () => importFile.click());
    app.querySelector("[data-action='select-all']").addEventListener("click", () => {
      selectedHistory = new Set(historySessions().map((session) => session.id));
      render();
    });
    app.querySelector("[data-action='deselect-all']").addEventListener("click", () => {
      selectedHistory = new Set();
      render();
    });
    app.querySelector("[data-action='delete-history']").addEventListener("click", deleteHistory);
    app.querySelectorAll("[data-history-id]").forEach((row) => {
      row.addEventListener("click", () => {
        const sessionId = row.dataset.historyId;
        if (selectedHistory.has(sessionId)) selectedHistory.delete(sessionId);
        else selectedHistory.add(sessionId);
        render();
      });
    });
  }

  function exportData() {
    const payload = {
      app: "FitNote",
      exported_on: TODAY,
      ...state,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `fitnote_data_${TODAY}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  }

  async function deleteHistory() {
    if (!selectedHistory.size) {
      showToast("Select saved workouts to delete.");
      return;
    }
    const count = selectedHistory.size;
    const ok = await confirmDialog("Delete history", `Delete ${count} saved workout${count === 1 ? "" : "s"}?`, "Delete");
    if (!ok) return;
    Array.from(selectedHistory).forEach(deleteWorkoutSession);
    selectedHistory = new Set();
    saveState();
    render();
    showToast(`Deleted ${count} history entr${count === 1 ? "y" : "ies"}.`);
  }

  function importData(payload) {
    const incoming = normalizeData(payload);
    let routineCount = 0;
    Object.entries(incoming.routines).forEach(([name, rows]) => {
      if (!state.routines[name]) {
        state.routines[name] = rows;
        routineCount += 1;
      }
    });

    const mergeById = (field) => {
      const existing = new Set(state[field].map((item) => item.id));
      let count = 0;
      incoming[field].forEach((item) => {
        if (existing.has(item.id)) return;
        state[field].push(item);
        existing.add(item.id);
        count += 1;
      });
      return count;
    };
    mergeById("exercises");
    mergeById("routine_definitions");
    const sessionCount = mergeById("workout_sessions");
    mergeById("workout_exercises");
    mergeById("workout_sets");

    const logKeys = new Set(state.routine_logs.map((log) => log.session_id || `${log.date}::${log.routine}::${log.exercises?.length || 0}`));
    let logCount = 0;
    let skipped = 0;
    incoming.routine_logs.forEach((log) => {
      const key = log.session_id || `${log.date}::${log.routine}::${log.exercises?.length || 0}`;
      if (!log.date || logKeys.has(key)) {
        skipped += 1;
        return;
      }
      state.routine_logs.push(log);
      logKeys.add(key);
      logCount += 1;
    });
    state = workoutHistory.ensureHistoricalModel(state, { today: TODAY });
    saveState();
    render();
    showToast(`Imported ${routineCount} routines and ${sessionCount || logCount} workouts. Skipped ${skipped}.`);
  }

  importFile.addEventListener("change", async () => {
    const file = importFile.files?.[0];
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      importData(payload);
    } catch (_error) {
      showToast("Import failed. Select a valid JSON file.");
    } finally {
      importFile.value = "";
    }
  });

  function exercisePoints() {
    const points = [];
    historySessions().forEach((session) => {
      workoutHistory.sessionRows(state, session.id).forEach((item) => {
        item.sets.filter((set) => set.completed).forEach((set) => {
          points.push({
            date: String(session.completed_at || session.started_at || "").slice(0, 10),
            routine: session.routine_name,
            exercise: item.exercise,
            weight: set.weight,
            reps: set.reps,
            numericWeight: Number(set.weight) || 0,
            tooltip: `${item.exercise}\nWeight: ${set.weight}\nReps: ${set.reps}`,
          });
        });
      });
    });
    return points.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  function pbPoints() {
    const points = [];
    historySessions().forEach((session) => {
      workoutHistory.sessionRows(state, session.id).filter((item) => item.track_pb).forEach((item) => {
        if (!item.exercise) return;
        const summary = workoutHistory.formatSetSummary(item.sets);
        points.push({
          date: String(session.completed_at || session.started_at || "").slice(0, 10),
          routine: session.routine_name,
          exercise: item.exercise,
          weight: item.sets[0]?.weight || "",
          reps: summary,
          numericWeight: Number(item.sets[0]?.weight) || 0,
          tooltip: `${item.exercise}\nPB Sets: ${summary}`,
        });
      });
    });
    return points.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  function parseRepsForSummary(value) {
    const text = String(value || "").trim().toLowerCase().replace(/x/g, "x").replace(/[–—]/g, "-");
    const match = text.match(/(\d+)\s*(?:x|sets?\s*x?)\s*(\d+)(?:\s*-\s*(\d+))?/);
    if (match) {
      const sets = Number(match[1]);
      const low = Number(match[2]);
      const high = match[3] ? Number(match[3]) : low;
      return { sets, reps: (low + high) / 2 };
    }
    const single = text.match(/\d+/);
    return single ? { sets: 1, reps: Number(single[0]) } : { sets: 0, reps: 0 };
  }

  function summarizeRoutineLog(log) {
    let totalSets = 0;
    let totalReps = 0;
    let totalWeight = 0;
    log.exercises.forEach((item) => {
      if (Array.isArray(item.sets) && item.sets.length) {
        item.sets.forEach((set) => {
          const weight = Number(set.weight) || 0;
          const reps = Number(set.reps) || 0;
          if (reps <= 0) return;
          totalSets += 1;
          totalReps += reps;
          totalWeight += weight * reps;
        });
      } else {
        const weight = Number(item.weight) || 0;
        const parsed = parseRepsForSummary(item.reps);
        if (parsed.sets <= 0 || parsed.reps <= 0) return;
        totalSets += parsed.sets;
        totalReps += parsed.sets * parsed.reps;
        totalWeight += weight * parsed.sets * parsed.reps;
      }
    });
    return {
      date: log.date,
      routine: log.routine,
      totalWeight,
      totalSets,
      averageReps: totalSets ? totalReps / totalSets : 0,
    };
  }

  function routineSummaries(routine) {
    return historySessions()
      .filter((session) => session.routine_name === routine)
      .map((session) => {
        let totalSets = 0;
        let totalReps = 0;
        let totalWeight = 0;
        workoutHistory.sessionRows(state, session.id).forEach((row) => {
          row.sets.filter((set) => set.completed).forEach((set) => {
            const reps = Number(set.reps) || 0;
            const weight = Number(set.weight) || 0;
            if (reps <= 0) return;
            totalSets += 1;
            totalReps += reps;
            totalWeight += weight * reps;
          });
        });
        return {
          date: String(session.completed_at || session.started_at || "").slice(0, 10),
          routine: session.routine_name,
          totalWeight,
          totalSets,
          averageReps: totalSets ? totalReps / totalSets : 0,
        };
      })
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }

  function dataGroups() {
    const routines = routineNames();
    const exerciseSet = new Set(exercisePoints().map((point) => point.exercise));
    Object.values(state.routines).forEach((rows) => rows.forEach((row) => exerciseSet.add(row.exercise)));
    const routineExercises = {};
    const assigned = new Set();
    routines.forEach((routine) => {
      const names = new Set((state.routines[routine] || []).map((row) => row.exercise).filter(Boolean));
      state.routine_logs
        .filter((log) => log.routine === routine)
        .forEach((log) => log.exercises.forEach((item) => names.add(item.exercise)));
      routineExercises[routine] = Array.from(names).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
      routineExercises[routine].forEach((name) => assigned.add(name));
    });
    const other = Array.from(exerciseSet)
      .filter((name) => name && !assigned.has(name))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    return { routines, routineExercises, other };
  }

  function ensureDataSelection(groups) {
    if (dataSelection.kind === "routine" && groups.routines.includes(dataSelection.value)) return;
    if (dataSelection.kind === "exercise") {
      const allExercises = [...Object.values(groups.routineExercises).flat(), ...groups.other];
      if (allExercises.includes(dataSelection.value)) return;
    }
    if (groups.routines.length) dataSelection = { kind: "routine", value: groups.routines[0] };
    else if (groups.other.length) dataSelection = { kind: "exercise", value: groups.other[0] };
    else dataSelection = { kind: "", value: "" };
  }

  function renderDataPage() {
    const groups = dataGroups();
    ensureDataSelection(groups);
    const chartPoints = selectedChartPoints();
    const historyPoints = selectedPbHistory();
    return `
      <section class="data-page">
        <div class="data-selector">
          <button class="data-selector-button" type="button" data-action="toggle-data-menu">${escapeHtml(dataSelection.value || "Select Data")}</button>
          <div class="data-menu" data-data-menu hidden>
            ${groups.routines
              .map(
                (routine) => `
                  <button class="data-option group" type="button" data-kind="routine" data-value="${escapeAttr(routine)}">${escapeHtml(routine)}</button>
                  ${groups.routineExercises[routine]
                    .map(
                      (exercise) =>
                        `<button class="data-option child" type="button" data-kind="exercise" data-value="${escapeAttr(exercise)}">${escapeHtml(exercise)}</button>`
                    )
                    .join("")}
                `
              )
              .join("")}
            <button class="data-option group" type="button" data-action="noop">Other</button>
            ${groups.other
              .map(
                (exercise) =>
                  `<button class="data-option child" type="button" data-kind="exercise" data-value="${escapeAttr(exercise)}">${escapeHtml(exercise)}</button>`
              )
              .join("")}
          </div>
        </div>
        ${renderTrendChart(chartPoints)}
        <p class="section-label">PB History</p>
        <div class="history-list">
          <table>
            <colgroup>
              <col class="history-date">
              <col class="history-exercise">
              <col class="history-weight">
              <col class="history-reps">
            </colgroup>
            <thead><tr><th>Date</th><th>Exercise</th><th>Weight</th><th>Reps</th></tr></thead>
            <tbody>
              ${
                historyPoints.length
                  ? historyPoints
                      .map(
                        (point) =>
                          `<tr><td>${escapeHtml(point.date)}</td><td>${escapeHtml(point.exercise)}</td><td>${escapeHtml(formatWeight(point.weight))}</td><td>${escapeHtml(point.reps)}</td></tr>`
                      )
                      .join("")
                  : '<tr><td colspan="4" class="muted">No PB history yet.</td></tr>'
              }
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function selectedChartPoints() {
    if (dataSelection.kind === "routine") {
      return routineSummaries(dataSelection.value).map((summary) => ({
        date: summary.date,
        label: summary.routine,
        value: summary.totalWeight,
        tooltip: `${summary.routine}\nTotal Moved: ${formatWeight(summary.totalWeight)}\nSets: ${summary.totalSets}, Avg Reps: ${formatWhole(summary.averageReps)}`,
      }));
    }
    if (dataSelection.kind === "exercise") {
      return exercisePoints()
        .filter((point) => point.exercise === dataSelection.value)
        .map((point) => ({
          date: point.date,
          label: point.exercise,
          value: point.numericWeight,
          tooltip: point.tooltip,
        }));
    }
    return [];
  }

  function selectedPbHistory() {
    const points = pbPoints();
    if (dataSelection.kind === "routine") return points.filter((point) => point.routine === dataSelection.value);
    if (dataSelection.kind === "exercise") return points.filter((point) => point.exercise === dataSelection.value);
    return points;
  }

  function renderTrendChart(points) {
    const usable = points.filter((point) => Number(point.value) > 0).slice().reverse();
    if (usable.length < 2) {
      return '<div class="chart-panel"><div class="chart-message">Save this item twice to see a trend.</div></div>';
    }
    const width = 360;
    const height = 190;
    const padX = 38;
    const padY = 28;
    const values = usable.map((point) => Number(point.value));
    let low = Math.min(...values) * 0.92;
    let high = Math.max(...values) * 1.08;
    if (low === high) high += 1;
    const plotW = width - padX * 2;
    const plotH = height - padY * 2;
    const coords = usable.map((point, index) => {
      const x = padX + (plotW * index) / (usable.length - 1);
      const y = padY + plotH * (1 - (Number(point.value) - low) / (high - low));
      return { x, y, point };
    });
    const path = coords.map((coord, index) => `${index ? "L" : "M"} ${coord.x.toFixed(2)} ${coord.y.toFixed(2)}`).join(" ");
    const grid = [0, 1, 2, 3]
      .map((index) => {
        const y = padY + (plotH * index) / 3;
        return `<line x1="${padX}" y1="${y}" x2="${width - padX}" y2="${y}" stroke="#1d2a25" stroke-width="1"></line>`;
      })
      .join("");
    const circles = coords
      .map(
        ({ x, y, point }) =>
          `<circle class="chart-point" cx="${x}" cy="${y}" r="4" fill="#22c76d" data-tip="${escapeAttr(point.tooltip)}"></circle>`
      )
      .join("");
    return `
      <div class="chart-panel" data-chart-panel>
        <svg class="trend-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
          ${grid}
          <path d="${path}" fill="none" stroke="#22c76d" stroke-width="3"></path>
          ${circles}
          <text x="${padX}" y="18" fill="#8ea0b8" font-size="10">${escapeHtml(formatWeight(values[0]))} lb</text>
          <text x="${width - padX}" y="18" fill="#f4faf6" font-size="10" text-anchor="end">${escapeHtml(formatWeight(values[values.length - 1]))} lb</text>
        </svg>
        <div class="chart-tooltip" data-chart-tooltip hidden></div>
      </div>
    `;
  }

  function bindDataPage() {
    const menuButton = app.querySelector("[data-action='toggle-data-menu']");
    const menu = app.querySelector("[data-data-menu]");
    menuButton.addEventListener("click", () => {
      menu.hidden = !menu.hidden;
    });
    app.querySelectorAll("[data-kind]").forEach((button) => {
      button.addEventListener("click", () => {
        dataSelection = { kind: button.dataset.kind, value: button.dataset.value };
        render();
      });
    });
    app.querySelectorAll("[data-action='noop']").forEach((button) => {
      button.addEventListener("click", () => {
        menu.hidden = true;
      });
    });

    const panel = app.querySelector("[data-chart-panel]");
    if (panel) {
      const tooltip = panel.querySelector("[data-chart-tooltip]");
      panel.querySelectorAll(".chart-point").forEach((point) => {
        const show = (event) => {
          tooltip.textContent = point.dataset.tip;
          tooltip.hidden = false;
          const panelBox = panel.getBoundingClientRect();
          const tipBox = tooltip.getBoundingClientRect();
          let left = event.clientX - panelBox.left + 12;
          let top = event.clientY - panelBox.top - tipBox.height - 12;
          if (left + tipBox.width + 8 > panelBox.width) left = panelBox.width - tipBox.width - 8;
          if (top < 8) top = event.clientY - panelBox.top + 12;
          if (top + tipBox.height + 8 > panelBox.height) top = panelBox.height - tipBox.height - 8;
          tooltip.style.left = `${Math.max(8, left)}px`;
          tooltip.style.top = `${Math.max(8, top)}px`;
        };
        point.addEventListener("pointerenter", show);
        point.addEventListener("pointermove", show);
        point.addEventListener("click", show);
      });
      panel.addEventListener("pointerleave", () => {
        tooltip.hidden = true;
      });
    }
  }

  function bindFloatingScroll(list, float) {
    if (!list || !float) return;
    let fadeTimer = null;
    const update = () => {
      if (list.scrollHeight <= list.clientHeight + 2) return;
      const box = list.getBoundingClientRect();
      const ratio = list.clientHeight / list.scrollHeight;
      const topRatio = list.scrollTop / (list.scrollHeight - list.clientHeight);
      const thumbHeight = Math.max(30, box.height * ratio);
      float.style.height = `${thumbHeight}px`;
      float.style.top = `${box.top + (box.height - thumbHeight) * topRatio}px`;
      float.classList.add("visible");
      window.clearTimeout(fadeTimer);
      fadeTimer = window.setTimeout(() => float.classList.remove("visible"), 380);
    };
    list.addEventListener("scroll", update, { passive: true });
  }

  function bindPressFeedback() {
    let pressedButton = null;
    const clearPressed = () => {
      if (!pressedButton) return;
      pressedButton.classList.remove("is-pressing");
      pressedButton = null;
    };

    document.addEventListener("pointerdown", (event) => {
      const button = event.target.closest("button");
      if (!button || button.disabled) return;
      clearPressed();
      pressedButton = button;
      button.classList.add("is-pressing");
    });
    document.addEventListener("pointerup", clearPressed);
    document.addEventListener("pointercancel", clearPressed);
    document.addEventListener("click", () => window.setTimeout(clearPressed, 90));
    document.addEventListener("keydown", (event) => {
      if (!["Enter", " "].includes(event.key) || event.target?.tagName !== "BUTTON" || event.target.disabled) return;
      event.target.classList.add("is-pressing");
      window.setTimeout(() => event.target.classList.remove("is-pressing"), 120);
    });
  }

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".data-selector")) {
      const dataMenu = app.querySelector("[data-data-menu]");
      if (dataMenu) dataMenu.hidden = true;
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      const backdrop = document.getElementById("confirm-backdrop");
      if (!backdrop.hidden) document.getElementById("confirm-cancel").click();
      if (routineImagePickerOpen) {
        routineImagePickerOpen = false;
        render();
      }
      const dataMenu = app.querySelector("[data-data-menu]");
      if (dataMenu) dataMenu.hidden = true;
    }
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("sw.js?v=68", { updateViaCache: "none" })
        .then((registration) => registration.update())
        .catch(() => {});
    });
  }

  bindPressFeedback();
  render();
  initCloudAuth();
})();
