import 'dotenv/config';
import fs from 'fs';
import { parse } from 'csv-parse';
import iconv from 'iconv-lite';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env');
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

function getArg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function main() {
  const file = getArg('file');

  if (!file) {
    throw new Error('Informe o arquivo com --file');
  }

  if (!fs.existsSync(file)) {
    throw new Error(`Arquivo não encontrado: ${file}`);
  }

  const stream = fs
    .createReadStream(file)
    .pipe(iconv.decodeStream('latin1'))
    .pipe(
      parse({
        delimiter: ';',
        quote: '"',
        relax_quotes: true,
        relax_column_count: true,
        skip_empty_lines: true
      })
    );

  let chunk: any[] = [];
  let total = 0;

  for await (const row of stream) {
    const codigo = String(row[0] || '').trim();
    const nome = String(row[1] || '').trim();

    if (!codigo || !nome) continue;

    chunk.push({ codigo, nome });

    if (chunk.length >= 500) {
      const { error } = await supabase
        .from('municipios')
        .upsert(chunk, { onConflict: 'codigo' });

      if (error) throw error;

      total += chunk.length;
      console.log(`Municípios importados: ${total}`);
      chunk = [];
    }
  }

  if (chunk.length > 0) {
    const { error } = await supabase
      .from('municipios')
      .upsert(chunk, { onConflict: 'codigo' });

    if (error) throw error;

    total += chunk.length;
  }

  console.log('Finalizado.');
  console.log(`Total importado: ${total}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
