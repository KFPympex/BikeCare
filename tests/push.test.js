// Pruebas de Web Push: servicio (push-service.js), endpoints (server.js) y parsePush() del Service Worker.
// El envío al servicio push real se simula; el cifrado/firma VAPID se comprueba de verdad con web-push (sin red).
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const webpush = require('web-push');
const { createPushService, normalizePayload } = require('../push-service');

const vapid = webpush.generateVAPIDKeys();
const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bk-push-')), 'subs.json');
const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
const subOf = (n = 1, real = false) => ({
  endpoint: `https://push.example.test/send/${n}`,
  keys: real ? { p256dh: ecdh.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') }
             : { p256dh: 'p' + n, auth: 'a' + n }
});
const ENV = { VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey, VAPID_SUBJECT: 'https://example.test' };
const make = (wp, env = ENV) => createPushService({ file: tmpFile(), webpush: wp, env });
const fakeWp = (impl = async () => ({})) => ({ setVapidDetails: jest.fn(), sendNotification: jest.fn(impl) });

describe('suscripciones', () => {
  test('guarda y evita duplicados (mismo endpoint → mismo id)', () => {
    const svc = make(fakeWp());
    const a = svc.subscribe(subOf(1)), b = svc.subscribe(subOf(1)), c = svc.subscribe(subOf(2));
    expect(a.id).toBe(b.id); expect(c.id).not.toBe(a.id); expect(svc.count()).toBe(2);
  });
  test('persiste en disco y se recupera en otra instancia', () => {
    const file = tmpFile(), wp = fakeWp();
    const id = createPushService({ file, webpush: wp, env: ENV }).subscribe(subOf(1)).id;
    expect(createPushService({ file, webpush: wp, env: ENV }).subscribe(subOf(1)).id).toBe(id);
  });
  test.each([[null], [{}], [{ endpoint: 'http://inseguro.test/x', keys: { p256dh: 'a', auth: 'b' } }],
    [{ endpoint: 'https://x.test/1', keys: {} }]])('rechaza suscripciones inválidas: %j', s => {
    expect(() => make(fakeWp()).subscribe(s)).toThrow(/inválida/);
  });
  test('baja: exige el secreto auth de esa suscripción', () => {
    const svc = make(fakeWp()), { id } = svc.subscribe(subOf(1));
    expect(() => svc.unsubscribe({ id, auth: 'otro' })).toThrow(/No autorizado/);
    expect(() => svc.unsubscribe({ id })).toThrow(/No autorizado/);
    expect(svc.count()).toBe(1);
    expect(svc.unsubscribe({ id, auth: 'a1' })).toBe(true);
    expect(svc.count()).toBe(0);
    expect(svc.unsubscribe({ id, auth: 'a1' })).toBe(false);
  });
});

describe('send()', () => {
  const msg = { kind: 'announcement', title: 'Hola', body: 'Nueva guía disponible' };
  test('sin claves VAPID → DISABLED', async () => {
    await expect(make(fakeWp(), {}).send(msg)).rejects.toMatchObject({ code: 'DISABLED' });
  });
  test('mensaje inválido → INVALID y no envía nada', async () => {
    const wp = fakeWp(), svc = make(wp); svc.subscribe(subOf(1));
    await expect(svc.send({ kind: 'desconocido', title: 'x', body: 'y' })).rejects.toMatchObject({ code: 'INVALID' });
    expect(wp.sendNotification).not.toHaveBeenCalled();
  });
  test('envía a un dispositivo concreto o a todos, sin tag ni topic', async () => {
    const wp = fakeWp(), svc = make(wp), a = svc.subscribe(subOf(1)); svc.subscribe(subOf(2));
    expect(await svc.send({ ...msg, tag: 'ignorada' }, { id: a.id })).toMatchObject({ targets: 1, sent: 1 });
    expect(wp.sendNotification.mock.calls[0][2]).toMatchObject({ TTL: 86400 });
    expect(wp.sendNotification.mock.calls[0][2]).not.toHaveProperty('topic');
    expect(JSON.parse(wp.sendNotification.mock.calls[0][1])).toEqual({ kind: 'announcement', title: 'Hola', body: 'Nueva guía disponible', route: '/' });
    expect(await svc.send(msg)).toMatchObject({ targets: 2, sent: 2 });
    expect(wp.setVapidDetails).toHaveBeenCalledTimes(1);
  });
  test('elimina suscripciones caducadas (404/410) y cuenta otros fallos sin borrarlas', async () => {
    const wp = fakeWp(async s => {
      if (s.endpoint.endsWith('/1')) throw { statusCode: 410 };
      if (s.endpoint.endsWith('/2')) throw { statusCode: 500, message: 'caído' };
    });
    const svc = make(wp); svc.subscribe(subOf(1)); svc.subscribe(subOf(2)); svc.subscribe(subOf(3));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await svc.send(msg)).toMatchObject({ sent: 1, removed: 1, failed: 1 });
    expect(svc.count()).toBe(2);
  });
  test('web-push real: cifra el mensaje y firma con VAPID (sin red)', async () => {
    webpush.setVapidDetails(ENV.VAPID_SUBJECT, vapid.publicKey, vapid.privateKey);
    const d = await webpush.generateRequestDetails(subOf(1, true), JSON.stringify(normalizePayload(msg)), { TTL: 60 });
    expect(d.headers['Content-Encoding']).toBe('aes128gcm');
    expect(d.headers.Authorization).toMatch(/^vapid t=/);
    expect(d.headers.Topic).toBeUndefined();
    expect(Buffer.isBuffer(d.body) && d.body.length > 0).toBe(true);
    expect(d.body.toString('utf8')).not.toContain('Nueva guía');           // viaja cifrado
  });
});

describe('normalizePayload()', () => {
  test('recorta y valida la ruta', () => {
    const n = normalizePayload({ kind: 'checklist', title: 'T'.repeat(200), body: 'b', route: 'https://evil.test', tag: 'mala etiqueta!' });
    expect(n.title).toHaveLength(80); expect(n.route).toBe('/#/check'); expect(n).not.toHaveProperty('tag');
    expect(normalizePayload({ kind: 'history', title: 't', body: 'b', route: '/#/config' }).route).toBe('/#/config');
  });
  test('rechaza sin título/cuerpo/tipo', () => {
    [null, {}, { kind: 'announcement', title: 't' }, { title: 't', body: 'b' }].forEach(p => expect(normalizePayload(p)).toBeNull());
  });
});

describe('endpoints /api/push/*', () => {
  let server, base, realFetch;
  beforeAll(done => {
    Object.assign(process.env, { PUSH_STORE: tmpFile(), ...ENV, PUSH_ADMIN_TOKEN: 'token-de-prueba-1234567890' });
    jest.resetModules();
    jest.doMock('web-push', () => ({ setVapidDetails: jest.fn(), sendNotification: jest.fn(async () => ({})) }));
    ({ server } = require('../server'));
    realFetch = global.fetch;
    server.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; done(); });
  });
  afterAll(done => { if (server.closeAllConnections) server.closeAllConnections(); server.close(() => done()); });
  const post = (p, body, h = {}) => realFetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body) });
  const ADMIN = { Authorization: 'Bearer token-de-prueba-1234567890' };

  test('GET /key expone solo la clave pública', async () => {
    const t = await (await realFetch(base + '/api/push/key')).text();
    expect(JSON.parse(t)).toEqual({ enabled: true, publicKey: vapid.publicKey });
    expect(t).not.toContain(vapid.privateKey);
  });
  test('suscribir → id; baja con auth incorrecto 403; correcta 200', async () => {
    const r = await post('/api/push/subscribe', { subscription: subOf(9) });
    expect(r.status).toBe(200); const { id } = await r.json(); expect(id).toMatch(/^[0-9a-f]{24}$/);
    expect((await post('/api/push/unsubscribe', { id, auth: 'mal' })).status).toBe(403);
    expect(await (await post('/api/push/unsubscribe', { id, auth: 'a9' })).json()).toEqual({ removed: true });
  });
  test('suscripción inválida → 400; JSON roto → 400', async () => {
    expect((await post('/api/push/subscribe', { subscription: { endpoint: 'x' } })).status).toBe(400);
    const r = await realFetch(base + '/api/push/subscribe', { method: 'POST', body: '{no-json' });
    expect(r.status).toBe(400);
  });
  test('/send exige el token de administrador', async () => {
    const body = { payload: { kind: 'announcement', title: 'T', body: 'B' } };
    expect((await post('/api/push/send', body)).status).toBe(401);
    expect((await post('/api/push/send', body, { Authorization: 'Bearer incorrecto' })).status).toBe(401);
    expect((await post('/api/push/send', body, ADMIN)).status).toBe(200);
    expect((await post('/api/push/send', { payload: { kind: 'x' } }, ADMIN)).status).toBe(400);
  });
});
