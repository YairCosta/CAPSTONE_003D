// Convierte el expediente de cumplimiento (docs/cumplimiento/<caso>/) en un archivo que la
// aplicación puede mostrar en el portal fiscalizador, con el manifiesto SHA-256 de cada pieza.
//
// El expediente en disco manda: este archivo es una representación de solo lectura y minimizada.
// No incluye datos personales: la matriz y los hallazgos no los contienen (ver triage.md).
//
// Ejecutar: npm run expediente

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const CASO = process.argv[2] ?? 'revela-2026-09';
const RAIZ = join(process.cwd(), 'docs', 'cumplimiento', CASO);
const SALIDA = join(process.cwd(), 'src', 'data', 'expedienteCumplimiento.json');

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

// --- CSV mínimo: los archivos del expediente no llevan saltos de línea dentro de una celda
function parseCsv(texto) {
  const filas = [];
  let campo = '';
  let fila = [];
  let entreComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') entreComillas = false;
      else campo += c;
    } else if (c === '"') entreComillas = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else if (c !== '\r') campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  const [cabecera, ...resto] = filas.filter((f) => f.some((v) => v !== ''));
  return resto.map((f) => Object.fromEntries(cabecera.map((h, i) => [h, f[i] ?? ''])));
}

const leer = (nombre) => readFileSync(join(RAIZ, nombre), 'utf8');

// --- Hallazgos: se leen los encabezados "### H-01 · Alta · Título" del documento
function parseHallazgos(markdown) {
  const hallazgos = [];
  const bloques = markdown.split(/\n### /).slice(1);
  for (const bloque of bloques) {
    const [encabezado, ...cuerpo] = bloque.split('\n');
    const [id, severidad, ...titulo] = encabezado.split(' · ');
    if (!/^H-\d+/.test(id)) continue;
    const texto = cuerpo.join('\n');
    const campo = (etiqueta) => texto.match(new RegExp(`\\*\\*${etiqueta}:\\*\\*\\s*([^*]+)`))?.[1].trim().replace(/\s+/g, ' ') ?? '';
    hallazgos.push({
      id,
      severidad,
      titulo: titulo.join(' · ').trim(),
      requisito: campo('Requisito'),
      hecho: campo('Hecho'),
      remediacion: campo('Remediación'),
    });
  }
  return hallazgos;
}

// --- Limitaciones declaradas en el alcance
function parseLimitaciones(markdown) {
  const seccion = markdown.split('## Restricciones probatorias')[1] ?? '';
  return seccion
    .split('\n')
    .filter((l) => /^\d+\.\s/.test(l))
    .map((l) => l.replace(/^\d+\.\s*/, '').replace(/\*\*/g, '').replace(/`/g, '').trim());
}

function manifiesto(dir) {
  const entradas = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) { entradas.push(...manifiesto(ruta)); continue; }
    const bytes = readFileSync(ruta);
    entradas.push({
      archivo: relative(RAIZ, ruta).replace(/\\/g, '/'),
      bytes: bytes.length,
      sha256: sha256(bytes),
    });
  }
  return entradas.sort((a, b) => a.archivo.localeCompare(b.archivo));
}

const matriz = parseCsv(leer('matriz-ley21719.csv'));
const scope = leer('SCOPE.md');
const caso = JSON.parse(leer('case.json'));

const contar = (campo) =>
  Object.entries(
    matriz.reduce((acc, fila) => ({ ...acc, [fila[campo]]: (acc[fila[campo]] ?? 0) + 1 }), {})
  )
    .map(([clave, total]) => ({ clave, total }))
    .sort((a, b) => b.total - a.total);

const expediente = {
  aviso:
    'Vista de solo lectura del expediente de cumplimiento. No acredita cumplimiento, no es una ' +
    'certificación de la Agencia y no reemplaza asesoría jurídica.',
  caso: {
    id: caso.case_id,
    entidad: caso.organization,
    escenario: caso.scenario,
    creadoUtc: caso.created_at_utc_system_clock,
    corteUtc: '2026-09-24T00:00:00Z',
    custodio: 'Yair Costa',
    datosProductivos: caso.production_data_allowed,
  },
  vigencia: {
    norma: 'Ley 19.628 modificada por la Ley 21.719',
    estado: 'enacted_not_effective',
    vigenciaGeneral: '2026-12-01',
    nota: 'El Boletín 18.623-07 propone postergarla al 01-12-2027 y sigue en tramitación: no se aplica.',
  },
  resumen: {
    disposiciones: matriz.length,
    sinEvaluar: matriz.filter((f) => f.estado_implementacion === 'NO_EVALUADO').length,
    porEstado: contar('estado_implementacion'),
    porAplicabilidad: contar('aplicabilidad'),
  },
  disposiciones: matriz.map((f) => ({
    id: f.id,
    provision: f.provision,
    resumen: f.resumen_skill,
    aplicabilidad: f.aplicabilidad,
    estado: f.estado_implementacion,
    hechos: f.hechos_del_caso,
    evidencia: f.evidencia,
    riesgo: f.riesgo_residual,
    claim: f.clasificacion_claim,
    revisadoUtc: f.revisado_utc,
  })),
  hallazgos: parseHallazgos(leer('hallazgos.md')),
  limitaciones: parseLimitaciones(scope),
  manifiesto: manifiesto(RAIZ),
  generadoUtc: new Date().toISOString(),
};

writeFileSync(SALIDA, `${JSON.stringify(expediente, null, 2)}\n`, 'utf8');

console.log(`Expediente ${caso.case_id}: ${expediente.disposiciones.length} disposiciones, ` +
  `${expediente.hallazgos.length} hallazgos, ${expediente.manifiesto.length} archivos con hash`);
console.log(`→ ${relative(process.cwd(), SALIDA)}`);
