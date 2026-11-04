// BikeCare – Service Worker (offline + widget de Windows 11)
const V = 'bikecare-v2';
const FILES = ['/', '/index.html', '/styles.css', '/app.js', '/data.js', '/widget-store.js',
  '/manifest.webmanifest', '/icon.svg', '/widgets/bike-summary.template.json', '/widgets/bike-summary.data.json'];

importScripts('/widget-store.js', '/data.js'); // define WidgetStore y M (guías) en el scope del SW

/* ---------- Caché / offline (igual que antes) ---------- */
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== V) await caches.delete(k);
    await self.clients.claim();
    await refreshAllWidgets();            // evita widgets vacíos tras actualizar el SW
  })());
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).pathname.startsWith('/api/')) return;
  e.respondWith(fetch(r).then(res => { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); return res; })
    .catch(() => caches.match(r).then(m => m || caches.match('/index.html'))));
});

/* ---------- Widget ---------- */
const hasWidgets = () => 'widgets' in self && self.widgets;

function ago(dateStr) {
  const d = new Date(dateStr + 'T00:00:00'); if (isNaN(d)) return '';
  const n = Math.floor((Date.now() - d.getTime()) / 864e5);
  return n <= 0 ? 'hoy' : n === 1 ? 'ayer' : `hace ${n} días`;
}
const cut = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n) + '…' : s; };

// Convierte el resumen guardado por la página en los datos de la plantilla.
async function buildData(defaults) {
  const snap = await WidgetStore.get('snapshot');
  const day = Math.floor(Date.now() / 864e5);
  const g = typeof M !== 'undefined' && M.length ? M[day % M.length] : null; // consejo del día (de data.js)
  const d = { ...defaults };
  if (g) { d.tipName = g.name; d.tip = cut(g.tip, 110); }
  if (snap) {
    d.title = snap.bikeType ? `Mi bici: ${snap.bikeType}` : 'BikeCare';
    d.subtitle = snap.bikeType ? (snap.use || 'Uso sin definir') : 'Configura tu bici en la app';
    d.lastService = snap.last
      ? `${cut(snap.last.comp, 22)}: ${cut(snap.last.work, 40)} (${ago(snap.last.date)})`
      : 'Sin registros de mantenimiento';
    d.chkDone = snap.chkDone; d.chkTotal = snap.chkTotal;
  }
  return d;
}

async function render(widget) {
  const def = widget.definition;
  try {
    const [template, defaults] = await Promise.all([
      fetch(def.msAcTemplate).then(r => { if (!r.ok) throw new Error('template ' + r.status); return r.text(); }),
      fetch(def.data).then(r => r.ok ? r.json() : {}).catch(() => ({}))
    ]);
    await self.widgets.updateByTag(def.tag, { template, data: JSON.stringify(await buildData(defaults)) });
  } catch (err) {
    console.warn('[widget] error al renderizar', err);
    // Tarjeta de error mínima: nunca dejar el widget en blanco.
    const template = JSON.stringify({
      type: 'AdaptiveCard', version: '1.5', $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      body: [{ type: 'TextBlock', text: 'No se pudo cargar BikeCare', wrap: true, weight: 'Bolder' }],
      actions: [{ type: 'Action.Execute', title: 'Abrir app', verb: 'open-home' }]
    });
    await self.widgets.updateByTag(def.tag, { template, data: '{}' }).catch(() => {});
  }
}

async function refreshAllWidgets() {
  if (!hasWidgets()) return;
  const list = await self.widgets.matchAll({ installed: true });
  await Promise.all(list.map(render));
}

self.addEventListener('widgetinstall', e => e.waitUntil((async () => {
  const w = e.widget;
  try { // refresco periódico (la frecuencia real la decide el navegador)
    if ('periodicSync' in self.registration && w.definition.update) {
      const tags = await self.registration.periodicSync.getTags();
      if (!tags.includes(w.definition.tag)) await self.registration.periodicSync.register(w.definition.tag, { minInterval: w.definition.update * 1000 });
    }
  } catch {}
  await render(w);
})()));

self.addEventListener('widgetresume', e => e.waitUntil(refreshAllWidgets()));   // al abrir el panel de widgets
self.addEventListener('widgetuninstall', e => e.waitUntil((async () => {
  try { if (e.widget.instances.length <= 1) await self.registration.periodicSync.unregister(e.widget.definition.tag); } catch {}
})()));
self.addEventListener('periodicsync', e => { if (hasWidgets()) e.waitUntil(refreshAllWidgets()); });

self.addEventListener('widgetclick', e => {
  const routes = { 'open-check': '/#/check', 'open-ai': '/#/ai', 'open-home': '/' };
  const url = routes[e.action];           // lista blanca: solo rutas internas conocidas
  if (url) e.waitUntil(self.clients.openWindow(url));
});

// La página avisa cuando cambian los datos locales.
self.addEventListener('message', e => { if (e.data && e.data.type === 'widget-sync') e.waitUntil(refreshAllWidgets()); });


// Solo para las pruebas (en el navegador `module` no existe, así que esta línea no hace nada).
if (typeof module !== 'undefined' && module.exports) module.exports = { ago, cut };