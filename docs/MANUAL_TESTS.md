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
