const $=s=>document.querySelector(s), app=$('#app');
const LS=(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}};
const save=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}syncWidget()};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const S={bike:LS('bike',{}),hist:LS('hist',[]),chk:LS('chk',{}),chat:[],pending:null};
const NAV=[['','🏠','Inicio'],['bike','🚲','Mi bicicleta'],['maint','🔧','Mantenimiento'],['ai','🤖','BikeAI'],['diag','🔍','Diagnóstico'],['check','✅','Checklist'],['tools','🛠️','Herramientas'],['hist','📋','Historial'],['config','⚙️','Ajustes']];
const BIKES=['MTB','Ruta','Urbana','BMX','Gravel','Eléctrica','Otra'];
const FIELDS=[['type','Tipo de bicicleta',BIKES],['brakes','Frenos',['Disco hidráulico','Disco mecánico','V-brake / zapata','No sé']],['drive','Transmisión',['1x (un plato)','2x','3x','Monovelocidad','Internas','No sé']],['susp','Suspensión',['Rígida','Delantera','Doble suspensión','No sé']],['use','Uso principal',['Ciudad','Montaña','Carretera','Trabajo / reparto','Recreativo']],['freq','Frecuencia de uso',['Diario','Varias veces por semana','Fines de semana','Ocasional']]];
const md=t=>{let h=esc(t).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').split('\n'),o='',l=null;
 for(const x of h){const u=/^\s*[-*•]\s+(.*)/.exec(x),n=/^\s*\d+[.)]\s+(.*)/.exec(x);const k=u?'ul':n?'ol':null;
  if(k!==l){if(l)o+=`</${l}>`;if(k)o+=`<${k}>`;l=k}
  o+=k?`<li>${(u||n)[1]}</li>`:(x.trim()?`<p style="margin:.4em 0">${x}</p>`:'')}
 return o+(l?`</${l}>`:'')};

function buildNav(cur){$('#nav').innerHTML=NAV.map(n=>`<a href="#/${n[0]}" class="${n[0]===cur?'on':''}"><span>${n[1]}</span>${n[2]}</a>`).join('')}
function route(){const [p='',id]=location.hash.replace(/^#\/?/,'').split('/');buildNav(p);scrollTo(0,0);
 ({'':home,bike,maint:()=>id?maintDetail(id):maint(),ai,diag,check,tools,hist,config}[p]||home)()}

function home(){app.innerHTML=`<div class="hero"><div class="big">🚲🔧🤖</div><h1>BikeCare</h1><p>Aprende a mantener tu bici, diagnostica fallas y pregunta a BikeAI paso a paso.</p><a class="btn" href="#/ai">Hablar con BikeAI</a></div>
 <h2>Accesos rápidos</h2><div class="grid">${NAV.slice(1,8).map(n=>`<a class="card" href="#/${n[0]}"><div class="big">${n[1]}</div><b>${n[2]}</b></a>`).join('')}</div>
 ${S.bike.type?`<div class="card">Tu bici: <b>${esc(S.bike.type)}</b> · ${esc(S.bike.use||'')}. Registros: ${S.hist.length}</div>`:`<div class="card">Configura tu bici en <a href="#/bike" style="color:var(--g)">Mi bicicleta</a> para recomendaciones personalizadas.</div>`}`}

function bike(){app.innerHTML=`<h1>🚲 Mi bicicleta</h1><div class="card">${FIELDS.map(f=>`<label>${f[1]}</label><select id="f-${f[0]}"><option value="">Selecciona…</option>${f[2].map(o=>`<option ${S.bike[f[0]]===o?'selected':''}>${o}</option>`).join('')}</select>`).join('')}<button id="sv">Guardar</button> <span id="ok" style="color:var(--g)"></span></div>`;
 $('#sv').onclick=()=>{FIELDS.forEach(f=>S.bike[f[0]]=$('#f-'+f[0]).value);save('bike',S.bike);$('#ok').textContent='Guardado ✓'}}

function maint(){app.innerHTML=`<h1>🔧 Mantenimiento</h1><div class="grid">${M.map(m=>`<a class="card" href="#/maint/${m.id}"><div class="big">${m.icon}</div><b>${m.name}</b><br><span class="tag">${m.dif}</span><span class="tag">${m.time}</span></a>`).join('')}</div>`}
function maintDetail(id){const m=M.find(x=>x.id===id);if(!m)return maint();
 app.innerHTML=`<a href="#/maint" style="color:var(--g)">← Volver</a><h1>${m.icon} ${m.name}</h1><span class="tag">Dificultad: ${m.dif}</span><span class="tag">⏱ ${m.time}</span>
 <div class="card"><b>🛠️ Herramientas:</b> ${esc(m.tools)}<br><b>🧴 Materiales:</b> ${esc(m.mat)}</div>
 <h2>Pasos</h2><div class="card"><ol>${m.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol></div>
 <div class="card">💡 <b>Consejo:</b> ${esc(m.tip)}<br>❗ <b>Error común:</b> ${esc(m.err)}</div><div class="warn">⚠️ ${esc(m.warn)}</div>
 <button id="ask">Preguntar a BikeAI sobre esto</button>`;
 $('#ask').onclick=()=>{S.pending=`Quiero hacer mantenimiento de: ${m.name}. Explícame paso a paso y dime qué errores evitar.`;location.hash='#/ai'}}

const QUICK=[['🔧 Diagnosticar problema','Quiero diagnosticar un problema de mi bicicleta. Hazme las preguntas necesarias.'],['🚲 Mantenimiento','¿Qué mantenimiento necesita mi bicicleta según mi uso y mi historial?'],['🛠️ Herramientas','¿Qué herramientas básicas necesito para empezar a darle mantenimiento a mi bici?'],['⛓️ Cadena','¿Cada cuánto debo limpiar y lubricar la cadena y cómo sé si está estirada?'],['🛑 Frenos','¿Cómo sé si mis pastillas de freno están desgastadas?'],['⚙️ Cambios','Mi cambio trasero no sube correctamente al piñón grande, ¿qué reviso primero?']];
function msgsHtml(){return S.chat.map(m=>m.loading?`<div class="m a"><div class="dots"><span></span><span></span><span></span></div></div>`:`<div class="m ${m.role==='user'?'u':'a'}">${m.role==='user'?esc(m.content):md(m.content)}</div>`).join('')||`<div class="m a">¡Hola! Soy BikeAI. Cuéntame qué le pasa a tu bici o qué quieres aprender.</div>`}
function paint(){const e=$('#msgs');if(e){e.innerHTML=msgsHtml();e.scrollTop=e.scrollHeight}}
async function ask(text){if(!text.trim()||S.busy)return;S.busy=true;S.chat.push({role:'user',content:text});S.chat.push({loading:true});paint();
 try{const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:S.chat.filter(m=>!m.loading).map(({role,content})=>({role,content})),context:{bici:S.bike,historial:S.hist.slice(0,5)}})});
  const d=await r.json();S.chat.pop();S.chat.push({role:'assistant',content:r.ok?d.reply:`⚠️ ${d.error||'Error'}`})}
 catch{S.chat.pop();S.chat.push({role:'assistant',content:'⚠️ No pude conectar con BikeAI (¿sin conexión?). Las guías de Mantenimiento siguen disponibles sin internet.'})}
 S.busy=false;paint()}
function ai(){app.innerHTML=`<h1>🤖 BikeAI</h1><div class="chat"><div id="msgs"></div><div class="chips">${QUICK.map((q,i)=>`<button data-q="${i}">${q[0]}</button>`).join('')}</div><div class="row"><input id="q" placeholder="Escribe tu pregunta…" autocomplete="off"><button id="send">Enviar</button><button id="clr" class="sec" title="Limpiar">🗑️</button></div></div>`;paint();
 const go=()=>{const v=$('#q').value;$('#q').value='';ask(v)};$('#send').onclick=go;$('#q').onkeydown=e=>{if(e.key==='Enter')go()};
 $('#clr').onclick=()=>{S.chat=[];paint()};document.querySelectorAll('[data-q]').forEach(b=>b.onclick=()=>ask(QUICK[b.dataset.q][1]));
 if(S.pending){const p=S.pending;S.pending=null;ask(p)}}

function diag(){app.innerHTML=`<h1>🔍 ¿Qué le pasa a mi bicicleta?</h1><div class="card"><label>Área del problema</label><select id="dc">${DIAG.map(d=>`<option>${d}</option>`).join('')}</select><label>Describe qué ocurre (cuándo, ruido, sensación…)</label><textarea id="ds" rows="4" placeholder="Ej.: Mi cambio trasero no sube correctamente al piñón grande"></textarea><button id="dg">Diagnosticar con BikeAI</button></div><div class="warn">⚠️ El diagnóstico es orientativo. Si es freno, dirección o ruedas, no uses la bici hasta revisarla.</div>`;
 $('#dg').onclick=()=>{const s=$('#ds').value.trim();if(!s)return $('#ds').focus();S.pending=`Diagnóstico (${$('#dc').value}): ${s}. Hazme las preguntas relevantes y luego dime posibles causas y qué revisar primero.`;location.hash='#/ai'}}

function check(){const sec=(t,k,arr)=>`<h2>${t}</h2><div class="card">${arr.map((x,i)=>{const id=k+i;return `<label class="chk ${S.chk[id]?'done':''}"><input type="checkbox" data-c="${id}" ${S.chk[id]?'checked':''}><span>${x}</span></label>`}).join('')}</div>`;
 app.innerHTML=`<h1>✅ Checklist</h1>${sec('Antes de salir','pre',CHK.pre)}${sec('Mantenimiento periódico','per',CHK.per)}<button class="sec" id="rc">Reiniciar</button>`;
 document.querySelectorAll('[data-c]').forEach(c=>c.onchange=()=>{S.chk[c.dataset.c]=c.checked;save('chk',S.chk);c.parentElement.classList.toggle('done',c.checked)});
 $('#rc').onclick=()=>{S.chk={};save('chk',S.chk);check()}}

function tools(){app.innerHTML=`<h1>🛠️ Herramientas</h1>${T.map(t=>`<div class="card"><b>${t.i} ${t.n}</b><br>${t.d}<br><span class="tag">Se usa en: ${t.u}</span></div>`).join('')}`}

function hist(){const sorted=[...S.hist].sort((a,b)=>b.date.localeCompare(a.date));
 app.innerHTML=`<h1>📋 Historial</h1><div class="card"><label>Fecha</label><input type="date" id="hd" value="${new Date().toISOString().slice(0,10)}"><label>Componente</label><select id="hc">${M.map(m=>`<option>${m.name}</option>`).join('')}</select><label>Mantenimiento realizado</label><input id="hw"><label>Kilometraje (opcional)</label><input id="hk" type="number" min="0"><label>Notas</label><textarea id="hn" rows="2"></textarea><button id="ha">Agregar registro</button></div>
 <div class="tl">${sorted.map(h=>`<div class="card"><b>${esc(h.comp)}</b> · ${esc(h.date)}${h.km?` · ${esc(h.km)} km`:''}<br>${esc(h.work)}${h.notes?`<br><small style="color:var(--mut)">${esc(h.notes)}</small>`:''}<br><button class="sec" data-d="${h.id}" style="padding:4px 10px;margin-top:6px">Eliminar</button></div>`).join('')||'<p style="color:var(--mut)">Aún no hay registros.</p>'}</div>`;
 $('#ha').onclick=()=>{const w=$('#hw').value.trim();if(!w||!$('#hd').value)return;S.hist.push({id:Date.now(),date:$('#hd').value,comp:$('#hc').value,work:w,km:$('#hk').value,notes:$('#hn').value});save('hist',S.hist);hist()};
 document.querySelectorAll('[data-d]').forEach(b=>b.onclick=()=>{S.hist=S.hist.filter(h=>h.id!=b.dataset.d);save('hist',S.hist);hist()})}

let deferred;addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferred=e;$('#inst')&&($('#inst').hidden=false)});
async function config(){app.innerHTML=`<h1>⚙️ Ajustes</h1><div class="card"><b>Servidor BikeAI</b><div id="st">Comprobando…</div></div><div class="card"><button id="inst" ${deferred?'':'hidden'}>📲 Instalar BikeCare</button><p style="color:var(--mut);font-size:.9rem">El modelo de IA se cambia en el servidor con la variable GROQ_MODEL.</p><button class="sec" id="wipe">Borrar mis datos locales</button></div>`;
 $('#inst').onclick=async()=>{deferred.prompt();deferred=null;$('#inst').hidden=true};
 $('#wipe').onclick=()=>{if(confirm('¿Borrar bicicleta, historial y checklist?')){['bike','hist','chk'].forEach(k=>localStorage.removeItem(k));S.bike={};S.hist=[];S.chk={};syncWidget();config()}};
 try{const d=await(await fetch('/api/health')).json();$('#st').innerHTML=d.ai?`✅ Conectado · modelo <code>${esc(d.model)}</code>`:'⚠️ Falta GROQ_API_KEY en el servidor'}catch{$('#st').textContent='Sin conexión con el servidor'}}

addEventListener('hashchange',route);route();
if('serviceWorker' in navigator)addEventListener('load',()=>navigator.serviceWorker.register('/sw.js'));

// ---- Widget de Windows 11: copia un resumen (sin notas) a IndexedDB para que el service worker lo lea ----
async function syncWidget(){try{
 if(typeof WidgetStore==='undefined'||!('serviceWorker' in navigator))return;
 const l=[...S.hist].sort((a,b)=>b.date.localeCompare(a.date))[0];
 await WidgetStore.set('snapshot',{bikeType:S.bike.type||'',use:S.bike.use||'',
  last:l?{comp:l.comp,work:l.work,date:l.date}:null,histCount:S.hist.length,
  chkDone:CHK.pre.filter((_,i)=>S.chk['pre'+i]).length,chkTotal:CHK.pre.length,updatedAt:Date.now()});
 const reg=await navigator.serviceWorker.ready;reg.active&&reg.active.postMessage({type:'widget-sync'})
}catch{}}
syncWidget();
