// Métricas geográficas compartidas por los paneles de KPI.

import type { Lead, TerritoryMetric } from '../types/crm.ts';
import type { CountryCode } from '../data/countries.ts';

// Distribución porcentual de leads por territorio (simulación de la función PostGIS).
// El porcentaje se calcula dentro del país de cada zona: los países no se mezclan en el denominador.
export const computeTerritoryMetrics = (source: Lead[], territories: TerritoryMetric[]): TerritoryMetric[] => {
  const totalsByCountry = new Map<CountryCode, number>();
  for (const lead of source) totalsByCountry.set(lead.countryCode, (totalsByCountry.get(lead.countryCode) ?? 0) + 1);

  return territories
    .map((t) => {
      const totalLeads = totalsByCountry.get(t.countryCode) ?? 0;
      const count = source.filter((l) => l.assignedTerritoryId === t.territoryId && l.countryCode === t.countryCode).length;
      const percentage = totalLeads > 0 ? Number(((count / totalLeads) * 100).toFixed(2)) : 0;
      return { ...t, leadCount: count, totalCompanyLeads: totalLeads, percentage };
    })
    .sort((a, b) => b.leadCount - a.leadCount);
};

// ------------------------------------------------------------------ resultados por zona
// Cómo se mide el rendimiento de una zona: por dinero ganado o por cantidad de negocios cerrados.
// Lo eligen los botones "Colorear por" del mapa, y el ranking de zonas usa el mismo criterio.
export type ZoneMetric = 'money' | 'deals';

export interface ZoneResult {
  money: number; // suma de lo ganado, en la moneda que entregue `amountOf`
  deals: number; // cantidad de leads ganados
}

// Solo cuentan los leads GANADOS: es lo que la zona ya produjo, no lo que podría producir.
// `amountOf` permite sumar ya convertido a la moneda de la vista (los leads pueden venir en monedas distintas).
export function computeZoneResults(
  leads: Lead[],
  territories: Pick<TerritoryMetric, 'territoryId'>[],
  amountOf: (lead: Lead) => number = (lead) => lead.estimatedDealValue || 0
): Map<string, ZoneResult> {
  const results = new Map<string, ZoneResult>(territories.map((t) => [t.territoryId, { money: 0, deals: 0 }]));
  for (const lead of leads) {
    if (lead.commercialStatus !== 'won' || !lead.assignedTerritoryId) continue;
    const result = results.get(lead.assignedTerritoryId);
    if (!result) continue;
    result.money += amountOf(lead);
    result.deals += 1;
  }
  return results;
}

// Valor con el que se ordena una zona según la métrica elegida. El dinero se entrega en la moneda
// local: quien compare zonas de países distintos debe convertirlo antes (ver currency.ts).
export const zoneResultValue = (result: ZoneResult | undefined, metric: ZoneMetric): number =>
  result ? (metric === 'money' ? result.money : result.deals) : 0;
