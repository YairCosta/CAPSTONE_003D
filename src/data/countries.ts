// Registro de países soportados por la plataforma (plan Internacional).
//
// Cada país define cómo se llama su unidad territorial de trabajo (la "zona" del mapa y del ranking):
//   · Chile:     Región → Provincia → Comuna        (zona = Comuna, unidad municipal)
//   · Perú:      Departamento → Provincia → Distrito (zona = Distrito, unidad municipal; ej. Miraflores, San Isidro)
//   · Argentina: Provincia → Departamento / Partido  (zona sugerida = Provincia; en CABA existen 15 comunas)
//
// Para agregar un país (ej. Argentina):
//   1. Sumar su código a CountryCode (ej. 'AR') y su moneda a CurrencyCode si es nueva (ej. 'ARS').
//   2. Agregar su configuración en COUNTRIES (zoneLabel: { singular: 'Provincia', plural: 'Provincias', gender: 'f' }, etc.).
//   3. Agregar la moneda y su tasa en src/lib/currency.ts.
//   4. Cargar sus zonas (polígonos) con country_code 'AR' en zone_catalog (se copian solas a cada CRM que
//      habilite el país) y, para la demo, en mockTerritories.
//   5. Habilitarlo en la migración (tabla countries) y activarlo por empresa desde Administración.

export type CountryCode = 'CL' | 'PE';
export type CurrencyCode = 'CLP' | 'PEN' | 'USD';

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
    zoneLabel: { singular: 'Distrito', plural: 'Distritos', gender: 'm' },
    regionLabel: { singular: 'Departamento', plural: 'Departamentos' },
    adminHierarchy: 'Departamento → Provincia → Distrito',
    phonePrefix: '+51 ',
    addressExample: 'Av. José Larco 1150',
    taxIdLabel: 'RUC',
    taxIdExample: '20100000000',
    mapView: { lat: -12.11, lng: -77.0, zoom: 12 },
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
