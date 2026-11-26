// Servidor sin dependencias (Node >= 18): sirve la PWA y hace de proxy seguro hacia Groq.
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
try { fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n').forEach(l => {
  const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}); } catch {}
const PORT = process.env.PORT || 3000;
const MODEL = () => process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const PUB = path.join(__dirname, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.png': 'image/png' };

const SYSTEM = `Eres BikeAI, el asistente experto en mantenimiento y mecánica de bicicletas dentro de la app BikeCare.
REGLAS:
- Responde SIEMPRE en español, con lenguaje claro y sencillo; explica brevemente los términos técnicos.
- Responde solo sobre bicicletas (mantenimiento, mecánica, componentes, herramientas, limpieza, seguridad). Si preguntan otra cosa, redirige amablemente.
- Para diagnósticos: si faltan datos, haz 2-3 preguntas concretas sobre síntomas; después da posibles causas ordenadas de la más a la menos probable, qué revisar primero y soluciones.
- Para procedimientos: indica dificultad (fácil/media/difícil), tiempo aproximado, herramientas, y pasos numerados.
- Adapta la respuesta al nivel del usuario (asume principiante si no lo dice) y a los datos de su bicicleta e historial si se proporcionan.
- Sé conciso y práctico; usa listas y **negritas** para lo importante.
SEGURIDAD:
- Si el procedimiento es complejo, riesgoso o requiere herramientas especializadas (p. ej. purgado de frenos hidráulicos, servicio de suspensión, centrado avanzado, cuadro o horquilla dañados), recomienda acudir a un mecánico profesional.
- Nunca afirmes que la bicicleta es segura para circular si el usuario reporta fallas en frenos, dirección, ruedas, cuadro u otros componentes críticos; indica no usarla hasta revisarla.
- No inventes pares de apriete ni presiones exactas: remite a lo indicado en el componente, neumático o manual del fabricante.`;

// ---- Web Push (ver push-service.js). Claves VAPID y token de administración: solo por variables de entorno ----
const push = require('./push-service').createPushService({
  file: process.env.PUSH_STORE || path.join(__dirname, 'data', 'push-subscriptions.json'),
  webpush: require('web-push')
});
const PUSH_ERR = { INVALID: 400, FORBIDDEN: 403, FULL: 507, DISABLED: 503 };

function readJson(req, res, cb, limit = 10000) {
  let body = '', dead = false;
  req.on('data', c => {
    if (dead) return;
    body += c;
    if (body.length > limit) { // se responde 413 y se cierra la conexión al terminar (sin cortar la respuesta)
      dead = true; body = '';
      res.setHeader('Connection', 'close');
      send(res, 413, { error: 'Cuerpo demasiado grande.' });
    }
  });
  req.on('end', async () => {
    if (dead) return;
    let data; try { data = JSON.parse(body || '{}'); } catch { return send(res, 400, { error: 'JSON inválido.' }); }
    try { await cb(data); } catch (e) {
      if (!e.code) console.error('[api]', e);           // el detalle queda en el log, no se envía al cliente
      send(res, PUSH_ERR[e.code] || 500, { error: e.code ? e.message : 'Error interno.' });
    }
  });
}
const isAdmin = req => {
  const t = process.env.PUSH_ADMIN_TOKEN, h = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!t || t.length < 16 || !h) return false;
  const a = Buffer.from(t), b = Buffer.from(h);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
function pushRoutes(req, res, url) {
  if (url === '/api/push/key' && req.method === 'GET')
    return send(res, 200, { enabled: push.enabled(), publicKey: push.enabled() ? push.publicKey() : '' }); // la clave PRIVADA nunca sale del servidor
  if (url === '/api/push/subscribe' && req.method === 'POST')
    return readJson(req, res, d => { if (!push.enabled()) return send(res, 503, { error: 'Web Push no está configurado en el servidor.' }); send(res, 200, push.subscribe(d.subscription)); });
  if (url === '/api/push/unsubscribe' && req.method === 'POST')
    return readJson(req, res, d => send(res, 200, { removed: push.unsubscribe(d) }));
  if (url === '/api/push/send' && req.method === 'POST') {
    if (!isAdmin(req)) return send(res, 401, { error: 'No autorizado.' });
    return readJson(req, res, async d => send(res, 200, await push.send(d.payload, { id: d.id })));
  }
  return send(res, 404, { error: 'No encontrado.' });
}

function send(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }

// ---- Límite de peticiones a /api/chat (en memoria, por IP). Protege la cuota de Groq ----
// CHAT_RATE_LIMIT = peticiones por minuto (20 por defecto). Detrás de un proxy, TRUST_PROXY=1 usa X-Forwarded-For.
function createRateLimiter(windowMs = 60000) {
  const hits = new Map();
  const max = () => Number(process.env.CHAT_RATE_LIMIT) || 20;
  return {
    // Devuelve 0 si la petición se permite, o los segundos que faltan para poder reintentar.
    check(key, now = Date.now()) {
      if (hits.size > 5000) for (const [k, v] of hits) if (now - v.start >= windowMs) hits.delete(k); // limpieza
      let e = hits.get(key);
      if (!e || now - e.start >= windowMs) hits.set(key, e = { start: now, n: 0 });
      return ++e.n > max() ? Math.ceil((e.start + windowMs - now) / 1000) : 0;
    },
    reset: () => hits.clear()
  };
}
const chatLimiter = createRateLimiter();
const clientIp = req => (process.env.TRUST_PROXY === '1' && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim())
  || req.socket.remoteAddress || '?';

function chat(req, res) {
  const wait = chatLimiter.check(clientIp(req));
  if (wait) {
    res.setHeader('Retry-After', String(wait));
    return send(res, 429, { error: `Demasiadas preguntas seguidas. Intenta de nuevo en ${wait} s.` });
  }
  readJson(req, res, async ({ messages, context }) => {
    if (!process.env.GROQ_API_KEY) return send(res, 500, { error: 'Falta GROQ_API_KEY en el servidor (.env).' });
    if (!Array.isArray(messages) || !messages.length) return send(res, 400, { error: 'Mensajes inválidos.' });
    const clean = messages.slice(-12).filter(m => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string')
      .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));
    const ctx = context ? `\n\nDATOS DEL USUARIO (úsalos para personalizar):\n${JSON.stringify(context).slice(0, 2000)}` : '';
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({ model: MODEL(), temperature: 0.4, max_tokens: 900, messages: [{ role: 'system', content: SYSTEM + ctx }, ...clean] })
    });
    const data = await r.json();
    if (!r.ok) return send(res, 502, { error: data.error?.message || 'Error al consultar Groq.' });
    send(res, 200, { reply: data.choices?.[0]?.message?.content || '' });
  }, 50000);
}

// Cabeceras de seguridad para los archivos estáticos (la app no usa scripts en línea; sí estilos en línea).
const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
};

function serveStatic(req, res, url) {
  let f = path.normalize(path.join(PUB, url === '/' ? 'index.html' : decodeURIComponentSafe(url)));
  const inside = f === PUB || f.startsWith(PUB + path.sep);
  const exists = inside && fs.existsSync(f) && !fs.statSync(f).isDirectory();
  if (!exists) {
    // Un archivo con extensión que no existe (p. ej. /icon.png) es un 404 real; las rutas sin extensión
    // devuelven la app (index.html) para que funcione la navegación de la PWA.
    if (path.extname(url)) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...SEC_HEADERS }); return res.end('No encontrado'); }
    f = path.join(PUB, 'index.html');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', ...SEC_HEADERS,
    ...(path.basename(f) === 'sw.js' ? { 'Cache-Control': 'no-cache' } : {}) });   // el SW siempre se revisa
  fs.createReadStream(f).pipe(res);
}
function decodeURIComponentSafe(s) { try { return decodeURIComponent(s); } catch { return s; } }

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/api/chat' && req.method === 'POST') return chat(req, res);
  if (url.startsWith('/api/push/') && pushRoutes(req, res, url) !== false) return;
  if (url === '/api/health') return send(res, 200, { ok: true, ai: !!process.env.GROQ_API_KEY, model: MODEL() });
  serveStatic(req, res, url);
});

// Solo escucha si se ejecuta con `node server.js`; al importarlo desde las pruebas no abre el puerto.
if (require.main === module) server.listen(PORT, () => console.log(`BikeCare en http://localhost:${PORT}  (modelo: ${MODEL()})`));
module.exports = { server, push, chatLimiter, createRateLimiter };
