// SQLite (sql.js) database with a local IndexedDB cache.
// The same file is synced to Dropbox by sync.js.
//
// Every row carries updated_at, and deletes are soft (deleted = 1), so two copies
// of the database can always be merged: for each row, the newer version wins.
// A set's id is "date|exercise|setNo", so the same set logged on two devices
// resolves to one row instead of a duplicate.

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sets (
  id           TEXT PRIMARY KEY,
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
`;

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

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally {
    stmt.free();
  }
}

function openBytes(bytes) {
  const d = bytes ? new SQL.Database(bytes) : new SQL.Database();
  d.exec(SCHEMA);
  return d;
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
    const tables = [
      { name: "sets", cols: ["id", "session_date", "day_id", "exercise_id", "set_no", "weight", "reps", "unit", "updated_at", "deleted"] },
      { name: "meta", cols: ["key", "value", "updated_at"] },
    ];
    db.exec("BEGIN");
    for (const t of tables) {
      const pk = t.cols[0];
      const remoteRows = [];
      const rs = remote.prepare(`SELECT ${t.cols.join(",")} FROM ${t.name}`);
      while (rs.step()) remoteRows.push(rs.getAsObject());
      rs.free();
      const remoteMap = new Map(remoteRows.map((r) => [r[pk], r]));

      const localRows = all(`SELECT ${pk}, updated_at FROM ${t.name}`);
      const localMap = new Map(localRows.map((r) => [r[pk], r.updated_at]));

      for (const r of remoteRows) {
        const localTs = localMap.get(r[pk]);
        if (localTs === undefined || r.updated_at > localTs) {
          db.run(
            `INSERT OR REPLACE INTO ${t.name} (${t.cols.join(",")}) VALUES (${t.cols.map(() => "?").join(",")})`,
            t.cols.map((c) => r[c])
          );
        }
      }
      for (const [key, ts] of localMap) {
        const r = remoteMap.get(key);
        if (!r || ts > r.updated_at) {
          localAhead = true;
          break;
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
  const rows = all("SELECT value FROM meta WHERE key = ?", [key]);
  return rows.length ? rows[0].value : fallback;
}

export function setSetting(key, value) {
  db.run("INSERT OR REPLACE INTO meta (key, value, updated_at) VALUES (?, ?, ?)", [key, String(value), Date.now()]);
}

// ---------- sets ----------

export function setId(date, exerciseId, setNo) {
  return `${date}|${exerciseId}|${setNo}`;
}

export function logSet({ date, dayId, exerciseId, setNo, weight, reps, unit }) {
  db.run(
    `INSERT OR REPLACE INTO sets (id, session_date, day_id, exercise_id, set_no, weight, reps, unit, updated_at, deleted)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [setId(date, exerciseId, setNo), date, dayId, exerciseId, setNo, weight, reps, unit, Date.now()]
  );
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
  const d = all(
    "SELECT MAX(session_date) AS d FROM sets WHERE exercise_id = ? AND session_date < ? AND deleted = 0",
    [exerciseId, date]
  )[0].d;
  if (!d) return null;
  const sets = all(
    "SELECT set_no, weight, reps, unit FROM sets WHERE exercise_id = ? AND session_date = ? AND deleted = 0 ORDER BY set_no",
    [exerciseId, d]
  );
  return { date: d, sets };
}

// The plan day logged most recently (by date, then by last edit).
export function lastDayLogged() {
  const rows = all(
    "SELECT day_id FROM sets WHERE deleted = 0 ORDER BY session_date DESC, updated_at DESC LIMIT 1"
  );
  return rows.length ? rows[0].day_id : null;
}

export function history(limit = 60) {
  const dates = all(
    "SELECT session_date, day_id FROM sets WHERE deleted = 0 GROUP BY session_date, day_id ORDER BY session_date DESC LIMIT ?",
    [limit]
  );
  return dates.map((s) => ({
    date: s.session_date,
    dayId: s.day_id,
    sets: all(
      `SELECT exercise_id, set_no, weight, reps, unit FROM sets
       WHERE session_date = ? AND day_id = ? AND deleted = 0 ORDER BY exercise_id, set_no`,
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
  return all("SELECT COUNT(*) AS n FROM sets WHERE deleted = 0")[0].n;
}
