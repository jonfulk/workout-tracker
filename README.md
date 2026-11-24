# Workout Tracker

A one-page tracker for the UpOne Coaching 4-day plan. It runs on GitHub Pages and stores every set in a SQLite file in your own Dropbox.

- Pick the day, type weight × reps, tap the circle. A blank box logs the gray number in it (last time's weight and reps).
- Each exercise shows last session's numbers, a warm-up suggestion for the main lifts, and an "Add weight" flag once you hit the top of the rep range on every set.
- Every tap is saved on the device right away, then to Dropbox a moment later. It works offline and catches up when you're back online.
- Two devices can edit at once. Changes merge set by set; the newer edit wins.

## Setup

### 1. GitHub Pages
Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save.**
After a minute the app is live at `https://<github-user>.github.io/workout-tracker/`.

### 2. Dropbox app (one time, by the repo owner)
1. Go to <https://www.dropbox.com/developers/apps> and click **Create app**.
2. Choose **Scoped access**, then **App folder**. Name it (e.g. `UpOne Workout Tracker`). The name becomes the folder: `Dropbox/Apps/<name>/`.
3. **Permissions** tab: tick `files.metadata.read`, `files.content.write`, `files.content.read`. Click **Submit**.
4. **Settings** tab:
   - **Redirect URIs**: add `https://<github-user>.github.io/workout-tracker/` (exact, with the trailing slash) and click **Add**.
   - **Allow public clients (Implicit Grant & PKCE)**: leave it on **Allow**.
   - Copy the **App key**. (Never share the App secret. The app doesn't use it.)
   - Development mode allows a limited number of linked users. To add more, click **Enable additional users**.
5. Put the app key in `js/config.js`:
   ```js
   export const DROPBOX_APP_KEY = "your-app-key";
   ```

### 3. Each person, each device
Open the site, go to **Settings → Connect Dropbox**, and approve.
- **iPhone**: connect in Safari, or add the site to your Home Screen first (Share → Add to Home Screen) and connect from the home-screen app. The home-screen app keeps its own storage, so it uses a copy-paste code: tap Connect, approve, copy the code Dropbox shows, paste it back in Settings.
- The token can only see the app's own folder in your Dropbox. Each person's data lives in their own Dropbox.

## Files
| Path | What |
|---|---|
| `js/plan.js` | The workout plan. Edit exercises, sets and rep ranges here. Keep `id`s stable; history is keyed on them. |
| `js/db.js` | SQLite schema, queries, and the row-level merge. |
| `js/sync.js` | Local save + Dropbox sync with revision checks. |
| `js/dropbox.js` | Dropbox OAuth (PKCE) and file API. |
| `js/app.js` | The UI. |
| `vendor/` | [sql.js](https://github.com/sql-js/sql.js) 1.13.0 (MIT). |

The database is plain SQLite. Open `workouts.sqlite` with any SQLite tool:
```sql
SELECT session_date, exercise_id, set_no, weight, reps, unit
FROM sets WHERE deleted = 0 ORDER BY session_date, exercise_id, set_no;
```
