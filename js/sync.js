// Keeps the local database and the Dropbox copy in step.
//
// Every change is saved to IndexedDB at once, so nothing is lost offline.
// Then, a moment later, the database is pushed to Dropbox. The push is
// conditional on the Dropbox file's revision: if another device saved first,
// we pull its copy, merge row by row (newer edit wins), and try again.

import * as db from "./db.js";
import * as dbx from "./dropbox.js";
import { DB_PATH } from "./config.js";

// seq counts local changes; synced is the seq last known to be in Dropbox.
// Comparing counters (not a boolean) means an edit made while an upload is
// in flight is never mistaken for already-synced.
const K = { rev: "wt.sync.rev", seq: "wt.sync.seq", synced: "wt.sync.synced" };

let listener = () => {};
let pulledListener = () => {};
let chain = Promise.resolve();
let timer = null;
let state = { status: "idle", message: "" };

// Called whenever data from another device was merged in.
export function onPulled(fn) {
  pulledListener = fn;
}

export function onStatus(fn) {
  listener = fn;
  fn(state);
}

function setStatus(status, message = "") {
  state = { status, message };
  listener(state);
}

function num(key) {
  return Number(localStorage.getItem(key) || 0);
}

function bump() {
  localStorage.setItem(K.seq, String(num(K.seq) + 1));
}

function isDirty() {
  return num(K.seq) > num(K.synced);
}

function markSynced(seq) {
  localStorage.setItem(K.synced, String(seq));
}

export function forgetRemote() {
  localStorage.removeItem(K.rev);
  // Whatever is local should be pushed on the next connect.
  bump();
}

// Call after every change.
export async function changed() {
  bump();
  const connected = dbx.isConnected();
  setStatus(connected ? "pending" : "local");
  await db.saveLocal();
  if (!connected) return;
  clearTimeout(timer);
  timer = setTimeout(() => syncNow(), 1200);
}

// Run a sync, one at a time. Returns true if remote data changed the local copy.
export function syncNow() {
  clearTimeout(timer);
  const run = chain.then(() => doSync());
  chain = run.catch(() => {});
  return run;
}

async function doSync() {
  if (!dbx.isConnected()) {
    setStatus(isDirty() ? "local" : "idle");
    return false;
  }
  if (!navigator.onLine) {
    setStatus("offline");
    return false;
  }
  setStatus("syncing");
  let pulled = false;
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const knownRev = localStorage.getItem(K.rev);
      const seq = num(K.seq);
      const meta = await dbx.getMetadata(DB_PATH);

      if (meta && meta.rev !== knownRev) {
        const remoteBytes = await dbx.download(DB_PATH);
        const localAhead = db.merge(remoteBytes);
        localStorage.setItem(K.rev, meta.rev);
        await db.saveLocal();
        pulled = true;
        if (localAhead) bump();
        else markSynced(seq);
        pulledListener();
      }

      if (!meta || isDirty()) {
        const uploadSeq = num(K.seq);
        const result = await dbx.upload(DB_PATH, db.exportBytes(), meta ? meta.rev : null);
        if (result.conflict) continue; // someone saved in between; pull and merge again
        localStorage.setItem(K.rev, result.rev);
        markSynced(uploadSeq);
      }
      setStatus(isDirty() ? "pending" : "synced");
      return pulled;
    }
    throw new Error("Kept colliding with another device. Will retry.");
  } catch (e) {
    console.error(e);
    if (e instanceof dbx.DropboxError && e.summary === "revoked") {
      localStorage.removeItem(K.rev);
      setStatus("error", "Dropbox disconnected. Reconnect in Settings.");
    } else if (!navigator.onLine || e instanceof TypeError) {
      setStatus("offline"); // fetch throws TypeError on network failure
    } else {
      setStatus("error", e.message || "Sync failed");
    }
    return pulled;
  }
}

export function hasUnsyncedChanges() {
  return isDirty();
}
