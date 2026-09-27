// Importa las zonas oficiales (comunas, distritos…) de cada país al formato de Revela.
// Ejecutar: npm run zonas   (ver docs/MULTIPAIS.md, "Zonas oficiales")
//
// Lee las fuentes descargadas en datos/zonas/fuentes/ (no se versionan), las pasa a WGS84, las
// simplifica para la web y deja:
//   · datos/zonas/zonas-<país>.geojson  (versionado): una zona por feature, con su región
//   · datos/zonas/zone_catalog.sql      (no versionado): los INSERT del catálogo, para copiarlos a una migración nueva
//
// Simplificación variable: las zonas urbanas chicas conservan su forma (en una ciudad las comunas
// son pequeñas y se reconocen por su contorno); las rurales grandes se recortan más.
//
// Para agregar un país: sumar su entrada en PAISES con su fuente, cómo leer código, nombre, región
// y provincia, y el orden de sus regiones. Después, una migración nueva con el SQL generado.
import mapshaper from 'mapshaper';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const SALIDA = 'datos/zonas';
const PALETA = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EC4899', '#0EA5E9', '#F97316', '#22C55E', '#A855F7', '#E11D48'];

const MINUSCULAS = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'en', 'a', 'al']);
/** "SAN JUAN DE LURIGANCHO" → "San Juan de Lurigancho" (el INEI publica los nombres en mayúsculas) */
const titulo = (texto) =>
  texto
    .toLowerCase()
    .split(' ')
    .map((palabra, i) => (i > 0 && MINUSCULAS.has(palabra) ? palabra : palabra.charAt(0).toUpperCase() + palabra.slice(1)))
    .join(' ');

// Regiones de Chile, de norte a sur, con su nombre oficial actual
const REGIONES_CL = [
  [15, 'Arica y Parinacota'],
  [1, 'Tarapacá'],
  [2, 'Antofagasta'],
  [3, 'Atacama'],
  [4, 'Coquimbo'],
  [5, 'Valparaíso'],
  [13, 'Metropolitana de Santiago'],
  [6, "Libertador General Bernardo O'Higgins"],
  [7, 'Maule'],
  [16, 'Ñuble'],
  [8, 'Biobío'],
  [9, 'La Araucanía'],
  [14, 'Los Ríos'],
  [10, 'Los Lagos'],
  [11, 'Aysén del General Carlos Ibáñez del Campo'],
  [12, 'Magallanes y de la Antártica Chilena'],
];

// Departamentos del Perú con tilde (el INEI los publica sin tildes)
const DEPARTAMENTOS_PE = {
  '01': 'Amazonas', '02': 'Áncash', '03': 'Apurímac', '04': 'Arequipa', '05': 'Ayacucho',
  '06': 'Cajamarca', '07': 'Callao', '08': 'Cusco', '09': 'Huancavelica', '10': 'Huánuco',
  '11': 'Ica', '12': 'Junín', '13': 'La Libertad', '14': 'Lambayeque', '15': 'Lima',
  '16': 'Loreto', '17': 'Madre de Dios', '18': 'Moquegua', '19': 'Pasco', '20': 'Piura',
  '21': 'Puno', '22': 'San Martín', '23': 'Tacna', '24': 'Tumbes', '25': 'Ucayali',
};

const PAISES = [
  {
    pais: 'CL',
    categoria: 'commune',
    fuente: 'Biblioteca del Congreso Nacional de Chile, "División comunal" (comunas_final.zip, edición 2018)',
    entrada: `${SALIDA}/fuentes/comunas/comunas.shp`,
    // La fuente viene en Web Mercator; se quitan islotes de menos de 1 km² (miles en la costa sur)
    comandos: '-proj wgs84 -filter-islands min-area=1km2 remove-empty',
    simplificar: 'this.area < 100e6 ? "8%" : "0.8%"',
    campos: 'cod_comuna,Comuna,Provincia,codregion',
    // "Zona sin demarcar" (Campo de Hielo Sur) no es una comuna
    incluir: (p) => p.cod_comuna > 0,
    zona: (p) => {
      const orden = REGIONES_CL.findIndex(([codigo]) => codigo === p.codregion);
      return {
        code: `CL-${String(p.cod_comuna).padStart(5, '0')}`,
        name: p.Comuna,
        province_name: p.Provincia,
        region_code: `CL-${String(p.codregion).padStart(2, '0')}`,
        region_name: REGIONES_CL[orden]?.[1] ?? `Región ${p.codregion}`,
        region_order: orden,
      };
    },
  },
  {
    pais: 'PE',
    categoria: 'district',
    fuente: 'INEI (límites distritales), publicados en github.com/Rodasluis/Peru-maps (distrito_simplificado.geojson)',
    entrada: `${SALIDA}/fuentes/distrito_simplificado.geojson`,
    comandos: '',
    simplificar: 'this.area < 60e6 ? "100%" : this.area < 600e6 ? "25%" : "8%"',
    campos: 'ubigeo,nombre,nombre_provincia,ubigeo_departamento',
    incluir: () => true,
    zona: (p) => ({
      code: `PE-${p.ubigeo}`,
      name: titulo(p.nombre),
      province_name: titulo(p.nombre_provincia),
      region_code: `PE-${p.ubigeo_departamento}`,
      region_name: DEPARTAMENTOS_PE[p.ubigeo_departamento] ?? titulo(p.ubigeo_departamento),
      // Perú: departamentos en orden alfabético
      region_order: Object.values(DEPARTAMENTOS_PE)
        .sort((a, b) => a.localeCompare(b, 'es'))
        .indexOf(DEPARTAMENTOS_PE[p.ubigeo_departamento]),
    }),
  },
];

const anillo = (puntos) => `(${puntos.map(([lng, lat]) => `${lng} ${lat}`).join(', ')})`;
const aWkt = (geometria) => {
  const poligonos = geometria.type === 'Polygon' ? [geometria.coordinates] : geometria.coordinates;
  return `SRID=4326;MULTIPOLYGON(${poligonos.map((p) => `(${p.map(anillo).join(', ')})`).join(', ')})`;
};
const sqlTexto = (valor) => `'${String(valor).replace(/'/g, "''")}'`;

mkdirSync(SALIDA, { recursive: true });
const filasSql = [];

for (const config of PAISES) {
  const temporal = `${SALIDA}/fuentes/_${config.pais}.geojson`;
  await mapshaper.runCommands(
    `-i "${config.entrada}" ${config.comandos} -simplify variable percentage='${config.simplificar}' keep-shapes ` +
      `-filter-fields ${config.campos} -o "${temporal}" format=geojson precision=0.0001 force`
  );
  const fuente = JSON.parse(readFileSync(temporal, 'utf8'));
  const features = fuente.features
    .filter((f) => f.geometry && config.incluir(f.properties))
    .map((f, i) => {
      const zona = config.zona(f.properties);
      return {
        type: 'Feature',
        properties: { country_code: config.pais, category: config.categoria, color_hex: PALETA[i % PALETA.length], ...zona },
        geometry: f.geometry,
      };
    })
    .sort((a, b) => a.properties.code.localeCompare(b.properties.code));

  const codigos = new Set(features.map((f) => f.properties.code));
  if (codigos.size !== features.length) throw new Error(`${config.pais}: hay códigos de zona repetidos`);
  const sinRegion = features.filter((f) => f.properties.region_order < 0);
  if (sinRegion.length > 0) throw new Error(`${config.pais}: zonas sin región conocida: ${sinRegion.map((f) => f.properties.code).join(', ')}`);

  writeFileSync(
    `${SALIDA}/zonas-${config.pais.toLowerCase()}.geojson`,
    JSON.stringify({ type: 'FeatureCollection', fuente: config.fuente, features })
  );
  for (const f of features) {
    const p = f.properties;
    filasSql.push(
      `(${[p.country_code, p.code, p.name, p.category, p.color_hex, p.region_code, p.region_name, p.province_name]
        .map(sqlTexto)
        .join(', ')}, ${p.region_order}, ${sqlTexto(aWkt(f.geometry))})`
    );
  }
  const regiones = new Set(features.map((f) => f.properties.region_code)).size;
  console.log(`${config.pais}: ${features.length} zonas en ${regiones} regiones → ${SALIDA}/zonas-${config.pais.toLowerCase()}.geojson`);
}

// Un INSERT cada 100 zonas: sentencias de tamaño razonable para la base
const bloques = [];
for (let i = 0; i < filasSql.length; i += 100) {
  bloques.push(
    'INSERT INTO public.zone_catalog (country_code, code, name, category, color_hex, region_code, region_name, province_name, region_order, polygon)\n' +
      'SELECT v.country_code, v.code, v.name, v.category, v.color_hex, v.region_code, v.region_name, v.province_name, v.region_order,\n' +
      '       extensions.ST_GeogFromText(v.wkt)\n' +
      `FROM (VALUES\n${filasSql.slice(i, i + 100).join(',\n')}\n) AS v(country_code, code, name, category, color_hex, region_code, region_name, province_name, region_order, wkt)\n` +
      'ON CONFLICT (country_code, code) DO UPDATE SET\n' +
      '    name = EXCLUDED.name, category = EXCLUDED.category, region_code = EXCLUDED.region_code,\n' +
      '    region_name = EXCLUDED.region_name, province_name = EXCLUDED.province_name,\n' +
      '    region_order = EXCLUDED.region_order, polygon = EXCLUDED.polygon;'
  );
}
writeFileSync(`${SALIDA}/zone_catalog.sql`, `-- Generado por scripts/importar-zonas.mjs (npm run zonas). No editar a mano.\n${bloques.join('\n\n')}\n`);
console.log(`SQL del catálogo: ${SALIDA}/zone_catalog.sql (${filasSql.length} zonas)`);
