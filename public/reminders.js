// Recordatorios de mantenimiento por kilómetros y por tiempo.
// Funciones puras: las usan la página (app.js), el service worker (importScripts) y las pruebas (require).
// Un componente "toca" cuando se cumple lo primero entre su intervalo de km y su intervalo de días.

// Intervalos ORIENTATIVOS para uso general. Lluvia, barro o uso intensivo los acortan.
// km: null = solo por tiempo · days: null = solo por km. Las claves son los `id` de las guías (data.js).
const INTERVALS = {
  cadena:      { km: 200,  days: 30,  task: 'Limpiar y lubricar la cadena' },
  frenos:      { km: 500,  days: 60,  task: 'Revisar pastillas y discos' },
  neumaticos:  { km: null, days: 7,   task: 'Revisar presión y desgaste' },
  cassette:    { km: 1000, days: 90,  task: 'Limpiar el cassette' },
  'desv-tras': { km: 1000, days: 180, task: 'Revisar ajuste del desviador trasero' },
  'desv-del':  { km: 1500, days: 180, task: 'Revisar ajuste del desviador delantero' },
  cambios:     { km: 2000, days: 365, task: 'Revisar cables y fundas' },
  bielas:      { km: 1500, days: 180, task: 'Revisar apriete de bielas' },
  pedales:     { km: 2000, days: 365, task: 'Limpiar y engrasar pedales' },
  ruedas:      { km: 1000, days: 180, task: 'Revisar rayos y centrado' },
  suspension:  { km: 500,  days: 30,  task: 'Limpiar botellines y revisar presión' },
  direccion:   { km: 2000, days: 365, task: 'Revisar juego de la dirección' },
  tija:        { km: null, days: 365, task: 'Limpiar y engrasar la tija' }
};
const SOON = 0.8; // a partir del 80 % del intervalo se avisa como "pronto"

// Fecha local en formato AAAA-MM-DD (toISOString usa UTC y puede dar el día siguiente por la noche).
function todayStr(now = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

// Días completos entre dos fechas AAAA-MM-DD (b - a). null si alguna es inválida.
function daysBetween(a, b) {
  const t = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? Date.UTC(+m[1], m[2] - 1, +m[3]) : NaN; };
  const d = Math.round((t(b) - t(a)) / 864e5);
  return Number.isFinite(d) ? d : null;
}

const num = v => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));

// ¿Aplica este componente a la bicicleta configurada? (si el dato es "No sé" o está vacío, sí aplica)
function applies(id, bike = {}) {
  const drive = bike.drive || '', susp = bike.susp || '';
  if (id === 'suspension') return susp !== 'Rígida';
  if (id === 'desv-del') return !/^(1x|Monovelocidad|Internas)/.test(drive);
  if (['desv-tras', 'cassette'].includes(id)) return !/^(Monovelocidad|Internas)/.test(drive);
  return true;
}

// Registro más reciente de un componente (el historial guarda el nombre de la guía en `comp`).
function lastRecord(hist, compName) {
  let best = null;
  for (const h of hist || []) {
    if (!h || h.comp !== compName || daysBetween('2000-01-01', h.date) === null) continue;
    if (!best || h.date > best.date || (h.date === best.date && (num(h.km) || 0) > (num(best.km) || 0))) best = h;
  }
  return best;
}

// Estado de un intervalo dado el último registro, el odómetro actual y la fecha de hoy.
// state: 'unknown' (sin registro) | 'ok' | 'soon' | 'due'
function dueStatus(interval, last, odo, today) {
  if (!last) return { state: 'unknown', ratio: 0, kmUsed: null, daysUsed: null, kmLeft: null, daysLeft: null };
  const lastKm = num(last.km), cur = num(odo);
  const kmUsed = interval.km && lastKm !== null && cur !== null && cur >= lastKm ? cur - lastKm : null;
  const days = daysBetween(last.date, today);
  const daysUsed = interval.days && days !== null ? Math.max(0, days) : null;
  const ratios = [];
  if (kmUsed !== null) ratios.push(kmUsed / interval.km);
  if (daysUsed !== null) ratios.push(daysUsed / interval.days);
  const ratio = ratios.length ? Math.max(...ratios) : 0;
  return {
    state: ratio >= 1 ? 'due' : ratio >= SOON ? 'soon' : 'ok', ratio,
    kmUsed, daysUsed,
    kmLeft: kmUsed !== null ? interval.km - kmUsed : null,
    daysLeft: daysUsed !== null ? interval.days - daysUsed : null
  };
}

const ORDER = { due: 0, soon: 1, ok: 2, unknown: 3 };
// Lista de componentes con su estado, del más urgente al menos urgente.
function dueList({ hist = [], odo = null, bike = {}, today = todayStr(), guides = (typeof M !== 'undefined' ? M : []) } = {}) {
  return guides.filter(g => INTERVALS[g.id] && applies(g.id, bike)).map(g => {
    const iv = INTERVALS[g.id], last = lastRecord(hist, g.name);
    return { id: g.id, name: g.name, icon: g.icon, task: iv.task, interval: iv, last, ...dueStatus(iv, last, odo, today) };
  }).sort((a, b) => ORDER[a.state] - ORDER[b.state] || b.ratio - a.ratio);
}

// Texto corto para mostrar el estado de un componente.
function describeDue(it) {
  const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
  if (it.state === 'unknown') return 'Sin registro: anota la última vez que lo hiciste';
  if (it.state === 'due') {
    const kmLate = it.kmLeft !== null && it.kmLeft <= 0 ? -it.kmLeft : null;
    const dLate = it.daysLeft !== null && it.daysLeft <= 0 ? -it.daysLeft : null;
    if (kmLate) return `Toca ya: ${plural(kmLate, 'km', 'km')} de retraso`;
    if (dLate) return `Toca ya: ${plural(dLate, 'día', 'días')} de retraso`;
    return 'Toca hoy';
  }
  const parts = [];
  if (it.kmLeft !== null) parts.push(`${it.kmLeft} km`);
  if (it.daysLeft !== null) parts.push(plural(it.daysLeft, 'día', 'días'));
  return parts.length ? `Faltan ${parts.join(' o ')}` : 'Al día';
}

if (typeof module !== 'undefined' && module.exports)
  module.exports = { INTERVALS, SOON, todayStr, daysBetween, applies, lastRecord, dueStatus, dueList, describeDue };
