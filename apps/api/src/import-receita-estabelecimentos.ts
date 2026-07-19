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

function onlyNumbers(value: string | undefined | null): string {
  return String(value || '').replace(/\D/g, '');
}

function normalizeText(value: unknown): string | null {
  const text = String(value || '').trim();
  return text || null;
}

function parseDate(value: string | undefined | null): string | null {
  const clean = onlyNumbers(value);

  if (clean.length !== 8) return null;

  return `${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`;
}

function mapSituacao(value: string | undefined | null): string | null {
  const code = onlyNumbers(value).padStart(2, '0');

  const map: Record<string, string> = {
    '01': 'NULA',
    '02': 'ATIVA',
    '03': 'SUSPENSA',
    '04': 'INAPTA',
    '08': 'BAIXADA'
  };

  return map[code] || value || null;
}

function buildPhone(ddd: string | undefined, phone: string | undefined): string | null {
  const cleanDdd = onlyNumbers(ddd);
  const cleanPhone = onlyNumbers(phone);

  if (!cleanDdd || !cleanPhone) return null;

  return `${cleanDdd}${cleanPhone}`;
}

function buildCnpj(base: string, ordem: string, dv: string): string {
  return `${onlyNumbers(base).padStart(8, '0')}${onlyNumbers(ordem).padStart(4, '0')}${onlyNumbers(dv).padStart(2, '0')}`;
}

async function insertChunk(rows: any[]) {
  if (rows.length === 0) return;

  const { error } = await supabase
    .from('companies')
    .upsert(rows, {
      onConflict: 'cnpj'
    });

  if (error) {
    console.error('Erro ao inserir chunk:', error);
    throw error;
  }
}

async function main() {
  const file = getArg('file');
  const limitArg = getArg('limit');
  const ufArg = getArg('uf');

  if (!file) {
    throw new Error('Informe o arquivo com --file');
  }

  if (!fs.existsSync(file)) {
    throw new Error(`Arquivo não encontrado: ${file}`);
  }

  const limit = limitArg ? Number(limitArg) : undefined;
  const filterUf = ufArg ? ufArg.toUpperCase() : undefined;

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

  let countRead = 0;
  let countImported = 0;
  let chunk: any[] = [];

  for await (const row of stream) {
    countRead++;

    const cnpjBasico = row[0];
    const cnpjOrdem = row[1];
    const cnpjDv = row[2];

    const uf = normalizeText(row[19])?.toUpperCase() || null;

    if (filterUf && uf !== filterUf) {
      continue;
    }

    const cnpj = buildCnpj(cnpjBasico, cnpjOrdem, cnpjDv);

    const telefone1 = buildPhone(row[21], row[22]);
    const telefone2 = buildPhone(row[23], row[24]);
    const telefone = telefone1 || telefone2;

    const email = normalizeText(row[27])?.toLowerCase() || null;

    const tipoLogradouro = normalizeText(row[13]);
    const logradouro = normalizeText(row[14]);

    chunk.push({
      cnpj,
      cnpj_root: onlyNumbers(cnpjBasico).padStart(8, '0'),

      razao_social: null,
      nome_fantasia: normalizeText(row[4]),

      situacao_cadastral: mapSituacao(row[5]),
      data_situacao_cadastral: parseDate(row[6]),
      data_abertura: parseDate(row[10]),

      uf,
      cidade: normalizeText(row[20]),
      municipio_codigo: normalizeText(row[20]),

      bairro: normalizeText(row[17]),
      cep: onlyNumbers(row[18]) || null,

      cnae_principal: normalizeText(row[11]),
      cnae_secundario: normalizeText(row[12]),

      porte: null,
      mei: false,
      simples: false,

      telefone,
      email,

      has_phone: Boolean(telefone),
      has_email: Boolean(email),

      matriz_filial: normalizeText(row[3]),
      logradouro: tipoLogradouro && logradouro ? `${tipoLogradouro} ${logradouro}` : logradouro,
      numero: normalizeText(row[15]),
      complemento: normalizeText(row[16]),

      source: 'receita_federal_dados_abertos',
      source_updated_at: new Date().toISOString()
    });

    if (chunk.length >= 500) {
      await insertChunk(chunk);
      countImported += chunk.length;
      console.log(`Importados: ${countImported}`);
      chunk = [];
    }

    if (limit && countImported + chunk.length >= limit) {
      break;
    }
  }

  if (chunk.length > 0) {
    await insertChunk(chunk);
    countImported += chunk.length;
  }

  console.log('Finalizado.');
  console.log(`Linhas lidas: ${countRead}`);
  console.log(`Empresas importadas: ${countImported}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
