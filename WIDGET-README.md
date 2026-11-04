# BikeCare – widget para el panel de Widgets de Windows 11

Enfoque: **widget PWA de Microsoft Edge** (miembro `widgets` del manifest + service worker). Sin código nativo.

## Archivos nuevos / cambiados
- `public/manifest.webmanifest` – añade `id`, iconos PNG y el miembro `widgets`.
- `public/widgets/bike-summary.template.json` – plantilla Adaptive Card 1.5.
- `public/widgets/bike-summary.data.json` – datos por defecto.
- `public/widgets/screenshot.png` – vista previa 300x304 para el selector (sustitúyela por una captura real).
- `public/widget-store.js` – IndexedDB compartida página <-> service worker.
- `public/sw.js` – eventos `widgetinstall/resume/uninstall/click`, `periodicsync`, caché v2.
- `public/app.js` – `syncWidget()` copia un resumen (sin notas) tras cada cambio.
- `.env.example` – el `.env` original NO se incluye. Si compartiste el zip original, rota tu GROQ_API_KEY.

## Probar
1. Windows 11 y Microsoft Edge actualizados; Modo de desarrollador activado
   (Configuración > Sistema > Para programadores).
2. `node server.js` y abre http://localhost:3000 en **Edge** (no en Chrome).
3. Instala con el icono de instalar de la barra de direcciones. Si ya la tenías instalada,
   desinstálala y vuelve a instalarla para que Edge registre los widgets nuevos.
4. Win + W > **Agregar widgets** > busca "Mi bici" > fíjalo.
5. Cambia datos en la app (Mi bicicleta, Historial, Checklist) y reabre Win + W: el widget se actualiza.

## Si el widget no aparece
- Prueba antes con la demo oficial PWAmp (https://microsoftedge.github.io/Demos/pwamp/).
  Si PWAmp tampoco aparece en tu equipo, el problema es del sistema, no de BikeCare.
- DevTools de Edge > Application > Manifest: revisa errores en `widgets`.
- Application > Service Workers: confirma que `sw.js` (bikecare-v2) está activo.
