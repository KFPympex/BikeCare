// Servidor sin dependencias (Node >= 18): sirve la PWA y hace de proxy seguro hacia Groq.
const http = require('http'), fs = require('fs'), path = require('path');
try { fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n').forEach(l => {
  const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}); } catch {}
const PORT = process.env.PORT || 3000;
const MODEL = () => process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
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

function send(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }

async function chat(req, res) {
  let body = '';
  req.on('data', c => { body += c; if (body.length > 50000) req.destroy(); });
  req.on('end', async () => {
    try {
      if (!process.env.GROQ_API_KEY) return send(res, 500, { error: 'Falta GROQ_API_KEY en el servidor (.env).' });
      const { messages, context } = JSON.parse(body || '{}');
      if (!Array.isArray(messages) || !messages.length) return send(res, 400, { error: 'Mensajes inválidos.' });
      const clean = messages.slice(-12).filter(m => ['user', 'assistant'].includes(m.role) && typeof m.content === 'string')
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
    } catch (e) { send(res, 500, { error: 'Error interno: ' + e.message }); }
  });
}

http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/api/chat' && req.method === 'POST') return chat(req, res);
  if (url === '/api/health') return send(res, 200, { ok: true, ai: !!process.env.GROQ_API_KEY, model: MODEL() });
  let f = path.normalize(path.join(PUB, url === '/' ? 'index.html' : url));
  if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(PUB, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(PORT, () => console.log(`BikeCare en http://localhost:${PORT}  (modelo: ${MODEL()})`));
