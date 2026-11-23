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
async function config(){app.innerHTML=`<h1>⚙️ Ajustes</h1><div class="card"><b>Servidor BikeAI</b><div id="st">Comprobando…</div></div><div class="card"><button id="inst" ${deferred?'':'hidden'}>📲 Instalar BikeCare</button><p style="color:var(--mut);font-size:.9rem">El modelo de IA se cambia en el servidor con la variable GROQ_MODEL.</p><button class="sec" id="wipe">Borrar mis datos locales</button></div>${notifHtml()}`;notifBind();
 $('#inst').onclick=async()=>{deferred.prompt();deferred=null;$('#inst').hidden=true};
 $('#wipe').onclick=()=>{if(confirm('¿Borrar bicicleta, historial y checklist?')){['bike','hist','chk'].forEach(k=>localStorage.removeItem(k));S.bike={};S.hist=[];S.chk={};syncWidget();config()}};
 try{const d=await(await fetch('/api/health')).json();$('#st').innerHTML=d.ai?`✅ Conectado · modelo <code>${esc(d.model)}</code>`:'⚠️ Falta GROQ_API_KEY en el servidor'}catch{$('#st').textContent='Sin conexión con el servidor'}}

addEventListener('hashchange',route);route();
if('serviceWorker' in navigator){
 // Un solo registro: se reutiliza el existente y solo se registra si no hay ninguno.
 addEventListener('load',async()=>{try{(await navigator.serviceWorker.getRegistration('/'))||await navigator.serviceWorker.register('/sw.js')}catch{}});
 // Al pulsar una notificación el SW pide abrir una sección (solo rutas conocidas).
 navigator.serviceWorker.addEventListener('message',e=>{const h=e.data&&e.data.type==='navigate'&&e.data.hash;if(typeof h==='string'&&/^#\/(check|hist|config|ai|diag|maint|bike|tools)?$/.test(h))location.hash=h})}

// ---- Web Push: suscripción real (PushManager + VAPID). El servidor guarda la suscripción y puede enviar avisos ----
const pushOk=()=>'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
const b64ToBytes=b=>Uint8Array.from(atob(b.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(b.length/4)*4,'=')),c=>c.charCodeAt(0));
const pushId=()=>{try{return localStorage.getItem('pushId')}catch{return null}};
const setPushId=v=>{try{v?localStorage.setItem('pushId',v):localStorage.removeItem('pushId')}catch{}};
async function pushPost(path,body){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Error del servidor ('+r.status+')');return d}
async function pushEnable(){ // debe llamarse desde un clic: aquí se pide el permiso
 if(Notification.permission==='default')await Notification.requestPermission();
 if(Notification.permission!=='granted')throw new Error('Permiso de notificaciones no concedido.');
 const k=await(await fetch('/api/push/key')).json();if(!k.enabled)throw new Error('El servidor no tiene Web Push configurado (claves VAPID).');
 const key=b64ToBytes(k.publicKey),reg=await navigator.serviceWorker.ready;let sub=await reg.pushManager.getSubscription();
 if(sub){const cur=new Uint8Array(sub.options.applicationServerKey||[]);if(cur.length!==key.length||cur.some((v,i)=>v!==key[i])){await sub.unsubscribe();sub=null}} // clave VAPID cambiada
 sub=sub||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
 setPushId((await pushPost('/api/push/subscribe',{subscription:sub.toJSON()})).id)}
async function pushDisable(){
 const reg=await navigator.serviceWorker.ready,sub=await reg.pushManager.getSubscription();let err=null;
 if(sub){try{await pushPost('/api/push/unsubscribe',{id:pushId(),endpoint:sub.endpoint,auth:sub.toJSON().keys.auth})}catch(e){err=e}await sub.unsubscribe()}
 setPushId(null);if(err)throw new Error('Desactivadas en este navegador, pero el servidor no confirmó la baja: '+err.message)}
async function pushSync(){try{ // mantiene navegador y servidor alineados (renovaciones, datos borrados)
 if(!pushOk())return;
 const sub=Notification.permission==='granted'?await(await navigator.serviceWorker.ready).pushManager.getSubscription():null;
 if(sub)setPushId((await pushPost('/api/push/subscribe',{subscription:sub.toJSON()})).id);else setPushId(null)
}catch{}}
async function pushPaint(){const st=$('#pst'),bt=$('#pbt');if(!st)return;
 if(!pushOk()){st.textContent='Este navegador no admite notificaciones push.';return}
 if(Notification.permission==='denied'){st.textContent='🚫 Permiso bloqueado: habilítalo en la configuración del sitio del navegador.';return}
 let sub=null,srv=true;try{sub=await(await navigator.serviceWorker.ready).pushManager.getSubscription();srv=(await(await fetch('/api/push/key')).json()).enabled}catch{}
 if(!$('#pst'))return;
 st.textContent=!srv?'⚠️ El servidor no tiene Web Push configurado.':sub?'✅ Suscrito: este dispositivo recibirá avisos del servidor aunque la app esté cerrada (según navegador y sistema).':'Sin suscripción.';
 bt.innerHTML=sub?'<button class="sec" id="poff">Desactivar push</button>':srv?'<button id="pon">Activar push</button>':'';
 const run=f=>async()=>{bt.querySelectorAll('button').forEach(b=>b.disabled=true);try{await f()}catch(e){const m=$('#nmsg');m&&(m.textContent=e.message)}pushPaint()};
 $('#pon')&&($('#pon').onclick=run(pushEnable));$('#poff')&&($('#poff').onclick=run(pushDisable))}

// ---- Distintivo (App Badging API) y notificaciones: pendientes = ítems del checklist sin marcar ----
function PREFS(){return {badge:false,reminders:false,...LS('prefs',{})}}
function pendingCount(){return CHK.pre.filter((_,i)=>!S.chk['pre'+i]).length+CHK.per.filter((_,i)=>!S.chk['per'+i]).length}
async function updateBadge(){try{
 if(!('setAppBadge' in navigator))return;
 const n=pendingCount();
 if(PREFS().badge&&n>0)await navigator.setAppBadge(n);else await navigator.clearAppBadge()
}catch(e){console.warn('[badge]',e)}}
async function setReminders(on){ // recordatorio en segundo plano: solo con Periodic Background Sync (PWA instalada)
 const reg=await navigator.serviceWorker.ready;
 if(!('periodicSync' in reg))return false;
 try{on?await reg.periodicSync.register('bikecare-reminders',{minInterval:12*36e5}):await reg.periodicSync.unregister('bikecare-reminders');return true}catch(e){console.warn('[periodicSync]',e);return false}}
function notifHtml(){const p=PREFS(),perm='Notification' in window?Notification.permission:'unsupported',ok=perm==='granted';
 const st={granted:'✅ Permitidas',denied:'🚫 Bloqueadas: habilítalas en la configuración del sitio del navegador',default:'Aún no activadas',unsupported:'Este navegador no admite notificaciones'}[perm];
 return `<div class="card"><b>🔔 Notificaciones y contador</b><p style="color:var(--mut);font-size:.9rem">Estado: ${st}</p>
 ${perm==='default'?'<button id="nen">Activar notificaciones</button>':''}
 <label class="chk"><input type="checkbox" id="nrem" ${p.reminders&&ok?'checked':''} ${ok?'':'disabled'}><span>Recordarme los puntos pendientes del checklist</span></label>
 <label class="chk"><input type="checkbox" id="nbad" ${p.badge?'checked':''} ${'setAppBadge' in navigator?'':'disabled'}><span>Mostrar en el icono cuántos puntos del checklist faltan</span></label>
 <button class="sec" id="ntest" ${ok?'':'disabled'}>Probar notificación</button> <span id="nmsg" style="color:var(--mut);font-size:.85rem"></span>
 <p style="color:var(--mut);font-size:.8rem">Los recordatorios en segundo plano dependen del navegador (app instalada y Sincronización periódica); sin ella solo funcionan el contador y la prueba.</p>
 <hr style="border:0;border-top:1px solid var(--line);margin:12px 0"><b>📡 Avisos desde el servidor (push)</b><div id="pst" style="margin:6px 0;color:var(--mut);font-size:.9rem">Comprobando…</div><div id="pbt"></div></div>`}
function notifBind(){pushPaint();const msg=t=>{const e=$('#nmsg');e&&(e.textContent=t)};
 $('#nen')&&($('#nen').onclick=async()=>{try{await Notification.requestPermission()}catch{}config()});
 $('#nrem')&&($('#nrem').onchange=async e=>{const on=e.target.checked;save('prefs',{...PREFS(),reminders:on});
  const ok=await setReminders(on);msg(on&&!ok?'Este navegador no permite recordatorios en segundo plano.':on?'Recordatorio activado (el navegador decide cuándo ejecutarlo).':'Recordatorio desactivado.')});
 $('#nbad')&&($('#nbad').onchange=e=>{save('prefs',{...PREFS(),badge:e.target.checked})});
 $('#ntest')&&($('#ntest').onclick=async()=>{try{const r=await navigator.serviceWorker.ready;r.active.postMessage({type:'notify-test'});msg('Enviada.')}catch{msg('No se pudo enviar.')}})}

// ---- Widget de Windows 11: copia un resumen (sin notas) a IndexedDB para que el service worker lo lea ----
async function syncWidget(){updateBadge();try{
 if(typeof WidgetStore==='undefined'||!('serviceWorker' in navigator))return;
 const l=[...S.hist].sort((a,b)=>b.date.localeCompare(a.date))[0];
 await WidgetStore.set('snapshot',{bikeType:S.bike.type||'',use:S.bike.use||'',
  last:l?{comp:l.comp,work:l.work,date:l.date}:null,histCount:S.hist.length,
  chkDone:CHK.pre.filter((_,i)=>S.chk['pre'+i]).length,chkTotal:CHK.pre.length,
  pending:pendingCount(),prefs:PREFS(),updatedAt:Date.now()});
 const reg=await navigator.serviceWorker.ready;reg.active&&reg.active.postMessage({type:'widget-sync'})
}catch{}}
syncWidget();pushSync();
