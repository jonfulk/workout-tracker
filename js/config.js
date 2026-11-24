// Dropbox app key from https://www.dropbox.com/developers/apps (Settings tab → "App key").
// It is public by design in a PKCE app — there is no secret here, and none is needed.
// Each person who uses the app connects their own Dropbox in Settings; their data
// lives in their own /Apps/<app name>/ folder.
export const DROPBOX_APP_KEY = "";

// File name inside the app folder.
export const DB_PATH = "/workouts.sqlite";
