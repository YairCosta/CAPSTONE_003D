// Monedas del CRM.
//
// Dos conceptos distintos que no hay que mezclar:
//   - MONEDA DEL LEAD: en la que se negoció. Se elige al crear el lead entre las monedas de los países
//     habilitados del CRM más el dólar, y el monto se GUARDA en esa moneda, sin convertir nunca.
//   - MONEDA DE LA VISTA: con la que se MUESTRA todo el CRM (hoy CLP o USD). Convertir es solo para
//     mostrar y sumar; el dato guardado no cambia.
// Las tasas vienen de /api/rates (Banco Central de Chile + open.er-api) y hay una de respaldo.

import { COUNTRIES, type CountryCode, type CurrencyCode } from '../data/countries.ts';

interface CurrencyConfig {
  symbol: string;
  locale: string;
  name: string;
  spaceAfterSymbol: boolean;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  CLP: { symbol: '$', locale: 'es-CL', name: 'Peso chileno', spaceAfterSymbol: false },
  PEN: { symbol: 'S/', locale: 'es-PE', name: 'Sol peruano', spaceAfterSymbol: true },
  USD: { symbol: 'US$', locale: 'en-US', name: 'Dólar estadounidense', spaceAfterSymbol: false },
};

// Unidades de cada moneda por 1 USD
export type Rates = Record<CurrencyCode, number>;

// Respaldo si /api/rates no responde. Revisado el 21-09-2026 (dólar observado 958,42; sol 3,38).
export const FALLBACK_RATES: Rates = { USD: 1, CLP: 958, PEN: 3.38 };

// Monedas en las que se puede VER el CRM. Agregar una aquí basta para ofrecerla en el selector.
export const DISPLAY_CURRENCIES: CurrencyCode[] = ['CLP', 'USD'];

// El dólar se ofrece siempre como moneda de lead: es habitual cotizar en US$ en ventas entre empresas
export const ALWAYS_AVAILABLE_LEAD_CURRENCY: CurrencyCode = 'USD';

export const currencyOfCountry = (code: CountryCode): CurrencyCode => COUNTRIES[code].currency;

// Moneda en que se negoció el lead. Los leads antiguos no la tenían: se asume la de su país.
export const leadCurrency = (lead: { currency?: CurrencyCode; countryCode: CountryCode }): CurrencyCode =>
  lead.currency ?? currencyOfCountry(lead.countryCode);

// Monedas disponibles para los leads de un CRM: la de cada país habilitado, más el dólar.
// Con el plan Internacional, cada país que se agrega suma su moneda.
export function leadCurrenciesFor(countries: CountryCode[]): CurrencyCode[] {
  const lista = countries.map(currencyOfCountry);
  if (!lista.includes(ALWAYS_AVAILABLE_LEAD_CURRENCY)) lista.push(ALWAYS_AVAILABLE_LEAD_CURRENCY);
  return Array.from(new Set(lista));
}

export const isAllowedLeadCurrency = (currency: unknown, countries: CountryCode[]): currency is CurrencyCode =>
  typeof currency === 'string' && leadCurrenciesFor(countries).includes(currency as CurrencyCode);

export function convert(amount: number, from: CurrencyCode, to: CurrencyCode, rates: Rates = FALLBACK_RATES): number {
  if (from === to) return amount;
  return (amount / rates[from]) * rates[to];
}

// Redondeo propio de cada moneda: el peso chileno no usa decimales, el dólar y el sol usan dos
export const roundForCurrency = (amount: number, currency: CurrencyCode): number =>
  currency === 'CLP' ? Math.round(amount) : Math.round(amount * 100) / 100;

export function formatMoney(amount: number, currency: CurrencyCode, options: { compact?: boolean } = {}): string {
  const config = CURRENCIES[currency];
  const separator = config.spaceAfterSymbol ? ' ' : '';
  if (options.compact && Math.abs(amount) >= 1000) {
    const thousands = amount / 1000;
    const digits = Math.abs(thousands) >= 100 ? 0 : 1;
    return `${config.symbol}${separator}${Number(thousands.toFixed(digits)).toLocaleString(config.locale)}k`;
  }
  return `${config.symbol}${separator}${Math.round(amount).toLocaleString(config.locale)}`;
}

// Monto del lead en SU moneda (la negociada), sin convertir
export const formatLeadMoney = (
  lead: { estimatedDealValue: number; countryCode: CountryCode; currency?: CurrencyCode },
  compact = false
) => formatMoney(lead.estimatedDealValue || 0, leadCurrency(lead), { compact });

// Montos agrupados por moneda: la suma real, antes de cualquier conversión
export interface MoneySummary {
  byCurrency: Partial<Record<CurrencyCode, number>>;
  currencies: CurrencyCode[];
}

export function summarizeMoney(items: { amount: number; currency: CurrencyCode }[]): MoneySummary {
  const byCurrency: Partial<Record<CurrencyCode, number>> = {};
  for (const item of items) byCurrency[item.currency] = (byCurrency[item.currency] ?? 0) + (item.amount || 0);
  return { byCurrency, currencies: Object.keys(byCurrency) as CurrencyCode[] };
}

export const summarizeLeads = (leads: { estimatedDealValue: number; countryCode: CountryCode; currency?: CurrencyCode }[]) =>
  summarizeMoney(leads.map((l) => ({ amount: l.estimatedDealValue, currency: leadCurrency(l) })));

// Total de un resumen expresado en la moneda de la vista
export const summaryIn = (summary: MoneySummary, display: CurrencyCode, rates: Rates = FALLBACK_RATES): number =>
  summary.currencies.reduce((acc, c) => acc + convert(summary.byCurrency[c] ?? 0, c, display, rates), 0);

// Desglose por moneda original: "$1.033.000 · S/ 362,000"
export const formatBreakdown = (summary: MoneySummary, options: { compact?: boolean } = {}) =>
  summary.currencies.map((c) => formatMoney(summary.byCurrency[c] ?? 0, c, options)).join(' · ');

// "1 US$ = 958 CLP · 3,38 PEN": se muestra junto a los montos convertidos
export function ratesNote(rates: Rates, currencies: CurrencyCode[] = ['CLP', 'PEN']): string {
  const partes = currencies
    .filter((c) => c !== 'USD')
    .map((c) => `${rates[c].toLocaleString('es-CL', { maximumFractionDigits: 2 })} ${c}`);
  return `1 US$ = ${partes.join(' = ')}`;
}
