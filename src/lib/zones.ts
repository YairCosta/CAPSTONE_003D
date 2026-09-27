// Zonas agrupadas por región y provincia: con 345 comunas en Chile y 1.893 distritos en Perú, una
// lista plana no sirve. Funciones puras: se prueban en npm run test:supabase.

import type { TerritoryMetric } from '../types/crm.ts';

export type ZoneInfo = Pick<TerritoryMetric, 'territoryId' | 'territoryName' | 'countryCode' | 'regionCode' | 'regionName' | 'provinceName' | 'regionOrder'>;

export interface ZoneRegion {
  code: string;
  name: string;
  order: number;
}

export interface ZoneGroup<T extends ZoneInfo> {
  label: string;
  zones: T[];
}

const OTRAS: ZoneRegion = { code: '', name: 'Otras zonas', order: Number.MAX_SAFE_INTEGER };
const regionOf = (zone: ZoneInfo): ZoneRegion =>
  zone.regionCode ? { code: zone.regionCode, name: zone.regionName ?? zone.regionCode, order: zone.regionOrder ?? 0 } : OTRAS;
const byName = (a: ZoneInfo, b: ZoneInfo) => a.territoryName.localeCompare(b.territoryName, 'es');

/** Regiones de un conjunto de zonas, en su orden (Chile de norte a sur, Perú alfabético). */
export function regionsOf(zones: ZoneInfo[]): ZoneRegion[] {
  const regiones = new Map<string, ZoneRegion>();
  for (const zone of zones) {
    const region = regionOf(zone);
    if (!regiones.has(region.code)) regiones.set(region.code, region);
  }
  return [...regiones.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'es'));
}

/**
 * Grupos para un selector de zona. Sin región elegida: todas las zonas, agrupadas por región.
 * Con región: solo las suyas, agrupadas por provincia si tiene más de una (así se distinguen el
 * Miraflores de Lima y el de Yauyos).
 */
export function groupZonesForSelect<T extends ZoneInfo>(zones: T[], regionCode?: string): ZoneGroup<T>[] {
  if (!regionCode) {
    return regionsOf(zones).map((region) => ({
      label: region.name,
      zones: zones.filter((z) => regionOf(z).code === region.code).sort(byName),
    }));
  }
  const propias = zones.filter((z) => regionOf(z).code === regionCode);
  const provincias = [...new Set(propias.map((z) => z.provinceName ?? ''))].sort((a, b) => a.localeCompare(b, 'es'));
  if (provincias.length <= 1) {
    const region = propias[0] ? regionOf(propias[0]) : OTRAS;
    return [{ label: region.name, zones: propias.sort(byName) }];
  }
  return provincias.map((provincia) => ({
    label: provincia ? `Provincia de ${provincia}` : 'Sin provincia',
    zones: propias.filter((z) => (z.provinceName ?? '') === provincia).sort(byName),
  }));
}

export const normalizeZoneName = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Busca una zona por su nombre (sin importar tildes ni mayúsculas), opcionalmente dentro de una
 * región. Devuelve todas las coincidencias: si hay más de una, quien llama debe pedir la región.
 */
export function findZonesByName<T extends ZoneInfo>(zones: T[], name: string, regionName?: string): T[] {
  const buscado = normalizeZoneName(name);
  if (!buscado) return [];
  const region = regionName ? normalizeZoneName(regionName) : '';
  const coincidencias = zones.filter(
    (z) =>
      normalizeZoneName(z.territoryName) === buscado &&
      (!region || normalizeZoneName(z.regionName ?? '').includes(region) || normalizeZoneName(z.provinceName ?? '') === region)
  );
  // "Miraflores, Lima": los dos Miraflores están en el departamento de Lima, pero solo uno en la
  // provincia de Lima. Si lo indicado calza exacto con la provincia, esa gana.
  const porProvincia = region ? coincidencias.filter((z) => normalizeZoneName(z.provinceName ?? '') === region) : [];
  return porProvincia.length > 0 && porProvincia.length < coincidencias.length ? porProvincia : coincidencias;
}
