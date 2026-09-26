// Prueba funcional de la base de Supabase enlazada (npm run test:db).
// Ejecuta scripts/sql/prueba-privacidad-remota.sql, que crea datos ficticios, prueba las reglas
// como usuarios reales y lo deshace todo al final con un error forzado. Requiere que el dueño del
// proyecto haya hecho `npx supabase login` y `npx supabase link`.
import { spawnSync } from 'node:child_process';

const archivo = 'scripts/sql/prueba-privacidad-remota.sql';
const r = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '-f', archivo], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
});
const salida = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;

const fallar = (motivo) => {
  console.error(`${motivo}\n\nSalida de Supabase:\n${salida.trim().slice(0, 3000)}`);
  process.exit(1);
};

// Capa 1: la CLI responde un JSON con el error de la API
const linea = salida.split('\n').find((l) => l.trim().startsWith('{"_tag"'));
if (!linea) fallar('La consulta no devolvió el error esperado (¿cambió la prueba o la CLI?).');
const mensajeCli = JSON.parse(linea).error?.message ?? '';

// Capa 2: la API devuelve otro JSON con el mensaje de PostgreSQL
const cuerpo = mensajeCli.slice(mensajeCli.indexOf('{'));
let mensajePg = '';
try {
  mensajePg = JSON.parse(cuerpo).message ?? '';
} catch {
  fallar('No se pudo leer la respuesta de la API.');
}

// Capa 3: el error forzado trae los resultados como JSON tras "RESULTADOS:"
const marca = mensajePg.indexOf('RESULTADOS:');
if (marca === -1) fallar(`La prueba se detuvo antes de terminar:\n${mensajePg}`);

// Se busca el cierre del arreglo respetando las comillas
const texto = mensajePg.slice(marca + 'RESULTADOS:'.length);
let nivel = 0;
let enTexto = false;
let fin = -1;
for (let i = 0; i < texto.length; i++) {
  const c = texto[i];
  if (enTexto) {
    if (c === '\\') i++;
    else if (c === '"') enTexto = false;
  } else if (c === '"') enTexto = true;
  else if (c === '[') nivel++;
  else if (c === ']' && --nivel === 0) {
    fin = i;
    break;
  }
}
const resultados = JSON.parse(texto.slice(0, fin + 1));

for (const p of resultados) {
  const detalle = typeof p.detalle === 'string' ? p.detalle : JSON.stringify(p.detalle);
  console.log(`${p.ok ? '✓' : '✗'} ${p.prueba}${p.ok ? '' : `\n    ${detalle}`}`);
}
const fallidas = resultados.filter((p) => !p.ok).length;
console.log(`\n${resultados.length - fallidas}/${resultados.length} pruebas contra la base de Supabase OK (todo se deshizo al terminar)`);
process.exit(fallidas ? 1 : 0);
