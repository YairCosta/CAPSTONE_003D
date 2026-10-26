import type { GeocodingStatus, TerritoryMetric } from '../types/crm.ts';
import { COUNTRIES } from '../data/countries.ts';

// Ubicación por zona: el usuario elige la zona (comuna, distrito…) y el lead queda asignado a ella.
// Revela no calcula ni guarda coordenadas: para saber qué se vende y dónde basta la zona, y la
// coordenada de una persona natural es un dato que no hace falta tener (minimización, Ley 21.719;
// la base lo impide desde la migración 0019).
// La zona llega completa (con su polígono): en la demo viene de los datos de ejemplo y con Supabase,
// de la tabla territories del CRM.
export type LocatableZone = Pick<TerritoryMetric, 'territoryId' | 'territoryName' | 'countryCode' | 'geojsonPolygon'>;

export interface GeocodeOutcome {
  geocodingStatus: GeocodingStatus;
  assignedTerritoryId?: string;
  normalizedAddress?: string;
}

/**
 * Centro aproximado de una zona, donde va su etiqueta en el mapa: el promedio de los vértices del
 * contorno de su parte más grande (una comuna con islas no debe quedar rotulada sobre una isla).
 */
export function zoneCenter(territory: LocatableZone | undefined): { latitude: number; longitude: number } | null {
  if (!territory) return null;
  // Polygon: [anillo, ...]; MultiPolygon: [[anillo, ...], ...]. Se usa el anillo exterior de cada parte.
  const coords = territory.geojsonPolygon.coordinates;
  const exteriores: [number, number][][] = (territory.geojsonPolygon.type === 'Polygon' ? [coords[0]] : coords.map((p) => p?.[0])).filter(
    (anillo): anillo is [number, number][] => Array.isArray(anillo) && anillo.length >= 3
  );
  if (exteriores.length === 0) return null;
  const extension = (anillo: [number, number][]) => {
    const lngs = anillo.map(([lng]) => lng);
    const lats = anillo.map(([, lat]) => lat);
    return (Math.max(...lngs) - Math.min(...lngs)) * (Math.max(...lats) - Math.min(...lats));
  };
  const mayor = exteriores.reduce((a, b) => (extension(b) > extension(a) ? b : a));
  const ring: [number, number][] = mayor.slice(0, -1);
  const longitude = ring.reduce((acc, [lng]) => acc + lng, 0) / ring.length;
  const latitude = ring.reduce((acc, [, lat]) => acc + lat, 0) / ring.length;
  return { latitude, longitude };
}

/** Asigna el lead a la zona elegida. Sin zona, queda para revisión en Gerencia → Leads sin zona. */
export function locateInCommune(territory: LocatableZone | undefined, rawAddress: string): GeocodeOutcome {
  if (!territory) {
    return { geocodingStatus: 'manual_review', assignedTerritoryId: undefined, normalizedAddress: undefined };
  }
  return {
    geocodingStatus: 'success',
    assignedTerritoryId: territory.territoryId,
    normalizedAddress: `${rawAddress.trim()}, ${territory.territoryName}, ${COUNTRIES[territory.countryCode].name}`,
  };
}
