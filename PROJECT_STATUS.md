# Estado del proyecto — Piano Tutor

**Última actualización:** 17-nov-2026 · **Fase actual:** 1 terminada, pendiente de tu revisión · **Siguiente:** Fase 2 (no iniciada)

## Fases
| Fase | Estado |
|---|---|
| 0 Auditoría y diseño | Hecha y aprobada |
| 1 Migración y estructura base | **Implementada; verificación manual pendiente (ver docs/MANUAL_TESTS.md)** |
| 2 Catálogo e importación | Pendiente |
| 3 Motor de interpretación (Ritmo, acordes, 2 manos, micrófono nuevo) | Pendiente |
| 4 Piano Tiles | Pendiente |
| 5 Editor de composición | Pendiente |
| 6 Grabación musical | Pendiente |
| 7 Integración y entrega | Pendiente |

## Arquitectura actual
Monorepo npm (`shared`, `backend`, `frontend`). Ver `docs/ARCHITECTURE.md`.
- **shared**: modelo Zod `schemaVersion 1`, PPQ 960, `toPerformance()`, `LearningSession`, mapa de tempo, migración de las 4 canciones.
- **backend**: Fastify en 127.0.0.1; `LibraryRepository` (escritura atómica, copias, revisión `If-Match`, bloqueo de instancia, rutas seguras).
- **frontend**: React 19 + Vite. Router propio por hash (`#/`, `#/catalog`, `#/play/:id`). `PlayingView` (DOM idéntico al original) + `PlayingPage` (lógica). Capa de entrada `InputHub`.

## Decisiones técnicas importantes
- Playing usa canvas propio portado (no VexFlow) para conservar el aspecto original. VexFlow se usará en previsualización y editor (Fases 2/5).
- Router propio en vez de react-router (3 rutas, cero dependencias).
- Versiones fijadas exactas (todas MIT salvo TypeScript: Apache-2.0 y Noto Music: OFL-1.1). TypeScript 7.0.2, Vite 8.3.8, Zod 4.6.7, Vitest 5.1.0, Fastify 5.12.8.
- Fuente musical: `@fontsource/noto-music` (verificado que contiene U+1D11E).
- Ritmo de las 4 canciones: **provisional** (todas negras, 4/4, 90 BPM); género/dificultad provisionales. Marcado en cada JSON (`provisional`).
- `settings.json` vive siempre en `<proyecto>/data/`; la biblioteca activa solo cambia tras reiniciar.

## Cambios de comportamiento respecto al original (todos intencionados)
1. Texto de ayuda corregido: el mapa del teclado llega a **Re♯**, no a Mi (P16); se añadió una frase sobre desactivar el micrófono.
2. Teclado del ordenador por posición física (`e.code`), no por carácter; ya no actúa dentro de campos de texto; envía Note Off al soltar.
3. Piano virtual envía Note Off al soltar (P21).
4. Micrófono: se puede desactivar; libera recursos (P1, P9, P18). Algoritmo y su comportamiento (clase de nota, sin fallos) **sin cambios**.
5. Renderer: el bucle de animación solo corre mientras hay movimiento (P10) y el redimensionado se compara redondeado (P11). Sin efecto visual esperado.
6. Dos botones añadidos a la barra («← Menú», «Catálogo») y rótulo `aria` en canvas/mensaje.

## Problemas conocidos / límites
- **No se ha podido comparar capturas de pantalla** (no hay navegador en el entorno de desarrollo). La paridad se verifica por DOM y CSS (ver abajo); la comparación visual real queda para ti.
- Micrófono, MIDI real, Windows (`start.bat`, `rename` con antivirus) y navegadores: **sin probar**.
- Playing rechaza con mensaje canciones de dos manos o con acordes (llegan en la Fase 3).
- Sin pantalla de ajustes para la carpeta de biblioteca (solo API).
- `npm audit` marca 1 aviso de severidad alta: `picomatch` (ReDoS), dependencia transitiva de Vite/tinyglobby, solo en tiempo de compilación; no está en el servidor en ejecución. El arreglo sugerido (`--force`) degradaría Vite a 6.x, por lo que **no se ha aplicado**. Revisar al actualizar Vite.
- Sin búsqueda/filtros (Fase 2). Sin exportación (Fase 7).
- `P2, P3, P4–P8, P12–P15, P17, P20` siguen abiertos (Fases 3 y 7).

## Pruebas (npm test): 97 automáticas pasan
Regresión de las 4 canciones contra el HTML original ejecutado; paridad DOM/CSS de Playing; esquema e invariantes; proyección; tempo; evaluación de Aprendizaje; biblioteca (atómica, copias, conflictos, rutas, bloqueo, corrupción); API HTTP (Host/Origin, If-Match); entradas (teclado, MIDI con mocks); ciclo de vida del micrófono con mocks; build sin recursos remotos.
**No demuestran** precisión acústica real ni comportamiento en navegador real.

## Cómo retomar
1. `npm install && npm test && npm run typecheck`.
2. Leer `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/EVALUATION.md`.
3. Empezar la Fase 2 solo con autorización. Prototipo previo de VexFlow (riesgo R6) antes de la previsualización.
