# Reglas de evaluación (Fase 3)
Implementación: `shared/src/evaluation/learning.ts` (Aprendizaje), `rhythm.ts` (Ritmo), `timeline.ts` (tiempos). Son lógica pura: no usan reloj ni interfaz; se prueban en Node (`tests/unit/rhythm.test.ts`, `learning.test.ts`).

## Contadores (los tres originales)
- **Aciertos:** una unidad por cada **nota (altura)** tocada correctamente. Un acorde de tres notas = tres aciertos. Con notas sueltas coincide con el programa original.
- **Fallos:** *Aprendizaje:* cada pulsación que no es una altura esperada pendiente. *Ritmo:* errores de tiempo + notas equivocadas + omisiones. Cada pulsación y cada ausencia se cuenta **una sola vez**. Una nota equivocada tocada en lugar de la correcta cuenta como *nota equivocada* **y además** como *omisión* de la que faltó (dos fallos: es lo aprobado en la Fase 0).
- **Progreso:** eventos resueltos ÷ eventos totales (denominador fijo; los silencios no cuentan). Un evento es el conjunto de notas que empiezan a la vez (ambas manos).
- **Precisión:** aciertos ÷ (aciertos + fallos).
- Los errores de **duración** no suman fallos: se anotan aparte.

## Modo Aprendizaje (sin límite de tiempo)
Cada evento esperado es un conjunto de alturas. Para cada Note On:
- altura esperada aún sin cubrir → acierto (queda cubierta);
- altura esperada ya cubierta → ignorada;
- la misma tecla dentro de 30 ms de un acierto anterior → rebote, ignorado;
- cualquier otra altura → fallo.
El evento avanza cuando todas sus alturas están cubiertas, en cualquier orden. No hay omisiones. Una nota mantenida no vuelve a contar (hace falta un nuevo Note On). Notas repetidas (E E E) exigen una pulsación por evento.
**Ventana de simultaneidad** (por defecto 150 ms, configurable): si las notas de un acorde se tocaron con más separación, se anota como «acorde tocado por separado» (informativo, no penaliza).
**Dos manos:** las notas de ambas manos que suenan a la vez forman un único evento: se iluminan juntas y se completa en cualquier orden.

## Modo Ritmo (formal)
Tiempos en **segundos reales** de la línea temporal: tick → segundos con el mapa de tempo, dividido por la velocidad elegida (×0,5 … ×1,25). Las pulsaciones se convierten al mismo eje con el reloj de audio y se les resta la latencia calibrada.
**Ventana** de un evento en `t_k`: `[t_k − L, t_k + R]` con `L = min(2·T_out, ½·(t_k − t_{k−1}))`, `R = min(2·T_out, ½·(t_{k+1} − t_k))`. Las ventanas de eventos vecinos **no se solapan** (propiedad verificada con datos aleatorios).
| Pulsación de una altura esperada abierta… | Resultado |
|---|---|
| a ≤ T_ok de `t_k` (recortado a la ventana) | **acierto** |
| entre T_ok y T_out | **error de tiempo** (cerca), pronto o tarde |
| entre T_out y el borde de la ventana | **error de tiempo** (lejos) |
Una altura tocada con error de tiempo queda consumida: **no** genera además una omisión.
- **Nota equivocada:** una pulsación que no encaja en ninguna altura abierta de ninguna ventana (altura incorrecta, o demasiado fuera de tiempo). Cuenta una vez.
- **Rebote:** misma altura dentro de 30 ms de una ya juzgada → ignorada, sin penalizar.
- **Omisión:** una altura esperada sigue abierta cuando se cierra la ventana (`t_k + R`) → una omisión, emitida una sola vez y de forma determinista (no depende de cada cuánto se consulte el reloj).
- **Entrega tardía:** si una nota que cae dentro de la ventana llega *después* de que esta se cerrara (retraso del micrófono), se **corrige** la omisión en vez de contar además una nota extra.
- **Acordes:** cada altura se evalúa por separado con el mismo `t_k`.
- **Cuenta previa:** un compás de pulsos con el tempo de la canción; las pulsaciones durante la cuenta, antes de la primera ventana, no penalizan.
**Tolerancias** (perfiles; los valores son de partida y se afinarán con uso real, no están medidos con usuarios): Principiante ±100 ms acierto / ±200 ms; Intermedio ±70 / ±140; Avanzado ±40 / ±90. Con micrófono se amplían 60 ms (estimación, sin medir).
**Duración** (solo con Note Off fiable: MIDI, piano en pantalla, teclado del ordenador): `tiempo pulsado ÷ duración esperada`; «corta» si < 0,6 (< 0,5 en notas de más de 1 s). **No se evalúa** si el pedal de sustain está pulsado al soltar, ni en notas esperadas de menos de 150 ms. El micrófono **nunca** evalúa duración.
**Pedal de sustain (CC64 ≥ 64):** el piano envía Note Off al soltar la tecla aunque el sonido siga; por eso la duración se mide por la tecla, y con el pedal pulsado se omite (no se puede saber qué quería el intérprete).
**Calibración de latencia:** 8 clics sobre el reloj de audio; latencia = **mediana** de (pulsación − clic). Es una estimación que incluye el sesgo humano al seguir el pulso; conviene repetirla.

## Micrófono (monofónico)
Todo ataque con altura estable llega al evaluador, coincida o no con lo esperado (**ya no se filtran en silencio las notas incorrectas**; la opción «contar fallos del micrófono» permite no puntuarlas). Lo que no alcanza la claridad mínima es «no detección» y no cuenta como error. Opción «cualquier octava» (activa por defecto, como en el original).
**Acordes y dos manos con micrófono:** el detector es monofónico, así que en un acorde basta con detectar **una** de sus notas; las demás quedan *sin verificar* (se muestran como tales, no se cuentan como aciertos ni como omisiones) y se avisa de la baja fiabilidad. **No se presenta como fiable una puntuación de acordes que el algoritmo no puede separar.**
