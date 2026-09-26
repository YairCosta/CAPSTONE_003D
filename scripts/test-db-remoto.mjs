// Prueba funcional de la base de Supabase enlazada (npm run test:db).
// Ejecuta los archivos de scripts/sql/, que crean datos ficticios, prueban las reglas como usuarios
// reales y lo deshacen todo al final con un error forzado. Requiere que el dueño del proyecto haya
// hecho `npx supabase login` y `npx supabase link`.
import { spawnSync } from 'node:child_process';

const ARCHIVOS = [
  { archivo: 'scripts/sql/prueba-privacidad-remota.sql', titulo: 'Privacidad y aislamiento' },
  { archivo: 'scripts/sql/prueba-plataforma-remota.sql', titulo: 'Administración de la plataforma' },
  { archivo: 'scripts/sql/prueba-crm-remota.sql', titulo: 'Trabajo diario del CRM (etapa 3)' },
];

const fallar = (motivo, salida) => {
  console.error(`${motivo}\n\nSalida de Supabase:\n${salida.trim().slice(0, 3000)}`);
  process.exit(1);
};

const ejecutar = (archivo) => {
  const r = spawnSync('npx', ['supabase', 'db', 'query', '--linked', '-f', archivo], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  const salida = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;

  // Capa 1: la CLI responde un JSON con el error de la API
  const linea = salida.split('\n').find((l) => l.trim().startsWith('{"_tag"'));
  if (!linea) fallar(`${archivo}: la consulta no devolvió el error esperado (¿cambió la prueba o la CLI?).`, salida);
  const mensajeCli = JSON.parse(linea).error?.message ?? '';

  // Capa 2: la API devuelve otro JSON con el mensaje de PostgreSQL
  const cuerpo = mensajeCli.slice(mensajeCli.indexOf('{'));
  let mensajePg = '';
  try {
    mensajePg = JSON.parse(cuerpo).message ?? '';
  } catch {
    fallar(`${archivo}: no se pudo leer la respuesta de la API.`, salida);
  }

  // Capa 3: el error forzado trae los resultados como JSON tras "RESULTADOS:"
  const marca = mensajePg.indexOf('RESULTADOS:');
  if (marca === -1) fallar(`${archivo}: la prueba se detuvo antes de terminar:\n${mensajePg}`, salida);

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
  return JSON.parse(texto.slice(0, fin + 1));
};

let total = 0;
let fallidas = 0;
for (const { archivo, titulo } of ARCHIVOS) {
  console.log(`\n${titulo}`);
  const resultados = ejecutar(archivo);
  for (const p of resultados) {
    const detalle = typeof p.detalle === 'string' ? p.detalle : JSON.stringify(p.detalle);
    console.log(`${p.ok ? '✓' : '✗'} ${p.prueba}${p.ok ? '' : `\n    ${detalle}`}`);
  }
  total += resultados.length;
  fallidas += resultados.filter((p) => !p.ok).length;
}
console.log(`\n${total - fallidas}/${total} pruebas contra la base de Supabase OK (todo se deshizo al terminar)`);
process.exit(fallidas ? 1 : 0);
