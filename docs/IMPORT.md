# Importación de canciones (Fase 2)

Flujo: archivo → `POST /api/import/preview` (el **servidor** analiza; no se guarda nada) → el usuario revisa y completa título, género, manos y dificultad → `POST /api/import` (el servidor vuelve a analizar el archivo con el mismo código, valida con el esquema, guarda el JSON en `data/songs/` y el original **sin modificar** en `data/imports/<id>/original.<ext>`). Si algo falla, no queda nada a medias. «Canción guardada» solo aparece tras la respuesta 201.
Código: `shared/src/import/` (musicxml, mxl, midi, index) y `backend/src/library/importService.ts`. Límites: 20 MB; `.mxl` descomprimido ≤ 50 MB.

## MusicXML (`.musicxml`, `.xml`, `.mxl`)
**Se conserva:** alturas con alteración, duraciones, silencios, compases (incl. anacrusa), tempo (`sound tempo` o metrónomo), compás y cambios de compás, armadura y cambios, acordes, voces, pentagramas (hasta 2), ligaduras de prolongación, tresillos y similares (`time-modification`), clave inicial.
**Se informa en el informe de importación (no se descarta en silencio):** notas de adorno (omitidas), notas «cue» (omitidas), notas sin altura/percusión (omitidas), ligaduras de expresión, articulaciones, ornamentos, fermatas, arpegios, dinámicas, letras, indicaciones técnicas (ignorados), repeticiones y casillas 1.ª/2.ª (**importadas sin expandir**), transposición (**no se aplica**), cambios de clave a mitad de pieza (solo clave inicial), microtonos (redondeados), eventos solapados en una voz (movidos a otra voz), ligaduras sin destino (quitadas).
**Se rechaza con mensaje:** XML mal formado, `score-timewise`, entidades/DOCTYPE internos (seguridad), más de 2 pentagramas en total, archivo sin notas, `.mxl` dañado o sin partitura, extensión que no coincide con el contenido.
Las manos se deducen del orden de pentagramas (superior = derecha). El número de manos elegido debe coincidir con el de pentagramas.

## MIDI (`.mid`, `.midi`; formatos 0 y 1)
Se leen PPQ (se reescala a 960), mapa de tempo, compás, armadura, pares Note On/Off (Note On vel. 0 = Off; notas solapadas de igual altura emparejadas por orden), pistas y canales. Canal 10 (percusión) se omite; el pedal de sustain se ignora (con aviso).
**Cuantización** (rejilla configurable: negra, corchea, semicorchea —por defecto—, fusa): inicio y fin se redondean a la rejilla; mínimo una casilla. «Unir solapes de legato» recorta solapes de una casilla entre notas consecutivas (si se desactiva, el solape crea otra voz).
**Notación:** notas simultáneas con igual duración = acorde; si difieren, van a voces distintas; las notas que cruzan una barra se parten en eventos ligados; se rellenan silencios en la voz 1.
**Manos:** un MIDI no dice qué mano toca cada nota. Con «dos manos» se propone: por pista (si hay exactamente 2 con notas; la más aguda = derecha) o por altura (punto de división configurable, Do4 por defecto). **El usuario debe confirmar** la propuesta (el servidor lo exige).
**Ortografía:** sostenidos si la armadura es de sostenidos o no hay armadura; bemoles si es de bemoles. No distingue Fa♯/Sol♭ por contexto armónico.
**Limitaciones (inherentes):** no reconoce tresillos ni ritmos irregulares (se aproximan a la rejilla recta); una interpretación humana cuantizada puede resultar poco legible; no detecta anacrusas; los cambios de compás fuera de barra se aplican desde la siguiente; se rechazan formato 2, temporización SMPTE y > 5000 compases. El archivo original queda guardado para reimportar con otra rejilla (aún no hay pantalla para ello).

## Vista previa
VexFlow (entrada `vexflow/bravura`, MIT; fuentes incrustadas como `data:` URLs: sin red). Paginada, con clave, armadura, métrica, alteraciones por compás, acordes, silencios, ligaduras y tresillos; dos pentagramas con llave y notas simultáneas alineadas. Las duraciones que no son una figura (p. ej. 5 semicorcheas) se dibujan como figuras ligadas **solo en pantalla**; el modelo guarda la duración real.
