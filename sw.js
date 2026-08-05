// CreditFlow Service Worker — offline support + faster loads
const CACHE = 'creditflow-v1';
const CORE = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];
const CDN = [
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(CORE).then(() =>
      // CDN files cached best-effort (don't fail install if one is unreachable)
      Promise.allSettled(CDN.map(u => c.add(u)))
    ))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  // Never intercept Google auth/Gmail API calls
  if (url.includes('accounts.google.com') || url.includes('googleapis.com')) return;
  // Cache-first for CDN libraries and app shell; network-first for the HTML itself
  if (e.request.mode === 'navigate' || url.endsWith('index.html')) {
    e.respondWith(
      fetch(e.request)
        .then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return r; })
        .catch(() => caches.match(e.request).then(m => m || caches.match('./index.html')))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(m => m || fetch(e.request).then(r => {
      if (r.ok && (url.startsWith('https://cdnjs.cloudflare.com') || url.startsWith('https://fonts.'))) {
        const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp));
      }
      return r;
    }))
  );
});
