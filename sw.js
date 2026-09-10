const CACHE_NAME = "fitnote-v75";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css?v=75",
  "./fitnote-config.js?v=75",
  "./fitnote-history.js?v=75",
  "./app.js?v=75",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/fitnote-landing-logo.png",
  "./icons/fitnote-full-logo.png",
  "./icons/fitnote-mark.png",
  "./icons/fitnote-tab-icon.png",
  "./icons/fitnote-app-logo.png",
  "./assets/routine-images/Abdominals.png",
  "./assets/routine-images/Biceps.png",
  "./assets/routine-images/Calves.png",
  "./assets/routine-images/Chest.png",
  "./assets/routine-images/Forearms.png",
  "./assets/routine-images/FrontDelts.png",
  "./assets/routine-images/FullLegs.png",
  "./assets/routine-images/Glutes.png",
  "./assets/routine-images/Hamstrings.png",
  "./assets/routine-images/Lats.png",
  "./assets/routine-images/LowerBack.png",
  "./assets/routine-images/Pull.png",
  "./assets/routine-images/Push.png",
  "./assets/routine-images/Quads.png",
  "./assets/routine-images/RearDelts.png",
  "./assets/routine-images/Traps.png",
  "./assets/routine-images/Triceps.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);

  if (event.request.mode === "navigate" || event.request.destination === "document") {
    event.respondWith(
      fetch(event.request, { cache: "no-store" }).catch(() =>
        caches.match("./index.html").then((cached) => cached || caches.match("./"))
      )
    );
    return;
  }

  if (requestUrl.origin !== self.location.origin) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request, { cache: "no-store" })
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
