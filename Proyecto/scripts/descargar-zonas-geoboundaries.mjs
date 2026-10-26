// Descarga los límites de los países de América Latina desde geoBoundaries (versión fijada por la API):
// regiones (ADM1) y municipios o su equivalente (ADM2), en su versión simplificada. Por defecto la
// edición abierta (gbOpen); la humanitaria (gbHumanitarian) donde calza mejor, ver abajo.
// Ejecutar: node scripts/descargar-zonas-geoboundaries.mjs   (después: npm run zonas)
//
// Chile y Perú no se descargan de aquí: usan sus fuentes oficiales, con más detalle (ver
// scripts/importar-zonas.mjs y docs/MULTIPAIS.md). Los archivos quedan en datos/zonas/fuentes/, que no
// se versiona. Licencias: CC BY, ODbL o dominio público según el país; se registran en fuentes.json.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const DESTINO = 'datos/zonas/fuentes/geoboundaries';
export const PAISES_GEOBOUNDARIES = ['ARG', 'BOL', 'BRA', 'COL', 'CRI', 'CUB', 'DOM', 'ECU', 'SLV', 'GTM', 'HND', 'MEX', 'NIC', 'PAN', 'PRY', 'URY', 'VEN'];
// Regiones de la edición humanitaria: vienen del mismo organismo que los municipios, así calzan. La
// edición abierta de estos países viene de otra fuente y no calza (la de Argentina, de Wikimedia, une
// Buenos Aires con Entre Ríos y dibuja mal la Ciudad de Buenos Aires).
const REGIONES_HUMANITARIAS = new Set(['ARG', 'BRA', 'COL', 'ECU', 'GTM']);
// Zonas de la edición humanitaria: la abierta de Paraguay trae nombres abreviados y con errores ("San
// Juan Delparana", "Tte 1Ro…") y la de El Salvador, diez zonas llamadas "Null". La humanitaria trae los
// nombres oficiales completos y con tildes.
const ZONAS_HUMANITARIAS = new Set(['PRY', 'SLV']);
const edicionDe = (iso3, nivel) =>
  (nivel === 'ADM1' ? REGIONES_HUMANITARIAS : ZONAS_HUMANITARIAS).has(iso3) ? 'gbHumanitarian' : 'gbOpen';

mkdirSync(DESTINO, { recursive: true });
let anteriores = {};
try {
  anteriores = JSON.parse(readFileSync(`${DESTINO}/fuentes.json`, 'utf8'));
} catch {
  // primera descarga
}
const fuentes = {};
const catalogos = {};
const catalogo = async (edicion, nivel) => {
  const clave = `${edicion}/${nivel}`;
  if (!catalogos[clave]) {
    const respuesta = await fetch(`https://www.geoboundaries.org/api/current/${edicion}/ALL/${nivel}/`);
    if (!respuesta.ok) throw new Error(`geoBoundaries respondió ${respuesta.status} para ${clave}`);
    catalogos[clave] = await respuesta.json();
  }
  return catalogos[clave];
};
for (const nivel of ['ADM1', 'ADM2']) {
  for (const iso3 of PAISES_GEOBOUNDARIES) {
    const edicion = edicionDe(iso3, nivel);
    const meta = (await catalogo(edicion, nivel)).find((m) => m.boundaryISO === iso3);
    if (!meta) throw new Error(`geoBoundaries no tiene ${nivel} de ${iso3}`);
    const archivo = `${DESTINO}/${iso3}_${nivel}.geojson`;
    fuentes[`${iso3}_${nivel}`] = {
      edicion,
      url: meta.simplifiedGeometryGeoJSON,
      fuente: meta.boundarySource,
      licencia: meta.boundaryLicense,
      anio: meta.boundaryYearRepresented,
      unidades: Number(meta.admUnitCount),
    };
    // Se vuelve a descargar si cambió la edición elegida para ese país
    if (existsSync(archivo) && anteriores[`${iso3}_${nivel}`]?.edicion === edicion && !process.argv.includes('--forzar')) {
      console.log(`= ${archivo} (ya estaba)`);
      continue;
    }
    const datos = await fetch(meta.simplifiedGeometryGeoJSON);
    if (!datos.ok) throw new Error(`No se pudo descargar ${iso3} ${nivel}: ${datos.status}`);
    writeFileSync(archivo, Buffer.from(await datos.arrayBuffer()));
    console.log(`↓ ${archivo} · ${meta.admUnitCount} unidades`);
  }
}
writeFileSync(`${DESTINO}/fuentes.json`, JSON.stringify(fuentes, null, 2));
console.log(`Listo: ${Object.keys(fuentes).length} archivos en ${DESTINO}`);
