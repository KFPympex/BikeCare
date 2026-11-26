// BikeCare – Service Worker (offline + widget de Windows 11)
const V = 'bikecare-v4';
// Imprescindibles para funcionar sin conexión: si alguno falla, la instalación falla (y se reintenta).
const FILES = ['/', '/index.html', '/styles.css', '/app.js', '/data.js', '/reminders.js', '/widget-store.js',
  '/manifest.webmanifest', '/widgets/bike-summary.template.json', '/widgets/bike-summary.data.json'];
// Opcionales (iconos): se guardan si existen, pero nunca bloquean la instalación del SW.
const OPTIONAL = ['/icon.svg', '/icon-192.png', '/icon-512.png', '/icon-maskable-512.png'];

importScripts('/widget-store.js', '/data.js', '/reminders.js'); // WidgetStore, M (guías) y dueList en el scope del SW

/* ---------- Caché / offline ---------- */
self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(async c => {
    await c.addAll(FILES);
    await Promise.all(OPTIONAL.map(u => c.add(u).catch(() => console.warn('[sw] no se pudo guardar', u))));
  }));
  self.skipWaiting();
});
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
  e.respondWith(fetch(r).then(res => { // solo se guardan respuestas correctas (nunca un 404 o un error)
    if (res.ok) { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); }
    return res;
  })
    .catch(() => caches.match(r).then(m => m || caches.match('/index.html'))));
});

/* ---------- Widget ---------- */
const hasWidgets = () => 'widgets' in self && self.widgets;

function ago(dateStr) {
  const d = new Date(dateStr + 'T00:00:00'); if (isNaN(d)) return '';
  const n = Math.floor((Date.now() - d.getTime()) / 864e5);
  return n <= 0 ? 'hoy' : n === 1 ? 'ayer' : `hace ${n} días`;
}
const cut = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

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
    const due = dueNow(snap);
    if (due.length) d.nextService = cut(`Toca: ${due.map(x => x.name).join(', ')}`, 60);
    else if (snap.maint && snap.maint.hist && snap.maint.hist.length) d.nextService = 'Mantenimiento al día';
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
self.addEventListener('periodicsync', e => {
  if (e.tag === REMINDER_TAG) e.waitUntil(checkReminders());
  else if (hasWidgets()) e.waitUntil(refreshAllWidgets());
});

self.addEventListener('widgetclick', e => {
  const routes = { 'open-check': '/#/check', 'open-ai': '/#/ai', 'open-home': '/' };
  const url = routes[e.action];           // lista blanca: solo rutas internas conocidas
  if (url) e.waitUntil(self.clients.openWindow(url));
});

// La página avisa cuando cambian los datos locales.
self.addEventListener('message', e => { if (e.data && e.data.type === 'widget-sync') e.waitUntil(refreshAllWidgets()); });

/* ---------- Notificaciones y distintivo (App Badging + Notifications) ---------- */
// Solo se notifica con datos reales: el resumen (`snapshot`) que la página guarda en IndexedDB.
const REMINDER_TAG = 'bikecare-reminders';
const ROUTES = { '/': '#/', '/#/check': '#/check', '/#/hist': '#/hist', '/#/config': '#/config',
  '/#/ai': '#/ai', '/#/diag': '#/diag', '/#/maint': '#/maint', '/#/bike': '#/bike', '/#/tools': '#/tools' };const routeFor = r => Object.prototype.hasOwnProperty.call(ROUTES, r) ? r : '/';   // lista blanca

// Componentes cuyo mantenimiento ya toca, recalculados HOY con los datos del resumen
// (así el aviso por tiempo llega aunque la app lleve días cerrada). dueList viene de reminders.js.
function dueNow(snap, today) {
  if (!snap || !snap.maint || typeof dueList !== 'function') return [];
  return dueList({ ...snap.maint, ...(today ? { today } : {}) }).filter(x => x.state === 'due');
}

// Devuelve el recordatorio a mostrar o null si no corresponde (sin preferencia o sin pendientes).
// `due`: componentes cuyo mantenimiento toca ([{ name, task }]); tienen prioridad sobre el checklist.
function reminderFor(snap, due = []) {
  if (!snap || !snap.prefs || !snap.prefs.reminders) return null;
  const n = Number(snap.pending) || 0, d = due.length;
  if (n <= 0 && d <= 0) return null;
  if (d > 0) {
    const names = due.slice(0, 3).map(x => x.name).join(', ') + (d > 3 ? ` y ${d - 3} más` : '');
    return {
      title: 'BikeCare: toca mantenimiento',
      body: (d === 1 ? `${due[0].name}: ${due[0].task}` : `Toca revisar: ${names}`) + (n ? ` · ${n} en el checklist` : ''),
      tag: 'bikecare-pending', route: '/#/maint', count: n + d, actionTitle: 'Ver mantenimiento'
    };
  }
  const pre = Math.max(0, (snap.chkTotal || 0) - (snap.chkDone || 0));
  return {
    title: 'BikeCare: revisión pendiente',
    body: `Tienes ${n} ${n === 1 ? 'punto pendiente' : 'puntos pendientes'} en tu checklist` + (pre ? ` (${pre} antes de salir)` : ''),
    tag: 'bikecare-pending', route: '/#/check', count: n
  };
}

async function applyBadge(snap) {
  const nav = self.navigator;
  if (!nav || !nav.setAppBadge) return;
  try {
    if (snap && snap.prefs && snap.prefs.badge && snap.pending > 0) await nav.setAppBadge(snap.pending);
    else await nav.clearAppBadge();
  } catch (err) { console.warn('[badge]', err); }
}

// Notificación persistente (registration.showNotification). Con la misma `tag` se reemplaza en vez de duplicarse,
// y si ya hay una visible con el mismo texto no se vuelve a mostrar.
async function notifyOnce({ title, body, tag, route, actionTitle = 'Abrir checklist' }) { // `tag` es opcional
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  if (tag && (await self.registration.getNotifications({ tag })).some(n => n.body === body)) return false;
  const actions = Notification.maxActions > 0
    ? [{ action: 'open', title: actionTitle }, { action: 'dismiss', title: 'Descartar' }] : [];
  await self.registration.showNotification(title, {
    body, ...(tag ? { tag } : {}), icon: '/icon-192.png', badge: '/icon-192.png', lang: 'es', data: { route: routeFor(route) }, actions
  });
  return true;
}

async function checkReminders() {
  const snap = await WidgetStore.get('snapshot');
  if (!snap) return;
  await applyBadge(snap);
  const r = reminderFor(snap, dueNow(snap));
  if (!r) return;
  const day = new Date().toDateString(), st = await WidgetStore.get('reminder-state');
  if (st && st.day === day) return;                                   // máximo un recordatorio al día
  const wins = await self.clients.matchAll({ type: 'window' });
  if (wins.some(c => c.visibilityState === 'visible')) return;        // si la app está a la vista, no molestar
  if (await notifyOnce(r)) await WidgetStore.set('reminder-state', { day, count: r.count });
}

self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'dismiss') return;
  const route = routeFor((e.notification.data || {}).route);
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const c = list.find(x => new URL(x.url).origin === self.location.origin);
    if (c) { await c.focus(); c.postMessage({ type: 'navigate', hash: ROUTES[route] }); }
    else await self.clients.openWindow(route);
  })());
});

// Botón "Probar notificación" de Ajustes: muestra el estado real del checklist.
self.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'notify-test') return;
  e.waitUntil((async () => {
    const snap = await WidgetStore.get('snapshot'), n = snap ? Number(snap.pending) || 0 : 0;
    await notifyOnce({
      title: 'BikeCare', tag: 'bikecare-test', route: '/#/check',
      body: n ? `Tienes ${n} ${n === 1 ? 'punto pendiente' : 'puntos pendientes'} en tu checklist` : 'No tienes puntos pendientes en tu checklist ✓'
    });
  })());
});

/* ---------- Web Push (el servidor envía; ver push-service.js) ---------- */
const PUSH_KINDS = { announcement: '/', checklist: '/#/check', history: '/#/hist' };   // igual que KINDS del servidor

// Valida y limpia el mensaje recibido; devuelve null si no se puede procesar.
function parsePush(d) {
  if (!d || typeof d !== 'object') return null;
  const t = (v, n) => typeof v === 'string' ? v.trim().slice(0, n) : '';
  const kind = Object.prototype.hasOwnProperty.call(PUSH_KINDS, d.kind) ? d.kind : null;
  const title = t(d.title, 80), body = t(d.body, 200);
  if (!kind || !title || !body) return null;
  const route = Object.prototype.hasOwnProperty.call(ROUTES, d.route) ? d.route : PUSH_KINDS[kind];
  return { title, body, route, actionTitle: t(d.actionTitle, 30) || 'Abrir' };
}

self.addEventListener('push', e => e.waitUntil((async () => {
  let msg = null;
  try { msg = parsePush(e.data && e.data.json()); } catch {}
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  // Con userVisibleOnly el navegador exige mostrar algo: solo si el mensaje no se pudo leer se usa un aviso genérico.
  await notifyOnce(msg || { title: 'BikeCare', body: 'Tienes un aviso nuevo', route: '/', actionTitle: 'Abrir' });
})()));

const b64ToBytes = b64 => {
  const raw = atob(b64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64.length / 4) * 4, '='));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
};
// El navegador renovó o invalidó la suscripción: se vuelve a suscribir y se avisa al servidor.
self.addEventListener('pushsubscriptionchange', e => e.waitUntil((async () => {
  try {
    const k = await (await fetch('/api/push/key')).json();
    if (!k.enabled) return;
    const sub = e.newSubscription || await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(k.publicKey) });
    const r = await fetch('/api/push/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON() }) });
    if (r.ok) await WidgetStore.set('push-id', (await r.json()).id);
  } catch (err) { console.warn('[push] no se pudo renovar la suscripción', err); }
})()));

// Solo para las pruebas (en el navegador `module` no existe, así que esta línea no hace nada).
if (typeof module !== 'undefined' && module.exports) module.exports = { ago, cut, reminderFor, routeFor, parsePush, dueNow };