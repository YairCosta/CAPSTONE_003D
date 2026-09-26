import type { GeocodingStatus, TerritoryMetric } from '../types/crm.ts';
import { COUNTRIES } from '../data/countries.ts';

// Ubicación sin API externa: el usuario elige la zona (comuna, distrito…) y el lead se ubica dentro de ella.
// La zona llega completa (con su polígono): en la demo viene de los datos de ejemplo y con Supabase,
// de la tabla territories del CRM.
export type LocatableZone = Pick<TerritoryMetric, 'territoryId' | 'territoryName' | 'countryCode' | 'geojsonPolygon'>;

export interface GeocodeOutcome {
  geocodingStatus: GeocodingStatus;
  latitude?: number;
  longitude?: number;
  assignedTerritoryId?: string;
  normalizedAddress?: string;
}

function hashString(value: string): number {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return Math.abs(hash);
}

// Centro aproximado (promedio de vértices) del polígono de una zona
export function zoneCenter(territory: LocatableZone | undefined): { latitude: number; longitude: number } | null {
  if (!territory) return null;
  // Polygon: [anillo, ...]; MultiPolygon: [[anillo, ...], ...]. Se usa el primer anillo exterior.
  const coords = territory.geojsonPolygon.coordinates;
  const firstRing = territory.geojsonPolygon.type === 'Polygon' ? coords[0] : coords[0]?.[0];
  if (!Array.isArray(firstRing) || firstRing.length < 2) return null;
  const ring: [number, number][] = firstRing.slice(0, -1);
  const longitude = ring.reduce((acc, [lng]) => acc + lng, 0) / ring.length;
  const latitude = ring.reduce((acc, [, lat]) => acc + lat, 0) / ring.length;
  return { latitude, longitude };
}

// Ubica el lead dentro de la zona elegida. La misma dirección siempre cae en el mismo punto.
export function locateInCommune(territory: LocatableZone | undefined, rawAddress: string): GeocodeOutcome {
  const center = zoneCenter(territory);

  if (!territory || !center) {
    return {
      geocodingStatus: 'manual_review',
      latitude: undefined,
      longitude: undefined,
      assignedTerritoryId: undefined,
      normalizedAddress: undefined,
    };
  }

  const spread = 0.008;
  const hash = hashString(`${territory.territoryId}|${rawAddress.trim().toLowerCase()}`);
  const jitterLat = ((hash % 1000) / 1000 - 0.5) * spread;
  const jitterLng = ((Math.floor(hash / 1000) % 1000) / 1000 - 0.5) * spread;

  return {
    geocodingStatus: 'success',
    latitude: center.latitude + jitterLat,
    longitude: center.longitude + jitterLng,
    assignedTerritoryId: territory.territoryId,
    normalizedAddress: `${rawAddress.trim()}, ${territory.territoryName}, ${COUNTRIES[territory.countryCode].name}`,
  };
}
