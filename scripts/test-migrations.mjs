// Revisión de las migraciones SQL con el parser oficial de PostgreSQL (libpg-query).
// No reemplaza aplicarlas contra una base real, pero detecta errores de sintaxis y descuidos frecuentes
// antes de tocar Supabase. Ejecutar: npm run test:sql
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadModule, parseSync, parsePlPgSQLSync } from 'libpg-query';

const DIR = 'supabase/migrations';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${!ok && detail ? `\n    ${detail}` : ''}`);
};

await loadModule();

const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
check('Hay migraciones y están numeradas en orden', files.length > 0 && files.every((f) => /^\d{14}_[a-z0-9_]+\.sql$/.test(f)), files.join(', '));

// Las migraciones se aplican en orden de nombre: no puede haber dos con el mismo prefijo
const prefixes = files.map((f) => f.slice(0, 14));
check('No hay dos migraciones con la misma marca de tiempo', new Set(prefixes).size === prefixes.length, prefixes.join(', '));

const tablesCreated = new Map(); // tabla -> archivo donde se crea

for (const file of files) {
  const sql = readFileSync(join(DIR, file), 'utf8');

  // 1. Sintaxis SQL
  let parsed = null;
  try {
    parsed = parseSync(sql);
    check(`${file}: sintaxis SQL válida`, true);
  } catch (error) {
    check(`${file}: sintaxis SQL válida`, false, error.message);
    continue;
  }

  // 2. Cuerpo de las funciones PL/pgSQL: se analiza cada CREATE FUNCTION completo,
  //    porque el parser necesita la firma para saber qué devuelve y si es un trigger (NEW / OLD).
  const functions = [...sql.matchAll(/CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION[\s\S]*?AS\s+\$\$[\s\S]*?\$\$\s*;/gi)].map((m) => m[0]);
  let plpgsqlOk = true;
  let plpgsqlError = '';
  for (const fn of functions) {
    if (!/LANGUAGE\s+plpgsql/i.test(fn)) continue; // sql puro: ya lo revisó el parser de arriba
    try {
      parsePlPgSQLSync(fn);
    } catch (error) {
      plpgsqlOk = false;
      plpgsqlError = `${error.message} · en: ${fn.slice(0, 90).replace(/\s+/g, ' ')}...`;
    }
  }
  check(`${file}: funciones PL/pgSQL válidas (${functions.length})`, plpgsqlOk, plpgsqlError);

  // 3. Convenciones del proyecto (docs/BASE_DE_DATOS.md)
  const statements = parsed.stmts.map((s) => s.stmt);
  const created = statements
    .filter((s) => s.CreateStmt)
    .map((s) => s.CreateStmt.relation.relname);
  for (const table of created) {
    if (tablesCreated.has(table)) {
      check(`${file}: la tabla "${table}" no se crea dos veces`, false, `ya se creaba en ${tablesCreated.get(table)}`);
    }
    tablesCreated.set(table, file);
  }

  const dangerous = [
    ...[...sql.matchAll(/DROP\s+TABLE\s+(?!IF\s+EXISTS\s+__)/gi)].map(() => 'DROP TABLE'),
    ...[...sql.matchAll(/DROP\s+COLUMN/gi)].map(() => 'DROP COLUMN'),
    ...[...sql.matchAll(/TRUNCATE/gi)].map(() => 'TRUNCATE'),
  ];
  const warnsAboutData = /NO HAY DATOS EN PRODUCCIÓN|expandir|contraer/i.test(sql);
  check(
    `${file}: los cambios destructivos están advertidos${dangerous.length ? ` (${dangerous.length})` : ''}`,
    dangerous.length === 0 || warnsAboutData,
    `${dangerous.join(', ')} sin nota sobre datos existentes`
  );
}

// 4. Toda tabla de datos de un CRM tiene RLS activado
const allSql = files.map((f) => readFileSync(join(DIR, f), 'utf8')).join('\n');
const tenantTables = [...tablesCreated.keys()].filter((t) =>
  new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${t}[\\s\\S]{0,1200}?company_id`, 'i').test(allSql)
);
const withoutRls = tenantTables.filter((t) => !new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`, 'i').test(allSql));
check(`Todas las tablas con company_id tienen RLS (${tenantTables.length})`, withoutRls.length === 0, `Sin RLS: ${withoutRls.join(', ')}`);

// 5. Toda tabla creada tiene un COMMENT que la explica
const withoutComment = [...tablesCreated.keys()].filter(
  (t) => !new RegExp(`COMMENT ON TABLE public\\.${t} IS`, 'i').test(allSql)
);
check(`Todas las tablas están documentadas con COMMENT ON (${tablesCreated.size})`, withoutComment.length === 0, `Sin comentario: ${withoutComment.join(', ')}`);

// 6. Las funciones SECURITY DEFINER fijan search_path (evita que alguien las engañe con un esquema propio)
const definers = [...allSql.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)[\s\S]*?\$\$/g)]
  .filter((m) => /SECURITY DEFINER/i.test(m[0]))
  .filter((m) => !/SET search_path/i.test(m[0]))
  .map((m) => m[1]);
check('Las funciones SECURITY DEFINER fijan search_path', definers.length === 0, `Sin search_path: ${definers.join(', ')}`);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} revisiones de migraciones OK`);
console.log('Nota: esto revisa sintaxis y convenciones, no reemplaza aplicarlas en una base real (npx supabase db push).');
process.exit(failed ? 1 : 0);
