// sw.js — Service Worker nhẹ cho PWA 学中文 (chỉ cache file tĩnh giao diện; TUYỆT ĐỐI không chặn /api/*)
const CACHE_NAME = 'xuezhongwen-shell-v1';
const SHELL_PRECACHE = [
  '/',
  '/manifest.json',
  '/icons/app-icon.svg',
  '/css/styles.css',
  '/css/conversation-v155.css',
  '/css/design-guofeng.css',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_PRECACHE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // KHÔNG bao giờ can thiệp /api/* (giữ nguyên FSRS API, auth, và COOP/COEP WASM Optimizer)
  if (url.pathname.startsWith('/api/')) return;
  const isStatic = url.pathname === '/' || url.pathname === '/index.html'
    || url.pathname === '/manifest.json'
    || url.pathname.startsWith('/css/')
    || url.pathname.startsWith('/js/')
    || url.pathname.startsWith('/icons/');
  if (!isStatic) return;

  // Network-first: có mạng luôn lấy bản mới nhất ngay sau khi deploy; mất mạng tự dùng bản cache.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || (req.mode === 'navigate' ? caches.match('/') : Response.error())))
  );
});
