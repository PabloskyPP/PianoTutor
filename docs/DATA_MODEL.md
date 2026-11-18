# Modelo de datos — `schemaVersion: 1`
Definición ejecutable: `shared/src/model/schema.ts` (Zod). Un archivo JSON por canción: `data/songs/<id>.json` o `data/compositions/<id>.json` (origen `composed`).

- **Tiempo:** ticks enteros, `ppq = 960`. El tempo solo existe en `tempoMap`.
- **Alturas:** `{midi, step, alter, octave}`; `midi` debe coincidir con los otros tres.
- **Eventos de grabado** (lo guardado): `note | chord | rest`; ninguno cruza su compás (las notas largas son ligaduras `tieNext/tiePrev`).
- **Eventos de interpretación** (`toPerformance`, calculados, no guardados): ligaduras fusionadas y notas simultáneas agrupadas. Reproducción, evaluación y Piano Tiles solo leen esto.
- **Invariantes validadas:** midi coherente; evento dentro de su compás; sin solapes en una misma voz; toda ligadura tiene continuación; dificultad entero 1–10; manos 1 o 2; `tempoMap[0].tick = 0`; tipo/número de alturas coherente.
- **`Staff.index` es global** en la canción (0 = pentagrama superior), único aunque haya varias partes (la proyección de interpretación lo usa para distinguir manos).
- **`source`** (canciones importadas): `kind`, `fileName`, `storedAs` (ruta relativa del original), `originalPpq`, `importReport` (avisos), `importOptions` (rejilla, modo de manos, punto de división… usados). Campo `importOptions` añadido en la Fase 2 como opcional: **no cambia `schemaVersion`** (los archivos de la Fase 1 siguen siendo válidos).
- **Control de cambios:** `revision` (entero). Actualizar exige `If-Match: <revision>`; si no coincide, 409.

## Migración de las 4 canciones (valores PROVISIONALES)
El HTML original solo tenía alturas. Se asignó: duraciones = negra (960 ticks), compás 4/4, 90 BPM, agrupadas de 4 en 4 (último compás `incomplete`, **sin silencios de relleno**). No es el ritmo real de las obras.

| Canción | Id | Género | Dif. |
|---|---|---|---|
| Estrellita, ¿dónde estás? | preloaded-estrellita-donde-estas | Infantil | 1 |
| Jingle Bells (estribillo) | preloaded-jingle-bells | Navidad | 2 |
| Oda a la alegría (Beethoven) | preloaded-oda-a-la-alegria | Clásica | 2 |
| Para Elisa (inicio, Beethoven) | preloaded-para-elisa | Clásica | 5 |

Cada JSON lleva `provisional: {metadata, rhythm, note}`. Para Elisa conserva la secuencia original tal cual (mezcla voces en una línea): es un fragmento simplificado. Regenerar semillas: `npm run seed`.

## Canciones importadas (Fase 2)
`origin: 'imported'`, id `imported-<uuid>`, archivo en `data/songs/`, original en `data/imports/<id>/original.<ext>`. No llevan `provisional`: su ritmo y metadatos proceden del archivo y de los datos introducidos por el usuario.
