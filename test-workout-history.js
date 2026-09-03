const assert = require("assert");
const fs = require("fs");
const path = require("path");
const history = require("./workout-history");

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "workout_data.json"), "utf8"));
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

{
  const data = migrated();
  assert.strictEqual(data.history_version, history.HISTORY_SCHEMA_VERSION);
  assert.ok(data.exercises.length >= 15);
  assert.ok(data.routine_definitions.length >= 3);
  assert.ok(completedSessions(data).length >= 8);
  assert.ok(data.workout_sets.length >= 56);
  const push = completedSessions(data, "Push Day").find((session) => session.started_at.startsWith("2026-08-09"));
  const incline = rows(data, push).find((row) => row.exercise === "Incline Barbell Press");
  assert.deepStrictEqual(incline.sets.map((set) => `${set.weight}x${set.reps}`), ["125x8", "125x8", "125x8"]);
  assert.ok(incline.sets.every((set) => set.legacy_source === "legacy_summary"));
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
  const incline = rows(data, session).find((row) => row.exercise === "Incline Barbell Press");
  assert.deepStrictEqual(incline.sets.map((set) => `${set.weight}x${set.reps}:${set.completed}`), [
    "125x8:false",
    "125x8:false",
    "125x8:false",
  ]);
  const previous = history.latestCompletedSession(data, "Push Day", session.id);
  const previousIncline = rows(data, previous).find((row) => row.exercise === "Incline Barbell Press");
  history.updateWorkoutSet(data, incline.sets[0].id, "weight", "130");
  history.updateWorkoutSet(data, incline.sets[0].id, "reps", "7");
  assert.strictEqual(previousIncline.sets[0].weight, "125");
  assert.strictEqual(previousIncline.sets[0].reps, "8");
}

{
  const data = migrated();
  const session = history.startWorkoutSession(data, "Pull Day", { today: TODAY, now: new Date("2026-09-02T11:00:00.000Z") });
  const pulldown = rows(data, session).find((row) => row.exercise === "Lat Pulldown");
  history.updateWorkoutSet(data, pulldown.sets[0].id, "completed", true, { now: new Date("2026-09-02T11:05:00.000Z") });
  assert.strictEqual(history.setsForWorkoutExercise(data, pulldown.workout_exercise_id)[0].timestamp, "2026-09-02T11:05:00.000Z");
  history.completeWorkoutSession(data, session.id, { now: new Date("2026-09-02T12:00:00.000Z") });
  const reopened = history.startWorkoutSession(data, "Pull Day", { today: TODAY, now: new Date("2026-09-02T17:00:00.000Z") });
  assert.strictEqual(reopened.id, session.id);
  const laterPulldown = rows(data, reopened).find((row) => row.exercise === "Lat Pulldown");
  history.addWorkoutSet(data, laterPulldown.workout_exercise_id);
  assert.strictEqual(history.setsForWorkoutExercise(data, laterPulldown.workout_exercise_id).length, 4);
}

{
  let data = migrated();
  data.routines.Core = [{ exercise: "Plank", weight: "0", reps: "3x45 sec", track_pb: false }];
  data = history.ensureHistoricalModel(data, { today: TODAY });
  const session = history.startWorkoutSession(data, "Core", { today: TODAY, now: new Date("2026-09-02T13:00:00.000Z") });
  const plank = rows(data, session).find((row) => row.exercise === "Plank");
  assert.strictEqual(plank.previous_sets.length, 0);
  assert.deepStrictEqual(plank.sets.map((set) => set.reps), ["45 sec", "45 sec", "45 sec"]);
}

{
  const data = migrated();
  const oldPull = completedSessions(data, "Pull Day")[0];
  const oldRow = rows(data, oldPull)[0];
  const exercise = data.exercises.find((item) => item.id === oldRow.exercise_id);
  exercise.active = false;
  assert.ok(rows(data, oldPull).some((row) => row.exercise_id === exercise.id));
}

console.log("workout history tests passed");
