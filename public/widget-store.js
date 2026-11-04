// Almacén compartido página <-> service worker (IndexedDB).
// localStorage NO existe en el service worker, por eso la página copia aquí un resumen.
const WidgetStore = (() => {
  const DB = 'bikecare-widget', STORE = 'kv';
  const open = () => new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(STORE, mode), out = fn(t.objectStore(STORE));
      t.oncomplete = () => { db.close(); res(out && out.result); };
      t.onerror = t.onabort = () => { db.close(); rej(t.error); };
    });
  };
  return {
    get: k => tx('readonly', s => s.get(k)).catch(() => undefined),
    set: (k, v) => tx('readwrite', s => s.put(v, k)).catch(() => {})
  };
})();
