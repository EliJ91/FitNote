const assert = require("assert");
const fs = require("fs");
const path = require("path");
const history = require("./fitnote-history");

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "fitnote_data.json"), "utf8"));
const TODAY = "2026-09-02";

function migrated() {
  return history.ensureHistoricalModel(fixture, { today: TODAY, now: new Date("2026-09-02T09:00:00.000Z") });
}

function completedSessions(data, routine) {
  return data.workout_sessions.filter((session) => session.status === "completed" && (!routine || session.routine_name === routine));
}

function rows(data, session) {
  return history.sessionRows(data, session.id);
}

function assertCleanModel(data) {
  const exerciseIds = new Set(data.exercises.map((exercise) => exercise.id));
  const routineIds = new Set(data.routine_definitions.map((routine) => routine.id));
  const sessionIds = new Set(data.workout_sessions.map((session) => session.id));
  const workoutExerciseIds = new Set(data.workout_exercises.map((exercise) => exercise.id));
  data.routine_definitions.forEach((routine) => {
    routine.exercises.forEach((exercise, index) => {
      assert.ok(exerciseIds.has(exercise.exercise_id));
      assert.strictEqual(exercise.order, index + 1);
    });
  });
  data.workout_sessions.forEach((session) => assert.ok(routineIds.has(session.routine_id)));
  data.workout_exercises.forEach((exercise) => {
    assert.ok(sessionIds.has(exercise.workout_session_id));
    assert.ok(exerciseIds.has(exercise.exercise_id));
  });
  data.workout_sets.forEach((set) => assert.ok(workoutExerciseIds.has(set.workout_exercise_id)));
}

{
  const data = migrated();
  assert.strictEqual(data.history_version, history.HISTORY_SCHEMA_VERSION);
  assert.ok(data.exercises.length > 0);
  assert.ok(data.exercises.length < history.presetExerciseNames().length);
  assert.ok(data.exercises.every((exercise) => history.presetExerciseNames().includes(exercise.name)));
  assert.ok(data.routine_definitions.length >= 3);
  assert.ok(completedSessions(data).length >= 8);
  assert.ok(data.workout_sets.length >= 56);
  const push = completedSessions(data, "Push Day").find((session) => session.started_at.startsWith("2026-08-09"));
  const incline = rows(data, push).find((row) => row.exercise === "Incline Barbell Bench Press");
  assert.deepStrictEqual(incline.sets.map((set) => `${set.weight}x${set.reps}`), ["125x8", "125x8", "125x8"]);
  assert.ok(incline.sets.every((set) => !("legacy_source" in set) && !("legacy_reps" in set)));
  assert.strictEqual(incline.exercise_id, history.presetExerciseId("Incline Barbell Bench Press"));
  assert.ok(data.routines["Push Day"].some((row) => row.exercise === "Cable Triceps Pushdown"));
  assert.strictEqual(data.routine_definitions.find((routine) => routine.name === "Push Day").description, "Chest - Shoulders - Triceps");
  assert.strictEqual(history.normalizeRoutineDescription("This routine description is too long"), "This routine description is to");
  assert.ok(!("groups" in data));
  assert.ok(!("sets" in data));
  assert.ok(!JSON.stringify(data).includes("legacy"));
  assertCleanModel(data);
}

{
  const once = migrated();
  const twice = history.ensureHistoricalModel(once, { today: TODAY, now: new Date("2026-09-02T09:00:00.000Z") });
  assert.strictEqual(twice.workout_sessions.length, once.workout_sessions.length);
  assert.strictEqual(twice.workout_exercises.length, once.workout_exercises.length);
  assert.strictEqual(twice.workout_sets.length, once.workout_sets.length);
}

{
  const data = migrated();
  const session = history.startWorkoutSession(data, "Push Day", { today: TODAY, now: new Date("2026-09-02T10:00:00.000Z") });
  const incline = rows(data, session).find((row) => row.exercise === "Incline Barbell Bench Press");
  assert.deepStrictEqual(incline.sets.map((set) => `${set.weight}x${set.reps}:${set.completed}`), [
    "125x8:false",
    "125x8:false",
    "125x8:false",
  ]);
  const previous = history.latestCompletedSession(data, "Push Day", session.id);
  const previousIncline = rows(data, previous).find((row) => row.exercise === "Incline Barbell Bench Press");
  history.updateWorkoutSet(data, incline.sets[0].id, "weight", "130");
  history.updateWorkoutSet(data, incline.sets[0].id, "reps", "7");
  assert.strictEqual(previousIncline.sets[0].weight, "125");
  assert.strictEqual(previousIncline.sets[0].reps, "8");
}

{
  let data = migrated();
  data.routines["Push Day"].push({ exercise: "Machine Press", weight: "80", reps: "2x12", track_pb: false });
  data = history.ensureHistoricalModel(data, { today: TODAY });
  const session = history.startWorkoutSession(data, "Push Day", { today: TODAY, now: new Date("2026-09-02T10:30:00.000Z") });
  const machinePress = rows(data, session).find((row) => row.exercise === "Machine Chest Press");
  assert.ok(machinePress);
  assert.deepStrictEqual(machinePress.sets.map((set) => `${set.weight}x${set.reps}:${set.completed}`), [
    "80x12:false",
    "80x12:false",
  ]);
}

{
  const data = migrated();
  const session = history.startWorkoutSession(data, "Pull Day", { today: TODAY, now: new Date("2026-09-02T11:00:00.000Z") });
  const pulldown = rows(data, session).find((row) => row.exercise === "Wide-Grip Lat Pulldown");
  history.updateWorkoutSet(data, pulldown.sets[0].id, "completed", true, { now: new Date("2026-09-02T11:05:00.000Z") });
  assert.strictEqual(history.setsForWorkoutExercise(data, pulldown.workout_exercise_id)[0].timestamp, "2026-09-02T11:05:00.000Z");
  history.completeWorkoutSession(data, session.id, { now: new Date("2026-09-02T12:00:00.000Z") });
  const reopened = history.startWorkoutSession(data, "Pull Day", { today: TODAY, now: new Date("2026-09-02T17:00:00.000Z") });
  assert.strictEqual(reopened.id, session.id);
  const laterPulldown = rows(data, reopened).find((row) => row.exercise === "Wide-Grip Lat Pulldown");
  history.addWorkoutSet(data, laterPulldown.workout_exercise_id);
  assert.strictEqual(history.setsForWorkoutExercise(data, laterPulldown.workout_exercise_id).length, 4);
}

{
  let data = migrated();
  data.routines.Core = [{ exercise: "Plank", weight: "0", reps: "3x45 sec", track_pb: false }];
  data = history.ensureHistoricalModel(data, { today: TODAY });
  const session = history.startWorkoutSession(data, "Core", { today: TODAY, now: new Date("2026-09-02T13:00:00.000Z") });
  const plank = rows(data, session).find((row) => row.exercise === "Plank");
  assert.deepStrictEqual(plank.sets.map((set) => set.reps), ["45 sec", "45 sec", "45 sec"]);
}

{
  let data = migrated();
  data.routines["Chest Day"] = [{ exercise: "Incline Bench", weight: "115", reps: "5x8", track_pb: true }];
  data = history.ensureHistoricalModel(data, { today: TODAY });
  const session = history.startWorkoutSession(data, "Chest Day", { today: TODAY, now: new Date("2026-09-02T13:30:00.000Z") });
  assert.deepStrictEqual(rows(data, session).map((row) => row.exercise), ["Incline Barbell Bench Press"]);
  data.routines["Chest Day"].push({ exercise: "Standing Shoulder Press", weight: "95", reps: "5x8", track_pb: true });
  data = history.ensureHistoricalModel(data, { today: TODAY });
  assert.strictEqual(history.syncWorkoutSessionWithRoutine(data, session.id), true);
  assert.strictEqual(history.syncWorkoutSessionWithRoutine(data, session.id), false);
  const chestRows = rows(data, session);
  assert.deepStrictEqual(chestRows.map((row) => row.exercise), ["Incline Barbell Bench Press", "Standing Barbell Overhead Press"]);
  assert.strictEqual(chestRows[0].track_pb, true);
  assert.strictEqual(chestRows[1].track_pb, true);
  assert.deepStrictEqual(chestRows[1].sets.map((set) => `${set.weight}x${set.reps}:${set.completed}`), [
    "95x8:false",
    "95x8:false",
    "95x8:false",
    "95x8:false",
    "95x8:false",
  ]);
}

{
  let data = migrated();
  data.routines["Chest Day"] = [{ exercise: "Incline Bench", weight: "115", reps: "5x8", track_pb: false }];
  data = history.ensureHistoricalModel(data, { today: TODAY });
  const session = history.startWorkoutSession(data, "Chest Day", { today: TODAY, now: new Date("2026-09-02T14:00:00.000Z") });
  history.completeWorkoutSession(data, session.id, { now: new Date("2026-09-02T15:00:00.000Z") });
  data.routines["Chest Day"].push({ exercise: "Standing Shoulder Press", weight: "95", reps: "5x8", track_pb: false });
  data = history.ensureHistoricalModel(data, { today: TODAY });
  assert.strictEqual(history.syncWorkoutSessionWithRoutine(data, session.id), false);
  assert.strictEqual(history.syncWorkoutSessionWithRoutine(data, session.id, { includeCompleted: true }), true);
  assert.deepStrictEqual(rows(data, session).map((row) => row.exercise), ["Incline Barbell Bench Press", "Standing Barbell Overhead Press"]);
}

{
  const data = migrated();
  const oldPull = completedSessions(data, "Pull Day")[0];
  const oldRow = rows(data, oldPull)[0];
  const exercise = data.exercises.find((item) => item.id === oldRow.exercise_id);
  exercise.active = false;
  assert.ok(rows(data, oldPull).some((row) => row.exercise_id === exercise.id));
}

{
  const data = history.ensureHistoricalModel(
    {
      selected_routine: "Empty",
      exercises: [{ id: history.stableId("ex", "Exercise"), name: "Exercise", active: true }],
      routines: { Empty: [{ exercise: "Exercise", weight: "", reps: "", track_pb: false }] },
    },
    { today: TODAY }
  );
  assert.deepStrictEqual(data.routines.Empty, [{ exercise_id: "", exercise: "", weight: "", reps: "", track_pb: false, active: true }]);
  assert.strictEqual(data.routine_definitions.find((routine) => routine.name === "Empty").exercises.length, 0);
  assert.ok(!data.exercises.some((exercise) => exercise.name === "Exercise" || exercise.name === "New Exercise"));
}

{
  let data = migrated();
  data.routines["Chest Day"] = [
    { exercise: "Cable Lateral Rais", weight: "12", reps: "15", track_pb: true },
    { exercise: "Standing Shoulder", weight: "95", reps: "8", track_pb: false },
  ];
  data = history.ensureHistoricalModel(data, { today: TODAY });
  assert.deepStrictEqual(data.routines["Chest Day"].map((row) => row.exercise), [
    "Cable Lateral Raise",
    "Standing Barbell Overhead Press",
  ]);
}

console.log("workout history tests passed");
