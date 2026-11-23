// Servicio de Web Push (VAPID) reutilizable. Sin base de datos en el proyecto: las suscripciones
// se guardan en un archivo JSON local (data/push-subscriptions.json, fuera de git).
// Cada dispositivo suscrito recibe un `id` aleatorio; no existen cuentas de usuario en BikeCare.
const fs = require('fs'), path = require('path'), crypto = require('crypto');

// Tipos de aviso admitidos y su destino por defecto. Para añadir un tipo nuevo basta con
// agregarlo aquí y en ROUTES de public/sw.js (el SW valida la ruta con su propia lista blanca).
const KINDS = { announcement: '/', checklist: '/#/check', history: '/#/hist' };
const ROUTES = ['/', '/#/check', '/#/hist', '/#/config', '/#/ai', '/#/diag', '/#/maint', '/#/bike', '/#/tools'];
const MAX_SUBS = 10000;
const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const safeEq = (a, b) => { // comparación en tiempo constante
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// Devuelve el mensaje que viajará cifrado hasta el SW (solo campos conocidos y recortados) o null.
function normalizePayload(p) {
  if (!p || typeof p !== 'object') return null;
  const kind = Object.prototype.hasOwnProperty.call(KINDS, p.kind) ? p.kind : null;
  const title = str(p.title, 80), body = str(p.body, 200);
  if (!kind || !title || !body) return null;
  const route = ROUTES.includes(p.route) ? p.route : KINDS[kind];
  const out = { kind, title, body, route };
  const a = str(p.actionTitle, 30); if (a) out.actionTitle = a;
  return out;
}

function createPushService({ file, webpush, env = process.env } = {}) {
  let subs = null, configured = false;
  const load = () => {
    if (subs) return subs;
    try { subs = JSON.parse(fs.readFileSync(file, 'utf8')); if (!Array.isArray(subs)) subs = []; } catch { subs = []; }
    return subs;
  };
  const persist = () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(subs, null, 2));
    fs.renameSync(tmp, file); // escritura atómica
  };
  const publicKey = () => env.VAPID_PUBLIC_KEY || '';
  const enabled = () => !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
  const ensureConfigured = () => {
    if (!enabled()) throw Object.assign(new Error('Web Push no está configurado (faltan claves VAPID).'), { code: 'DISABLED' });
    if (!configured) {
      webpush.setVapidDetails(env.VAPID_SUBJECT || 'https://localhost', env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
      configured = true;
    }
  };

  function subscribe(sub) {
    const endpoint = str(sub && sub.endpoint, 2048), p256dh = str(sub && sub.keys && sub.keys.p256dh, 256), auth = str(sub && sub.keys && sub.keys.auth, 64);
    let url; try { url = new URL(endpoint); } catch {}
    if (!url || url.protocol !== 'https:' || !p256dh || !auth) throw Object.assign(new Error('Suscripción inválida.'), { code: 'INVALID' });
    const list = load(), now = Date.now();
    let e = list.find(s => s.endpoint === endpoint);      // sin duplicados: misma suscripción → mismo id
    if (e) { e.keys = { p256dh, auth }; e.updatedAt = now; }
    else {
      if (list.length >= MAX_SUBS) throw Object.assign(new Error('Límite de suscripciones alcanzado.'), { code: 'FULL' });
      e = { id: crypto.randomBytes(12).toString('hex'), endpoint, keys: { p256dh, auth }, createdAt: now, updatedAt: now };
      list.push(e);
    }
    persist();
    return { id: e.id };
  }

  // Solo quien conoce el secreto `auth` de esa suscripción puede darla de baja.
  function unsubscribe({ id, endpoint, auth } = {}) {
    const list = load();
    const i = list.findIndex(s => (id ? s.id === id : s.endpoint === endpoint));
    if (i < 0) return false;
    if (!auth || !safeEq(list[i].keys.auth, auth)) throw Object.assign(new Error('No autorizado.'), { code: 'FORBIDDEN' });
    list.splice(i, 1); persist();
    return true;
  }

  // Envía a un dispositivo (`id`) o a todos. Elimina las suscripciones caducadas (404/410).
  async function send(payload, { id } = {}) {
    ensureConfigured();
    const msg = normalizePayload(payload);
    if (!msg) throw Object.assign(new Error('Mensaje inválido (kind, title y body son obligatorios).'), { code: 'INVALID' });
    const targets = load().filter(s => !id || s.id === id);
    const result = { targets: targets.length, sent: 0, removed: 0, failed: 0 };
    const data = JSON.stringify(msg), dead = new Set();
    for (let i = 0; i < targets.length; i += 20) {
      await Promise.all(targets.slice(i, i + 20).map(async s => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, data, { TTL: 86400, urgency: 'normal' });
          result.sent++;
        } catch (err) {
          if (err && (err.statusCode === 404 || err.statusCode === 410)) { dead.add(s.id); result.removed++; }
          else { result.failed++; console.warn('[push] fallo de envío', err && err.statusCode, err && err.message); }
        }
      }));
    }
    if (dead.size) { subs = load().filter(s => !dead.has(s.id)); persist(); }
    return result;
  }

  return { enabled, publicKey, subscribe, unsubscribe, send, count: () => load().length };
}

module.exports = { createPushService, normalizePayload, KINDS, ROUTES };
