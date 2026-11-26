// Pruebas unitarias de public/reminders.js: recordatorios de mantenimiento por km y por tiempo.
const { INTERVALS, todayStr, daysBetween, applies, lastRecord, dueStatus, dueList, describeDue } = require('../public/reminders.js');

const GUIDES = [
  { id: 'cadena', name: 'Cadena', icon: '⛓️' },
  { id: 'frenos', name: 'Frenos', icon: '🛑' },
  { id: 'neumaticos', name: 'Neumáticos', icon: '🫧' },
  { id: 'suspension', name: 'Suspensión', icon: '🌀' },
  { id: 'desv-del', name: 'Desviador delantero', icon: '🔗' },
  { id: 'sillin', name: 'Sillín', icon: '💺' }            // sin intervalo: no aparece en la lista
];
const CADENA = { km: 200, days: 30 };

describe('todayStr() y daysBetween()', () => {
  test('todayStr usa la fecha LOCAL, no UTC', () => {
    expect(todayStr(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
  test('daysBetween cuenta días completos y tolera fechas inválidas', () => {
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30);
    expect(daysBetween('2026-03-01', '2026-02-28')).toBe(-1);
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1);
    expect(daysBetween('', '2026-01-01')).toBeNull();
    expect(daysBetween('2026-1-1', '2026-01-01')).toBeNull();
  });
});

describe('applies(): componentes según la bicicleta', () => {
  test('bici rígida no tiene suspensión', () => {
    expect(applies('suspension', { susp: 'Rígida' })).toBe(false);
    expect(applies('suspension', { susp: 'Delantera' })).toBe(true);
    expect(applies('suspension', {})).toBe(true); // sin dato → se muestra
  });
  test('1x, monovelocidad e internas no tienen desviador delantero', () => {
    ['1x (un plato)', 'Monovelocidad', 'Internas'].forEach(drive => expect(applies('desv-del', { drive })).toBe(false));
    expect(applies('desv-del', { drive: '2x' })).toBe(true);
  });
  test('monovelocidad e internas no tienen cassette ni desviador trasero', () => {
    expect(applies('cassette', { drive: 'Monovelocidad' })).toBe(false);
    expect(applies('desv-tras', { drive: 'Internas' })).toBe(false);
    expect(applies('cassette', { drive: '1x (un plato)' })).toBe(true);
  });
});

describe('lastRecord(): último registro de un componente', () => {
  test('elige la fecha más reciente y, si empatan, el mayor kilometraje', () => {
    const hist = [
      { comp: 'Cadena', date: '2026-01-10', km: '100' },
      { comp: 'Cadena', date: '2026-03-01', km: '300' },
      { comp: 'Cadena', date: '2026-03-01', km: '350' },
      { comp: 'Frenos', date: '2026-05-01', km: '900' },
      { comp: 'Cadena', date: 'fecha-rota', km: '999' }
    ];
    expect(lastRecord(hist, 'Cadena')).toEqual({ comp: 'Cadena', date: '2026-03-01', km: '350' });
    expect(lastRecord(hist, 'Pedales')).toBeNull();
    expect(lastRecord(undefined, 'Cadena')).toBeNull();
  });
});

describe('dueStatus(): estado de un intervalo', () => {
  test('sin registro → unknown', () => expect(dueStatus(CADENA, null, 500, '2026-01-01').state).toBe('unknown'));
  test('lejos del intervalo → ok, con km y días restantes', () => {
    const s = dueStatus(CADENA, { date: '2026-01-01', km: '1000' }, 1050, '2026-01-11');
    expect(s).toMatchObject({ state: 'ok', kmLeft: 150, daysLeft: 20 });
  });
  test('al 80 % (por km) → soon', () => {
    expect(dueStatus(CADENA, { date: '2026-01-01', km: 1000 }, 1160, '2026-01-02').state).toBe('soon');
  });
  test('vence por km aunque no por tiempo', () => {
    const s = dueStatus(CADENA, { date: '2026-01-01', km: 1000 }, 1250, '2026-01-05');
    expect(s).toMatchObject({ state: 'due', kmLeft: -50 });
  });
  test('vence por tiempo aunque no se registren km', () => {
    const s = dueStatus(CADENA, { date: '2026-01-01', km: '' }, null, '2026-02-15');
    expect(s).toMatchObject({ state: 'due', kmUsed: null, daysLeft: -15 });
  });
  test('si el odómetro es menor que el km del registro, se ignoran los km (dato incoherente)', () => {
    const s = dueStatus(CADENA, { date: '2026-01-01', km: 5000 }, 100, '2026-01-02');
    expect(s.kmUsed).toBeNull();
    expect(s.state).toBe('ok');
  });
  test('intervalo solo por tiempo (neumáticos)', () => {
    const s = dueStatus(INTERVALS.neumaticos, { date: '2026-01-01', km: 0 }, 9999, '2026-01-08');
    expect(s).toMatchObject({ state: 'due', kmLeft: null, daysLeft: 0 });
  });
});

describe('dueList(): lista ordenada por urgencia', () => {
  const hist = [
    { comp: 'Cadena', date: '2026-01-01', km: '1000' },   // 300 km → due
    { comp: 'Frenos', date: '2026-01-01', km: '1000' }    // 300 de 500 km, 10 de 60 días → ok
  ];
  const list = dueList({ hist, odo: 1300, bike: { susp: 'Rígida', drive: '1x (un plato)' }, today: '2026-01-11', guides: GUIDES });

  test('solo componentes con intervalo y que aplican a la bici', () => {
    expect(list.map(x => x.id).sort()).toEqual(['cadena', 'frenos', 'neumaticos']);
  });
  test('orden: toca ya → al día → sin registro', () => {
    expect(list.map(x => x.state)).toEqual(['due', 'ok', 'unknown']);
    expect(list[0]).toMatchObject({ id: 'cadena', name: 'Cadena', task: INTERVALS.cadena.task });
  });
});

describe('describeDue(): texto para la interfaz', () => {
  test('cada estado tiene un texto claro', () => {
    expect(describeDue({ state: 'unknown' })).toMatch(/Sin registro/);
    expect(describeDue({ state: 'due', kmLeft: -50, daysLeft: 10 })).toBe('Toca ya: 50 km de retraso');
    expect(describeDue({ state: 'due', kmLeft: null, daysLeft: -1 })).toBe('Toca ya: 1 día de retraso');
    expect(describeDue({ state: 'due', kmLeft: null, daysLeft: 0 })).toBe('Toca hoy');
    expect(describeDue({ state: 'ok', kmLeft: 150, daysLeft: 20 })).toBe('Faltan 150 km o 20 días');
    expect(describeDue({ state: 'soon', kmLeft: null, daysLeft: 1 })).toBe('Faltan 1 día');
  });
});
