# Entrada de audio: límites conocidos
Detector actual = el del programa original, portado sin cambios (`input/pitchLegacy.ts`).
- Monofónico: no reconoce acordes. Rango efectivo ≈ 200–1100 Hz (Sol♯3–Do6); más grave no se detecta bien (hay una prueba que lo documenta).
- Resolución de lag entera, sin interpolación: a ~1 kHz el error puede alcanzar ±20 cents.
- Sin detección de ataque: las repeticiones dependen de un bloqueo temporal (600 ms).
- Ventana de análisis de 2048 muestras sobre un `fftSize` 4096 (latencia innecesaria).
- El sintetizador de la app puede ser captado por el micrófono.
Las pruebas automáticas usan senoides sintéticas y mocks: **no miden la precisión con un piano real.** Se sustituye en la Fase 3 (YIN/NSDF en AudioWorklet, ataque, calibración).
