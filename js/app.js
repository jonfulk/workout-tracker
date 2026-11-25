import { CATALOG, MUSCLES } from "./catalog.js";
import * as db from "./db.js";
import * as dbx from "./dropbox.js";
import * as sync from "./sync.js";
import { APP_VERSION } from "./version.js";

// ---------- state ----------

const state = {
  view: "workout",      // workout | history | exercise | routines | routine | picker | settings
  dayId: null,
  date: today(),
  // anchor: the date you're working from (today, or one you picked). The day
  // buttons show that date's week. date: what's on screen, which is the anchor,
  // or the date you completed a day when you tap a finished day in that week.
  anchor: today(),
  followToday: true,    // anchor tracks today, even past midnight
  exerciseId: null,     // exercise history view
  routineId: null,      // routine editor
  openRow: null,        // expanded exercise row in the editor
  picker: null,         // { mode: "add" | "swap", dayId, rowId }
  pickerQuery: "",
  pickerMuscle: "All",
  extraSets: {},        // "date|exerciseId" -> extra rows added with "+ Set"
  renderPending: false, // a sync pulled new data while the user was typing
  backTo: "workout",
};

const main = document.getElementById("main");
const banner = document.getElementById("banner");
const syncEl = document.getElementById("sync");

// ---------- small helpers ----------

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function prettyDate(iso, opts = { weekday: "short", month: "short", day: "numeric" }) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, opts);
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function unit() {
  return db.getSetting("unit", "lb");
}

// Convert a stored weight into the current display unit.
function toUnit(weight, fromUnit) {
  if (weight === null || weight === undefined) return null;
  const u = unit();
  if (fromUnit === u) return weight;
  const v = u === "kg" ? weight / 2.20462 : weight * 2.20462;
  return Math.round(v * 2) / 2;
}

function fmt(n) {
  if (n === null || n === undefined || n === "") return "";
  return String(Number(Number(n).toFixed(2)));
}

function setText(s) {
  return `${fmt(toUnit(s.weight, s.unit))}×${s.reps}`;
}

function rangeText(lo, hi) {
  return lo === hi ? `${lo}` : `${lo}–${hi}`;
}

function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(y, m - 1, d + n);
  const pad = (x) => String(x).padStart(2, "0");
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

function weekday(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

// Days completed in the week containing `date` (week starts on the day set in
// Settings; never past today): Map dayId -> date it was completed, newest first.
function doneInWeek(date) {
  const start = Number(db.getSetting("week_start", "1"));
  const from = addDays(date, -((weekday(date) - start + 7) % 7));
  let to = addDays(from, 6);
  if (to > today()) to = today();
  const out = new Map();
  for (const c of db.completionsBetween(from, to)) if (!out.has(c.dayId)) out.set(c.dayId, c.date);
  return out;
}

function shortDate(iso) {
  return iso === today() ? "today" : prettyDate(iso);
}

function inputFocused() {
  const a = document.activeElement;
  return a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA") && main.contains(a);
}

function go(view, extra = {}) {
  Object.assign(state, extra, { view });
  render();
  window.scrollTo(0, 0);
}

// Superset letters: consecutive rows joined by superset_next share a letter.
function supersetLetters(rows) {
  const out = new Map();
  let letter = 0;
  for (let i = 0; i < rows.length; i++) {
    const joinedPrev = i > 0 && rows[i - 1].superset_next && out.has(rows[i - 1].id);
    const joinsNext = rows[i].superset_next && i < rows.length - 1;
    if (joinedPrev) out.set(rows[i].id, out.get(rows[i - 1].id));
    else if (joinsNext) out.set(rows[i].id, String.fromCharCode(65 + letter++));
  }
  return out;
}

async function changed() {
  await sync.changed();
}

// ---------- workout view ----------

function activeDays() {
  const rid = db.activeRoutineId();
  return rid ? db.days(rid) : [];
}

function defaultDay() {
  const list = activeDays();
  if (!list.length) return null;
  const ids = list.map((d) => d.id);
  // Something already logged or completed on this date? Stay on that day.
  const loggedToday = db.daysLoggedOn(state.date).find((id) => ids.includes(id))
    || ids.find((id) => db.isComplete(state.date, id));
  if (loggedToday) return loggedToday;
  // Using "Complete workout": the next day this week that isn't done yet,
  // counting on from the one you finished most recently.
  if (state.date === today() && db.hasAnyCompletions()) {
    const done = doneInWeek(today());
    // doneInWeek is ordered newest first (by date, then by when you tapped Complete).
    const latest = [...done.entries()].find(([id]) => ids.includes(id));
    if (!latest) return ids[0];
    const i = ids.indexOf(latest[0]);
    for (let k = 1; k <= ids.length; k++) {
      const cand = ids[(i + k) % ids.length];
      if (!done.has(cand)) return cand;
    }
    return ids[(i + 1) % ids.length];
  }
  // Otherwise the day after the last one you logged.
  const last = db.lastDayLogged(ids);
  if (!last) return ids[0];
  return ids[(ids.indexOf(last) + 1) % ids.length];
}

function warmup(row, last) {
  if (!row.warmup || !last || !last.sets.length) return "";
  const top = Math.max(...last.sets.map((s) => toUnit(s.weight, s.unit) ?? 0));
  if (!(top > 0)) return "";
  const step = unit() === "kg" ? 2 : 5;
  const r = (x) => Math.max(step, Math.round(x / step) * step);
  return `Warm-up: ${r(top * 0.6)}–${r(top * 0.67)} × 6–8, optional ${r(top * 0.73)}–${r(top * 0.8)} × 4–6`;
}

function progression(row, last) {
  if (!last || last.sets.length < row.sets) return "";
  if (!last.sets.every((s) => s.reps >= row.rep_hi)) return "";
  return last.sets.some((s) => s.weight < 0)
    ? "↑ Top of the range on every set last time. Use less assistance."
    : "↑ Top of the range on every set last time. Add weight.";
}

function cardHtml(row, letter) {
  const ex = db.exercise(row.exercise_id);
  const logged = db.setsOn(state.date, row.exercise_id);
  const last = db.lastSession(row.exercise_id, state.date);
  const loggedNos = Object.keys(logged).map(Number);
  const extra = state.extraSets[`${state.date}|${row.exercise_id}`] || 0;
  const count = Math.max(row.sets, ...loggedNos, 0) + extra;
  const done = loggedNos.length >= row.sets;

  // Last session's top set: the heaviest weight (for assisted work, the least
  // assistance), and on a tie the one with the most reps. Every set starts there.
  const top = last && last.sets.length
    ? last.sets.reduce((a, b) => {
        const wa = toUnit(a.weight, a.unit), wb = toUnit(b.weight, b.unit);
        return wb > wa || (wb === wa && b.reps > a.reps) ? b : a;
      })
    : null;

  // Each set starts as a copy of the set above it (logged or suggested);
  // set 1 starts at last session's top set. A blank box logs its placeholder.
  let aboveW = top ? fmt(toUnit(top.weight, top.unit)) : unit();
  let aboveR = top ? String(top.reps) : rangeText(row.rep_lo, row.rep_hi);

  let rows = "";
  for (let n = 1; n <= count; n++) {
    const s = logged[n];
    const phW = aboveW;
    const phR = aboveR;
    if (s) {
      aboveW = fmt(toUnit(s.weight, s.unit));
      aboveR = String(s.reps);
    }
    const bonus = n > row.sets ? `<span class="optional">extra</span>` : "";
    rows += `
      <div class="set${s ? " logged" : ""}" data-set="${n}">
        <span class="n">${n}${bonus}</span>
        <input class="w" type="text" inputmode="decimal" autocomplete="off" aria-label="Set ${n} weight"
          value="${s ? esc(fmt(toUnit(s.weight, s.unit))) : ""}" placeholder="${esc(phW)}">
        <span class="x">×</span>
        <input class="r" type="text" inputmode="numeric" autocomplete="off" aria-label="Set ${n} reps"
          value="${s ? esc(s.reps) : ""}" placeholder="${esc(phR)}">
        <button class="check" aria-label="${s ? "Unlog" : "Log"} set ${n}">${s ? "✓" : "○"}</button>
      </div>`;
  }

  const lastLine = last
    ? `<p class="info">Last (${esc(prettyDate(last.date, { month: "short", day: "numeric" }))}): ${last.sets.map(setText).join(" · ")}</p>`
    : `<p class="info">No history yet. Pick a weight you can do ${row.rep_hi} clean reps with.</p>`;
  const up = progression(row, last);
  const wu = warmup(row, last);

  return `
    <section class="card${done ? " done" : ""}" id="card-${esc(row.exercise_id)}" data-ex="${esc(row.exercise_id)}" data-row="${esc(row.id)}">
      <div class="card-head">
        <h2><button class="ex-name" data-act="ex-history" data-id="${esc(row.exercise_id)}">${esc(ex.name)}</button>${letter ? `<span class="tag">SUPERSET ${letter}</span>` : ""}</h2>
        <span class="target">${row.sets} × ${rangeText(row.rep_lo, row.rep_hi)}</span>
      </div>
      ${lastLine}
      ${up ? `<p class="info up">${esc(up)}</p>` : ""}
      ${wu ? `<p class="info">${esc(wu)}</p>` : ""}
      ${ex.cues ? `<details><summary>Form cues</summary><p>${esc(ex.cues)}</p></details>` : ""}
      <div class="col-labels"><span></span><span>${esc(unit())}</span><span></span><span>reps</span><span></span></div>
      <div class="sets">${rows}</div>
      <button class="add-set" data-act="add-set">+ Set</button>
    </section>`;
}

function renderWorkout() {
  const rid = db.activeRoutineId();
  if (!rid) {
    main.innerHTML = `<p class="empty">No routine yet.</p><p style="text-align:center"><button class="btn primary" data-act="new-routine">Create a routine</button></p>`;
    return;
  }
  const r = db.routine(rid);
  const list = db.days(rid);
  if (!list.length) {
    main.innerHTML = `
      <button class="routine-link" data-act="routines">${esc(r.name)} ›</button>
      <p class="empty">This routine has no days yet.</p>
      <p style="text-align:center"><button class="btn primary" data-act="edit-routine" data-id="${esc(rid)}">Edit routine</button></p>`;
    return;
  }
  if (!list.some((d) => d.id === state.dayId)) state.dayId = defaultDay();
  const day = list.find((d) => d.id === state.dayId);
  const rows = db.dayExercises(day.id);
  const letters = supersetLetters(rows);
  const done = doneInWeek(state.anchor);
  const completed = db.isComplete(state.date, day.id);

  let dateNote = "";
  if (state.date !== state.anchor) {
    dateNote = `<div class="viewing"><span><b>✓ Completed</b> ${esc(prettyDate(state.date))}</span><button data-act="to-anchor">Back to ${esc(shortDate(state.anchor))}</button></div>`;
  } else if (state.anchor !== today()) {
    dateNote = `<p class="tempo"><b>Editing ${esc(prettyDate(state.date))}.</b> <button class="linkish" data-act="to-today">Back to today</button></p>`;
  }

  main.innerHTML = `
    <button class="routine-link" data-act="routines">${esc(r.name)} ›</button>
    <div class="days" style="--cols: ${Math.min(list.length, 4)}">
      ${list.map((d, i) => `
        <button class="day${d.id === day.id ? " active" : ""}${done.has(d.id) ? " done" : ""}" data-act="day" data-id="${esc(d.id)}"
          aria-label="Day ${i + 1}, ${esc(d.name)}${done.has(d.id) ? ", completed this week" : ""}">
          <small>${done.has(d.id) ? "✓ " : ""}Day ${i + 1}</small><b>${esc(d.name)}</b>
        </button>`).join("")}
    </div>
    <div class="dateline">
      <h1>${esc(day.name)}${day.subtitle ? `<span>${esc(day.subtitle)}</span>` : ""}</h1>
      <input type="date" id="date" value="${state.date}" max="${today()}" aria-label="Workout date">
    </div>
    ${dateNote}
    ${r.tempo ? `<p class="tempo">Tempo <b>${esc(r.tempo)}</b></p>` : ""}
    ${rows.length ? rows.map((row) => cardHtml(row, letters.get(row.id))).join("")
      : `<p class="empty">No exercises on this day. <button class="linkish" data-act="edit-routine" data-id="${esc(rid)}">Add some</button>.</p>`}
    ${completed
      ? `<div class="completed-note"><span>✓ ${esc(day.name)} complete</span><button data-act="uncomplete">Undo</button></div>`
      : `<button class="complete" data-act="complete">Complete workout</button>`}
  `;
}

// As you type in a set, the sets below it that you haven't filled in or logged
// follow along. Sets above never change.
function cascadePlaceholders(fromRow) {
  let w = fromRow.querySelector(".w");
  let r = fromRow.querySelector(".r");
  let wVal = w.value.trim() || w.placeholder;
  let rVal = r.value.trim() || r.placeholder;
  let next = fromRow.nextElementSibling;
  while (next && next.classList.contains("set")) {
    const nw = next.querySelector(".w");
    const nr = next.querySelector(".r");
    if (next.classList.contains("logged")) {
      wVal = nw.value.trim() || nw.placeholder;
      rVal = nr.value.trim() || nr.placeholder;
    } else {
      nw.placeholder = wVal;
      nr.placeholder = rVal;
      wVal = nw.value.trim() || wVal;
      rVal = nr.value.trim() || rVal;
    }
    next = next.nextElementSibling;
  }
}

function rerenderCard(exId) {
  const el = document.getElementById(`card-${exId}`);
  if (!el) return;
  const rows = db.dayExercises(state.dayId);
  const row = rows.find((r) => r.id === el.dataset.row);
  if (!row) return render();
  el.outerHTML = cardHtml(row, supersetLetters(rows).get(row.id));
}

function readSet(rowEl) {
  const w = rowEl.querySelector(".w");
  const r = rowEl.querySelector(".r");
  const wRaw = (w.value.trim() || w.placeholder).replace(",", ".");
  const rRaw = r.value.trim() || r.placeholder;
  const weight = /^-?\d+(\.\d+)?$/.test(wRaw) ? Number(wRaw) : NaN;
  const reps = /^\d+$/.test(rRaw) ? Number(rRaw) : NaN;
  w.classList.toggle("missing", !Number.isFinite(weight));
  r.classList.toggle("missing", !(reps > 0));
  if (!Number.isFinite(weight)) { w.focus(); return null; }
  if (!(reps > 0)) { r.focus(); return null; }
  return { weight, reps };
}

function logFromRow(rowEl, v) {
  const exId = rowEl.closest(".card").dataset.ex;
  const d = db.day(state.dayId);
  db.logSet({
    date: state.date, dayId: state.dayId, dayName: d ? d.name : null, exerciseId: exId,
    setNo: Number(rowEl.dataset.set), weight: v.weight, reps: v.reps, unit: unit(),
  });
  return exId;
}

async function toggleSet(rowEl) {
  const exId = rowEl.closest(".card").dataset.ex;
  if (rowEl.classList.contains("logged")) {
    db.deleteSet(state.date, exId, Number(rowEl.dataset.set));
  } else {
    const v = readSet(rowEl);
    if (!v) return;
    logFromRow(rowEl, v);
  }
  rerenderCard(exId);
  await changed();
}

// Editing the numbers on a set that's already logged saves the new values.
async function editLoggedSet(rowEl) {
  const v = readSet(rowEl);
  if (!v) return;
  logFromRow(rowEl, v);
  await changed();
}

// ---------- history views ----------

// Weight × reps in the display unit. Assisted (negative) sets count as zero.
function volume(sets) {
  return sets.reduce((sum, x) => sum + Math.max(0, toUnit(x.weight, x.unit) || 0) * x.reps, 0);
}

function fmtVolume(v) {
  return `${Math.round(v).toLocaleString()} ${unit()}`;
}

function renderHistory() {
  const sessions = db.history();
  if (!sessions.length) {
    main.innerHTML = `<h1 class="page-title">History</h1><p class="empty">Nothing logged yet.</p>`;
    return;
  }
  const lifetime = db.volumeByUnit().reduce((sum, r) => sum + Math.max(0, toUnit(r.v, r.unit)), 0);
  main.innerHTML = `
    <h1 class="page-title">History</h1>
    <section class="card lifetime">
      <span>Lifetime weight moved</span>
      <b>${fmtVolume(lifetime)}</b>
    </section>` + sessions.map((s) => {
    const byEx = new Map();
    for (const x of s.sets) {
      if (!byEx.has(x.exercise_id)) byEx.set(x.exercise_id, []);
      byEx.get(x.exercise_id).push(x);
    }
    // Plan order if the day still exists, else the order sets were logged.
    const planOrder = db.dayExercises(s.dayId).map((r) => r.exercise_id).filter((id) => byEx.has(id));
    const order = [...planOrder, ...[...byEx.keys()].filter((id) => !planOrder.includes(id))];
    return `
      <section class="card session">
        <div class="session-head">
          <h3>${esc(prettyDate(s.date))}${s.dayName ? ` <span>· ${esc(s.dayName)}${db.isComplete(s.date, s.dayId) ? " ✓" : ""}</span>` : ""}</h3>
          <span class="session-vol">${fmtVolume(volume(s.sets))}</span>
        </div>
        ${order.map((id) => `
          <div class="row"><button class="name linkish" data-act="ex-history" data-id="${esc(id)}">${esc(db.exercise(id).name)}</button>
          <span class="vals">${byEx.get(id).sort((a, b) => a.set_no - b.set_no).map(setText).join(" · ")}</span></div>`).join("")}
      </section>`;
  }).join("");
}

function renderExercise() {
  const ex = db.exercise(state.exerciseId);
  const rows = db.exerciseHistory(state.exerciseId);
  main.innerHTML = `
    <button class="back" data-act="back">‹ Back</button>
    <h1 class="page-title">${esc(ex.name)}</h1>
    ${rows.length ? `<section class="card">${rows.map((r) => `
      <div class="row"><span class="name">${esc(prettyDate(r.date, { month: "short", day: "numeric", year: "numeric" }))}</span>
      <span class="vals">${r.sets.map(setText).join(" · ")} ${esc(unit())}</span></div>`).join("")}</section>`
      : `<p class="empty">No sets logged yet.</p>`}`;
}

// ---------- routines list ----------

function renderRoutines() {
  const active = db.activeRoutineId();
  const list = db.routines();
  main.innerHTML = `
    <h1 class="page-title">Routines</h1>
    ${list.map((r) => {
      const ds = db.days(r.id);
      return `
        <button class="card routine-card${r.id === active ? " active" : ""}" data-act="edit-routine" data-id="${esc(r.id)}">
          <span class="rc-name">${esc(r.name)}${r.id === active ? `<span class="tag">ACTIVE</span>` : ""}</span>
          <span class="rc-days">${ds.length} day${ds.length === 1 ? "" : "s"}${ds.length ? ` · ${esc(ds.map((d) => d.name).join(", "))}` : ""}</span>
        </button>`;
    }).join("")}
    <button class="btn primary" data-act="new-routine">+ New routine</button>`;
}

// ---------- routine editor ----------

function exerciseRowHtml(row, i, rows, letter) {
  const ex = db.exercise(row.exercise_id);
  const open = state.openRow === row.id;
  const isLast = i === rows.length - 1;
  const summary = `${row.sets} × ${rangeText(row.rep_lo, row.rep_hi)}${row.warmup ? " · warm-up" : ""}`;
  return `
    <div class="ed-row${open ? " open" : ""}" data-row="${esc(row.id)}">
      <button class="ed-row-head" data-act="toggle-row" data-id="${esc(row.id)}">
        <span class="ed-name">${esc(ex.name)}${letter ? `<span class="tag">SS ${letter}</span>` : ""}</span>
        <span class="ed-sum">${summary} <span class="chev">${open ? "▾" : "▸"}</span></span>
      </button>
      ${open ? `
      <div class="ed-body">
        <div class="ed-line">
          <span class="lbl">Sets</span>
          <div class="stepper">
            <button data-act="sets" data-id="${esc(row.id)}" data-d="-1" aria-label="Fewer sets">−</button>
            <span>${row.sets}</span>
            <button data-act="sets" data-id="${esc(row.id)}" data-d="1" aria-label="More sets">+</button>
          </div>
        </div>
        <div class="ed-line">
          <span class="lbl">Reps</span>
          <div class="reps">
            <input class="rep" data-field="rep_lo" data-id="${esc(row.id)}" type="text" inputmode="numeric" value="${row.rep_lo}" aria-label="Lowest reps">
            <span>to</span>
            <input class="rep" data-field="rep_hi" data-id="${esc(row.id)}" type="text" inputmode="numeric" value="${row.rep_hi}" aria-label="Highest reps">
          </div>
        </div>
        <div class="ed-line toggles">
          <button class="chip${row.warmup ? " on" : ""}" data-act="warmup" data-id="${esc(row.id)}">Warm-up sets</button>
          ${isLast ? "" : `<button class="chip${row.superset_next ? " on" : ""}" data-act="superset" data-id="${esc(row.id)}">Superset with next</button>`}
        </div>
        <div class="ed-line actions">
          <button class="mini" data-act="move-row" data-id="${esc(row.id)}" data-d="-1" ${i === 0 ? "disabled" : ""} aria-label="Move up">↑</button>
          <button class="mini" data-act="move-row" data-id="${esc(row.id)}" data-d="1" ${isLast ? "disabled" : ""} aria-label="Move down">↓</button>
          <button class="mini wide" data-act="swap" data-id="${esc(row.id)}">Swap</button>
          <button class="mini wide danger" data-act="remove-row" data-id="${esc(row.id)}">Remove</button>
        </div>
      </div>` : ""}
    </div>`;
}

function renderRoutine() {
  const r = db.routine(state.routineId);
  if (!r) return go("routines");
  const isActive = db.activeRoutineId() === r.id;
  const list = db.days(r.id);
  const many = db.routines().length > 1;
  main.innerHTML = `
    <button class="back" data-act="routines">‹ Routines</button>
    <div class="ed-top">
      <input class="title-input" data-field="routine-name" value="${esc(r.name)}" placeholder="Routine name" aria-label="Routine name">
      ${isActive ? `<span class="tag big">ACTIVE</span>` : `<button class="btn primary small" data-act="activate">Use this routine</button>`}
    </div>
    <label class="tempo-edit">Tempo <input data-field="routine-tempo" value="${esc(r.tempo || "")}" placeholder="optional, e.g. 3:1:2:1" aria-label="Tempo"></label>
    ${list.map((d, i) => {
      const rows = db.dayExercises(d.id);
      const letters = supersetLetters(rows);
      return `
        <section class="card ed-day" data-day="${esc(d.id)}">
          <div class="ed-day-head">
            <span class="day-no">Day ${i + 1}</span>
            <button class="mini" data-act="move-day" data-id="${esc(d.id)}" data-d="-1" ${i === 0 ? "disabled" : ""} aria-label="Move day up">↑</button>
            <button class="mini" data-act="move-day" data-id="${esc(d.id)}" data-d="1" ${i === list.length - 1 ? "disabled" : ""} aria-label="Move day down">↓</button>
            <button class="mini danger" data-act="delete-day" data-id="${esc(d.id)}" aria-label="Delete day">✕</button>
          </div>
          <input class="day-name" data-field="day-name" data-id="${esc(d.id)}" value="${esc(d.name)}" placeholder="Day name" aria-label="Day name">
          <input class="day-sub" data-field="day-sub" data-id="${esc(d.id)}" value="${esc(d.subtitle || "")}" placeholder="Description (optional)" aria-label="Day description">
          <div class="ed-rows">${rows.map((row, j) => exerciseRowHtml(row, j, rows, letters.get(row.id))).join("")}</div>
          <button class="add-ex" data-act="add-ex" data-id="${esc(d.id)}">+ Add exercise</button>
        </section>`;
    }).join("")}
    <button class="btn" data-act="add-day">+ Add day</button>
    <div class="ed-footer">
      <button class="btn" data-act="duplicate">Duplicate routine</button>
      ${many ? `<button class="btn danger" data-act="delete-routine">Delete routine</button>` : ""}
    </div>`;
}

// ---------- exercise picker ----------

function pickerList() {
  const q = state.pickerQuery.trim().toLowerCase();
  const m = state.pickerMuscle;
  const taken = new Set(db.dayExercises(state.picker.dayId).map((r) => r.exercise_id));
  const swapping = state.picker.mode === "swap" ? db.dayExercises(state.picker.dayId).find((r) => r.id === state.picker.rowId) : null;
  const all = [...db.customExercises(), ...CATALOG];
  const items = all.filter((e) =>
    (m === "All" || (m === "Custom" ? e.custom : e.muscle === m)) &&
    (!q || e.name.toLowerCase().includes(q) || e.muscle.toLowerCase().includes(q) || (e.equipment || "").toLowerCase().includes(q))
  );
  const exact = all.some((e) => e.name.toLowerCase() === q);
  let html = "";
  if (q && !exact) {
    html += `<button class="pick create" data-act="create-ex"><b>+ Create “${esc(state.pickerQuery.trim())}”</b><small>Custom exercise${m !== "All" && m !== "Custom" ? ` · ${esc(m)}` : ""}</small></button>`;
  }
  html += items.map((e) => {
    const isTaken = taken.has(e.id) && !(swapping && swapping.exercise_id === e.id);
    return `<button class="pick" data-act="pick" data-id="${esc(e.id)}" ${isTaken ? "disabled" : ""}>
      <b>${esc(e.name)}</b><small>${esc(e.muscle)}${e.equipment ? ` · ${esc(e.equipment)}` : ""}${isTaken ? " · already in this day" : ""}</small></button>`;
  }).join("");
  if (!items.length && !q) html += `<p class="empty">No custom exercises yet. Type a name above to make one.</p>`;
  return html;
}

function renderPicker() {
  const p = state.picker;
  const swapping = p.mode === "swap" ? db.exercise(db.dayExercises(p.dayId).find((r) => r.id === p.rowId)?.exercise_id) : null;
  main.innerHTML = `
    <button class="back" data-act="close-picker">‹ Cancel</button>
    <h1 class="page-title">${swapping ? `Swap ${esc(swapping.name)}` : "Add exercise"}</h1>
    <input id="picker-q" class="search" type="search" placeholder="Search or type a new exercise" value="${esc(state.pickerQuery)}" autocomplete="off" aria-label="Search exercises">
    <div class="chips">
      ${["All", ...MUSCLES, "Custom"].map((m) => `<button class="chip${state.pickerMuscle === m ? " on" : ""}" data-act="muscle" data-id="${m}">${m}</button>`).join("")}
    </div>
    <div id="pick-list">${pickerList()}</div>`;
}

async function choose(exerciseId) {
  const p = state.picker;
  if (p.mode === "swap") {
    db.updateDayExercise(p.rowId, { exercise_id: exerciseId });
    state.openRow = p.rowId;
  } else {
    state.openRow = db.addDayExercise(p.dayId, exerciseId);
  }
  state.picker = null;
  go("routine");
  // Land back where you were building: the row you just added or swapped.
  const el = main.querySelector(`.ed-row[data-row="${CSS.escape(state.openRow)}"]`);
  if (el) el.scrollIntoView({ block: "center" });
  else window.scrollTo(0, state.editorScroll || 0);
  await changed();
}

// ---------- settings ----------

async function prepareConnectLink() {
  const a = document.getElementById("connect-manual");
  if (!a) return;
  a.removeAttribute("href");
  const url = await dbx.prepareManualConnect();
  if (document.body.contains(a)) a.href = url;
}

// ---------- home screen install help ----------

let installPrompt = null; // Android/Chrome one-tap install, when the browser offers it
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  installPrompt = e;
  if (state.view === "settings" && !inputFocused()) render();
});
window.addEventListener("appinstalled", () => {
  installPrompt = null;
  if (state.view === "settings") render();
});

function platform() {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch support gives it away.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "other";
}

const SHARE_ICON = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8"/></svg>`;

function installCard() {
  if (dbx.isStandalone()) return "";
  const p = platform();
  const reconnect = dbx.isConnected()
    ? `<p>The Home Screen app keeps its own storage, so connect Dropbox once more inside it. Your data is already in Dropbox and comes right back.</p>`
    : "";
  if (p === "ios") {
    return `
      <section class="card setting" id="install-card">
        <h3>Add to Home Screen</h3>
        <p>Opens full screen like a regular app, with no browser bars.</p>
        <ol class="steps">
          <li>In Safari, tap the <b>Share</b> button ${SHARE_ICON}. If you don't see it, tap <b>•••</b> first, then <b>Share</b>.</li>
          <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
          <li>Tap <b>Add</b>, then open <b>Workout</b> from your Home Screen.</li>
        </ol>
        ${reconnect}
      </section>`;
  }
  if (p === "android") {
    return `
      <section class="card setting" id="install-card">
        <h3>Add to Home Screen</h3>
        <p>Opens full screen like a regular app, with no browser bars.</p>
        ${installPrompt ? `<button class="btn primary" data-act="install">Install app</button>` : `
        <ol class="steps">
          <li>In Chrome, tap the <b>⋮</b> menu at the top right.</li>
          <li>Tap <b>Add to Home screen</b> (it may say <b>Install app</b>).</li>
          <li>Tap <b>Install</b> or <b>Add</b>, then open <b>Workout</b> from your Home screen.</li>
        </ol>`}
        ${reconnect}
      </section>`;
  }
  return "";
}

function renderSettings() {
  const u = unit();
  let dropbox;
  if (!dbx.isConfigured()) {
    dropbox = `<p class="err">No Dropbox app key yet. Add it to <code>js/config.js</code>.</p>`;
  } else if (dbx.isConnected()) {
    dropbox = `
      <p>Connected. Your log and routines are saved to <b>Apps / (this app's folder) / workouts.sqlite</b> in your Dropbox.</p>
      <button class="btn" data-act="sync-now">Sync now</button>
      <button class="btn danger" data-act="disconnect">Disconnect</button>`;
  } else if (dbx.isStandalone()) {
    dropbox = `
      <p>Connect once on each device. The app can only see its own folder in your Dropbox, nothing else.</p>
      <p>1. Tap Connect and approve in Dropbox. 2. Copy the code Dropbox shows. 3. Come back here and paste it.</p>
      <a class="btn primary" id="connect-manual" target="_blank" rel="noopener" style="text-decoration:none">Connect Dropbox</a>
      <div class="code-row">
        <input id="dbx-code" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Paste code">
        <button class="btn" data-act="dbx-code-go">Done</button>
      </div>
      <p class="err" id="dbx-code-err"></p>`;
  } else {
    dropbox = `
      <p>Connect once on each device. The app can only see its own folder in your Dropbox, nothing else.</p>
      <button class="btn primary" data-act="connect">Connect Dropbox</button>`;
  }
  main.innerHTML = `
    <h1 class="page-title">Settings</h1>
    ${installCard()}
    <section class="card setting">
      <h3>Dropbox</h3>
      ${dropbox}
    </section>
    <section class="card setting">
      <h3>Theme</h3>
      <div class="themes">
        ${THEMES.map((t) => `
          <button class="theme${currentTheme() === t.id ? " on" : ""}" data-act="theme" data-id="${t.id}">
            <span class="swatch">${t.colors.map((c) => `<i style="background:${c}"></i>`).join("")}</span>
            <span>${esc(t.name)}${t.note ? `<small>${esc(t.note)}</small>` : ""}</span>
          </button>`).join("")}
      </div>
    </section>
    <section class="card setting">
      <h3>Week starts on</h3>
      <p>Completed workouts reset at the start of each week.</p>
      <div class="seg">
        <button data-act="week-start" data-id="1" class="${db.getSetting("week_start", "1") === "1" ? "active" : ""}">Monday</button>
        <button data-act="week-start" data-id="0" class="${db.getSetting("week_start", "1") === "0" ? "active" : ""}">Sunday</button>
      </div>
    </section>
    <section class="card setting">
      <h3>Units</h3>
      <p>Old entries are converted for display.</p>
      <div class="seg">
        <button data-act="unit" data-id="lb" class="${u === "lb" ? "active" : ""}">lb</button>
        <button data-act="unit" data-id="kg" class="${u === "kg" ? "active" : ""}">kg</button>
      </div>
    </section>
    <section class="card setting">
      <h3>Backup</h3>
      <p>Download the SQLite file. ${db.setCount()} sets logged.</p>
      <button class="btn" data-act="export">Download database</button>
    </section>
    <section class="card setting">
      <h3>Start over</h3>
      <p>These sync to Dropbox and your other devices, so reconnecting won't bring the old data back. Download a backup first if you might want it.</p>
      <button class="btn danger" data-act="clear-history">Clear workout history</button>
      <button class="btn danger" data-act="reset-all">Reset everything</button>
    </section>
    <p class="version">Version ${APP_VERSION}</p>`;
  prepareConnectLink();
}

// ---------- themes (per device) ----------

const THEMES = [
  { id: "gold", name: "Gold", colors: ["#111214", "#c9b26b", "#4fb477"], bar: "#111214" },
  { id: "ocean", name: "Ocean", colors: ["#0e1319", "#5aa9e6", "#4fb477"], bar: "#0e1319" },
  { id: "light", name: "Light", colors: ["#f4f4f1", "#8a6d1f", "#23864a"], bar: "#f4f4f1" },
  { id: "orange", name: "Orange", colors: ["#15110e", "#f08a3c", "#4fb477"], bar: "#15110e" },
  { id: "red", name: "Red", colors: ["#140f10", "#e5484d", "#4fb477"], bar: "#140f10" },
  { id: "pink", name: "Pink", colors: ["#fdf3f6", "#d6457f", "#23864a"], bar: "#fdf3f6" },
  { id: "purple", name: "Purple", colors: ["#120f17", "#a78bfa", "#4fb477"], bar: "#120f17" },
  { id: "colorblind", name: "Color-blind friendly", note: "Blue, orange, yellow", colors: ["#111214", "#e69f00", "#56b4e9"], bar: "#111214" },
];

function currentTheme() {
  try {
    return localStorage.getItem("wt.theme") || "gold";
  } catch {
    return "gold";
  }
}

function applyTheme(id) {
  const t = THEMES.find((x) => x.id === id) || THEMES[0];
  document.documentElement.dataset.theme = t.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", t.bar);
  try {
    localStorage.setItem("wt.theme", t.id);
  } catch { /* private mode: theme just won't persist */ }
}

// ---------- top-level render ----------

const NAV_FOR = { exercise: null, routine: "routines", picker: "routines" };

function render() {
  state.renderPending = false;
  const navView = state.view in NAV_FOR ? NAV_FOR[state.view] ?? state.backTo : state.view;
  for (const b of document.querySelectorAll(".nav")) b.classList.toggle("active", b.dataset.view === navView);
  if (state.view === "workout") renderWorkout();
  else if (state.view === "history") renderHistory();
  else if (state.view === "exercise") renderExercise();
  else if (state.view === "routines") renderRoutines();
  else if (state.view === "routine") renderRoutine();
  else if (state.view === "picker" && state.picker) renderPicker();
  else if (state.view === "settings") renderSettings();
  else { state.view = "workout"; renderWorkout(); }
  renderBanner();
}

let bannerMessage = "";

function renderBanner() {
  let html = bannerMessage ? esc(bannerMessage) : "";
  if (!html && !dbx.isConnected()) {
    html = dbx.isConfigured()
      ? `Saved on this device only. <button data-goto="settings">Connect Dropbox</button> to keep it safe and use it on other devices.`
      : `Saved on this device only. Dropbox isn't set up yet.`;
  }
  banner.innerHTML = html;
  banner.hidden = !html;
}

// The top-right dot shows sync state; tapping it explains what it means.
const syncPop = document.getElementById("sync-pop");
let syncState = { status: "idle", message: "" };

function statusSentence({ status, message }) {
  switch (status) {
    case "synced": return "Everything is backed up to Dropbox.";
    case "pending": return "Saving your latest change to Dropbox…";
    case "syncing": return "Syncing with Dropbox…";
    case "offline": return "You're offline. Changes are kept on this device and go to Dropbox when you're back online.";
    case "error": return message || "Something went wrong syncing with Dropbox. Your changes are kept on this device.";
    default:
      return dbx.isConnected()
        ? "Connected to Dropbox."
        : "Saved on this device only. Connect Dropbox in Settings to back it up and use it on other devices.";
  }
}

function renderSyncPop() {
  syncPop.innerHTML = `
    <p>${esc(statusSentence(syncState))}</p>
    <ul>
      <li style="--dot: var(--good)">Backed up to Dropbox</li>
      <li style="--dot: var(--warn)">Saving</li>
      <li style="--dot: var(--muted)">On this device only, or offline</li>
      <li style="--dot: var(--bad)">Problem syncing</li>
    </ul>`;
}

function toggleSyncPop(open = syncPop.hidden) {
  syncPop.hidden = !open;
  syncEl.setAttribute("aria-expanded", String(open));
  if (open) renderSyncPop();
}

syncEl.addEventListener("click", (e) => {
  e.stopPropagation();
  toggleSyncPop();
});
document.addEventListener("click", (e) => {
  if (!syncPop.hidden && !syncPop.contains(e.target)) toggleSyncPop(false);
});

sync.onStatus((st) => {
  syncState = st;
  const { status, message } = st;
  syncEl.className = `sync ${status}`;
  syncEl.setAttribute("aria-label", `Sync status: ${statusSentence(st)}`);
  if (!syncPop.hidden) renderSyncPop();
  if (status === "error" && message) {
    bannerMessage = message;
    renderBanner();
  } else if (status === "synced" && bannerMessage) {
    bannerMessage = "";
    renderBanner();
  }
});

// Redraw when another device's changes arrive, but never under the user's
// fingers: if they're typing, wait until they leave the box.
sync.onPulled(() => {
  if (inputFocused()) state.renderPending = true;
  else render();
});

// ---------- actions ----------

const actions = {
  "day": (id) => {
    // A day finished in the week you're looking at opens the date you finished
    // it. Any other day opens on the date you're working from.
    state.dayId = id;
    state.date = doneInWeek(state.anchor).get(id) || state.anchor;
    render();
  },
  "to-anchor": () => {
    state.date = state.anchor;
    render();
  },
  "to-today": () => {
    state.anchor = state.date = today();
    state.followToday = true;
    state.dayId = defaultDay();
    render();
  },
  "complete": async () => {
    const d = db.day(state.dayId);
    db.setComplete(state.date, state.dayId, d ? d.name : null, true);
    render();
    await changed();
  },
  "uncomplete": async () => {
    db.setComplete(state.date, state.dayId, null, false);
    // Un-completing a day you were viewing: keep working on that date.
    if (state.date !== state.anchor) {
      state.anchor = state.date;
      state.followToday = state.anchor === today();
    }
    render();
    await changed();
  },
  "ex-history": (id) => { state.backTo = state.view === "exercise" ? state.backTo : state.view; go("exercise", { exerciseId: id }); },
  "back": () => go(state.backTo || "workout"),
  "routines": () => go("routines"),
  "add-set": (_, el) => {
    const card = el.closest(".card");
    const key = `${state.date}|${card.dataset.ex}`;
    state.extraSets[key] = (state.extraSets[key] || 0) + 1;
    rerenderCard(card.dataset.ex);
    const rows = document.querySelectorAll(`#card-${CSS.escape(card.dataset.ex)} .set`);
    rows[rows.length - 1]?.querySelector(".w")?.focus();
  },

  // routines
  "new-routine": async () => {
    const id = db.createRoutine("New routine");
    if (!db.activeRoutineId() || db.routines().length === 1) db.setActiveRoutine(id);
    go("routine", { routineId: id, openRow: null });
    const name = main.querySelector("[data-field='routine-name']");
    name?.focus();
    name?.select();
    await changed();
  },
  "edit-routine": (id) => go("routine", { routineId: id, openRow: null }),
  "activate": async () => {
    db.setActiveRoutine(state.routineId);
    state.dayId = null;
    render();
    await changed();
  },
  "duplicate": async () => {
    const id = db.duplicateRoutine(state.routineId);
    go("routine", { routineId: id, openRow: null });
    await changed();
  },
  "delete-routine": async () => {
    const r = db.routine(state.routineId);
    if (!confirm(`Delete “${r.name}”? Your logged history stays.`)) return;
    const wasActive = db.activeRoutineId() === r.id;
    db.deleteRoutine(r.id);
    if (wasActive) {
      const next = db.routines()[0];
      if (next) db.setActiveRoutine(next.id);
      state.dayId = null;
    }
    go("routines");
    await changed();
  },
  "add-day": async () => {
    const n = db.days(state.routineId).length + 1;
    const id = db.addDay(state.routineId, `Day ${n}`);
    render();
    const input = main.querySelector(`[data-field='day-name'][data-id='${CSS.escape(id)}']`);
    input?.scrollIntoView({ block: "center" });
    input?.focus();
    input?.select();
    await changed();
  },
  "move-day": async (id, el) => { db.moveDay(id, Number(el.dataset.d)); render(); await changed(); },
  "delete-day": async (id) => {
    const d = db.day(id);
    if (!confirm(`Delete “${d.name}” from this routine? Your logged history stays.`)) return;
    db.deleteDay(id);
    if (state.dayId === id) state.dayId = null;
    render();
    await changed();
  },
  "toggle-row": (id) => { state.openRow = state.openRow === id ? null : id; render(); },
  "sets": async (id, el) => {
    const row = rowById(id);
    db.updateDayExercise(id, { sets: Math.min(10, Math.max(1, row.sets + Number(el.dataset.d))) });
    render();
    await changed();
  },
  "warmup": async (id) => { db.updateDayExercise(id, { warmup: rowById(id).warmup ? 0 : 1 }); render(); await changed(); },
  "superset": async (id) => { db.updateDayExercise(id, { superset_next: rowById(id).superset_next ? 0 : 1 }); render(); await changed(); },
  "move-row": async (id, el) => { db.moveDayExercise(id, Number(el.dataset.d)); render(); await changed(); },
  "remove-row": async (id) => {
    const row = rowById(id);
    if (!confirm(`Remove ${db.exercise(row.exercise_id).name} from this day? Its history stays.`)) return;
    db.removeDayExercise(id);
    state.openRow = null;
    render();
    await changed();
  },
  "add-ex": (dayId) => openPicker({ mode: "add", dayId }),
  "swap": (rowId) => openPicker({ mode: "swap", dayId: rowById(rowId).day_id, rowId }),

  // picker
  "close-picker": () => {
    state.picker = null;
    go("routine");
    window.scrollTo(0, state.editorScroll || 0);
  },
  "muscle": (m) => {
    state.pickerMuscle = m;
    for (const c of main.querySelectorAll(".chips .chip")) c.classList.toggle("on", c.dataset.id === m);
    document.getElementById("pick-list").innerHTML = pickerList();
  },
  "pick": (id) => choose(id),
  "create-ex": () => {
    const m = state.pickerMuscle;
    const id = db.createCustomExercise(state.pickerQuery, m !== "All" && m !== "Custom" ? m : null);
    return choose(id);
  },

  // settings
  "install": async () => {
    if (!installPrompt) return;
    const p = installPrompt;
    installPrompt = null;
    await p.prompt();
    render();
  },
  "unit": async (u) => { db.setSetting("unit", u); render(); await changed(); },
  "week-start": async (v) => { db.setSetting("week_start", v); render(); await changed(); },
  "theme": (t) => { applyTheme(t); render(); },
  "connect": () => dbx.startConnect(),
  "dbx-code-go": async () => {
    const input = document.getElementById("dbx-code");
    const err = document.getElementById("dbx-code-err");
    if (!input.value.trim()) { input.focus(); return; }
    try {
      await dbx.finishManualConnect(input.value);
      sync.forgetRemote();
      bannerMessage = "Connected to Dropbox.";
      go("workout");
      if (await sync.syncNow()) {
        state.dayId = defaultDay();
        render();
      }
    } catch (e) {
      err.textContent = e.message;
    }
  },
  "disconnect": async () => {
    if (!confirm("Disconnect Dropbox on this device? Your data stays in Dropbox and on this device.")) return;
    await dbx.disconnect();
    sync.forgetRemote();
    render();
  },
  "sync-now": () => sync.syncNow(),
  "clear-history": async () => {
    if (!confirm("Clear all logged sets and completed workouts? Your routines stay. This can't be undone.")) return;
    db.clearHistory();
    state.extraSets = {};
    afterReset();
    await changed();
  },
  "reset-all": async () => {
    if (!confirm("Reset everything? This deletes all history, routines and custom exercises, and restores the starter plan and default settings. This can't be undone.")) return;
    if (!confirm("Are you sure? Everything will be erased on all your devices.")) return;
    db.resetEverything();
    applyTheme("gold");
    state.extraSets = {};
    afterReset();
    await changed();
  },
  "export": () => {
    const blob = new Blob([db.exportBytes()], { type: "application/x-sqlite3" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `workouts-${today()}.sqlite`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  },
};

function afterReset() {
  state.anchor = state.date = today();
  state.followToday = true;
  state.dayId = defaultDay();
  state.routineId = null;
  state.openRow = null;
  const msg = (bannerMessage = "Done. You're starting fresh.");
  go("workout");
  setTimeout(() => {
    if (bannerMessage === msg) {
      bannerMessage = "";
      renderBanner();
    }
  }, 4000);
}

function rowById(id) {
  for (const d of db.days(state.routineId)) {
    const r = db.dayExercises(d.id).find((x) => x.id === id);
    if (r) return r;
  }
  throw new Error(`Row ${id} not found`);
}

function openPicker(picker) {
  state.editorScroll = window.scrollY;
  state.picker = picker;
  state.pickerQuery = "";
  state.pickerMuscle = "All";
  go("picker");
}

// ---------- events ----------

document.querySelector(".top").addEventListener("click", (e) => {
  const b = e.target.closest(".nav");
  if (!b) return;
  state.picker = null;
  go(b.dataset.view);
});

banner.addEventListener("click", (e) => {
  const b = e.target.closest("[data-goto]");
  if (b) go(b.dataset.goto);
});

main.addEventListener("click", async (e) => {
  const check = e.target.closest(".check");
  if (check) {
    await toggleSet(check.closest(".set"));
    return;
  }
  const el = e.target.closest("[data-act]");
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.act];
  if (fn) await fn(el.dataset.id, el);
});

// Text fields in the editor save on change without redrawing, so moving
// from one box to the next never loses focus.
async function saveField(t) {
  const f = t.dataset.field;
  const v = t.value.trim();
  if (f === "routine-name") {
    if (!v) { t.value = db.routine(state.routineId).name; return; }
    db.updateRoutine(state.routineId, { name: v });
  } else if (f === "routine-tempo") {
    db.updateRoutine(state.routineId, { tempo: v || null });
  } else if (f === "day-name") {
    if (!v) { t.value = db.day(t.dataset.id).name; return; }
    db.updateDay(t.dataset.id, { name: v });
  } else if (f === "day-sub") {
    db.updateDay(t.dataset.id, { subtitle: v || null });
  } else if (f === "rep_lo" || f === "rep_hi") {
    const row = rowById(t.dataset.id);
    const n = /^\d+$/.test(v) ? Math.min(100, Math.max(1, Number(v))) : null;
    if (n === null) { t.value = row[f]; return; }
    let lo = f === "rep_lo" ? n : row.rep_lo;
    let hi = f === "rep_hi" ? n : row.rep_hi;
    // Keep the range valid by moving the other end, not by swapping.
    if (lo > hi) { if (f === "rep_lo") hi = lo; else lo = hi; }
    db.updateDayExercise(row.id, { rep_lo: lo, rep_hi: hi });
    const box = t.closest(".ed-row");
    box.querySelector("[data-field='rep_lo']").value = lo;
    box.querySelector("[data-field='rep_hi']").value = hi;
    const r2 = rowById(row.id);
    box.querySelector(".ed-sum").firstChild.textContent = `${r2.sets} × ${rangeText(lo, hi)}${r2.warmup ? " · warm-up" : ""} `;
  } else {
    return;
  }
  await changed();
}

main.addEventListener("change", async (e) => {
  const t = e.target;
  if (t.id === "date") {
    if (!t.value) return;
    state.anchor = state.date = t.value > today() ? today() : t.value;
    state.followToday = state.anchor === today();
    // Show what you did on that date if anything; otherwise keep the day you're on.
    const ids = activeDays().map((d) => d.id);
    const onDate = db.daysLoggedOn(state.date).find((id) => ids.includes(id))
      || ids.find((id) => db.isComplete(state.date, id));
    state.dayId = onDate || (state.followToday ? defaultDay() : state.dayId);
    render();
    return;
  }
  if (t.dataset.field) {
    await saveField(t);
    return;
  }
  const row = t.closest(".set");
  if (row && row.classList.contains("logged")) await editLoggedSet(row);
});

main.addEventListener("input", (e) => {
  e.target.classList.remove("missing");
  const setRow = e.target.closest(".set");
  if (setRow) cascadePlaceholders(setRow);
  if (e.target.id === "picker-q") {
    state.pickerQuery = e.target.value;
    document.getElementById("pick-list").innerHTML = pickerList();
  }
});

// Enter: weight → reps → log the set. In other fields, Enter just closes the keyboard.
main.addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;
  const t = e.target;
  const row = t.closest(".set");
  if (!row) {
    if (t.tagName === "INPUT" && t.id !== "picker-q") t.blur();
    return;
  }
  e.preventDefault();
  if (t.classList.contains("w")) row.querySelector(".r").focus();
  else if (!row.classList.contains("logged")) await toggleSet(row);
  else t.blur();
});

main.addEventListener("focusout", () => {
  setTimeout(() => {
    if (state.renderPending && !inputFocused()) render();
  }, 0);
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (state.followToday && state.anchor !== today()) {
    state.anchor = state.date = today();
    state.dayId = defaultDay();
    if (!inputFocused()) render();
  }
  sync.syncNow();
});

window.addEventListener("online", () => sync.syncNow());

// ---------- updates ----------

// Ask for the newest service worker on every open (never from the browser's
// cache), and when an update takes over, reload once so the whole app is the
// new version. Never reload under someone's fingers: wait until they leave the box.
function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  // Once a version is in control, any change of control is an update.
  // (The very first install also fires controllerchange; that one isn't.)
  let controlled = Boolean(navigator.serviceWorker.controller);
  let reloading = false;

  const reloadWhenIdle = () => {
    if (reloading) return;
    if (inputFocused()) {
      main.addEventListener("focusout", () => setTimeout(reloadWhenIdle, 300), { once: true });
      return;
    }
    reloading = true;
    window.location.reload();
  };

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (controlled) reloadWhenIdle();
    controlled = true;
  });

  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" })
    .then((reg) => {
      reg.update().catch(() => {});
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") reg.update().catch(() => {});
      });
    })
    .catch((e) => console.warn("Service worker not registered", e));
}

// ---------- start ----------

async function start() {
  applyTheme(currentTheme());
  try {
    await db.init();
  } catch (e) {
    console.error(e);
    main.innerHTML = `<p class="empty err">Couldn't start the database: ${esc(e.message)}</p>`;
    return;
  }

  try {
    if (await dbx.finishConnectIfReturning()) {
      sync.forgetRemote(); // new connection: merge whatever is here into Dropbox
      bannerMessage = "Connected to Dropbox.";
    }
  } catch (e) {
    console.error(e);
    bannerMessage = e.message;
  }

  state.dayId = defaultDay();
  render();

  // First sync. On a new device this brings down existing history and routines,
  // so pick the day again once it arrives.
  if (await sync.syncNow()) {
    state.dayId = defaultDay();
    if (inputFocused()) state.renderPending = true;
    else render();
  }

  registerServiceWorker();
}

start();
