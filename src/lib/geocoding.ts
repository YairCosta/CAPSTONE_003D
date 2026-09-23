import type { GeocodingStatus } from '../types/crm';
import { mockTerritories } from '../data/mockGeoData';
import { COUNTRIES } from '../data/countries';

// Ubicación sin API externa: el usuario elige la zona (comuna, distrito…) y el lead se ubica dentro de ella.

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
export function zoneCenter(territoryId: string): { latitude: number; longitude: number } | null {
  const territory = mockTerritories.find((t) => t.territoryId === territoryId);
  if (!territory) return null;
  const ring: [number, number][] = territory.geojsonPolygon.coordinates[0][0].slice(0, -1);
  const longitude = ring.reduce((acc, [lng]) => acc + lng, 0) / ring.length;
  const latitude = ring.reduce((acc, [, lat]) => acc + lat, 0) / ring.length;
  return { latitude, longitude };
}

// Ubica el lead dentro de la zona elegida. La misma dirección siempre cae en el mismo punto.
export function locateInCommune(territoryId: string, rawAddress: string): GeocodeOutcome {
  const territory = mockTerritories.find((t) => t.territoryId === territoryId);
  const center = zoneCenter(territoryId);

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
  const hash = hashString(`${territoryId}|${rawAddress.trim().toLowerCase()}`);
  const jitterLat = ((hash % 1000) / 1000 - 0.5) * spread;
  const jitterLng = ((Math.floor(hash / 1000) % 1000) / 1000 - 0.5) * spread;

  return {
    geocodingStatus: 'success',
    latitude: center.latitude + jitterLat,
    longitude: center.longitude + jitterLng,
    assignedTerritoryId: territoryId,
    normalizedAddress: `${rawAddress.trim()}, ${territory.territoryName}, ${COUNTRIES[territory.countryCode].name}`,
  };
}
