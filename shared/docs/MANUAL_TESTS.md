# Pruebas manuales de la Fase 1 (pendientes de ejecutar por ti)
Marca cada una tras probarla. Ninguna se ha podido ejecutar en el entorno de desarrollo (sin navegador ni hardware).

1. [ ] `npm install` y `npm start` (o `start.bat`/`start.sh`): se abre el navegador con el menú. *(Windows: sin probar.)*
2. [ ] **Aspecto de Playing**: abre `tests/regression/original/piano-tutor.html` en una pestaña y la app (Catálogo → Oda a la alegría) en otra, misma ventana. Compara barra, partitura (clave de Sol incluida), piano y colores. Anota diferencias.
3. [ ] Tocar con clic en el piano: acierto en verde, fallo en rojo, siguiente en naranja; contadores y progreso; mensaje «¡Canción completada!…».
4. [ ] Teclado del ordenador (A W S E D F T G Y H U J K O L P).
5. [ ] Reiniciar vuelve al principio.
6. [ ] Teclado MIDI (Chrome/Edge): aparece su nombre; Note On avanza; desconectar/reconectar actualiza el texto.
7. [ ] Micrófono: activar, tocar la nota resaltada (piano acústico) y comprobar que avanza; **desactivar** pulsando de nuevo y comprobar que el icono de grabación del navegador desaparece de la pestaña.
8. [ ] Cambiar de canción con el micrófono activo; volver al menú con el micrófono activo (debe apagarse).
9. [ ] Catálogo: orden alfabético; «Guardar como copia propia»; cerrar la app, volver a abrir: la copia sigue y no hay duplicados.
10. [ ] Corromper a mano un `.json` de `data/songs/`: la app arranca y lo lista como error.
11. [ ] Pestaña Red del navegador: ninguna petición fuera de `127.0.0.1`.
12. [ ] Con `Ctrl+C`, el proceso termina y desaparece `data/.pianotutor.lock`.

# Pruebas manuales de la Fase 2 (pendientes de ejecutar por ti)
Ficheros de ejemplo en `tests/fixtures/` (**sintéticos**, generados por `scripts/make-fixtures.ts`). Además, prueba con **tus propios** archivos reales (MuseScore, Finale, Sibelius, un MIDI de piano real): es la prueba más importante y no la he podido hacer.

13. [ ] Menú → «Añadir una nueva canción». Elegir `escala-do-mayor.musicxml`: aparecen título, manos y vista previa con **clave de Sol, notas, silencio y barras visibles**. Sin pedir aún guardar, volver al catálogo: no ha cambiado.
14. [ ] **Sin conexión:** desactiva la red del ordenador, recarga y repite el paso 13: los símbolos (clave, alteraciones, silencios) deben verse igual. Si salen cuadrados vacíos, la fuente embebida no se carga: avísame.
15. [ ] `estudio-dos-manos.musicxml`: dos pentagramas con llave, acorde a la derecha sobre un Do grave a la izquierda **alineados**, ligadura del La entre compases, Fa♯. Con «A una mano» elegido aparece el error de pentagramas y «Guardar» queda desactivado.
16. [ ] `dos-manos.mid`: opciones MIDI visibles; cambiar «Mano derecha desde» y la rejilla actualiza la vista; «Guardar» exige marcar la confirmación de manos.
17. [ ] `melodia-monofonica.mid` → rellenar género/dificultad → «Guardar canción»: aparece «Canción guardada». En el catálogo está (origen Importada) y **«Tocar esta canción» funciona** con piano/teclado/MIDI. Cerrar y reabrir la app: sigue ahí; `data/imports/<id>/original.mid` existe.
18. [ ] Importar `estudio-dos-manos.musicxml` o `acordes-duraciones.mid`: se guarda y se ve, y en Playing aparece el aviso de que dos manos/acordes llegan en la Fase 3.
19. [ ] `invalido-truncado.musicxml` y `no-es-midi.mid`: mensaje claro; nada se guarda.
20. [ ] Importa una canción con notas muy graves/agudas (fuera de Do4–Do6): el piano de Playing se amplía y todas se pueden tocar; si salen del pentagrama visible aparece el aviso.
21. [ ] Catálogo: buscador (con y sin acentos), «Limpiar búsqueda», filtros combinados, mensaje cuando no hay resultados, orden alfabético.
22. [ ] Cancelar en «Añadir» vacía el formulario sin tocar el catálogo.
23. [ ] Catálogo → abrir una canción importada o una copia propia → «Eliminar canción» → «Cancelar»: no pasa nada. Repetir y «Sí, eliminar»: desaparece, aparece el aviso con la ruta de `data/trash`, y tras cerrar y abrir la app sigue sin estar.
24. [ ] Abrir una canción precargada: «Eliminar canción» está desactivado y explica por qué.
25. [ ] Recuperar una eliminada siguiendo las instrucciones del README: con la app cerrada, mueve los archivos y comprueba que vuelve al catálogo y se puede tocar. *(En Windows, comprueba además que eliminar no falla por el antivirus.)*

# Pruebas manuales de la Fase 3 (pendientes de ejecutar por ti: necesitan navegador, teclado MIDI y/o piano acústico)
Resultado esperado de cada una en negrita. **Anota cualquier diferencia: es información real que yo no tengo.**

26. [ ] **Aspecto de Playing a una mano:** abre `tests/regression/original/piano-tutor.html` y la app (una canción de una mano, modo Aprendizaje). **Sin diferencias visibles** salvo los botones «← Menú»/«Catálogo», el selector de modo y el plegable «Ajustes de interpretación». (El dibujo de la partitura ya está comprobado píxel a píxel contra el original; esto comprueba la página completa y el CSS.)
27. [ ] **Dos manos, Aprendizaje, teclado MIDI:** importa `estudio-dos-manos.musicxml` (o `dos-manos.mid`) y tócala. **Dos pentagramas (Sol y Fa) con las notas simultáneas alineadas; el piano se amplía; las notas de ambas manos se iluminan a la vez; el evento avanza al completarse en cualquier orden.** Comprueba que la clave de Fa se ve bien asentada.
28. [ ] **Acordes:** toca un acorde tocando las notas con un poco de separación (< 150 ms) y otro tocándolas una a una (> 150 ms). **Ambos avanzan; el segundo se anota como «acordes tocados por separado» sin penalizar.**
29. [ ] **Modo Ritmo con MIDI:** elige «Ritmo» → «Empezar». **Cuenta previa (un compás de clics) y luego la canción; la partitura se desplaza de forma continua.** Toca bien, toca pronto, toca tarde, no toques una nota y toca una equivocada: **verde / dorado con «Pronto/Tarde (± ms)» / roja «Omitida» / «Nota equivocada»; el resumen final cuadra con el detalle.**
30. [ ] **Calibración de latencia (MIDI):** en «Ajustes de interpretación» → «Calibrar latencia» y sigue los 8 clics. **Aparece un valor en ms; repítela 3 veces: deben ser parecidos (±20 ms).** Si salen muy distintos, anótalo. Comprueba que con ese valor el modo Ritmo te sitúa «a tiempo» al tocar con el clic.
31. [ ] **Velocidad y pausa:** velocidades ×0,5/×0,75/×1/×1,25 (se bloquean mientras juegas); «Pausa» detiene partitura y clics, «Reanudar» continúa sin saltos ni omisiones.
32. [ ] **Pedal de sustain:** en una nota larga, suelta la tecla con el pedal pulsado. **La duración no se evalúa («no evaluable»).** Sin pedal, soltar pronto cuenta «duración corta» (no suma fallos).
33. [ ] **Micrófono con piano acústico (notas sueltas):** «Activar micrófono» y **no toques durante 1 s** (calibración). Toca una melodía lenta de una mano, incluyendo notas repetidas, graves (Mi2–Do3) y agudas (Do6–Do7). **Anota: qué notas no se detectan, cuántos «fallos» aparecen sin que te hayas equivocado, y el retraso que notas.** Si hay muchos falsos fallos prueba «Recalibrar ruido» y la sensibilidad, o desactiva «contar fallos del micrófono».
34. [ ] **Micrófono con acordes / dos manos:** **aparece el aviso de fiabilidad baja; basta una nota del acorde; las demás quedan «sin verificar».**
35. [ ] **Micrófono en modo Ritmo:** **aviso de menor precisión temporal; tolerancia ampliada.** Anota si las omisiones falsas son frecuentes (si lo son, el retraso de entrega de 120 ms o la tolerancia necesitan ajuste: dímelo).
36. [ ] **Liberación:** con el micrófono activo, cambia de canción, de modo y de pantalla; desactívalo pulsando de nuevo el botón. **El indicador de grabación del navegador desaparece en cada caso.**
37. [ ] **Ajustes persistentes:** cambia perfil, latencia y sensibilidad; cierra y reabre la aplicación. **Se conservan** (`data/settings.json`).
38. [ ] **Canal MIDI:** con un teclado que permita elegir canal, fija el canal 3 en la app: **solo suena/puntúa lo enviado por el canal 3.**
39. [ ] **Rendimiento:** canción larga en modo Ritmo con micrófono activo. **Animación fluida y CPU moderada (mira el administrador de tareas).**
40. [ ] **Piano ancho:** importa una canción de dos manos con rango de 5+ octavas. **El piano aparece con barra de desplazamiento horizontal y se centra solo en las teclas pendientes.**

# Pruebas manuales: notación y edición (tras la Fase 3)
41. [ ] Importa tu `.musicxml` real y entra en Playing. **Se ven corcheas, semicorcheas, blancas, puntillos, barras de compás, la cifra 6/8·9/8·3/8 y los cambios de clave en su sitio.** Compáralo con la vista previa de «Añadir canción». Anota cualquier diferencia o nota mal colocada.
42. [ ] «Ajustes de interpretación» → desmarca «Mostrar compases»: **desaparecen barras y cifra.** En una de las 4 canciones originales, **con** compases aparecen barras cada 4 negras (provisional).
43. [ ] Catálogo → «Editar datos»: cambia nombre, género y dificultad (también en una precargada). **Se guardan, persisten al reiniciar y, si dos pestañas editan a la vez, la segunda recibe el aviso de conflicto.**
