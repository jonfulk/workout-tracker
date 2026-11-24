// Minimal Dropbox client for a browser-only app (OAuth 2 PKCE, no secret).
// The Dropbox app uses "App folder" access, so paths are relative to
// /Apps/<your app name>/ and the token can't see anything else.

import { DROPBOX_APP_KEY } from "./config.js";

const AUTH_URL = "https://www.dropbox.com/oauth2/authorize";
const TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";
const API = "https://api.dropboxapi.com/2";
const CONTENT = "https://content.dropboxapi.com/2";

const K = {
  refresh: "wt.dbx.refresh",
  access: "wt.dbx.access",
  expires: "wt.dbx.expires",
  verifier: "wt.dbx.verifier",
  state: "wt.dbx.state",
};

export class DropboxError extends Error {
  constructor(message, status, summary) {
    super(message);
    this.status = status;
    this.summary = summary || "";
  }
}

export function isConfigured() {
  return Boolean(DROPBOX_APP_KEY);
}

export function isConnected() {
  return Boolean(localStorage.getItem(K.refresh));
}

function redirectUri() {
  return window.location.origin + window.location.pathname;
}

function base64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(len = 64) {
  return base64url(crypto.getRandomValues(new Uint8Array(len))).slice(0, len);
}

// Step 1: send the user to Dropbox to approve access.
export async function startConnect() {
  const verifier = randomString(64);
  const state = randomString(24);
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  sessionStorage.setItem(K.verifier, verifier);
  sessionStorage.setItem(K.state, state);
  const params = new URLSearchParams({
    client_id: DROPBOX_APP_KEY,
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    token_access_type: "offline",
    redirect_uri: redirectUri(),
    state,
  });
  window.location.assign(`${AUTH_URL}?${params}`);
}

// Home-screen web apps on iOS keep their own storage, separate from Safari,
// and an OAuth redirect can come back into Safari instead of the app.
// There we use Dropbox's no-redirect flow: Dropbox shows a code, the user pastes it.
export function isStandalone() {
  return window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
}

// Returns the Dropbox approval URL. Build it ahead of the tap: iOS blocks
// window.open calls that happen after an await.
export async function prepareManualConnect() {
  // Reuse a pending verifier so a re-render can't invalidate a code in flight.
  const verifier = localStorage.getItem(K.verifier) || randomString(64);
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  localStorage.setItem(K.verifier, verifier);
  const params = new URLSearchParams({
    client_id: DROPBOX_APP_KEY,
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    token_access_type: "offline",
  });
  return `${AUTH_URL}?${params}`;
}

export async function finishManualConnect(code) {
  const verifier = localStorage.getItem(K.verifier);
  if (!verifier) throw new DropboxError("Tap Connect Dropbox first, then paste the code.", 0, "no_verifier");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    body: new URLSearchParams({
      code: code.trim(),
      grant_type: "authorization_code",
      client_id: DROPBOX_APP_KEY,
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new DropboxError("That code didn't work. Codes expire quickly — tap Connect Dropbox and try again.", res.status, await res.text());
  localStorage.removeItem(K.verifier);
  storeTokens(await res.json());
}

// Step 2: Dropbox redirects back with ?code=...; trade it for tokens.
// Returns true if this page load was a returning OAuth redirect.
export async function finishConnectIfReturning() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  if (!code && !error) return false;

  // Clean the URL either way so a reload doesn't retry.
  window.history.replaceState(null, "", redirectUri());

  if (error) throw new DropboxError(url.searchParams.get("error_description") || error, 0, error);

  const expectedState = sessionStorage.getItem(K.state);
  const verifier = sessionStorage.getItem(K.verifier);
  sessionStorage.removeItem(K.state);
  sessionStorage.removeItem(K.verifier);
  if (!verifier || url.searchParams.get("state") !== expectedState) {
    throw new DropboxError("Dropbox sign-in didn't match this browser. Try connecting again.", 0, "state_mismatch");
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      client_id: DROPBOX_APP_KEY,
      code_verifier: verifier,
      redirect_uri: redirectUri(),
    }),
  });
  if (!res.ok) throw new DropboxError("Dropbox didn't accept the sign-in. Try again.", res.status, await res.text());
  storeTokens(await res.json());
  return true;
}

function storeTokens(t) {
  if (t.refresh_token) localStorage.setItem(K.refresh, t.refresh_token);
  localStorage.setItem(K.access, t.access_token);
  // Refresh a minute early.
  localStorage.setItem(K.expires, String(Date.now() + (t.expires_in - 60) * 1000));
}

function clearTokens() {
  for (const k of [K.refresh, K.access, K.expires]) localStorage.removeItem(k);
}

async function accessToken() {
  const access = localStorage.getItem(K.access);
  const expires = Number(localStorage.getItem(K.expires) || 0);
  if (access && Date.now() < expires) return access;

  const refresh = localStorage.getItem(K.refresh);
  if (!refresh) throw new DropboxError("Not connected to Dropbox.", 401, "not_connected");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refresh, client_id: DROPBOX_APP_KEY }),
  });
  if (res.status === 400 || res.status === 401) {
    // Refresh token revoked or app access removed.
    clearTokens();
    throw new DropboxError("Dropbox access was removed. Reconnect in Settings.", 401, "revoked");
  }
  if (!res.ok) throw new DropboxError("Couldn't reach Dropbox.", res.status, await res.text());
  storeTokens(await res.json());
  return localStorage.getItem(K.access);
}

async function call(url, init, retried = false) {
  const token = await accessToken();
  const res = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
  if (res.status === 401 && !retried) {
    localStorage.removeItem(K.expires); // force a refresh, then retry once
    return call(url, init, true);
  }
  return res;
}

async function errorSummary(res) {
  const text = await res.text();
  try {
    return JSON.parse(text).error_summary || text;
  } catch {
    return text;
  }
}

// Returns { rev } or null if the file doesn't exist.
export async function getMetadata(path) {
  const res = await call(`${API}/files/get_metadata`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  if (res.status === 409) {
    const summary = await errorSummary(res);
    if (summary.includes("not_found")) return null;
    throw new DropboxError("Dropbox error", 409, summary);
  }
  if (!res.ok) throw new DropboxError("Dropbox error", res.status, await errorSummary(res));
  const meta = await res.json();
  return { rev: meta.rev };
}

export async function download(path) {
  const res = await call(`${CONTENT}/files/download`, {
    method: "POST",
    headers: { "Dropbox-API-Arg": JSON.stringify({ path }) },
  });
  if (!res.ok) throw new DropboxError("Dropbox download failed", res.status, await errorSummary(res));
  return new Uint8Array(await res.arrayBuffer());
}

// Upload only if the file is still at `rev` (or doesn't exist, when rev is null).
// Returns { rev } on success, or { conflict: true } if someone else saved first.
export async function upload(path, bytes, rev) {
  const mode = rev ? { ".tag": "update", update: rev } : { ".tag": "add" };
  const res = await call(`${CONTENT}/files/upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify({ path, mode, autorename: false, mute: true }),
    },
    body: bytes,
  });
  if (res.status === 409) {
    const summary = await errorSummary(res);
    if (summary.includes("conflict")) return { conflict: true };
    throw new DropboxError("Dropbox upload failed", 409, summary);
  }
  if (!res.ok) throw new DropboxError("Dropbox upload failed", res.status, await errorSummary(res));
  const meta = await res.json();
  return { rev: meta.rev };
}

export async function disconnect() {
  try {
    await call(`${API}/auth/token/revoke`, { method: "POST" });
  } catch {
    // Revoking is best-effort; forget the tokens regardless.
  }
  clearTokens();
}
