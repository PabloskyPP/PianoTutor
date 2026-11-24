/** Regenera backend/seed/*.json desde shared/legacy. Uso: npm run seed */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildAllLegacySongs, validateSong } from '@pianotutor/shared';

const dir = fileURLToPath(new URL('../seed/', import.meta.url));
for (const song of buildAllLegacySongs()) {
  const v = validateSong(song);
  if (!v.ok) throw new Error(`Semilla inválida ${song.id}: ${v.errors.join('; ')}`);
  writeFileSync(`${dir}${song.id}.json`, JSON.stringify(song, null, 2) + '\n');
  console.log('escrito', song.id);
}
