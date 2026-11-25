// Network first, cache as fallback: you always get the latest version when
// online, and the app still opens in a gym basement with no signal.
// Only this site's own files are cached; Dropbox calls pass straight through.

const CACHE = "workout-tracker-v8";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  // OAuth redirect URLs carry a one-time code; never cache those.
  if (url.searchParams.has("code") || url.searchParams.has("error")) return;

  // cache: "no-cache" makes the browser check with GitHub before reusing a file
  // (a quick 304 when nothing changed). Without it, GitHub's 10-minute cache
  // can serve new styles with an old script right after an update.
  // Fetch by URL: a navigation Request can't be re-created with options.
  event.respondWith(
    fetch(url.href, { cache: "no-cache", credentials: "same-origin" })
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
