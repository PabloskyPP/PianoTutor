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
