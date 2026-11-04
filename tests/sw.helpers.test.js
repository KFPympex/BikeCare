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