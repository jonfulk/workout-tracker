import { PLAN, TEMPO, findDay } from "./plan.js";
import * as db from "./db.js";
import * as dbx from "./dropbox.js";
import * as sync from "./sync.js";

// ---------- state ----------

const state = {
  view: "workout",      // workout | history | exercise | settings
  dayId: "d1",
  date: today(),
  followToday: true,    // keep the date on "today" if the app stays open past midnight
  exerciseId: null,     // for the exercise history view
  renderPending: false, // a sync pulled new data while the user was typing
};

const main = document.getElementById("main");
const banner = document.getElementById("banner");
const syncEl = document.getElementById("sync");

const EXERCISE_NAMES = new Map();
for (const day of PLAN) for (const ex of day.exercises) if (!EXERCISE_NAMES.has(ex.id)) EXERCISE_NAMES.set(ex.id, ex.name);

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
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
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
  const w = toUnit(s.weight, s.unit);
  return `${fmt(w)}×${s.reps}`;
}

function rangeText(r) {
  return r[0] === r[1] ? `${r[0]}` : `${r[0]}–${r[1]}`;
}

function inputFocused() {
  const a = document.activeElement;
  return a && a.tagName === "INPUT" && main.contains(a);
}

// ---------- workout view ----------

function defaultDay() {
  // Something already logged today? Stay on that day.
  const todays = db.history(1)[0];
  if (todays && todays.date === state.date) return todays.dayId;
  // Otherwise the day after the last one you did.
  const last = db.lastDayLogged();
  if (!last) return PLAN[0].id;
  const i = PLAN.findIndex((d) => d.id === last);
  return PLAN[(i + 1) % PLAN.length].id;
}

function warmup(ex, last) {
  if (!ex.main || !last || !last.sets.length) return "";
  const top = Math.max(...last.sets.map((s) => toUnit(s.weight, s.unit) ?? 0));
  if (!(top > 0)) return "";
  const step = unit() === "kg" ? 2 : 5;
  const r = (x) => Math.max(step, Math.round(x / step) * step);
  const a = `${r(top * 0.6)}–${r(top * 0.67)}`;
  const b = `${r(top * 0.73)}–${r(top * 0.8)}`;
  return `Warm-up: ${a} × 6–8, optional ${b} × 4–6`;
}

function progression(ex, last) {
  if (!last) return "";
  const needed = ex.minSets || ex.sets;
  if (last.sets.length < needed) return "";
  if (!last.sets.every((s) => s.reps >= ex.reps[1])) return "";
  const assisted = last.sets.some((s) => s.weight < 0);
  return assisted
    ? "↑ Top of the range on every set last time. Use less assistance."
    : "↑ Top of the range on every set last time. Add weight.";
}

function cardHtml(day, ex) {
  const logged = db.setsOn(state.date, ex.id);
  const last = db.lastSession(ex.id, state.date);
  const loggedCount = Object.keys(logged).length;
  const done = loggedCount >= (ex.minSets || ex.sets);
  const setsLabel = ex.minSets ? `${ex.minSets}–${ex.sets}` : `${ex.sets}`;

  let rows = "";
  for (let n = 1; n <= ex.sets; n++) {
    const s = logged[n];
    // Placeholders: weight from the set you just did today, else last session;
    // reps from the same set last session. A blank box logs its placeholder.
    const prev = last ? last.sets.find((x) => x.set_no === n) || last.sets[last.sets.length - 1] : null;
    const earlier = logged[n - 1];
    const wSrc = earlier || prev;
    const phW = wSrc ? fmt(toUnit(wSrc.weight, wSrc.unit)) : unit();
    const phR = prev ? prev.reps : earlier ? earlier.reps : `${ex.reps[0]}–${ex.reps[1]}`;
    const optional = ex.minSets && n > ex.minSets ? `<span class="optional">opt</span>` : "";
    rows += `
      <div class="set${s ? " logged" : ""}" data-set="${n}">
        <span class="n">${n}${optional}</span>
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
    : `<p class="info">No history yet. Pick a weight you can do ${ex.reps[1]} clean reps with at this tempo.</p>`;
  const up = progression(ex, last);
  const wu = warmup(ex, last);

  return `
    <section class="card${done ? " done" : ""}" id="card-${esc(ex.id)}" data-ex="${esc(ex.id)}">
      <div class="card-head">
        <h2><button class="ex-name" data-ex="${esc(ex.id)}">${esc(ex.name)}</button>${ex.superset ? `<span class="tag">SUPERSET ${esc(ex.superset)}</span>` : ""}</h2>
        <span class="target">${setsLabel} × ${rangeText(ex.reps)}</span>
      </div>
      ${lastLine}
      ${up ? `<p class="info up">${esc(up)}</p>` : ""}
      ${wu ? `<p class="info">${esc(wu)}</p>` : ""}
      <details><summary>Form cues</summary><p>${esc(ex.note)}</p></details>
      <div class="col-labels"><span></span><span>${esc(unit())}</span><span></span><span>reps</span><span></span></div>
      <div class="sets">${rows}</div>
    </section>`;
}

function renderWorkout() {
  const day = findDay(state.dayId);
  const isToday = state.date === today();
  main.innerHTML = `
    <div class="days">
      ${PLAN.map((d) => `
        <button class="day${d.id === day.id ? " active" : ""}" data-day="${d.id}">
          <small>${esc(d.name)}</small><b>${esc(d.title)}</b>
        </button>`).join("")}
    </div>
    <div class="dateline">
      <h1>${esc(day.title)}<span>${esc(day.focus)}</span></h1>
      <input type="date" id="date" value="${state.date}" max="${today()}" aria-label="Workout date">
    </div>
    <p class="tempo">${isToday ? "" : `<b>Editing ${esc(prettyDate(state.date))}.</b> `}Tempo <b>${TEMPO}</b>: 3s down · 1s pause · 2s up · 1s pause</p>
    ${day.exercises.map((ex) => cardHtml(day, ex)).join("")}
  `;
}

function rerenderCard(exId) {
  const day = findDay(state.dayId);
  const ex = day.exercises.find((e) => e.id === exId);
  const el = document.getElementById(`card-${exId}`);
  if (!ex || !el) return;
  el.outerHTML = cardHtml(day, ex);
}

function readSet(row) {
  const w = row.querySelector(".w");
  const r = row.querySelector(".r");
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

async function toggleSet(row) {
  const card = row.closest(".card");
  const exId = card.dataset.ex;
  const setNo = Number(row.dataset.set);
  if (row.classList.contains("logged")) {
    db.deleteSet(state.date, exId, setNo);
  } else {
    const v = readSet(row);
    if (!v) return;
    db.logSet({ date: state.date, dayId: state.dayId, exerciseId: exId, setNo, weight: v.weight, reps: v.reps, unit: unit() });
  }
  rerenderCard(exId);
  await sync.changed();
}

// Editing the numbers on a set that's already logged saves the new values.
async function editLoggedSet(row) {
  const v = readSet(row);
  if (!v) return;
  const exId = row.closest(".card").dataset.ex;
  db.logSet({ date: state.date, dayId: state.dayId, exerciseId: exId, setNo: Number(row.dataset.set), weight: v.weight, reps: v.reps, unit: unit() });
  await sync.changed();
}

// ---------- history views ----------

function renderHistory() {
  const sessions = db.history();
  if (!sessions.length) {
    main.innerHTML = `<h1 class="page-title">History</h1><p class="empty">Nothing logged yet.</p>`;
    return;
  }
  main.innerHTML = `<h1 class="page-title">History</h1>` + sessions.map((s) => {
    const day = findDay(s.dayId);
    const byEx = new Map();
    for (const x of s.sets) {
      if (!byEx.has(x.exercise_id)) byEx.set(x.exercise_id, []);
      byEx.get(x.exercise_id).push(x);
    }
    // Keep plan order.
    const order = day.exercises.map((e) => e.id).filter((id) => byEx.has(id));
    for (const id of byEx.keys()) if (!order.includes(id)) order.push(id);
    return `
      <section class="card session">
        <h3>${esc(prettyDate(s.date))} <span>· ${esc(day.name)} ${esc(day.title)}</span></h3>
        ${order.map((id) => `
          <div class="row"><span class="name">${esc(EXERCISE_NAMES.get(id) || id)}</span>
          <span class="vals">${byEx.get(id).map(setText).join(" · ")}</span></div>`).join("")}
      </section>`;
  }).join("");
}

function renderExercise() {
  const name = EXERCISE_NAMES.get(state.exerciseId) || state.exerciseId;
  const rows = db.exerciseHistory(state.exerciseId);
  main.innerHTML = `
    <button class="back" id="back">‹ Back</button>
    <h1 class="page-title">${esc(name)}</h1>
    ${rows.length ? `<section class="card">${rows.map((r) => `
      <div class="row"><span class="name">${esc(prettyDate(r.date, { month: "short", day: "numeric", year: "numeric" }))}</span>
      <span class="vals">${r.sets.map(setText).join(" · ")} ${esc(unit())}</span></div>`).join("")}</section>`
      : `<p class="empty">No sets logged yet.</p>`}`;
}

// ---------- settings ----------

async function prepareConnectLink() {
  const a = document.getElementById("connect-manual");
  if (!a) return;
  a.removeAttribute("href");
  const url = await dbx.prepareManualConnect();
  if (document.body.contains(a)) a.href = url;
}

function renderSettings() {
  const u = unit();
  let dropbox;
  if (!dbx.isConfigured()) {
    dropbox = `<p class="err">No Dropbox app key yet. Add it to <code>js/config.js</code>.</p>`;
  } else if (dbx.isConnected()) {
    dropbox = `
      <p>Connected. Your log is saved to <b>Apps / (this app's folder) / workouts.sqlite</b> in your Dropbox.</p>
      <button class="btn" id="sync-now">Sync now</button>
      <button class="btn danger" id="disconnect">Disconnect</button>`;
  } else if (dbx.isStandalone()) {
    dropbox = `
      <p>Connect once on each device. The app can only see its own folder in your Dropbox, nothing else.</p>
      <p>1. Tap Connect and approve in Dropbox. 2. Copy the code Dropbox shows. 3. Come back here and paste it.</p>
      <a class="btn primary" id="connect-manual" target="_blank" rel="noopener" style="text-decoration:none">Connect Dropbox</a>
      <div class="set" style="grid-template-columns: 1fr auto; margin-top: 6px;">
        <input id="dbx-code" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Paste code">
        <button class="btn" id="dbx-code-go" style="margin:0">Done</button>
      </div>
      <p class="err" id="dbx-code-err"></p>`;
  } else {
    dropbox = `
      <p>Connect once on each device. The app can only see its own folder in your Dropbox, nothing else.</p>
      <button class="btn primary" id="connect">Connect Dropbox</button>`;
  }
  main.innerHTML = `
    <h1 class="page-title">Settings</h1>
    <section class="card setting">
      <h3>Dropbox</h3>
      ${dropbox}
    </section>
    <section class="card setting">
      <h3>Units</h3>
      <p>Old entries are converted for display.</p>
      <div class="seg">
        <button data-unit="lb" class="${u === "lb" ? "active" : ""}">lb</button>
        <button data-unit="kg" class="${u === "kg" ? "active" : ""}">kg</button>
      </div>
    </section>
    <section class="card setting">
      <h3>Backup</h3>
      <p>Download the SQLite file. ${db.setCount()} sets logged.</p>
      <button class="btn" id="export">Download database</button>
    </section>`;
  prepareConnectLink();
}

// ---------- top-level render ----------

function render() {
  state.renderPending = false;
  for (const b of document.querySelectorAll(".nav")) {
    const v = state.view === "exercise" ? "history" : state.view;
    b.classList.toggle("active", b.dataset.view === v);
  }
  if (state.view === "workout") renderWorkout();
  else if (state.view === "history") renderHistory();
  else if (state.view === "exercise") renderExercise();
  else renderSettings();
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

const STATUS_TEXT = {
  idle: "",
  local: "On this device",
  pending: "Saving…",
  syncing: "Syncing…",
  synced: "Saved",
  offline: "Offline",
  error: "Sync error",
};

sync.onStatus(({ status, message }) => {
  syncEl.className = `sync ${status}`;
  syncEl.textContent = STATUS_TEXT[status] ?? "";
  syncEl.title = message || STATUS_TEXT[status] || "";
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

function pull() {
  return sync.syncNow();
}

// ---------- events ----------

document.querySelector(".top").addEventListener("click", (e) => {
  const b = e.target.closest(".nav");
  if (!b) return;
  state.view = b.dataset.view;
  render();
  window.scrollTo(0, 0);
});

banner.addEventListener("click", (e) => {
  const b = e.target.closest("[data-goto]");
  if (!b) return;
  state.view = b.dataset.goto;
  render();
});

main.addEventListener("click", async (e) => {
  const t = e.target;
  const day = t.closest(".day");
  if (day) {
    state.dayId = day.dataset.day;
    render();
    return;
  }
  const check = t.closest(".check");
  if (check) {
    await toggleSet(check.closest(".set"));
    return;
  }
  const name = t.closest(".ex-name");
  if (name) {
    state.exerciseId = name.dataset.ex;
    state.view = "exercise";
    render();
    window.scrollTo(0, 0);
    return;
  }
  if (t.id === "back") {
    state.view = "workout";
    render();
    return;
  }
  const u = t.closest("[data-unit]");
  if (u) {
    db.setSetting("unit", u.dataset.unit);
    render();
    await sync.changed();
    return;
  }
  if (t.id === "connect") {
    await dbx.startConnect();
    return;
  }
  if (t.id === "dbx-code-go") {
    const input = document.getElementById("dbx-code");
    const err = document.getElementById("dbx-code-err");
    if (!input.value.trim()) { input.focus(); return; }
    try {
      await dbx.finishManualConnect(input.value);
      sync.forgetRemote();
      bannerMessage = "Connected to Dropbox.";
      state.view = "workout";
      render();
      if (await sync.syncNow()) {
        state.dayId = defaultDay();
        render();
      }
    } catch (e2) {
      err.textContent = e2.message;
    }
    return;
  }
  if (t.id === "disconnect") {
    if (!confirm("Disconnect Dropbox on this device? Your data stays in Dropbox and on this device.")) return;
    await dbx.disconnect();
    sync.forgetRemote();
    render();
    return;
  }
  if (t.id === "sync-now") {
    await pull();
    return;
  }
  if (t.id === "export") {
    const blob = new Blob([db.exportBytes()], { type: "application/x-sqlite3" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `workouts-${today()}.sqlite`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
});

main.addEventListener("change", async (e) => {
  const t = e.target;
  if (t.id === "date") {
    if (!t.value) return;
    state.date = t.value > today() ? today() : t.value;
    state.followToday = state.date === today();
    state.dayId = defaultDay();
    render();
    return;
  }
  const row = t.closest(".set");
  if (row && row.classList.contains("logged")) await editLoggedSet(row);
});

// Enter in the weight box jumps to reps; Enter in reps logs the set.
main.addEventListener("keydown", async (e) => {
  if (e.key !== "Enter") return;
  const row = e.target.closest(".set");
  if (!row) return;
  e.preventDefault();
  if (e.target.classList.contains("w")) row.querySelector(".r").focus();
  else if (!row.classList.contains("logged")) await toggleSet(row);
  else e.target.blur();
});

main.addEventListener("input", (e) => e.target.classList.remove("missing"));

main.addEventListener("focusout", () => {
  setTimeout(() => {
    if (state.renderPending && !inputFocused()) render();
  }, 0);
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (state.followToday && state.date !== today()) {
    state.date = today();
    state.dayId = defaultDay();
    if (!inputFocused()) render();
  }
  pull();
});

window.addEventListener("online", () => pull());

// ---------- start ----------

async function start() {
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

  // First sync. On a new device this brings down existing history,
  // so pick the day again once it arrives.
  if (await sync.syncNow()) {
    state.dayId = defaultDay();
    if (inputFocused()) state.renderPending = true;
    else render();
  }

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("Service worker not registered", e));
  }
}

start();
