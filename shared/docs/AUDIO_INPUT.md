# Entrada de audio y MIDI (Fase 3)

## Capa unificada
Toda fuente produce `NoteInputEvent {kind: on|off|sustain, midi, tMs, source, velocity?, confidence?, channel?, down?}` hacia `InputHub`. `tMs` usa la base de `performance.now()`. Cada `attach*`/`connect*` devuelve su baja y se llama al desmontar.
**MIDI:** detección de dispositivos y reconexión; Note On, Note Off, Note On con velocidad 0 = Off; canal y velocidad; **pedal de sustain** (CC64, pulsado desde 64) como evento aparte; **filtro de canal** opcional (0 = todos); asignación (no `addEventListener`) de `onmidimessage`, de modo que reenlazar no duplica escuchas. **Piano en pantalla y teclado del ordenador:** Note On al pulsar, Note Off al soltar; el teclado ignora la repetición de tecla mantenida y los campos de texto.
No hecho: arrastrar entre teclas del piano virtual (glissando).

## Micrófono: detector nuevo
`input/audio/`: `fft.ts`, `pitch.ts` (NSDF de McLeod con FFT, primer máximo relevante, interpolación parabólica, claridad), `onset.ts` (ataques por salto de energía con periodo refractario), `analyzer.ts` (calibración de ruido + ataques + altura estable ≥ 3 sondeos), `mic.ts` (captura y ciclo de vida).
- **Rango objetivo Mi2–Do7** (antes Sol♯3–Do6). **Calibración de ruido** ~1 s al activarlo (no tocar). **Sensibilidad** ajustable. Altura: umbral de claridad 0,85.
- Cada ataque se entrega con el **instante del ataque**, no el de la detección. **No se emite Note Off**: un piano acústico decae solo y el micrófono no puede saber cuándo se soltó la tecla, así que la duración no se evalúa.
- La altura solo se calcula tras un ataque (ahorra CPU); ~6,5 ms por cálculo en el entorno de pruebas.

### Qué se ha medido (SINTÉTICO) y qué no
Con señales generadas por código (senoides, timbre tipo piano con inarmonicidad, fundamental débil, ruido blanco; 44,1 y 48 kHz):
| Prueba | Resultado |
|---|---|
| Mi2–Do7, senoides y timbre de piano | 57/57 correctas; error máx. 5,7 centésimas de semitono |
| Fundamental débil, Mi2–Do6 | 45/45 correctas, sin errores de octava |
| Ruido blanco (200 casos) y silencio | 0 falsos positivos |
| Acorde Do-Mi-Sol | sin detección (no inventa una nota; **no está garantizado** en otros acordes) |
| Secuencias C4 E4 E4 G4 + grave + agudo, repeticiones a 0,3 s | un evento por ataque, alturas exactas |
| Retraso de entrega del evento | **120 ms** tras el ataque (constante) |
| Sesgo del instante del ataque | **+12 ms** (tarde) |
**NO está medido:** la precisión con un **piano acústico real** (resonancias, pedal, reverberación, ruido de la sala, micrófono del portátil), la latencia real de captura del navegador, ni el comportamiento con teclados reales. Es el riesgo R3/R4 y requiere tu prueba manual (docs/MANUAL_TESTS.md). Las cifras de arriba no deben leerse como precisión real.

### Limitaciones conocidas
- **Monofónico:** no reconoce acordes (ver docs/EVALUATION.md para cómo se evalúa). No hay reconocimiento polifónico; si se añade, irá en un módulo `experimental/` aparte.
- Un micrófono que capte el **sonido del propio sintetizador** de la app (altavoces) puede detectarlo como notas; el sintetizador solo suena con el teclado del ordenador y el piano en pantalla.
- **Precisión temporal con micrófono:** muestreo cada 20 ms desde el hilo principal (un hilo ocupado añade fluctuación) más 120 ms de entrega. Por eso el modo Ritmo con micrófono amplía la tolerancia y espera 0,3 s antes de dar una omisión. MIDI es la opción recomendada para Ritmo.
- **AudioWorklet:** estudiado y **no implementado**. Daría marcas de tiempo exactas por muestra y proceso fuera del hilo principal, pero no puedo validarlo sin navegador ni micrófono reales, y el análisis actual es barato (solo tras un ataque). La captura está separada del análisis (`analyzer.ts` es puro), así que añadirlo en la Fase 7 no obliga a reescribir nada.
- Una nota muy suave puede quedar por debajo del umbral: sube la sensibilidad; si el ambiente es ruidoso, bájala o usa «Recalibrar ruido».

## Reloj y latencia
Un único `AudioContext`. `Transport` guarda un ancla (tiempo de audio, tiempo de canción); pausar/reanudar rehace el ancla (sin deriva; probado con relojes que difieren un 0,1 % durante 10 minutos: error < 1 ms). Las marcas de las pulsaciones (base `performance.now()`) se convierten con `getOutputTimestamp()`, que recalcula la correspondencia en cada llamada y descuenta la latencia de salida; si el navegador no lo ofrece, se usa `currentTime` y la calibración manual absorbe la diferencia. El metrónomo se programa con anticipación (120 ms) sobre el reloj de audio, no con `setInterval` como fuente de tiempo.
