// SQLite (sql.js) database with a local IndexedDB cache.
// The same file is synced to Dropbox by sync.js.
//
// Every row in every table carries updated_at, and deletes are soft
// (deleted = 1), so two copies of the database can always be merged:
// for each row, the newer version wins.

import { STARTER } from "./plan.js";
import { catalogExercise } from "./catalog.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sets (
  id           TEXT PRIMARY KEY,           -- "date|exercise|setNo"
  session_date TEXT NOT NULL,
  day_id       TEXT NOT NULL,
  exercise_id  TEXT NOT NULL,
  set_no       INTEGER NOT NULL,
  weight       REAL,
  reps         INTEGER,
  unit         TEXT NOT NULL DEFAULT 'lb',
  updated_at   INTEGER NOT NULL,
  deleted      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS sets_by_exercise ON sets (exercise_id, session_date);
CREATE INDEX IF NOT EXISTS sets_by_date ON sets (session_date);
CREATE TABLE IF NOT EXISTS meta (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS exercises (     -- custom exercises; built-ins live in catalog.js
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  muscle     TEXT,
  cues       TEXT,
  updated_at INTEGER NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS routines (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  tempo      TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS routine_days (
  id         TEXT PRIMARY KEY,
  routine_id TEXT NOT NULL,
  name       TEXT NOT NULL,
  subtitle   TEXT,
  position   REAL NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted    INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS day_exercises (
  id             TEXT PRIMARY KEY,
  day_id         TEXT NOT NULL,
  exercise_id    TEXT NOT NULL,
  position       REAL NOT NULL,
  sets           INTEGER NOT NULL,
  rep_lo         INTEGER NOT NULL,
  rep_hi         INTEGER NOT NULL,
  warmup         INTEGER NOT NULL DEFAULT 0,
  superset_next  INTEGER NOT NULL DEFAULT 0,
  updated_at     INTEGER NOT NULL,
  deleted        INTEGER NOT NULL DEFAULT 0
);
`;

const TABLES = ["sets", "meta", "exercises", "routines", "routine_days", "day_exercises"];

let SQL = null;
let db = null;

// ---------- IndexedDB cache (survives reloads, works offline) ----------

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("workout-tracker", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("files");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const conn = await idb();
  return new Promise((resolve, reject) => {
    const req = conn.transaction("files").objectStore("files").get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key, value) {
  const conn = await idb();
  return new Promise((resolve, reject) => {
    const tx = conn.transaction("files", "readwrite");
    tx.objectStore("files").put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- helpers ----------

function allIn(d, sql, params = []) {
  const stmt = d.prepare(sql);
  try {
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally {
    stmt.free();
  }
}

function all(sql, params = []) {
  return allIn(db, sql, params);
}

function one(sql, params = []) {
  return all(sql, params)[0] || null;
}

function columns(d, table) {
  return allIn(d, `PRAGMA table_info(${table})`).map((c) => c.name);
}

export function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
}

function migrate(d) {
  d.exec(SCHEMA);
  if (!columns(d, "sets").includes("day_name")) {
    d.exec("ALTER TABLE sets ADD COLUMN day_name TEXT");
  }
  // Sets logged before routines existed: name them from the starter plan.
  for (const day of STARTER.days) {
    d.run("UPDATE sets SET day_name = ? WHERE day_id = ? AND day_name IS NULL", [day.name, day.id]);
  }
}

function openBytes(bytes) {
  const d = bytes ? new SQL.Database(bytes) : new SQL.Database();
  migrate(d);
  return d;
}

// Insert or update a row, stamping updated_at.
function put(table, row, ts = Date.now()) {
  const r = { ...row, updated_at: ts };
  if (!("deleted" in r) && table !== "meta") r.deleted = 0;
  const cols = Object.keys(r);
  db.run(
    `INSERT OR REPLACE INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`,
    cols.map((c) => (typeof r[c] === "boolean" ? Number(r[c]) : r[c]))
  );
}

function softDelete(table, id) {
  db.run(`UPDATE ${table} SET deleted = 1, updated_at = ? WHERE id = ?`, [Date.now(), id]);
}

// ---------- lifecycle ----------

export async function init() {
  SQL = await window.initSqlJs({ locateFile: (f) => `vendor/${f}` });
  let bytes = null;
  try {
    bytes = await idbGet("db");
  } catch (e) {
    console.warn("IndexedDB unavailable", e);
  }
  db = openBytes(bytes || null);
  seedStarter();
}

// First run: add the starter routine. Rows are stamped updated_at = 1, so any
// edit or delete from another device wins the merge.
function seedStarter() {
  if (one("SELECT 1 AS x FROM routines LIMIT 1")) return; // ever existed, even deleted
  const s = STARTER;
  put("routines", { id: s.id, name: s.name, tempo: s.tempo, created_at: 1 }, 1);
  s.days.forEach((day, i) => {
    put("routine_days", { id: day.id, routine_id: s.id, name: day.name, subtitle: day.subtitle, position: i }, 1);
    day.exercises.forEach(([exId, sets, lo, hi, warmup, ssNext], j) => {
      put("day_exercises", {
        id: `${day.id}-${j}`, day_id: day.id, exercise_id: exId, position: j,
        sets, rep_lo: lo, rep_hi: hi, warmup: warmup ? 1 : 0, superset_next: ssNext ? 1 : 0,
      }, 1);
    });
  });
  if (!one("SELECT 1 AS x FROM meta WHERE key = 'active_routine'")) {
    put("meta", { key: "active_routine", value: s.id }, 1);
  }
}

export function exportBytes() {
  return db.export();
}

export async function saveLocal() {
  try {
    await idbPut("db", db.export());
  } catch (e) {
    console.warn("Could not cache database locally", e);
  }
}

// Merge a remote copy into the local one. Newer updated_at wins per row.
// Returns true if the local copy has anything the remote copy lacks,
// which means the merged result needs to be uploaded.
export function merge(remoteBytes) {
  const remote = openBytes(remoteBytes);
  let localAhead = false;
  try {
    db.exec("BEGIN");
    for (const table of TABLES) {
      const cols = columns(db, table);
      const pk = cols[0];
      const remoteRows = allIn(remote, `SELECT ${cols.join(",")} FROM ${table}`);
      const remoteMap = new Map(remoteRows.map((r) => [r[pk], r.updated_at]));
      const localMap = new Map(all(`SELECT ${pk}, updated_at FROM ${table}`).map((r) => [r[pk], r.updated_at]));

      for (const r of remoteRows) {
        const localTs = localMap.get(r[pk]);
        if (localTs === undefined || r.updated_at > localTs) {
          db.run(
            `INSERT OR REPLACE INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`,
            cols.map((c) => r[c])
          );
        }
      }
      if (!localAhead) {
        for (const [key, ts] of localMap) {
          const rts = remoteMap.get(key);
          if (rts === undefined || ts > rts) {
            localAhead = true;
            break;
          }
        }
      }
    }
    db.exec("COMMIT");
  } catch (e) {
    try { db.exec("ROLLBACK"); } catch (_) { /* already rolled back */ }
    throw e;
  } finally {
    remote.close();
  }
  return localAhead;
}

// ---------- settings ----------

export function getSetting(key, fallback) {
  const row = one("SELECT value FROM meta WHERE key = ?", [key]);
  return row ? row.value : fallback;
}

export function setSetting(key, value) {
  put("meta", { key, value: String(value) });
}

// ---------- exercises ----------

export function exercise(id) {
  const c = catalogExercise(id);
  if (c) return c;
  const row = one("SELECT id, name, muscle, cues FROM exercises WHERE id = ?", [id]);
  if (row) return { ...row, muscle: row.muscle || "Other", equipment: "", main: false, custom: true };
  return { id, name: id, muscle: "Other", equipment: "", cues: "", main: false, custom: true };
}

export function customExercises() {
  return all("SELECT id, name, muscle, cues FROM exercises WHERE deleted = 0 ORDER BY name COLLATE NOCASE")
    .map((r) => ({ ...r, muscle: r.muscle || "Other", equipment: "Custom", main: false, custom: true }));
}

export function createCustomExercise(name, muscle) {
  const id = `c-${uid()}`;
  put("exercises", { id, name: name.trim(), muscle: muscle || null, cues: null });
  return id;
}

// ---------- routines ----------

export function routines() {
  return all("SELECT id, name, tempo FROM routines WHERE deleted = 0 ORDER BY created_at, name");
}

export function routine(id) {
  return one("SELECT id, name, tempo FROM routines WHERE id = ? AND deleted = 0", [id]);
}

export function activeRoutineId() {
  const id = getSetting("active_routine", null);
  if (id && routine(id)) return id;
  const first = routines()[0];
  return first ? first.id : null;
}

export function setActiveRoutine(id) {
  setSetting("active_routine", id);
}

export function days(routineId) {
  return all(
    "SELECT id, routine_id, name, subtitle, position FROM routine_days WHERE routine_id = ? AND deleted = 0 ORDER BY position, id",
    [routineId]
  );
}

export function day(dayId) {
  return one("SELECT id, routine_id, name, subtitle, position FROM routine_days WHERE id = ? AND deleted = 0", [dayId]);
}

export function dayExercises(dayId) {
  return all(
    `SELECT id, day_id, exercise_id, position, sets, rep_lo, rep_hi, warmup, superset_next
     FROM day_exercises WHERE day_id = ? AND deleted = 0 ORDER BY position, id`,
    [dayId]
  );
}

export function updateRoutine(id, fields) {
  const r = one("SELECT * FROM routines WHERE id = ?", [id]);
  if (!r) return;
  put("routines", { ...r, ...fields });
}

export function createRoutine(name) {
  const id = uid();
  put("routines", { id, name, tempo: null, created_at: Date.now() });
  addDay(id, "Day 1");
  return id;
}

export function duplicateRoutine(srcId) {
  const src = one("SELECT * FROM routines WHERE id = ?", [srcId]);
  const id = uid();
  put("routines", { id, name: `${src.name} (copy)`, tempo: src.tempo, created_at: Date.now() });
  for (const d of days(srcId)) {
    const newDay = uid();
    put("routine_days", { id: newDay, routine_id: id, name: d.name, subtitle: d.subtitle, position: d.position });
    for (const e of dayExercises(d.id)) {
      put("day_exercises", { ...e, id: uid(), day_id: newDay });
    }
  }
  return id;
}

export function deleteRoutine(id) {
  for (const d of days(id)) deleteDay(d.id);
  softDelete("routines", id);
}

// ---------- days ----------

function renumber(table, rows) {
  rows.forEach((r, i) => {
    if (r.position !== i) {
      const full = one(`SELECT * FROM ${table} WHERE id = ?`, [r.id]);
      put(table, { ...full, position: i });
    }
  });
}

export function addDay(routineId, name) {
  const existing = days(routineId);
  const id = uid();
  put("routine_days", { id, routine_id: routineId, name, subtitle: null, position: existing.length });
  return id;
}

export function updateDay(id, fields) {
  const r = one("SELECT * FROM routine_days WHERE id = ?", [id]);
  if (!r) return;
  put("routine_days", { ...r, ...fields });
}

export function moveDay(id, delta) {
  const d = day(id);
  const list = days(d.routine_id);
  const i = list.findIndex((x) => x.id === id);
  const j = i + delta;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  renumber("routine_days", list);
}

export function deleteDay(id) {
  for (const e of dayExercises(id)) softDelete("day_exercises", e.id);
  softDelete("routine_days", id);
}

// ---------- exercises within a day ----------

export function addDayExercise(dayId, exerciseId) {
  const list = dayExercises(dayId);
  const ex = exercise(exerciseId);
  const id = uid();
  put("day_exercises", {
    id, day_id: dayId, exercise_id: exerciseId, position: list.length,
    sets: 3, rep_lo: 8, rep_hi: 12, warmup: ex.main ? 1 : 0, superset_next: 0,
  });
  return id;
}

export function updateDayExercise(id, fields) {
  const r = one("SELECT * FROM day_exercises WHERE id = ?", [id]);
  if (!r) return;
  put("day_exercises", { ...r, ...fields });
}

export function moveDayExercise(id, delta) {
  const r = one("SELECT day_id FROM day_exercises WHERE id = ?", [id]);
  const list = dayExercises(r.day_id);
  const i = list.findIndex((x) => x.id === id);
  const j = i + delta;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  renumber("day_exercises", list);
}

export function removeDayExercise(id) {
  softDelete("day_exercises", id);
}

// ---------- sets ----------

export function setId(date, exerciseId, setNo) {
  return `${date}|${exerciseId}|${setNo}`;
}

export function logSet({ date, dayId, dayName, exerciseId, setNo, weight, reps, unit }) {
  put("sets", {
    id: setId(date, exerciseId, setNo), session_date: date, day_id: dayId, day_name: dayName,
    exercise_id: exerciseId, set_no: setNo, weight, reps, unit,
  });
}

export function deleteSet(date, exerciseId, setNo) {
  db.run("UPDATE sets SET deleted = 1, updated_at = ? WHERE id = ?", [Date.now(), setId(date, exerciseId, setNo)]);
}

// Sets for one exercise on one date, keyed by set number.
export function setsOn(date, exerciseId) {
  const rows = all(
    "SELECT set_no, weight, reps, unit FROM sets WHERE session_date = ? AND exercise_id = ? AND deleted = 0",
    [date, exerciseId]
  );
  const out = {};
  for (const r of rows) out[r.set_no] = r;
  return out;
}

// Most recent session for an exercise strictly before `date`.
export function lastSession(exerciseId, date) {
  const d = one(
    "SELECT MAX(session_date) AS d FROM sets WHERE exercise_id = ? AND session_date < ? AND deleted = 0",
    [exerciseId, date]
  ).d;
  if (!d) return null;
  const sets = all(
    "SELECT set_no, weight, reps, unit FROM sets WHERE exercise_id = ? AND session_date = ? AND deleted = 0 ORDER BY set_no",
    [exerciseId, d]
  );
  return { date: d, sets };
}

// Of the given day ids, the one with the most recent logged set (by date, then edit time).
export function lastDayLogged(dayIds) {
  if (!dayIds.length) return null;
  const row = one(
    `SELECT day_id FROM sets WHERE deleted = 0 AND day_id IN (${dayIds.map(() => "?").join(",")})
     ORDER BY session_date DESC, updated_at DESC LIMIT 1`,
    dayIds
  );
  return row ? row.day_id : null;
}

// Day ids with anything logged on a date, most recently edited first.
export function daysLoggedOn(date) {
  return all(
    "SELECT day_id, MAX(updated_at) AS t FROM sets WHERE session_date = ? AND deleted = 0 GROUP BY day_id ORDER BY t DESC",
    [date]
  ).map((r) => r.day_id);
}

export function history(limit = 60) {
  const sessions = all(
    `SELECT session_date, day_id, MAX(day_name) AS day_name FROM sets WHERE deleted = 0
     GROUP BY session_date, day_id ORDER BY session_date DESC, MAX(updated_at) DESC LIMIT ?`,
    [limit]
  );
  return sessions.map((s) => ({
    date: s.session_date,
    dayId: s.day_id,
    dayName: s.day_name,
    sets: all(
      `SELECT exercise_id, set_no, weight, reps, unit FROM sets
       WHERE session_date = ? AND day_id = ? AND deleted = 0 ORDER BY updated_at`,
      [s.session_date, s.day_id]
    ),
  }));
}

export function exerciseHistory(exerciseId, limit = 30) {
  const dates = all(
    "SELECT DISTINCT session_date FROM sets WHERE exercise_id = ? AND deleted = 0 ORDER BY session_date DESC LIMIT ?",
    [exerciseId, limit]
  );
  return dates.map(({ session_date }) => ({
    date: session_date,
    sets: all(
      "SELECT set_no, weight, reps, unit FROM sets WHERE exercise_id = ? AND session_date = ? AND deleted = 0 ORDER BY set_no",
      [exerciseId, session_date]
    ),
  }));
}

export function setCount() {
  return one("SELECT COUNT(*) AS n FROM sets WHERE deleted = 0").n;
}
