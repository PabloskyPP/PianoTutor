# Reglas de evaluación (Fase 1: solo modo Aprendizaje)
Implementación: `shared/src/evaluation/learning.ts`.

**Contadores.** *Aciertos*: una unidad por cada altura correcta (acorde de 3 notas = 3). *Fallos*: cada Note On que no es una altura esperada pendiente (una sola vez). *Progreso*: eventos completados ÷ eventos totales (denominador fijo; con una nota por evento coincide con el original). *Precisión* (mensaje final): aciertos ÷ (aciertos + fallos).

**Note On sobre el evento esperado `P`:** altura de `P` aún sin cubrir → acierto; altura de `P` ya cubierta → ignorada (sin penalización); otra altura → fallo. El evento avanza cuando todas las alturas de `P` están cubiertas, en cualquier orden. No hay límite de tiempo ni omisiones. Una nota mantenida no vuelve a contar: hace falta un nuevo Note On. Notas repetidas (E4 E4) exigen una pulsación por evento.

**Micrófono (Fase 1, heredado):** acepta cualquier octava y el detector solo envía notas que coinciden con la esperada, por lo que **nunca hay fallos de micrófono**. Cambia en la Fase 3.

**Pendiente (Fase 3):** modo Ritmo (ventanas ±100/±200 ms, omisiones, errores de tiempo y duración) según el diseño aprobado en la Fase 0.
