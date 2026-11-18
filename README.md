# Piano Tutor

Aplicación local para aprender piano: eliges una canción, la partitura te muestra la siguiente nota y avanzas tocándola con un teclado MIDI, un piano acústico (micrófono), el teclado del ordenador o el piano en pantalla.

**Estado: Fase 2 de 7** (catálogo, importación MusicXML/MIDI y previsualización). Ver `PROJECT_STATUS.md`.

## Requisitos
- **Node.js 20 o superior** (probado con Node 22). Descarga: https://nodejs.org
- **Chrome o Edge** (Web MIDI no existe en Safari; en Firefox el soporte es parcial y no está verificado).
- Windows, macOS o Linux. Solo el arranque en Linux/Node 22 se ha ejecutado de verdad; `start.bat` no está probado en Windows.

## Instalación (una vez, con internet)
```
npm install
```
Después la aplicación funciona **sin conexión**: la interfaz, la fuente musical y todas las bibliotecas salen de tu carpeta.

## Iniciar
- Windows: doble clic en `start.bat`
- macOS/Linux: `./start.sh`
- Cualquier sistema: `npm start`

Compila la interfaz si hace falta, arranca el servidor local en `http://127.0.0.1:4173` y abre el navegador. Para cerrar: `Ctrl+C` en la consola. El servidor solo escucha en tu propio ordenador. Puerto distinto: variable `PORT`. Sin abrir navegador: `PIANOTUTOR_NO_OPEN=1`.

Desarrollo con recarga: `npm run dev` (Vite en http://localhost:5173).

## Qué puedes hacer en la Fase 2
- **Catálogo**: ordenado alfabéticamente (español). Buscador por título (sin distinguir mayúsculas ni acentos) y filtros combinables: género, dificultad (rango 1–10), manos y propias. Clic en una fila → «Tocar esta canción».
- **Añadir una nueva canción**: importa MusicXML (`.musicxml`, `.xml`, `.mxl`) o MIDI (`.mid`, `.midi`), revisa la previsualización y el informe de importación, y guarda. Ver `docs/IMPORT.md` para lo que se conserva, lo que se avisa y las limitaciones. Ficheros de prueba sintéticos en `tests/fixtures/`.
- **Playing** toca las canciones importadas **de una mano y sin acordes**; las de dos manos o con acordes se guardan y se ven, pero se tocan en la Fase 3.
- **Playing**: igual que el programa original (piano, partitura, contadores, nota siguiente en naranja, micrófono, MIDI, teclado del ordenador). Nuevos: botones «← Menú» y «Catálogo»; el micrófono se puede **desactivar** pulsando de nuevo «Micrófono activo».
- **Guardar como copia propia** (en la tarjeta de cada canción): crea una copia en `data/compositions/`. Las canciones precargadas son de solo lectura.
- *Componer* (Fase 5) aparece en el menú pero deshabilitada.

## Carpetas
```
shared/     Lógica musical pura (modelo, esquema, tiempo, evaluación). Se prueba en Node.
backend/    Servidor local (Fastify) y biblioteca de archivos. backend/seed = las 4 canciones.
frontend/   Interfaz (React + Vite + TypeScript).
data/       TUS DATOS (no se versiona): songs/ compositions/ imports/ drafts/ backups/
tests/      Pruebas automáticas y el HTML original de referencia.
docs/       Arquitectura, modelo de datos, reglas de evaluación, límites del audio, pruebas manuales.
```
**Ubicación de tus canciones:** `data/songs/` (precargadas e importadas) y `data/compositions/` (propias), un archivo `.json` por canción. Antes de sobrescribir una canción se guarda la versión anterior en `data/backups/<id>/` (se conservan las 10 últimas).

**Copia de seguridad manual:** copia la carpeta `data/` entera. **Recuperar:** devuélvela a su sitio con la aplicación cerrada. (Exportación a zip desde la interfaz: Fase 7.)

## Carpeta de biblioteca alternativa
Por seguridad la aplicación solo escribe en carpetas autorizadas. Copia `pianotutor.config.example.json` a `pianotutor.config.json` y lista las rutas permitidas (la primera es la predeterminada), o usa la variable `PIANOTUTOR_ROOTS`. La elección de carpeta activa se hace por API (`GET/PUT /api/settings`) y requiere reiniciar; aún no hay pantalla de ajustes.

## Conectar un piano MIDI
Conéctalo por USB **antes** de abrir la página (o después: se detecta solo), usa Chrome/Edge y acepta el permiso de MIDI. La línea inferior de Playing muestra el dispositivo detectado.

## Micrófono
Pulsa «Activar micrófono» y acepta el permiso. **Limitaciones de la Fase 1 (detector original):** una sola nota a la vez, rango aproximado Sol♯3–Do6, acepta la nota en cualquier octava y **nunca cuenta fallos**. Mejoras previstas en la Fase 3. Si usas altavoces, el sonido sintético de la app puede ser detectado por el micrófono.

## Pruebas
```
npm test          # 197 pruebas automáticas
npm run typecheck
```
Las pruebas con hardware real están en `docs/MANUAL_TESTS.md`.

## Problemas frecuentes
- *«Faltan las dependencias»* → ejecuta `npm install`.
- *«Otra instancia está usando esta biblioteca»* → ya hay un Piano Tutor abierto. Si no es así y se cerró mal, el bloqueo huérfano se recupera solo.
- *Un archivo de la biblioteca aparece como no cargado* → el catálogo lo lista con el motivo; el resto de canciones funciona. No se borra nada automáticamente.
- *No se detecta el teclado MIDI* → usa Chrome o Edge, reconecta el cable y recarga la página.
- *Falta la clave de Sol en la partitura* → la fuente `Noto Music` va incluida; recarga con `Ctrl+F5`.
- *El navegador dice que el puerto está en uso* → `PORT=4180 npm start`.
