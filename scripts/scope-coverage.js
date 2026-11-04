// Cobertura SOLO del alcance de la actividad (10% del proyecto BikeCare).
// Lee coverage/coverage-final.json (Jest/Istanbul) y filtra por las líneas de cada función elegida.
const fs = require('fs'), path = require('path');

const SCOPE = { 'server.js': ['chat', 'send', 'MODEL'], 'public/sw.js': ['ago', 'cut'] };
const MIN = Number(process.env.SCOPE_MIN || 80); // % mínimo de sentencias cubiertas dentro del alcance
const root = process.cwd();
const covFile = path.join(root, 'coverage', 'coverage-final.json');
if (!fs.existsSync(covFile)) { console.error('No existe coverage/coverage-final.json. Ejecuta antes: npx jest --coverage'); process.exit(1); }

const rel = f => path.relative(root, f).split(path.sep).join('/');
const byFile = Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(covFile, 'utf8'))).map(([k, v]) => [rel(k), v]));
const pct = ([c, t]) => (t ? (100 * c / t) : 100);
const fmt = ([c, t]) => `${c}/${t} (${pct([c, t]).toFixed(1)}%)`;

// Ubica en el código fuente las líneas [inicio, fin] de una función.
function lineRange(file, name) {
  const lines = fs.readFileSync(path.join(root, file), 'utf8').split(/\r?\n/);
  const start = lines.findIndex(l => new RegExp(`^(async\\s+)?function\\s+${name}\\b|^const\\s+${name}\\s*=`).test(l));
  if (start < 0) throw new Error(`No se encontró ${name} en ${file}`);
  const balance = l => (l.match(/{/g) || []).length - (l.match(/}/g) || []).length;
  if (balance(lines[start]) === 0) return [start + 1, start + 1]; // función de una sola línea
  let end = start + 1;
  while (end < lines.length && !/^}/.test(lines[end])) end++;     // termina en la primera línea que empieza con "}"
  return [start + 1, end + 1];
}

function measure(file, [a, b]) {
  const d = byFile[file];
  if (!d) throw new Error(`Sin datos de cobertura para ${file}`);
  const inside = loc => loc.start.line >= a && loc.start.line <= b;
  const r = { st: [0, 0], fn: [0, 0], br: [0, 0] }; // [cubiertos, total]
  for (const id in d.statementMap) if (inside(d.statementMap[id])) { r.st[1]++; if (d.s[id] > 0) r.st[0]++; }
  for (const id in d.fnMap) if (inside(d.fnMap[id].loc)) { r.fn[1]++; if (d.f[id] > 0) r.fn[0]++; }
  for (const id in d.branchMap) if (inside(d.branchMap[id].loc)) d.b[id].forEach(n => { r.br[1]++; if (n > 0) r.br[0]++; });
  return r;
}

const rows = [], sum = { st: [0, 0], fn: [0, 0], br: [0, 0] };
for (const [file, names] of Object.entries(SCOPE)) for (const name of names) {
  const r = measure(file, lineRange(file, name));
  rows.push({ unit: `${file} › ${name}`, ...r });
  for (const k of ['st', 'fn', 'br']) { sum[k][0] += r[k][0]; sum[k][1] += r[k][1]; }
}
const proj = [0, 0];
for (const d of Object.values(byFile)) for (const id in d.statementMap) { proj[1]++; if (d.s[id] > 0) proj[0]++; }

const share = 100 * sum.st[1] / proj[1];
const ok = pct(sum.st) >= MIN;
const w = Math.max(...rows.map(r => r.unit.length), 8);
const out = [
  'COBERTURA DEL ALCANCE SELECCIONADO (unidades elegidas de BikeCare)',
  `${'Unidad'.padEnd(w)}  ${'Sentencias'.padEnd(16)}${'Ramas'.padEnd(16)}Funciones`,
  ...rows.map(r => `${r.unit.padEnd(w)}  ${fmt(r.st).padEnd(16)}${fmt(r.br).padEnd(16)}${fmt(r.fn)}`),
  `${'ALCANCE'.padEnd(w)}  ${fmt(sum.st).padEnd(16)}${fmt(sum.br).padEnd(16)}${fmt(sum.fn)}`,
  '',
  `Porcentaje del proyecto seleccionado: ${sum.st[1]} de ${proj[1]} sentencias = ${share.toFixed(1)}%`,
  `Cobertura sobre el alcance seleccionado: ${pct(sum.st).toFixed(1)}%`,
  `Cobertura sobre todo el proyecto (todos los archivos medidos): ${fmt(proj)}`,
  `Umbral mínimo del alcance: ${MIN}% -> ${ok ? 'CUMPLE' : 'NO CUMPLE'}`
].join('\n');
console.log('\n' + out + '\n');

const md = [
  '### Cobertura del alcance seleccionado (BikeCare)',
  '| Unidad | Sentencias | Ramas | Funciones |', '|---|---|---|---|',
  ...rows.map(r => `| \`${r.unit}\` | ${fmt(r.st)} | ${fmt(r.br)} | ${fmt(r.fn)} |`),
  `| **ALCANCE** | **${fmt(sum.st)}** | **${fmt(sum.br)}** | **${fmt(sum.fn)}** |`, '',
  `- Proyecto seleccionado: **${sum.st[1]} de ${proj[1]} sentencias = ${share.toFixed(1)}%**`,
  `- Cobertura del alcance: **${pct(sum.st).toFixed(1)}%** · cobertura de todo el proyecto: **${pct(proj).toFixed(1)}%**`,
  `- Umbral ${MIN}%: **${ok ? 'cumple' : 'no cumple'}**`, ''
].join('\n');
fs.writeFileSync(path.join(root, 'coverage', 'scope-report.txt'), out + '\n');
fs.writeFileSync(path.join(root, 'coverage', 'scope-report.md'), md);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
process.exitCode = ok ? 0 : 1;
