// Pruebas unitarias de public/sw.js: ago() y cut(), usadas para construir los datos del widget.
// sw.js usa `self` e `importScripts`, que no existen en Node: se definen stubs antes de importarlo.
global.self = { addEventListener: () => {} };
global.importScripts = () => {};
const { ago, cut } = require('../public/sw.js');

describe('ago(): antigüedad de un mantenimiento', () => {
  // Hora local fija (mediodía del 4-nov-2026) para que el resultado no dependa del reloj ni de la zona horaria.
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date(2026, 10, 4, 12, 0, 0)));
  afterEach(() => jest.useRealTimers());

  test('misma fecha → "hoy"', () => expect(ago('2026-11-04')).toBe('hoy'));
  test('un día antes → "ayer"', () => expect(ago('2026-11-03')).toBe('ayer'));
  test('varios días antes → "hace N días"', () => {
    expect(ago('2026-10-30')).toBe('hace 5 días');
    expect(ago('2026-10-05')).toBe('hace 30 días');
  });
  test('fecha inválida o vacía → cadena vacía', () => {
    expect(ago('no-es-fecha')).toBe('');
    expect(ago('')).toBe('');
  });
  test('CARACTERIZACIÓN: una fecha futura se muestra como "hoy"', () => expect(ago('2026-11-10')).toBe('hoy'));
});

describe('cut(): recorte de texto para la tarjeta del widget', () => {
  test('no recorta si el texto cabe (incluido el límite exacto)', () => {
    expect(cut('Hola mundo', 20)).toBe('Hola mundo');
    expect(cut('abcde', 5)).toBe('abcde');
  });
  test('recorta y agrega "…" sin pasar el límite', () => {
    expect(cut('Hola mundo', 5)).toBe('Hola…');
    expect(cut('Hola mundo', 5)).toHaveLength(5);
  });
  test('null y undefined → cadena vacía', () => {
    expect(cut(null, 5)).toBe('');
    expect(cut(undefined, 5)).toBe('');
  });
  test('convierte números a texto', () => expect(cut(1234567, 4)).toBe('123…'));
});
const { reminderFor, routeFor, parsePush } = require('../public/sw.js');

describe('parsePush(): mensaje push recibido', () => {
  test('mensaje válido → datos listos para showNotification', () => {
    expect(parsePush({ kind: 'checklist', title: ' Hola ', body: 'Texto', tag: 't-1' }))
      .toEqual({ title: 'Hola', body: 'Texto', route: '/#/check', actionTitle: 'Abrir' });
  });
  test('ruta fuera de la lista blanca → ruta por defecto del tipo', () => {
    expect(parsePush({ kind: 'history', title: 't', body: 'b', route: 'https://evil.test' }).route).toBe('/#/hist');
    expect(parsePush({ kind: 'announcement', title: 't', body: 'b', route: '/#/ai' }).route).toBe('/#/ai');
  });
  test('inválido o incompleto → null', () => {
    [null, 'texto', {}, { kind: 'otro', title: 't', body: 'b' }, { kind: 'checklist', title: 't' }].forEach(p => expect(parsePush(p)).toBeNull());
  });
});

describe('reminderFor(): recordatorio del checklist', () => {
  const snap = o => ({ prefs: { reminders: true }, pending: 7, chkDone: 2, chkTotal: 5, ...o });
  test('sin resumen o con recordatorios desactivados → null', () => {
    expect(reminderFor(null)).toBeNull();
    expect(reminderFor(snap({ prefs: { reminders: false } }))).toBeNull();
  });
  test('sin pendientes → null', () => expect(reminderFor(snap({ pending: 0 }))).toBeNull());
  test('con pendientes → cuenta total y los de "antes de salir"', () => {
    const r = reminderFor(snap());
    expect(r.body).toBe('Tienes 7 puntos pendientes en tu checklist (3 antes de salir)');
    expect(r.tag).toBe('bikecare-pending');
  });
  test('singular y sin pendientes previos a salir', () => {
    expect(reminderFor(snap({ pending: 1, chkDone: 5 })).body).toBe('Tienes 1 punto pendiente en tu checklist');
  });
});

describe('routeFor(): lista blanca de rutas de notificación', () => {
  test('acepta rutas conocidas', () => expect(routeFor('/#/check')).toBe('/#/check'));
  test('cualquier otra cosa → inicio', () => {
    expect(routeFor('https://evil.example')).toBe('/');
    expect(routeFor('constructor')).toBe('/');
    expect(routeFor(undefined)).toBe('/');
  });
});
