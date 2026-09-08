(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.FitNoteHistory = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const HISTORY_SCHEMA_VERSION = 2;
  const PRESET_EXERCISE_NAMES = [
    "Barbell Bench Press",
    "Incline Barbell Bench Press",
    "Decline Barbell Bench Press",
    "Dumbbell Bench Press",
    "Incline Dumbbell Bench Press",
    "Decline Dumbbell Bench Press",
    "Smith Machine Bench Press",
    "Smith Machine Incline Bench Press",
    "Machine Chest Press",
    "Incline Machine Chest Press",
    "Cable Chest Press",
    "Single-Arm Cable Chest Press",
    "Dumbbell Chest Fly",
    "Incline Dumbbell Chest Fly",
    "Cable Chest Fly",
    "Low-to-High Cable Chest Fly",
    "High-to-Low Cable Chest Fly",
    "Pec Deck Fly",
    "Push-Up",
    "Incline Push-Up",
    "Decline Push-Up",
    "Chest Dip",
    "Pull-Up",
    "Chin-Up",
    "Wide-Grip Lat Pulldown",
    "Close-Grip Lat Pulldown",
    "Neutral-Grip Lat Pulldown",
    "Single-Arm Cable Lat Pulldown",
    "Straight-Arm Cable Pulldown",
    "Barbell Bent-Over Row",
    "Underhand Barbell Row",
    "Pendlay Row",
    "Single-Arm Dumbbell Row",
    "Chest-Supported Dumbbell Row",
    "Seated Cable Row",
    "Single-Arm Cable Row",
    "Chest-Supported Cable Row",
    "High Cable Row",
    "Machine Row",
    "Chest-Supported Machine Row",
    "T-Bar Row",
    "Landmine Row",
    "Inverted Row",
    "Dumbbell Pullover",
    "Face Pull",
    "Barbell Shrug",
    "Dumbbell Shrug",
    "Cable Shrug",
    "Back Extension",
    "Reverse Hyperextension",
    "Standing Barbell Overhead Press",
    "Seated Barbell Overhead Press",
    "Standing Dumbbell Shoulder Press",
    "Seated Dumbbell Shoulder Press",
    "Arnold Press",
    "Machine Shoulder Press",
    "Smith Machine Shoulder Press",
    "Single-Arm Cable Shoulder Press",
    "Barbell Push Press",
    "Dumbbell Front Raise",
    "Cable Front Raise",
    "Dumbbell Lateral Raise",
    "Cable Lateral Raise",
    "Machine Lateral Raise",
    "Dumbbell Rear Delt Fly",
    "Cable Reverse Fly",
    "Reverse Pec Deck Fly",
    "Incline Bench Rear Delt Raise",
    "Cable External Rotation",
    "Cable Internal Rotation",
    "Barbell Curl",
    "EZ-Bar Curl",
    "Dumbbell Curl",
    "Incline Dumbbell Curl",
    "Barbell Preacher Curl",
    "EZ-Bar Preacher Curl",
    "Dumbbell Preacher Curl",
    "Cable Curl",
    "Single-Arm Cable Curl",
    "Dumbbell Hammer Curl",
    "Cable Hammer Curl",
    "Dumbbell Concentration Curl",
    "EZ-Bar Spider Curl",
    "Reverse Barbell Curl",
    "Reverse EZ-Bar Curl",
    "Cable Triceps Pushdown",
    "Single-Arm Cable Triceps Pushdown",
    "Reverse-Grip Cable Triceps Pushdown",
    "Overhead Cable Triceps Extension",
    "Single-Arm Overhead Cable Triceps Extension",
    "Dumbbell Overhead Triceps Extension",
    "EZ-Bar Lying Triceps Extension",
    "Dumbbell Lying Triceps Extension",
    "Close-Grip Barbell Bench Press",
    "Close-Grip Push-Up",
    "Triceps Dip",
    "Barbell Wrist Curl",
    "Barbell Reverse Wrist Curl",
    "Dumbbell Wrist Curl",
    "Dumbbell Reverse Wrist Curl",
    "Barbell Back Squat",
    "Barbell Front Squat",
    "Barbell Box Squat",
    "Goblet Squat",
    "Dumbbell Squat",
    "Smith Machine Squat",
    "Hack Squat Machine",
    "Barbell Hack Squat",
    "Leg Press",
    "Belt Squat",
    "Bodyweight Squat",
    "Barbell Conventional Deadlift",
    "Barbell Sumo Deadlift",
    "Barbell Romanian Deadlift",
    "Dumbbell Romanian Deadlift",
    "Barbell Stiff-Leg Deadlift",
    "Trap-Bar Deadlift",
    "Barbell Hip Thrust",
    "Dumbbell Hip Thrust",
    "Barbell Glute Bridge",
    "Cable Pull-Through",
    "Barbell Good Morning",
    "Bodyweight Split Squat",
    "Dumbbell Split Squat",
    "Barbell Reverse Lunge",
    "Dumbbell Reverse Lunge",
    "Dumbbell Walking Lunge",
    "Dumbbell Bulgarian Split Squat",
    "Dumbbell Step-Up",
    "Bodyweight Step-Up",
    "Single-Leg Dumbbell Romanian Deadlift",
    "Machine Leg Extension",
    "Seated Leg Curl Machine",
    "Lying Leg Curl Machine",
    "Standing Single-Leg Curl Machine",
    "Cable Standing Leg Curl",
    "Nordic Hamstring Curl",
    "Glute-Ham Raise",
    "Machine Hip Abduction",
    "Machine Hip Adduction",
    "Cable Standing Hip Abduction",
    "Cable Standing Hip Adduction",
    "Cable Glute Kickback",
    "Machine Glute Kickback",
    "Barbell Standing Calf Raise",
    "Dumbbell Standing Calf Raise",
    "Machine Standing Calf Raise",
    "Machine Seated Calf Raise",
    "Leg Press Calf Raise",
    "Bodyweight Single-Leg Calf Raise",
    "Floor Crunch",
    "Cable Crunch",
    "Reverse Crunch",
    "Bicycle Crunch",
    "Sit-Up",
    "Decline Bench Sit-Up",
    "Hanging Knee Raise",
    "Hanging Leg Raise",
    "Captain's Chair Knee Raise",
    "Ab Wheel Rollout",
    "Plank",
    "Side Plank",
    "Dead Bug",
    "Bird Dog",
    "Cable Pallof Press",
    "Cable Wood Chop",
    "Cable Reverse Wood Chop",
    "Dumbbell Russian Twist",
    "Dumbbell Side Bend",
    "Dumbbell Farmer's Carry",
    "Barbell Power Clean",
    "Barbell Hang Power Clean",
    "Barbell Clean",
    "Barbell Clean and Jerk",
    "Barbell Power Snatch",
    "Barbell Snatch",
    "Barbell Hang Power Snatch",
    "Barbell Push Jerk",
    "Barbell Split Jerk",
    "Barbell Thruster",
    "Dumbbell Thruster",
    "Kettlebell Swing",
    "Kettlebell Clean and Press",
    "Dumbbell Renegade Row",
    "Burpee",
    "Treadmill Walking",
    "Incline Treadmill Walking",
    "Treadmill Running",
    "Outdoor Walking",
    "Outdoor Running",
    "Stationary Cycling",
    "Outdoor Cycling",
    "Air Bike",
    "Elliptical Trainer",
    "Rowing Machine",
    "Stair Climber",
    "Jump Rope",
    "Swimming Freestyle",
    "Swimming Breaststroke",
    "Sled Push",
  ];
  const EXERCISE_ALIASES = {
    "back extensions": "Back Extension",
    "back squat": "Barbell Back Squat",
    "barbell row": "Barbell Bent-Over Row",
    "bench press": "Barbell Bench Press",
    "bulgarian split squat": "Dumbbell Bulgarian Split Squat",
    "cable row single arm": "Single-Arm Cable Row",
    "cable pull through": "Cable Pull-Through",
    "cable lateral raise": "Cable Lateral Raise",
    "cable triceps pushdown": "Cable Triceps Pushdown",
    "calf raises": "Machine Standing Calf Raise",
    "face pulls": "Face Pull",
    "hammer curl single arm": "Dumbbell Hammer Curl",
    "hammer curl cable single arm": "Cable Hammer Curl",
    "incline barbell press": "Incline Barbell Bench Press",
    "incline bench": "Incline Barbell Bench Press",
    "lat pulldown": "Wide-Grip Lat Pulldown",
    "machine press": "Machine Chest Press",
    "overhead cable triceps extension": "Overhead Cable Triceps Extension",
    "preacher curl": "EZ-Bar Preacher Curl",
    "romanian deadlift": "Barbell Romanian Deadlift",
    "seated shoulder press": "Seated Dumbbell Shoulder Press",
    "squat": "Barbell Back Squat",
    "standing shoulder": "Standing Barbell Overhead Press",
    "standing shoulder press": "Standing Barbell Overhead Press",
  };

  function exerciseKey(name) {
    return String(name || "")
      .trim()
      .toLocaleLowerCase()
      .replace(/[\u2010-\u2015]/g, "-")
      .replace(/\b1\s*arm\b/g, "single-arm")
      .replace(/\bone\s*arm\b/g, "single-arm")
      .replace(/\btricep\b/g, "triceps")
      .replace(/\bshoulde\b/g, "shoulder")
      .replace(/\brais\b/g, "raise")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function presetExerciseNames() {
    return PRESET_EXERCISE_NAMES.slice().sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }

  function isPlaceholderExerciseName(name) {
    return ["exercise", "new exercise"].includes(exerciseKey(name));
  }

  function matchingPresetExerciseName(name) {
    const key = exerciseKey(name);
    if (!key) return "";
    const direct = PRESET_EXERCISE_NAMES.find((item) => exerciseKey(item) === key);
    if (direct) return direct;
    const alias = EXERCISE_ALIASES[key];
    if (alias) return alias;
    const startsWithMatches = PRESET_EXERCISE_NAMES.filter((item) => exerciseKey(item).startsWith(key));
    if (startsWithMatches.length === 1) return startsWithMatches[0];
    return "";
  }

  function canonicalExerciseName(name) {
    const text = String(name ?? "").trim();
    if (!text) return "";
    return matchingPresetExerciseName(text) || text;
  }

  function presetExerciseId(name) {
    return stableId("ex", canonicalExerciseName(name));
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function todayIso(now = new Date()) {
    return now.toISOString().slice(0, 10);
  }

  function nowIso(now = new Date()) {
    return now.toISOString();
  }

  function hashParts(parts) {
    const text = parts.map((part) => String(part ?? "")).join("\u001f");
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function stableId(prefix, ...parts) {
    return `${prefix}_${hashParts(parts)}`;
  }

  function randomId(prefix) {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function boolFromData(value) {
    if (typeof value === "string") return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
    return Boolean(value);
  }

  function formatWeight(value) {
    if (value === "" || value === null || value === undefined) return "";
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return String(value);
    const rounded = Math.round(parsed * 10) / 10;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }

  function cleanText(value, fallback = "") {
    const text = String(value ?? "").trim();
    return text || fallback;
  }

  function normalizeExerciseRow(row = {}) {
    const weight = row.weight ?? row.target_weight ?? "";
    const rawExercise = String(row.exercise ?? row.name ?? "").trim();
    const exercise = rawExercise && !isPlaceholderExerciseName(rawExercise) ? canonicalExerciseName(rawExercise) : "";
    return {
      exercise_id: exercise ? presetExerciseId(exercise) : row.exercise_id || "",
      exercise,
      weight: weight === "" ? "" : formatWeight(weight),
      reps: String(row.reps ?? row.target_reps ?? "").trim(),
      track_pb: boolFromData(row.track_pb),
      active: row.active === undefined ? true : boolFromData(row.active),
    };
  }

  function parseSetScheme(repsValue) {
    const original = String(repsValue ?? "").trim();
    if (!original) return [{ reps: "" }];
    const text = original.toLowerCase().replace(/\u00d7/g, "x").replace(/[\u2013\u2014]/g, "-");
    const match = text.match(/^(\d+)\s*x\s*(.+)$/);
    if (match) {
      const count = Math.max(1, Number(match[1]) || 1);
      const reps = match[2].trim();
      return Array.from({ length: count }, () => ({ reps }));
    }
    return [{ reps: original }];
  }

  function setSort(a, b) {
    return Number(a.set_number || 0) - Number(b.set_number || 0);
  }

  function sessionSortDesc(a, b) {
    const left = String(a.completed_at || a.started_at || "");
    const right = String(b.completed_at || b.started_at || "");
    return right.localeCompare(left);
  }

  function routinesFromLegacy(data) {
    const groups = data.groups || data.routines || {};
    const routines = {};
    Object.entries(groups).forEach(([name, rows]) => {
      routines[name] = Array.isArray(rows) ? rows.map(normalizeExerciseRow) : [];
    });
    return routines;
  }

  function logsFromLegacySets(data, existingKeys = new Set()) {
    const byKey = new Map();
    (data.sets || []).forEach((item, index) => {
      const routine = cleanText(item.routine || item.exercise_group, "Imported");
      const logDate = cleanText(item.date, todayIso());
      const key = `${logDate}::${routine}`;
      if (existingKeys.has(key)) return;
      if (!byKey.has(key)) byKey.set(key, { date: logDate, routine, exercises: [], pb_entries: [] });
      byKey.get(key).exercises.push(normalizeExerciseRow(item));
    });
    return Array.from(byKey.values());
  }

  function normalizeLegacyLogs(data) {
    const logs = Array.isArray(data.routine_logs) ? data.routine_logs : [];
    const normalized = logs.map((log) => ({
      date: cleanText(log.date, todayIso()),
      routine: cleanText(log.routine, "Workout"),
      exercises: Array.isArray(log.exercises)
        ? log.exercises.map((row) => {
            const normalizedRow = {
              ...normalizeExerciseRow(row),
              workout_exercise_id: row.workout_exercise_id || undefined,
              sets: Array.isArray(row.sets)
                ? row.sets.map((set) => ({
                    id: set.id || undefined,
                    set_number: Number(set.set_number || 0) || undefined,
                    weight: formatWeight(set.weight ?? row.weight ?? ""),
                    reps: String(set.reps ?? "").trim(),
                    completed: set.completed === undefined ? true : boolFromData(set.completed),
                    timestamp: set.timestamp || "",
                  }))
                : undefined,
            };
            Object.keys(normalizedRow).forEach((key) => normalizedRow[key] === undefined && delete normalizedRow[key]);
            return normalizedRow;
          })
        : [],
      pb_entries: Array.isArray(log.pb_entries) ? clone(log.pb_entries) : [],
      session_id: log.session_id || undefined,
      completed_at: log.completed_at || undefined,
      notes: log.notes || undefined,
    }));
    const existingKeys = new Set(normalized.map((log) => `${log.date}::${log.routine}`));
    return normalized.concat(logsFromLegacySets(data, existingKeys));
  }

  function ensureExercise(data, row, metadata = {}) {
    const name = canonicalExerciseName(row.exercise || row.name);
    if (!name || isPlaceholderExerciseName(name)) return "";
    const matchedByName = data.exercises.find((exercise) => exercise.name.localeCompare(name, undefined, { sensitivity: "accent" }) === 0);
    const id = presetExerciseId(name);
    if (!data.exercises.some((exercise) => exercise.id === id)) {
      data.exercises.push({
        id,
        name,
        category: row.category || metadata.routine || "",
        equipment: row.equipment || "",
        active: row.active === undefined ? true : boolFromData(row.active),
      });
    } else if (matchedByName && !matchedByName.active && row.active !== false) {
      matchedByName.active = true;
    }
    return id;
  }

  function presetNameFromId(id) {
    return PRESET_EXERCISE_NAMES.find((name) => presetExerciseId(name) === id) || "";
  }

  function normalizeExerciseReferences(data) {
    const sourceNames = new Map();
    (data.exercises || []).forEach((exercise) => {
      if (exercise?.id && exercise?.name) sourceNames.set(exercise.id, exercise.name);
    });
    const resolveExercise = (name, id) => {
      const sourceName = name || sourceNames.get(id) || presetNameFromId(id) || "";
      if (!String(sourceName || "").trim()) return null;
      if (isPlaceholderExerciseName(sourceName)) return null;
      const resolvedName = canonicalExerciseName(sourceName);
      return { id: presetExerciseId(resolvedName), name: resolvedName };
    };

    const usedExercises = new Map();
    const rememberExercise = (resolved, source = {}) => {
      if (!resolved) return;
      const existing = usedExercises.get(resolved.id);
      if (existing) {
        existing.active = existing.active || source.active !== false;
        if (!existing.category && source.category) existing.category = source.category;
        if (!existing.equipment && source.equipment) existing.equipment = source.equipment;
        return;
      }
      usedExercises.set(resolved.id, {
        id: resolved.id,
        name: resolved.name,
        category: source.category || "",
        equipment: source.equipment || "",
        active: source.active === undefined ? true : boolFromData(source.active),
      });
    };

    Object.keys(data.routines || {}).forEach((routineName) => {
      data.routines[routineName] = (data.routines[routineName] || []).map((row) => {
        const resolved = resolveExercise(row.exercise || row.name, row.exercise_id);
        if (!resolved) return { ...row, exercise_id: "", exercise: "" };
        rememberExercise(resolved, row);
        return { ...row, exercise_id: resolved.id, exercise: resolved.name };
      });
    });
    (data.routine_definitions || []).forEach((routine) => {
      routine.exercises = (routine.exercises || []).filter((exercise) => {
        const resolved = resolveExercise(exercise.exercise || exercise.name, exercise.exercise_id);
        if (!resolved) return false;
        exercise.exercise_id = resolved.id;
        rememberExercise(resolved, exercise);
        return true;
      });
    });
    (data.workout_exercises || []).forEach((exercise) => {
      const resolved = resolveExercise(exercise.exercise_name || exercise.exercise || exercise.name, exercise.exercise_id);
      if (!resolved) return;
      exercise.exercise_id = resolved.id;
      exercise.exercise_name = resolved.name;
      rememberExercise(resolved, exercise);
    });
    (data.routine_logs || []).forEach((log) => {
      (log.exercises || []).forEach((exercise) => {
        const resolved = resolveExercise(exercise.exercise || exercise.name, exercise.exercise_id);
        if (!resolved) return;
        exercise.exercise_id = resolved.id;
        exercise.exercise = resolved.name;
        rememberExercise(resolved, exercise);
      });
      (log.pb_entries || []).forEach((entry) => {
        const resolved = resolveExercise(entry.exercise || entry.name, entry.exercise_id);
        if (!resolved) return;
        entry.exercise_id = resolved.id;
        entry.exercise = resolved.name;
        rememberExercise(resolved, entry);
      });
    });
    data.exercises = Array.from(usedExercises.values()).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }

  function compactHistoricalModel(data) {
    delete data.app;
    delete data.exported_on;
    delete data.groups;
    delete data.sets;
    delete data.selected_group;
    delete data.deleted_groups;

    data.exercises = (data.exercises || []).map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      category: exercise.category || "",
      equipment: exercise.equipment || "",
      active: exercise.active !== false,
    }));
    const exerciseIds = new Set(data.exercises.map((exercise) => exercise.id));

    data.routine_definitions = (data.routine_definitions || []).map((routine) => ({
      id: routine.id,
      name: routine.name,
      category: routine.category || routine.name || "",
      exercises: (routine.exercises || [])
        .filter((exercise) => exerciseIds.has(exercise.exercise_id))
        .map((exercise, index) => ({
          exercise_id: exercise.exercise_id,
          order: Number(exercise.order || index + 1),
          default_weight: formatWeight(exercise.default_weight ?? ""),
          default_reps: String(exercise.default_reps ?? ""),
          track_pb: boolFromData(exercise.track_pb),
          active: exercise.active !== false,
        })),
      active: routine.active !== false,
    }));
    const routineIds = new Set(data.routine_definitions.map((routine) => routine.id));

    data.workout_sessions = (data.workout_sessions || [])
      .filter((session) => session.id && session.routine_name && routineIds.has(session.routine_id))
      .map((session) => ({
        id: session.id,
        routine_id: session.routine_id,
        routine_name: session.routine_name,
        started_at: session.started_at || "",
        completed_at: session.completed_at || "",
        status: session.status || "active",
        notes: session.notes || "",
      }));
    const sessionIds = new Set(data.workout_sessions.map((session) => session.id));

    data.workout_exercises = (data.workout_exercises || [])
      .filter((exercise) => exercise.id && sessionIds.has(exercise.workout_session_id) && exerciseIds.has(exercise.exercise_id))
      .map((exercise) => ({
        id: exercise.id,
        workout_session_id: exercise.workout_session_id,
        exercise_id: exercise.exercise_id,
        exercise_name: exercise.exercise_name,
        order: Number(exercise.order || 0),
        track_pb: boolFromData(exercise.track_pb),
      }));
    const workoutExerciseIds = new Set(data.workout_exercises.map((exercise) => exercise.id));

    data.workout_sets = (data.workout_sets || [])
      .filter((set) => set.id && workoutExerciseIds.has(set.workout_exercise_id))
      .map((set) => ({
        id: set.id,
        workout_exercise_id: set.workout_exercise_id,
        set_number: Number(set.set_number || 0),
        weight: formatWeight(set.weight ?? ""),
        reps: String(set.reps ?? ""),
        completed: boolFromData(set.completed),
        timestamp: set.timestamp || "",
      }));

    data.routine_logs = (data.routine_logs || []).map((log) => {
      const cleanLog = {
        date: log.date,
        routine: log.routine,
        exercises: (log.exercises || [])
          .filter((exercise) => exerciseIds.has(exercise.exercise_id))
          .map((exercise) => ({
            exercise_id: exercise.exercise_id,
            exercise: exercise.exercise,
            weight: formatWeight(exercise.weight ?? ""),
            reps: String(exercise.reps ?? ""),
            track_pb: boolFromData(exercise.track_pb),
            workout_exercise_id: exercise.workout_exercise_id || undefined,
            sets: Array.isArray(exercise.sets)
              ? exercise.sets.map((set) => ({
                  id: set.id,
                  set_number: Number(set.set_number || 0),
                  weight: formatWeight(set.weight ?? ""),
                  reps: String(set.reps ?? ""),
                  completed: boolFromData(set.completed),
                  timestamp: set.timestamp || "",
                }))
              : undefined,
          })),
        pb_entries: (log.pb_entries || [])
          .filter((entry) => exerciseIds.has(entry.exercise_id))
          .map((entry) => ({
            exercise_id: entry.exercise_id,
            exercise: entry.exercise,
            weight: formatWeight(entry.weight ?? ""),
            reps: String(entry.reps ?? ""),
          })),
        session_id: log.session_id || undefined,
        completed_at: log.completed_at || undefined,
        notes: log.notes || undefined,
      };
      cleanLog.exercises.forEach((exercise) => {
        Object.keys(exercise).forEach((key) => exercise[key] === undefined && delete exercise[key]);
      });
      Object.keys(cleanLog).forEach((key) => cleanLog[key] === undefined && delete cleanLog[key]);
      return cleanLog;
    });

    data.routine_definitions.forEach((routine) => {
      routine.exercises.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
      routine.exercises.forEach((exercise, index) => {
        exercise.order = index + 1;
      });
    });
    data.workout_sessions.forEach((session) => {
      data.workout_exercises
        .filter((exercise) => exercise.workout_session_id === session.id)
        .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
        .forEach((exercise, index) => {
          exercise.order = index + 1;
        });
    });
    data.workout_exercises.forEach((exercise) => {
      data.workout_sets
        .filter((set) => set.workout_exercise_id === exercise.id)
        .sort((a, b) => Number(a.set_number || 0) - Number(b.set_number || 0))
        .forEach((set, index) => {
          set.set_number = index + 1;
        });
    });
  }

  function ensureRoutineDefinition(data, routineName, rows) {
    const id = stableId("routine", routineName);
    const existing = data.routine_definitions.find((routine) => routine.id === id);
    const exercises = rows
      .map((row) => ({ row, exercise_id: ensureExercise(data, row, { routine: routineName }) }))
      .filter((item) => item.exercise_id)
      .map((item, index) => ({
        exercise_id: item.exercise_id,
        order: index + 1,
        default_weight: item.row.weight,
        default_reps: item.row.reps,
        track_pb: boolFromData(item.row.track_pb),
        active: item.row.active !== false,
      }));
    if (existing) {
      existing.name = routineName;
      existing.category = existing.category || routineName;
      existing.exercises = exercises;
      if (existing.active === undefined) existing.active = true;
      return existing.id;
    }
    data.routine_definitions.push({ id, name: routineName, category: routineName, exercises, active: true });
    return id;
  }

  function normalizeExistingV2(data) {
    data.exercises = Array.isArray(data.exercises) ? data.exercises : [];
    data.routine_definitions = Array.isArray(data.routine_definitions) ? data.routine_definitions : [];
    data.workout_sessions = Array.isArray(data.workout_sessions) ? data.workout_sessions : [];
    data.workout_exercises = Array.isArray(data.workout_exercises) ? data.workout_exercises : [];
    data.workout_sets = Array.isArray(data.workout_sets) ? data.workout_sets : [];
    data.migration_metadata = data.migration_metadata && typeof data.migration_metadata === "object" ? data.migration_metadata : {};
    data.routine_definitions.forEach((routine) => {
      if (!routine || typeof routine !== "object") return;
      (routine.exercises || []).forEach((exercise) => {
        if (!exercise || typeof exercise !== "object") return;
        delete exercise.weight_offset;
      });
    });
    data.workout_exercises.forEach((exercise) => {
      if (!exercise || typeof exercise !== "object") return;
      delete exercise.weight_offset;
    });
    (data.routine_logs || []).forEach((log) => {
      if (!log || typeof log !== "object") return;
      (log.exercises || []).forEach((exercise) => {
        if (!exercise || typeof exercise !== "object") return;
        delete exercise.weight_offset;
      });
    });
  }

  function addLegacySession(data, log, logIndex) {
    const routineId = ensureRoutineDefinition(data, log.routine, data.routines?.[log.routine] || log.exercises || []);
    const sessionId = log.session_id || stableId("session", "legacy-log", log.date, log.routine, logIndex);
    log.session_id = sessionId;
    log.completed_at = log.completed_at || `${log.date}T12:00:00.000Z`;
    if (!data.workout_sessions.some((session) => session.id === sessionId)) {
      data.workout_sessions.push({
        id: sessionId,
        routine_id: routineId,
        routine_name: log.routine,
        started_at: `${log.date}T12:00:00.000Z`,
        completed_at: log.completed_at,
        status: "completed",
        notes: log.notes || "",
      });
    }

    (log.exercises || []).forEach((row, exerciseIndex) => {
      const exerciseId = ensureExercise(data, row, { routine: log.routine });
      if (!exerciseId) return;
      const workoutExerciseId = row.workout_exercise_id || stableId("wex", sessionId, exerciseId, exerciseIndex);
      row.workout_exercise_id = workoutExerciseId;
      if (!data.workout_exercises.some((exercise) => exercise.id === workoutExerciseId)) {
        data.workout_exercises.push({
          id: workoutExerciseId,
          workout_session_id: sessionId,
          exercise_id: exerciseId,
          exercise_name: row.exercise,
          order: exerciseIndex + 1,
          track_pb: boolFromData(row.track_pb),
        });
      }

      const existingSetIds = new Set(data.workout_sets.map((set) => set.id));
      const sourceSets = Array.isArray(row.sets) && row.sets.length ? row.sets : parseSetScheme(row.reps);
      const logSets = [];
      sourceSets.forEach((sourceSet, setIndex) => {
        const setId = sourceSet.id || stableId("set", workoutExerciseId, setIndex + 1, row.weight, sourceSet.reps);
        const normalizedSet = {
          id: setId,
          workout_exercise_id: workoutExerciseId,
          set_number: Number(sourceSet.set_number || setIndex + 1),
          weight: formatWeight(sourceSet.weight ?? row.weight ?? ""),
          reps: String(sourceSet.reps ?? "").trim(),
          completed: sourceSet.completed === undefined ? true : boolFromData(sourceSet.completed),
          timestamp: sourceSet.timestamp || `${log.date}T12:${String(setIndex).padStart(2, "0")}:00.000Z`,
        };
        logSets.push(normalizedSet);
        if (!existingSetIds.has(setId)) data.workout_sets.push(normalizedSet);
      });
      row.sets = logSets;
    });
  }

  function ensureHistoricalModel(input, options = {}) {
    const data = input && typeof input === "object" ? clone(input) : {};
    const inputHadSourceSets = Array.isArray(data.sets);
    normalizeExistingV2(data);
    const previousSourceCounts = data.migration_metadata.source_counts || {};
    data.history_version = HISTORY_SCHEMA_VERSION;
    delete data.settings;
    data.routines = Object.keys(data.routines || {}).length ? data.routines : routinesFromLegacy(data);
    Object.keys(data.routines).forEach((name) => {
      data.routines[name] = Array.isArray(data.routines[name]) ? data.routines[name].map(normalizeExerciseRow) : [];
      if (!data.routines[name].length) data.routines[name] = [normalizeExerciseRow()];
      ensureRoutineDefinition(data, name, data.routines[name]);
    });
    data.selected_routine = data.routines[data.selected_routine] ? data.selected_routine : data.selected_group || Object.keys(data.routines)[0];
    if (!data.routines[data.selected_routine]) data.selected_routine = Object.keys(data.routines)[0] || "";

    const legacyLogs = normalizeLegacyLogs(data);
    data.routine_logs = legacyLogs;
    legacyLogs.forEach((log, index) => addLegacySession(data, log, index));
    normalizeExerciseReferences(data);

    const migratedAt = options.now ? nowIso(options.now) : data.migration_metadata.migrated_at || nowIso();
    const sourceCounts = {
      routines: Object.keys(data.routines || {}).length,
      routine_logs: legacyLogs.length,
      sets: inputHadSourceSets ? data.sets.length : Number(previousSourceCounts.sets || 0),
    };
    data.migration_metadata = {
      version: HISTORY_SCHEMA_VERSION,
      migrated_at: migratedAt,
      source_counts: sourceCounts,
    };
    compactHistoricalModel(data);
    return data;
  }

  function routineByName(data, routineName) {
    return data.routine_definitions.find((routine) => routine.name === routineName) || null;
  }

  function sessionDate(session) {
    return String(session.started_at || session.completed_at || "").slice(0, 10);
  }

  function sessionsForRoutine(data, routineName) {
    const routine = routineByName(data, routineName);
    if (!routine) return [];
    return data.workout_sessions.filter((session) => session.routine_id === routine.id || session.routine_name === routineName);
  }

  function latestCompletedSession(data, routineName, excludeSessionId = "") {
    return sessionsForRoutine(data, routineName)
      .filter((session) => session.status === "completed" && session.id !== excludeSessionId)
      .sort(sessionSortDesc)[0] || null;
  }

  function todaySession(data, routineName, today = todayIso()) {
    return sessionsForRoutine(data, routineName)
      .filter((session) => sessionDate(session) === today)
      .sort(sessionSortDesc)[0] || null;
  }

  function exercisesForSession(data, sessionId) {
    return data.workout_exercises
      .filter((exercise) => exercise.workout_session_id === sessionId)
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  }

  function setsForWorkoutExercise(data, workoutExerciseId) {
    return data.workout_sets.filter((set) => set.workout_exercise_id === workoutExerciseId).sort(setSort);
  }

  function copyExercisesFromSession(data, sourceSession, targetSessionId) {
    exercisesForSession(data, sourceSession.id).forEach((sourceExercise, index) => {
      const workoutExerciseId = randomId("wex");
      data.workout_exercises.push({
        id: workoutExerciseId,
        workout_session_id: targetSessionId,
        exercise_id: sourceExercise.exercise_id,
        exercise_name: sourceExercise.exercise_name,
        order: index + 1,
        track_pb: boolFromData(sourceExercise.track_pb),
      });
      const sourceSets = setsForWorkoutExercise(data, sourceExercise.id);
      const performedSets = sourceSets.filter((sourceSet) => boolFromData(sourceSet.completed));
      (performedSets.length ? performedSets : sourceSets).forEach((sourceSet, setIndex) => {
        data.workout_sets.push({
          id: randomId("set"),
          workout_exercise_id: workoutExerciseId,
          set_number: setIndex + 1,
          weight: sourceSet.weight,
          reps: sourceSet.reps,
          completed: false,
          timestamp: "",
        });
      });
    });
  }

  function seedExercisesFromRoutine(data, routine, targetSessionId) {
    (routine.exercises || []).filter((row) => row.active !== false).forEach((routineExercise, index) => {
      const workoutExerciseId = randomId("wex");
      const exercise = data.exercises.find((item) => item.id === routineExercise.exercise_id);
      data.workout_exercises.push({
        id: workoutExerciseId,
        workout_session_id: targetSessionId,
        exercise_id: routineExercise.exercise_id,
        exercise_name: exercise?.name || "Exercise",
        order: index + 1,
        track_pb: boolFromData(routineExercise.track_pb),
      });
      seedSetsFromRoutineExercise(data, workoutExerciseId, routineExercise);
    });
  }

  function seedSetsFromRoutineExercise(data, workoutExerciseId, routineExercise) {
    parseSetScheme(routineExercise.default_reps).forEach((sourceSet, setIndex) => {
      data.workout_sets.push({
        id: randomId("set"),
        workout_exercise_id: workoutExerciseId,
        set_number: setIndex + 1,
        weight: formatWeight(routineExercise.default_weight ?? ""),
        reps: sourceSet.reps,
        completed: false,
        timestamp: "",
      });
    });
  }

  function syncWorkoutSessionWithRoutine(data, sessionId, options = {}) {
    const session = data.workout_sessions.find((item) => item.id === sessionId);
    if (!session || (session.status === "completed" && !options.includeCompleted)) return false;
    const routine = data.routine_definitions.find((item) => item.id === session.routine_id) || routineByName(data, session.routine_name);
    if (!routine) return false;
    const templateExercises = (routine.exercises || []).filter((item) => item.active !== false);
    const sessionExercises = exercisesForSession(data, sessionId);
    const matchedWorkoutIds = new Set();
    let changed = false;

    templateExercises.forEach((routineExercise, index) => {
      let workoutExercise = sessionExercises.find(
        (item) => item.exercise_id === routineExercise.exercise_id && !matchedWorkoutIds.has(item.id)
      );
      if (!workoutExercise) {
        const workoutExerciseId = randomId("wex");
        const exercise = data.exercises.find((item) => item.id === routineExercise.exercise_id);
        workoutExercise = {
          id: workoutExerciseId,
          workout_session_id: sessionId,
          exercise_id: routineExercise.exercise_id,
          exercise_name: exercise?.name || "Exercise",
          order: index + 1,
          track_pb: boolFromData(routineExercise.track_pb),
        };
        data.workout_exercises.push(workoutExercise);
        sessionExercises.push(workoutExercise);
        seedSetsFromRoutineExercise(data, workoutExercise.id, routineExercise);
        changed = true;
      } else {
        const exercise = data.exercises.find((item) => item.id === routineExercise.exercise_id);
        const nextName = exercise?.name || workoutExercise.exercise_name || "Exercise";
        const nextOrder = index + 1;
        const nextTrackPb = boolFromData(routineExercise.track_pb);
        if (
          workoutExercise.exercise_name !== nextName ||
          Number(workoutExercise.order || 0) !== nextOrder ||
          boolFromData(workoutExercise.track_pb) !== nextTrackPb
        ) {
          changed = true;
        }
        workoutExercise.exercise_name = nextName;
        workoutExercise.order = nextOrder;
        workoutExercise.track_pb = nextTrackPb;
        if (!setsForWorkoutExercise(data, workoutExercise.id).length) {
          seedSetsFromRoutineExercise(data, workoutExercise.id, routineExercise);
          changed = true;
        }
      }
      matchedWorkoutIds.add(workoutExercise.id);
    });

    sessionExercises
      .filter((item) => !matchedWorkoutIds.has(item.id))
      .forEach((item, index) => {
        const nextOrder = templateExercises.length + index + 1;
        if (Number(item.order || 0) !== nextOrder) changed = true;
        item.order = nextOrder;
      });
    return changed;
  }

  function startWorkoutSession(data, routineName, options = {}) {
    const today = options.today || todayIso(options.now);
    const now = options.now ? nowIso(options.now) : nowIso();
    const routine = routineByName(data, routineName) || {
      id: ensureRoutineDefinition(data, routineName, data.routines?.[routineName] || []),
      name: routineName,
      exercises: data.routine_definitions.find((item) => item.name === routineName)?.exercises || [],
    };
    const existingToday = todaySession(data, routineName, today);
    if (existingToday) return existingToday;

    const session = {
      id: randomId("session"),
      routine_id: routine.id,
      routine_name: routineName,
      started_at: now,
      completed_at: "",
      status: "active",
      notes: "",
    };
    data.workout_sessions.push(session);
    const previous = latestCompletedSession(data, routineName, session.id);
    if (previous) {
      copyExercisesFromSession(data, previous, session.id);
      syncWorkoutSessionWithRoutine(data, session.id);
    } else {
      seedExercisesFromRoutine(data, routine, session.id);
    }
    return session;
  }

  function sessionRows(data, sessionId) {
    const session = data.workout_sessions.find((item) => item.id === sessionId);
    if (!session) return [];
    return exercisesForSession(data, sessionId).map((workoutExercise) => {
      const exercise = data.exercises.find((item) => item.id === workoutExercise.exercise_id);
      return {
        workout_exercise_id: workoutExercise.id,
        exercise_id: workoutExercise.exercise_id,
        exercise: workoutExercise.exercise_name || exercise?.name || "Exercise",
        track_pb: boolFromData(workoutExercise.track_pb),
        sets: setsForWorkoutExercise(data, workoutExercise.id),
      };
    });
  }

  function formatSets(sets) {
    return sets.map((set) => `${formatWeight(set.weight)} lb x ${set.reps}`).join(", ");
  }

  function formatSetSummary(sets) {
    const completed = sets.filter((set) => boolFromData(set.completed));
    const usable = (completed.length ? completed : sets).filter((set) => String(set.reps ?? "").trim());
    if (!usable.length) return "";
    const sameWeight = usable.every((set) => formatWeight(set.weight) === formatWeight(usable[0].weight));
    const reps = usable.map((set) => String(set.reps).trim()).join(",");
    return sameWeight ? `${usable.length}x${reps}` : formatSets(usable);
  }

  function renumberSets(data, workoutExerciseId) {
    setsForWorkoutExercise(data, workoutExerciseId).forEach((set, index) => {
      set.set_number = index + 1;
    });
  }

  function addWorkoutSet(data, workoutExerciseId) {
    const sets = setsForWorkoutExercise(data, workoutExerciseId);
    const last = sets[sets.length - 1] || { weight: "", reps: "" };
    const next = {
      id: randomId("set"),
      workout_exercise_id: workoutExerciseId,
      set_number: sets.length + 1,
      weight: last.weight,
      reps: last.reps,
      completed: false,
      timestamp: "",
    };
    data.workout_sets.push(next);
    return next;
  }

  function deleteWorkoutSet(data, setId) {
    const set = data.workout_sets.find((item) => item.id === setId);
    if (!set) return false;
    const workoutExerciseId = set.workout_exercise_id;
    data.workout_sets = data.workout_sets.filter((item) => item.id !== setId);
    if (!setsForWorkoutExercise(data, workoutExerciseId).length) addWorkoutSet(data, workoutExerciseId);
    renumberSets(data, workoutExerciseId);
    return true;
  }

  function updateWorkoutSet(data, setId, field, value, options = {}) {
    const set = data.workout_sets.find((item) => item.id === setId);
    if (!set || !["weight", "reps", "completed"].includes(field)) return null;
    if (field === "weight") set.weight = formatWeight(value);
    else if (field === "completed") {
      set.completed = boolFromData(value);
      set.timestamp = set.completed ? options.now ? nowIso(options.now) : nowIso() : "";
    } else set.reps = String(value ?? "").trim();
    return set;
  }

  function addWorkoutExercise(data, sessionId, name = "") {
    const sessionExercises = exercisesForSession(data, sessionId);
    const exerciseName = canonicalExerciseName(name) || PRESET_EXERCISE_NAMES[0];
    const exerciseId = ensureExercise(data, { exercise: exerciseName, active: true });
    const workoutExercise = {
      id: randomId("wex"),
      workout_session_id: sessionId,
      exercise_id: exerciseId,
      exercise_name: exerciseName,
      order: sessionExercises.length + 1,
      track_pb: false,
    };
    data.workout_exercises.push(workoutExercise);
    addWorkoutSet(data, workoutExercise.id);
    return workoutExercise;
  }

  function deleteWorkoutExercise(data, workoutExerciseId) {
    const exercise = data.workout_exercises.find((item) => item.id === workoutExerciseId);
    if (!exercise) return false;
    const sessionId = exercise.workout_session_id;
    if (exercisesForSession(data, sessionId).length <= 1) return false;
    data.workout_exercises = data.workout_exercises.filter((item) => item.id !== workoutExerciseId);
    data.workout_sets = data.workout_sets.filter((set) => set.workout_exercise_id !== workoutExerciseId);
    exercisesForSession(data, sessionId).forEach((item, index) => {
      item.order = index + 1;
    });
    return true;
  }

  function moveWorkoutExercise(data, workoutExerciseId, direction) {
    const exercise = data.workout_exercises.find((item) => item.id === workoutExerciseId);
    if (!exercise) return false;
    const rows = exercisesForSession(data, exercise.workout_session_id);
    const index = rows.findIndex((item) => item.id === workoutExerciseId);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= rows.length) return false;
    [rows[index].order, rows[targetIndex].order] = [rows[targetIndex].order, rows[index].order];
    return true;
  }

  function syncRoutineLogFromSession(data, sessionId) {
    const session = data.workout_sessions.find((item) => item.id === sessionId);
    if (!session) return null;
    const date = sessionDate(session) || todayIso();
    const exercises = sessionRows(data, sessionId).map((row) => ({
      exercise: row.exercise,
      weight: row.sets[0] ? formatWeight(row.sets[0].weight) : "",
      reps: formatSetSummary(row.sets),
      track_pb: row.track_pb,
      workout_exercise_id: row.workout_exercise_id,
      sets: row.sets.map((set) => ({
        id: set.id,
        set_number: set.set_number,
        weight: formatWeight(set.weight),
        reps: String(set.reps ?? ""),
        completed: boolFromData(set.completed),
        timestamp: set.timestamp || "",
      })),
    }));
    const pb_entries = exercises
      .filter((exercise) => exercise.track_pb)
      .map((exercise) => ({ exercise: exercise.exercise, weight: exercise.weight, reps: exercise.reps }));
    const log = {
      date,
      routine: session.routine_name,
      exercises,
      pb_entries,
      session_id: session.id,
      completed_at: session.completed_at,
    };
    const index = data.routine_logs.findIndex((item) => item.session_id === session.id);
    if (index >= 0) data.routine_logs[index] = log;
    else data.routine_logs.push(log);
    return log;
  }

  function completeWorkoutSession(data, sessionId, options = {}) {
    const session = data.workout_sessions.find((item) => item.id === sessionId);
    if (!session) return null;
    session.status = "completed";
    session.completed_at = options.now ? nowIso(options.now) : nowIso();
    session.notes = session.notes || "";
    syncRoutineLogFromSession(data, sessionId);
    return session;
  }

  return {
    HISTORY_SCHEMA_VERSION,
    clone,
    presetExerciseNames,
    presetExerciseId,
    canonicalExerciseName,
    ensureHistoricalModel,
    startWorkoutSession,
    latestCompletedSession,
    todaySession,
    sessionRows,
    setsForWorkoutExercise,
    addWorkoutSet,
    deleteWorkoutSet,
    updateWorkoutSet,
    addWorkoutExercise,
    deleteWorkoutExercise,
    moveWorkoutExercise,
    syncWorkoutSessionWithRoutine,
    completeWorkoutSession,
    syncRoutineLogFromSession,
    formatSets,
    formatSetSummary,
    parseSetScheme,
    stableId,
  };
});
