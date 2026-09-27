// Registro de países soportados por la plataforma (plan Internacional): América Latina.
//
// Cada país define cómo se llama su unidad territorial de trabajo (la "zona" del mapa y del ranking) y
// su primer nivel administrativo (la "región", que agrupa las zonas). No en todos lados hay comunas:
//   · Chile:     Región → Provincia → Comuna          · Perú:     Departamento → Provincia → Distrito
//   · México:    Estado → Municipio                   · Brasil:   Estado → Municipio
//   · Argentina: Provincia → Departamento o partido   · Ecuador y Costa Rica: Provincia → Cantón
//   · Panamá y Paraguay: distrito                     · El Salvador: distrito (reforma de 2024)
// La zona es el nivel municipal de cada país (Bolivia: provincia). Chile y Perú usan fuentes oficiales;
// el resto, geoBoundaries (ver docs/MULTIPAIS.md).
//
// Para agregar un país:
//   1. Sumar su código a CountryCode y su moneda a CurrencyCode si es nueva.
//   2. Agregar su configuración en COUNTRIES, y la moneda y su tasa de respaldo en src/lib/currency.ts.
//   3. Su bandera en src/components/CountryFlag.tsx.
//   4. Sus zonas con `npm run zonas` y una migración nueva (tabla countries y zone_catalog).
//   5. Con el plan Internacional, el gerente lo activa desde Gerencia → Países.

export type CountryCode =
  | 'CL'
  | 'PE'
  | 'AR'
  | 'BO'
  | 'BR'
  | 'CO'
  | 'CR'
  | 'CU'
  | 'DO'
  | 'EC'
  | 'SV'
  | 'GT'
  | 'HN'
  | 'MX'
  | 'NI'
  | 'PA'
  | 'PY'
  | 'UY'
  | 'VE';
export type CurrencyCode =
  | 'CLP'
  | 'PEN'
  | 'USD'
  | 'ARS'
  | 'BOB'
  | 'BRL'
  | 'COP'
  | 'CRC'
  | 'CUP'
  | 'DOP'
  | 'GTQ'
  | 'HNL'
  | 'MXN'
  | 'NIO'
  | 'PYG'
  | 'UYU'
  | 'VES';

export interface CountryConfig {
  code: CountryCode;
  name: string;
  currency: CurrencyCode;
  locale: string;
  zoneLabel: { singular: string; plural: string; gender: 'f' | 'm' };
  // Primer nivel de la división administrativa: agrupa las zonas en los selectores y en el mapa
  regionLabel: { singular: string; plural: string };
  adminHierarchy: string;
  phonePrefix: string;
  addressExample: string;
  taxIdLabel: string;
  taxIdExample: string;
  mapView: { lat: number; lng: number; zoom: number };
}

const municipio = { singular: 'Municipio', plural: 'Municipios', gender: 'm' } as const;
const distrito = { singular: 'Distrito', plural: 'Distritos', gender: 'm' } as const;
const canton = { singular: 'Cantón', plural: 'Cantones', gender: 'm' } as const;
const estado = { singular: 'Estado', plural: 'Estados' };
const provincia = { singular: 'Provincia', plural: 'Provincias' };
const departamento = { singular: 'Departamento', plural: 'Departamentos' };

export const COUNTRIES: Record<CountryCode, CountryConfig> = {
  CL: {
    code: 'CL',
    name: 'Chile',
    currency: 'CLP',
    locale: 'es-CL',
    zoneLabel: { singular: 'Comuna', plural: 'Comunas', gender: 'f' },
    regionLabel: { singular: 'Región', plural: 'Regiones' },
    adminHierarchy: 'Región → Provincia → Comuna',
    phonePrefix: '+56 9 ',
    addressExample: 'Av. Providencia 1900',
    taxIdLabel: 'RUT',
    taxIdExample: '76.000.000-0',
    mapView: { lat: -33.43, lng: -70.6, zoom: 12 },
  },
  PE: {
    code: 'PE',
    name: 'Perú',
    currency: 'PEN',
    locale: 'es-PE',
    zoneLabel: distrito,
    regionLabel: departamento,
    adminHierarchy: 'Departamento → Provincia → Distrito',
    phonePrefix: '+51 ',
    addressExample: 'Av. José Larco 1150',
    taxIdLabel: 'RUC',
    taxIdExample: '20100000000',
    mapView: { lat: -12.11, lng: -77.0, zoom: 12 },
  },
  AR: {
    code: 'AR',
    name: 'Argentina',
    currency: 'ARS',
    locale: 'es-AR',
    zoneLabel: { singular: 'Partido o departamento', plural: 'Partidos y departamentos', gender: 'm' },
    regionLabel: provincia,
    adminHierarchy: 'Provincia → Departamento (partido en Buenos Aires, comuna en CABA)',
    phonePrefix: '+54 9 ',
    addressExample: 'Av. Corrientes 1234',
    taxIdLabel: 'CUIT',
    taxIdExample: '30-00000000-0',
    mapView: { lat: -34.6, lng: -58.44, zoom: 11 },
  },
  BO: {
    code: 'BO',
    name: 'Bolivia',
    currency: 'BOB',
    locale: 'es-BO',
    zoneLabel: { singular: 'Provincia', plural: 'Provincias', gender: 'f' },
    regionLabel: departamento,
    adminHierarchy: 'Departamento → Provincia → Municipio',
    phonePrefix: '+591 ',
    addressExample: 'Av. 16 de Julio 1490',
    taxIdLabel: 'NIT',
    taxIdExample: '1000000000',
    mapView: { lat: -16.5, lng: -68.13, zoom: 11 },
  },
  BR: {
    code: 'BR',
    name: 'Brasil',
    currency: 'BRL',
    locale: 'pt-BR',
    zoneLabel: municipio,
    regionLabel: estado,
    adminHierarchy: 'Estado → Municipio',
    phonePrefix: '+55 ',
    addressExample: 'Av. Paulista 1000',
    taxIdLabel: 'CNPJ',
    taxIdExample: '00.000.000/0000-00',
    mapView: { lat: -23.55, lng: -46.63, zoom: 10 },
  },
  CO: {
    code: 'CO',
    name: 'Colombia',
    currency: 'COP',
    locale: 'es-CO',
    zoneLabel: municipio,
    regionLabel: departamento,
    adminHierarchy: 'Departamento → Municipio',
    phonePrefix: '+57 ',
    addressExample: 'Carrera 7 # 71-21',
    taxIdLabel: 'NIT',
    taxIdExample: '900.000.000-0',
    mapView: { lat: 4.65, lng: -74.08, zoom: 11 },
  },
  CR: {
    code: 'CR',
    name: 'Costa Rica',
    currency: 'CRC',
    locale: 'es-CR',
    zoneLabel: canton,
    regionLabel: provincia,
    adminHierarchy: 'Provincia → Cantón → Distrito',
    phonePrefix: '+506 ',
    addressExample: 'Avenida Central, calle 5',
    taxIdLabel: 'Cédula jurídica',
    taxIdExample: '3-101-000000',
    mapView: { lat: 9.93, lng: -84.08, zoom: 11 },
  },
  CU: {
    code: 'CU',
    name: 'Cuba',
    currency: 'CUP',
    locale: 'es-CU',
    zoneLabel: municipio,
    regionLabel: provincia,
    adminHierarchy: 'Provincia → Municipio',
    phonePrefix: '+53 ',
    addressExample: 'Calle 23 No. 105, Vedado',
    taxIdLabel: 'NIT',
    taxIdExample: '00000000000',
    mapView: { lat: 23.11, lng: -82.37, zoom: 11 },
  },
  DO: {
    code: 'DO',
    name: 'República Dominicana',
    currency: 'DOP',
    locale: 'es-DO',
    zoneLabel: municipio,
    regionLabel: provincia,
    adminHierarchy: 'Provincia → Municipio',
    phonePrefix: '+1 809 ',
    addressExample: 'Av. Winston Churchill 95',
    taxIdLabel: 'RNC',
    taxIdExample: '1-01-00000-0',
    mapView: { lat: 18.48, lng: -69.93, zoom: 11 },
  },
  EC: {
    code: 'EC',
    name: 'Ecuador',
    currency: 'USD',
    locale: 'es-EC',
    zoneLabel: canton,
    regionLabel: provincia,
    adminHierarchy: 'Provincia → Cantón → Parroquia',
    phonePrefix: '+593 ',
    addressExample: 'Av. Amazonas N24-03',
    taxIdLabel: 'RUC',
    taxIdExample: '1790000000001',
    mapView: { lat: -0.18, lng: -78.48, zoom: 11 },
  },
  SV: {
    code: 'SV',
    name: 'El Salvador',
    currency: 'USD',
    locale: 'es-SV',
    // Desde 2024 los 262 municipios son distritos de 44 municipios nuevos: el lead se ubica en el distrito
    zoneLabel: distrito,
    regionLabel: departamento,
    adminHierarchy: 'Departamento → Municipio → Distrito',
    phonePrefix: '+503 ',
    addressExample: 'Paseo General Escalón 3700',
    taxIdLabel: 'NIT',
    taxIdExample: '0614-000000-000-0',
    mapView: { lat: 13.69, lng: -89.22, zoom: 11 },
  },
  GT: {
    code: 'GT',
    name: 'Guatemala',
    currency: 'GTQ',
    locale: 'es-GT',
    zoneLabel: municipio,
    regionLabel: departamento,
    adminHierarchy: 'Departamento → Municipio',
    phonePrefix: '+502 ',
    addressExample: '6a Avenida 10-50, zona 1',
    taxIdLabel: 'NIT',
    taxIdExample: '1234567-8',
    mapView: { lat: 14.62, lng: -90.52, zoom: 11 },
  },
  HN: {
    code: 'HN',
    name: 'Honduras',
    currency: 'HNL',
    locale: 'es-HN',
    zoneLabel: municipio,
    regionLabel: departamento,
    adminHierarchy: 'Departamento → Municipio',
    phonePrefix: '+504 ',
    addressExample: 'Bulevar Morazán 1500',
    taxIdLabel: 'RTN',
    taxIdExample: '08019000000000',
    mapView: { lat: 14.08, lng: -87.2, zoom: 11 },
  },
  MX: {
    code: 'MX',
    name: 'México',
    currency: 'MXN',
    locale: 'es-MX',
    zoneLabel: municipio,
    regionLabel: estado,
    adminHierarchy: 'Estado → Municipio (alcaldía en Ciudad de México)',
    phonePrefix: '+52 ',
    addressExample: 'Paseo de la Reforma 222',
    taxIdLabel: 'RFC',
    taxIdExample: 'AAA000000AA0',
    mapView: { lat: 19.43, lng: -99.13, zoom: 10 },
  },
  NI: {
    code: 'NI',
    name: 'Nicaragua',
    currency: 'NIO',
    locale: 'es-NI',
    zoneLabel: municipio,
    regionLabel: departamento,
    adminHierarchy: 'Departamento → Municipio',
    phonePrefix: '+505 ',
    addressExample: 'Carretera a Masaya km 4',
    taxIdLabel: 'RUC',
    taxIdExample: 'J0310000000000',
    mapView: { lat: 12.13, lng: -86.25, zoom: 11 },
  },
  PA: {
    code: 'PA',
    name: 'Panamá',
    currency: 'USD',
    locale: 'es-PA',
    zoneLabel: distrito,
    regionLabel: provincia,
    adminHierarchy: 'Provincia → Distrito → Corregimiento',
    phonePrefix: '+507 ',
    addressExample: 'Calle 50, edificio 10',
    taxIdLabel: 'RUC',
    taxIdExample: '155000000-2-2020',
    mapView: { lat: 8.98, lng: -79.52, zoom: 11 },
  },
  PY: {
    code: 'PY',
    name: 'Paraguay',
    currency: 'PYG',
    locale: 'es-PY',
    zoneLabel: distrito,
    regionLabel: departamento,
    adminHierarchy: 'Departamento → Distrito',
    phonePrefix: '+595 ',
    addressExample: 'Av. Mariscal López 1234',
    taxIdLabel: 'RUC',
    taxIdExample: '80000000-0',
    mapView: { lat: -25.29, lng: -57.6, zoom: 11 },
  },
  UY: {
    code: 'UY',
    name: 'Uruguay',
    currency: 'UYU',
    locale: 'es-UY',
    zoneLabel: municipio,
    regionLabel: departamento,
    adminHierarchy: 'Departamento → Municipio',
    phonePrefix: '+598 ',
    addressExample: 'Av. 18 de Julio 1234',
    taxIdLabel: 'RUT',
    taxIdExample: '210000000019',
    mapView: { lat: -34.88, lng: -56.17, zoom: 11 },
  },
  VE: {
    code: 'VE',
    name: 'Venezuela',
    currency: 'VES',
    locale: 'es-VE',
    zoneLabel: municipio,
    regionLabel: estado,
    adminHierarchy: 'Estado → Municipio → Parroquia',
    phonePrefix: '+58 ',
    addressExample: 'Av. Francisco de Miranda 1000',
    taxIdLabel: 'RIF',
    taxIdExample: 'J-00000000-0',
    mapView: { lat: 10.49, lng: -66.88, zoom: 11 },
  },
};

export const COUNTRY_CODES = Object.keys(COUNTRIES) as CountryCode[];

export const isCountryCode = (value: unknown): value is CountryCode =>
  typeof value === 'string' && (COUNTRY_CODES as string[]).includes(value);

export const countryOf = (code: CountryCode): CountryConfig => COUNTRIES[code];

// Etiqueta de zona para un conjunto de países: "Comuna" si hay uno solo, "Zona" si se mezclan
export function zoneLabelFor(codes: CountryCode[], form: 'singular' | 'plural' = 'singular'): string {
  const labels = new Set(codes.map((code) => COUNTRIES[code].zoneLabel[form]));
  if (labels.size === 1) return [...labels][0];
  return form === 'singular' ? 'Zona' : 'Zonas';
}

// Zona con artículo en minúsculas: "la comuna", "el distrito", "una zona", "un distrito"
export function zoneWithArticle(codes: CountryCode[], article: 'definite' | 'indefinite' = 'definite'): string {
  const label = zoneLabelFor(codes);
  const genders = new Set(codes.map((code) => COUNTRIES[code].zoneLabel.gender));
  const masculine = label !== 'Zona' && genders.size === 1 && genders.has('m');
  const word = article === 'definite' ? (masculine ? 'el' : 'la') : masculine ? 'un' : 'una';
  return `${word} ${label.toLowerCase()}`;
}
