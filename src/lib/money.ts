// Moneda de la vista para toda la interfaz. Cada componente pide `useMoney()` y obtiene los montos
// ya convertidos y formateados en la moneda elegida, con las tasas vigentes. Así ninguna pantalla
// decide por su cuenta cómo convertir, y cambiar de moneda cambia todo el CRM de una vez.

import { createContext, useContext } from 'react';
import type { CountryCode, CurrencyCode } from '../data/countries.ts';
import {
  FALLBACK_RATES,
  convert,
  formatMoney,
  leadCurrency,
  summaryIn,
  type MoneySummary,
  type Rates,
} from './currency.ts';

export interface RatesInfo {
  live: boolean; // false = tasa de respaldo (sin conexión a las fuentes)
  sources: string[];
  updatedAt: string | null;
}

type LeadMoney = { estimatedDealValue: number; countryCode: CountryCode; currency?: CurrencyCode };
type Fmt = { compact?: boolean };

export interface MoneyApi {
  display: CurrencyCode;
  rates: Rates;
  info: RatesInfo;
  toDisplay: (amount: number, from: CurrencyCode) => number;
  fmt: (amount: number, from: CurrencyCode, options?: Fmt) => string;
  fmtLead: (lead: LeadMoney, options?: Fmt) => string;
  // El lead se negoció en otra moneda que la de la vista: sirve para mostrar el monto original al lado
  isForeign: (lead: LeadMoney) => boolean;
  sumLeads: (leads: LeadMoney[]) => number;
  fmtLeads: (leads: LeadMoney[], options?: Fmt) => string;
  fmtSummary: (summary: MoneySummary, options?: Fmt) => string;
  summaryTotal: (summary: MoneySummary) => number;
}

export function buildMoneyApi(display: CurrencyCode, rates: Rates, info: RatesInfo): MoneyApi {
  const toDisplay = (amount: number, from: CurrencyCode) => convert(amount || 0, from, display, rates);
  const fmt = (amount: number, from: CurrencyCode, options: Fmt = {}) => formatMoney(toDisplay(amount, from), display, options);
  const sumLeads = (leads: LeadMoney[]) => leads.reduce((acc, l) => acc + toDisplay(l.estimatedDealValue, leadCurrency(l)), 0);
  const summaryTotal = (summary: MoneySummary) => summaryIn(summary, display, rates);
  return {
    display,
    rates,
    info,
    toDisplay,
    fmt,
    fmtLead: (lead, options) => fmt(lead.estimatedDealValue, leadCurrency(lead), options),
    isForeign: (lead) => leadCurrency(lead) !== display,
    sumLeads,
    fmtLeads: (leads, options = {}) => formatMoney(sumLeads(leads), display, options),
    fmtSummary: (summary, options = {}) => formatMoney(summaryTotal(summary), display, options),
    summaryTotal,
  };
}

// Valor por defecto (pruebas, o si algo se renderiza fuera del proveedor): CLP con tasa de respaldo
export const MoneyContext = createContext<MoneyApi>(
  buildMoneyApi('CLP', FALLBACK_RATES, { live: false, sources: ['tasa de respaldo'], updatedAt: null })
);

export const useMoney = () => useContext(MoneyContext);

// Tasas desde el servidor. Si falla, se sigue con la de respaldo: el CRM nunca se queda sin mostrar montos.
export async function fetchRates(): Promise<{ rates: Rates; info: RatesInfo }> {
  try {
    const response = await fetch('/api/rates');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = (await response.json()) as { rates?: Record<string, number>; live?: boolean; sources?: string[]; updatedAt?: string };
    const rates: Rates = { ...FALLBACK_RATES };
    for (const code of Object.keys(rates) as CurrencyCode[]) {
      const value = Number(data.rates?.[code]);
      if (Number.isFinite(value) && value > 0) rates[code] = value;
    }
    rates.USD = 1;
    return { rates, info: { live: data.live === true, sources: data.sources ?? [], updatedAt: data.updatedAt ?? null } };
  } catch {
    return { rates: FALLBACK_RATES, info: { live: false, sources: ['tasa de respaldo'], updatedAt: null } };
  }
}
