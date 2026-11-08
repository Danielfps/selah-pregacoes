/* Selah – service worker: cache offline, lembretes e notificações. */
/* global SelahReminderCore */
const VERSION = '1.3.0';
const CACHE = 'selah-' + VERSION;

const APP_SHELL = [
  './',
  'index.html',
  'manifest.json',
  'config.js',
  'favicon.svg',
  'css/app.css',
  'fonts/inter-latin.woff2',
  'fonts/space-grotesk-latin.woff2',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-192.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
  'js/app.js',
  'js/auth.js',
  'js/backup.js',
  'js/bible-search.js',
  'js/components.js',
  'js/db.js',
  'js/docbuilder.js',
  'js/google.js',
  'js/icons.js',
  'js/install.js',
  'js/platform.js',
  'js/recorder.js',
  'js/reminder-core.js',
  'js/reminders.js',
  'js/schema.js',
  'js/share.js',
  'js/store.js',
  'js/sync.js',
  'js/util.js',
  'js/views/detail.js',
  'js/views/editor.js',
  'js/views/home.js',
  'js/views/settings.js',
  'js/views/setup.js',
  'js/views/stats.js',
];

importScripts('js/reminder-core.js');

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(APP_SHELL.map((u) => new Request(u, { cache: 'reload' }))))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('selah-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

async function networkFirst(request, cacheKey, ms, fresh) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([fresh ? fetch(request.url, { cache: 'no-cache' }) : fetch(request), timeout(ms)]);
    if (res && res.ok) cache.put(cacheKey || request, res.clone());
    return res;
  } catch (_) {
    const hit = await cache.match(cacheKey || request, { ignoreSearch: true });
    if (hit) return hit;
    throw _;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(request);
  if (res && res.ok && res.type === 'basic') cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Google (login, Drive, Docs) e outros domínios: direto para a rede.
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, './', 3000).catch(() => caches.match('index.html')));
    return;
  }
  // config.js: busca a versão mais nova (para o GOOGLE_CLIENT_ID valer na hora).
  if (url.pathname.endsWith('/config.js')) {
    event.respondWith(networkFirst(req, null, 3000, true));
    return;
  }
  event.respondWith(cacheFirst(req));
});

// ---------- Notificações ----------
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '#/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.registration.scope)) {
        await c.focus();
        c.postMessage({ type: 'navigate', url: target });
        return;
      }
    }
    await self.clients.openWindow(self.registration.scope + target);
  })());
});

// ---------- Lembretes em segundo plano (Chrome/Android com o app instalado) ----------
function idb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('selah');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
function getAll(db, store) {
  return new Promise((resolve, reject) => {
    const r = db.transaction(store).objectStore(store).getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function checkReminders() {
  const db = await idb();
  if (!db.objectStoreNames.contains('sermons')) return;
  const [sermons, rows] = await Promise.all([getAll(db, 'sermons'), getAll(db, 'settings')]);
  const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const due = SelahReminderCore.toNotify(sermons, settings).slice(0, 3);
  for (const s of due) {
    await self.registration.showNotification('Você colocou em prática o que ouviu?', {
      body: (s.title || 'Pregação') + (s.preacher ? ' – ' + s.preacher : ''),
      tag: 'selah-' + s.id,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-maskable-192.png',
      data: { url: '#/p/' + s.id },
    });
    await new Promise((resolve) => {
      const tx = db.transaction('sermons', 'readwrite');
      const st = tx.objectStore('sermons');
      const g = st.get(s.id);
      g.onsuccess = () => {
        const cur = g.result;
        if (cur) { cur.reminder = Object.assign({}, cur.reminder || {}, { notifiedAt: Date.now() }); st.put(cur); }
      };
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  }
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'selah-lembretes') event.waitUntil(checkReminders().catch(() => {}));
});
