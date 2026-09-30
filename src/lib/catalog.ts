// Catálogo de productos y servicios: valor de los leads y métricas de venta.

import type { CatalogItem, CatalogItemType, CommercialStatus, Lead, LeadItem } from '../types/crm.ts';
import { convert, currencyOfCountry, leadCurrency, roundForCurrency, summarizeMoney, type MoneySummary, type Rates } from './currency.ts';
import type { CurrencyCode } from '../data/countries.ts';
import type { CountryCode } from '../data/countries.ts';

export const ITEM_TYPE_LABEL: Record<CatalogItemType, { singular: string; plural: string }> = {
  product: { singular: 'Producto', plural: 'Productos' },
  service: { singular: 'Servicio', plural: 'Servicios' },
};

export const itemsSubtotal = (items: LeadItem[] = []) =>
  items.reduce((acc, item) => acc + (item.quantity || 0) * (item.unitPrice || 0), 0);

// Un valor es manual si se editó a mano o si el lead no tiene productos/servicios
export const isManualValue = (lead: Pick<Lead, 'items' | 'valueSource'>) =>
  lead.valueSource === 'manual' || !lead.items?.length;

// Con ítems y valor no manual, el valor estimado es siempre la suma de los ítems
export function applyLeadValue<T extends Pick<Lead, 'items' | 'valueSource' | 'estimatedDealValue'>>(lead: T): T {
  const items = lead.items ?? [];
  if (items.length === 0) return { ...lead, items: [], valueSource: 'manual' };
  if (lead.valueSource === 'manual') return { ...lead, items };
  return { ...lead, items, valueSource: 'items', estimatedDealValue: itemsSubtotal(items) };
}

// Fila en edición: el ítem puede estar sin elegir todavía
export interface DraftLeadItem {
  itemId: string;
  quantity: string;
  unitPrice: string;
}

export const toDraftItems = (items: LeadItem[] = []): DraftLeadItem[] =>
  items.map((i) => ({ itemId: i.itemId, quantity: String(i.quantity), unitPrice: String(i.unitPrice) }));

// Filas completas convertidas a ítems del lead
export const fromDraftItems = (drafts: DraftLeadItem[]): LeadItem[] =>
  drafts
    .filter((d) => d.itemId && Number(d.quantity) >= 1)
    .map((d) => ({ itemId: d.itemId, quantity: Math.floor(Number(d.quantity)), unitPrice: Math.max(0, Number(d.unitPrice) || 0) }));

export const priceFor = (item: CatalogItem, country: CountryCode) => item.prices[country];

// ------------------------------------------------------------------ métricas de venta
export type SalesScope = 'won' | 'open' | 'all';

export const isOpenStatus = (status: CommercialStatus) => status !== 'won' && status !== 'lost';

export const matchesScope = (status: CommercialStatus, scope: SalesScope) =>
  scope === 'all' ? status !== 'lost' : scope === 'won' ? status === 'won' : isOpenStatus(status);

export interface ItemSalesMetric {
  item: CatalogItem;
  leads: number; // leads que incluyen el ítem (cualquier etapa)
  wonLeads: number;
  lostLeads: number;
  conversion: number | null; // ganados / (ganados + perdidos)
  unitsWon: number;
  revenueWon: MoneySummary;
  pipelineOpen: MoneySummary;
}

export function computeItemSales(leads: Lead[], catalog: CatalogItem[]): ItemSalesMetric[] {
  return catalog.map((item) => {
    const won: { amount: number; currency: CurrencyCode }[] = [];
    const open: typeof won = [];
    let leadsCount = 0;
    let wonLeads = 0;
    let lostLeads = 0;
    let unitsWon = 0;

    for (const lead of leads) {
      const lines = (lead.items ?? []).filter((line) => line.itemId === item.id);
      if (lines.length === 0) continue;
      leadsCount += 1;
      // Los precios de los ítems están en la moneda del lead
      const currency = leadCurrency(lead);
      const amount = itemsSubtotal(lines);
      if (lead.commercialStatus === 'won') {
        wonLeads += 1;
        unitsWon += lines.reduce((acc, line) => acc + line.quantity, 0);
        won.push({ amount, currency });
      } else if (lead.commercialStatus === 'lost') {
        lostLeads += 1;
      } else {
        open.push({ amount, currency });
      }
    }

    const closed = wonLeads + lostLeads;
    return {
      item,
      leads: leadsCount,
      wonLeads,
      lostLeads,
      conversion: closed > 0 ? Math.round((wonLeads / closed) * 100) : null,
      unitsWon,
      revenueWon: summarizeMoney(won),
      pipelineOpen: summarizeMoney(open),
    };
  });
}

// Leads que incluyen alguno de los ítems indicados, dentro del alcance (ganados, en curso o todos)
export const leadsWithItems = (leads: Lead[], itemIds: Set<string>, scope: SalesScope) =>
  leads.filter(
    (lead) => matchesScope(lead.commercialStatus, scope) && (lead.items ?? []).some((line) => itemIds.has(line.itemId))
  );

/**
 * Precio de referencia para un país que todavía no tiene precio en el catálogo: el primero que sí lo
 * tiene (en el orden de los países del CRM, que parte por el país base), convertido con la tasa del
 * día. Es solo una sugerencia para mostrar en gris: nunca llena el campo ni se guarda.
 */
export function suggestedCatalogPrice(
  prices: Partial<Record<CountryCode, string | number>>,
  countries: CountryCode[],
  target: CountryCode,
  rates: Rates
): { amount: number; from: CountryCode } | null {
  const propio = prices[target];
  if (propio !== undefined && propio !== '') return null;
  for (const from of countries) {
    if (from === target) continue;
    const valor = Number(prices[from]);
    if (prices[from] === undefined || prices[from] === '' || !Number.isFinite(valor) || valor <= 0) continue;
    const moneda = currencyOfCountry(target);
    return { amount: roundForCurrency(convert(valor, currencyOfCountry(from), moneda, rates), moneda), from };
  }
  return null;
}
