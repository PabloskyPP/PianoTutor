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
