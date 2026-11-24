# Arquitectura (Fase 1)

```
shared  ──► frontend (Vite alias por workspace)
   └─────► backend  (tsx ejecuta TypeScript directamente)
```
- `shared` no importa nada de DOM ni de Node: se prueba en Node puro.
- El frontend nunca habla con el disco. Solo usa `/api/*`. El backend nunca recibe rutas: recibe ids validados (`^[a-z0-9-]{8,64}$`) y construye la ruta dentro de una raíz autorizada, comprobando `realpath` (también contra symlinks).
- Producción: `npm start` compila con Vite y el backend sirve `frontend/dist` y la API en 127.0.0.1. No hay CORS; se validan `Host` y `Origin`.

## Entrada musical
Toda fuente produce `NoteInputEvent {kind, midi, tMs, source, velocity?, confidence?, channel?}` hacia `InputHub`. `PlayingPage` es un suscriptor más. Cada `attach*/connect*` devuelve su función de baja y se llama al desmontar.

## Audio
Un solo `AudioContext` (`audio/engine.ts`), compartido por el sintetizador y el micrófono; `MicInput.stop()` no lo cierra.

## Evaluación
`LearningSession` (shared) es pura: recibe `PerformanceEvent[]` y llamadas `noteOn`. La interfaz solo traduce resultados a colores y contadores.

## Persistencia
Ver `DATA_MODEL.md` y la sección de almacenamiento del README.

## Importación y partitura (Fase 2)
- El **servidor** analiza los archivos (`shared/import`), tanto en la previsualización como al guardar: el navegador nunca envía una canción ya construida, y el análisis no bloquea la interfaz (sí puede bloquear brevemente el servidor con archivos muy grandes).
- `score/toVexSpec.ts` (puro, probado en Node) convierte el modelo en una especificación de dibujo; `score/VexScore.tsx` la dibuja con VexFlow. **Playing sigue usando el renderer canvas portado del original**, no VexFlow.
- La página «Añadir canción» se carga de forma diferida (VexFlow pesa ~0,8 MB) para no penalizar a Playing.

## Eliminación de canciones
`LibraryRepository.delete` **mueve** (no borra) a `data/trash/<fecha>-<id>/`: `song.json`, `imports/` y, si existen, `backups/` y `draft.json`. Exige `If-Match` (revisión) y rechaza las precargadas. Si falla a medias, deshace lo movido. `trash/` no se escanea al listar el catálogo. Los reintentos ante `EPERM/EBUSY` cubren los bloqueos de antivirus en Windows (sin probar allí).

## Interpretación (Fase 3)
- **Evaluación** pura en `shared/evaluation` (Aprendizaje y Ritmo); la interfaz solo traduce juicios a colores y contadores. **Tiempo** en `frontend/audio` (`clock`, `transport`, `beats`, `calibrate`), con reloj inyectable para pruebas.
- **Playing** (`PlayingPage`) conecta `InputHub` → sesión del modo activo → `ScrollScoreRenderer` y piano. `PlayingView` conserva el DOM original; lo añadido lleva `data-added`.
- **Partitura de Playing** (`ScrollScoreRenderer`, canvas): una mano idéntica píxel a píxel al `draw()` original (prueba `tests/regression/score-parity.test.ts`); acordes; colores por resultado; desplazamiento continuo en Ritmo; **dos pentagramas** (Sol/Fa, notas simultáneas alineadas) cuando la canción es de dos manos.
- **Piano:** rango ampliado por octavas a la canción (≥ Do4–Do6; ≥ Do3–Do6 a dos manos); con más de 35 teclas blancas se envuelve en un contenedor con desplazamiento horizontal que centra las teclas pendientes.
- **Preferencias:** `GET/PUT /api/preferences` (validadas con Zod, guardado serializado en `data/settings.json` sin pisar `libraryRoot`).
- **Pruebas visuales:** `@napi-rs/canvas` (solo desarrollo) permite ejecutar los canvas en Node. Efecto colateral: jsdom lo detecta y ofrece un canvas real, por lo que VexFlow mide texto de verdad en las pruebas.
