# Estado del proyecto — Piano Tutor

**Última actualización:** 18-nov-2026 · **Fase actual:** 2 implementada, pendiente de tu verificación manual · **Siguiente:** Fase 3 (no iniciada)

## Fases
| Fase | Estado |
|---|---|
| 0 Auditoría y diseño | Hecha y aprobada |
| 1 Migración y estructura base | Hecha y aprobada |
| 2 Catálogo e importación | **Implementada; verificación manual pendiente (docs/MANUAL_TESTS.md, pruebas 13–22)** |
| 3 Motor de interpretación (Ritmo, acordes, 2 manos, micrófono nuevo) | Pendiente |
| 4 Piano Tiles | Pendiente |
| 5 Editor de composición | Pendiente |
| 6 Grabación musical | Pendiente |
| 7 Integración y entrega | Pendiente |

## Fase 2: qué incluye
Catálogo con búsqueda y filtros (`shared/catalog`); importación MusicXML/`.mxl`/MIDI (`shared/import`); servidor que analiza y guarda con original conservado y rollback; previsualización con VexFlow; página «Añadir canción»; rango del piano de Playing ajustado a la canción. Detalle en `docs/IMPORT.md`.

## Arquitectura actual
Monorepo npm (`shared`, `backend`, `frontend`). Ver `docs/ARCHITECTURE.md`.
- **shared**: modelo Zod `schemaVersion 1`, PPQ 960, `toPerformance()`, `LearningSession`, mapa de tempo, migración de las 4 canciones.
- **backend**: Fastify en 127.0.0.1; `LibraryRepository` (escritura atómica, copias, revisión `If-Match`, bloqueo de instancia, rutas seguras).
- **frontend**: React 19 + Vite. Router propio por hash (`#/`, `#/catalog`, `#/play/:id`). `PlayingView` (DOM idéntico al original) + `PlayingPage` (lógica). Capa de entrada `InputHub`.

## Decisiones técnicas importantes
- Playing usa canvas propio portado (no VexFlow) para conservar el aspecto original. VexFlow se usará en previsualización y editor (Fases 2/5).
- Router propio en vez de react-router (3 rutas, cero dependencias).
- **Fase 2:** el servidor analiza los archivos (preview y guardado usan el mismo código; el cliente nunca envía una canción construida). VexFlow 5.2 (`vexflow/bravura`) solo para previsualización/editor; carga diferida. Parsers: fast-xml-parser 5.12.1, fflate 0.8.3, midi-file 1.2.4 (todos MIT). `Staff.index` global; `source.importOptions` opcional (sin cambio de `schemaVersion`).
- Versiones fijadas exactas (todas MIT salvo TypeScript: Apache-2.0 y Noto Music: OFL-1.1). TypeScript 7.0.2, Vite 8.3.8, Zod 4.6.7, Vitest 5.1.0, Fastify 5.12.8.
- Fuente musical: `@fontsource/noto-music` (verificado que contiene U+1D11E).
- Ritmo de las 4 canciones: **provisional** (todas negras, 4/4, 90 BPM); género/dificultad provisionales. Marcado en cada JSON (`provisional`).
- `settings.json` vive siempre en `<proyecto>/data/`; la biblioteca activa solo cambia tras reiniciar.

## Cambios de la Fase 2 sobre la Fase 1
- Playing: el piano se amplía por octavas si la canción sale de Do4–Do6 (cierra P17 para una mano) y avisa si hay notas fuera del pentagrama que dibuja. Para canciones de las 4 originales no cambia nada (rango 60–84).
- Menú: «Añadir una nueva canción» habilitado. Catálogo: buscador y filtros.

## Cambios de comportamiento respecto al original (todos intencionados, Fase 1)
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
- **`npm audit` (estado cambiante):** el 17-nov marcaba 6 avisos altos que eran UNA vulnerabilidad (ReDoS en `picomatch` 4.0.7, vía fdir → tinyglobby → vite/vitest → plugin-react; solo compilación, no el servidor en ejecución). El 18-nov, con **la misma versión instalada (4.0.7, que sigue siendo la última publicada)**, `npm audit` devuelve 0: la base de avisos de npm cambió (no sé si se retiró o se corrigió). Tu terminal puede seguir mostrando 6 según cuándo se actualice. Las dependencias nuevas de la Fase 2 no añaden avisos. No se ha usado `--force`. Reejecuta `npm audit` antes de publicar.
- **Importación:** ver limitaciones en `docs/IMPORT.md` (tresillos en MIDI, repeticiones sin expandir, adornos omitidos, máx. 2 pentagramas, manos de un MIDI = propuesta a confirmar, ortografía aproximada). No hay pantalla para reimportar con otra rejilla ni para editar metadatos de una canción ya guardada.
- Playing no toca canciones de dos manos ni con acordes (Fase 3); la partitura de Playing no dibuja notas fuera de Mi3–Re7 (Fase 3).
- **La vista previa (VexFlow) solo se ha probado en jsdom (estructura, sin medidas de texto): su aspecto real no está verificado.** Tampoco se ha probado la carga offline de la fuente en un navegador (sí que el código solo registra `data:` URLs).
- No se han probado archivos reales de editores (MuseScore, Finale, Sibelius) ni MIDI de interpretaciones reales: solo ficheros sintéticos de `tests/fixtures`.
- Sin exportación (Fase 7).
- `P2, P3, P4–P8, P12–P15, P17, P20` siguen abiertos (Fases 3 y 7).

## Pruebas (npm test): 197 automáticas pasan (97 de la Fase 1 + 100 de la Fase 2)
Fase 2: importadores MusicXML (26) y MIDI, `.mxl`, archivos inválidos y seguridad XML/zip, filtros del catálogo, API de importación (guardado, rollback, validación, rutas), especificación de dibujo y VexFlow en jsdom, fuentes sin red, ficheros de ejemplo. Fase 1: regresión de las 4 canciones contra el HTML original ejecutado; paridad DOM/CSS de Playing; esquema e invariantes; proyección; tempo; evaluación de Aprendizaje; biblioteca (atómica, copias, conflictos, rutas, bloqueo, corrupción); API HTTP (Host/Origin, If-Match); entradas (teclado, MIDI con mocks); ciclo de vida del micrófono con mocks; build sin recursos remotos.
**No demuestran** precisión acústica real ni comportamiento en navegador real.

## Cómo retomar
1. `npm install && npm test && npm run typecheck`.
2. Leer `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/EVALUATION.md`.
3. Empezar la Fase 3 solo con autorización. Riesgos abiertos: R3 (micrófono real), R4 (latencia), R5 (Web MIDI por navegador), R7/R8 (probar con archivos reales).
