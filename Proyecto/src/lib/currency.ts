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
  /** Decimales en que se redondea un monto (el peso chileno y el guaraní no usan) */
  decimals: 0 | 2;
}

// Varios países usan "$": salvo el peso chileno, cada uno lleva su prefijo para no confundirse en
// un CRM con leads de varios países (AR$ 1.000 no es lo mismo que MX$ 1.000).
export const CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  CLP: { symbol: '$', locale: 'es-CL', name: 'Peso chileno', spaceAfterSymbol: false, decimals: 0 },
  PEN: { symbol: 'S/', locale: 'es-PE', name: 'Sol peruano', spaceAfterSymbol: true, decimals: 2 },
  USD: { symbol: 'US$', locale: 'en-US', name: 'Dólar estadounidense', spaceAfterSymbol: false, decimals: 2 },
  ARS: { symbol: 'AR$', locale: 'es-AR', name: 'Peso argentino', spaceAfterSymbol: false, decimals: 2 },
  BOB: { symbol: 'Bs', locale: 'es-BO', name: 'Boliviano', spaceAfterSymbol: true, decimals: 2 },
  BRL: { symbol: 'R$', locale: 'pt-BR', name: 'Real brasileño', spaceAfterSymbol: true, decimals: 2 },
  COP: { symbol: 'COL$', locale: 'es-CO', name: 'Peso colombiano', spaceAfterSymbol: false, decimals: 2 },
  CRC: { symbol: '₡', locale: 'es-CR', name: 'Colón costarricense', spaceAfterSymbol: false, decimals: 2 },
  CUP: { symbol: 'CUP', locale: 'es-CU', name: 'Peso cubano', spaceAfterSymbol: true, decimals: 2 },
  DOP: { symbol: 'RD$', locale: 'es-DO', name: 'Peso dominicano', spaceAfterSymbol: false, decimals: 2 },
  GTQ: { symbol: 'Q', locale: 'es-GT', name: 'Quetzal', spaceAfterSymbol: true, decimals: 2 },
  HNL: { symbol: 'L', locale: 'es-HN', name: 'Lempira', spaceAfterSymbol: true, decimals: 2 },
  MXN: { symbol: 'MX$', locale: 'es-MX', name: 'Peso mexicano', spaceAfterSymbol: false, decimals: 2 },
  NIO: { symbol: 'C$', locale: 'es-NI', name: 'Córdoba', spaceAfterSymbol: true, decimals: 2 },
  PYG: { symbol: '₲', locale: 'es-PY', name: 'Guaraní', spaceAfterSymbol: true, decimals: 0 },
  UYU: { symbol: '$U', locale: 'es-UY', name: 'Peso uruguayo', spaceAfterSymbol: true, decimals: 2 },
  VES: { symbol: 'Bs.D', locale: 'es-VE', name: 'Bolívar digital', spaceAfterSymbol: true, decimals: 2 },
};

// Unidades de cada moneda por 1 USD
export type Rates = Record<CurrencyCode, number>;

// Respaldo si /api/rates no responde. Revisado el 21-09-2026 (dólar observado 958,42; sol 3,38). Las
// demás son aproximadas (27-09-2026): solo sirven para que la app no se detenga; la tasa del día llega
// de /api/rates, que cubre todas las monedas.
export const FALLBACK_RATES: Rates = {
  USD: 1,
  CLP: 958,
  PEN: 3.38,
  ARS: 1350,
  BOB: 6.91,
  BRL: 5.4,
  COP: 4000,
  CRC: 505,
  CUP: 120,
  DOP: 62,
  GTQ: 7.7,
  HNL: 26,
  MXN: 18.5,
  NIO: 36.8,
  PYG: 7300,
  UYU: 40,
  VES: 150,
};

// El dólar se ofrece siempre como moneda de lead: es habitual cotizar en US$ en ventas entre empresas
export const ALWAYS_AVAILABLE_LEAD_CURRENCY: CurrencyCode = 'USD';

export const currencyOfCountry = (code: CountryCode): CurrencyCode => COUNTRIES[code].currency;

export const isCurrencyCode = (value: unknown): value is CurrencyCode => typeof value === 'string' && Object.hasOwn(CURRENCIES, value);

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

/**
 * Divisas del selector del encabezado (la moneda en que se VE el CRM): la del país base y el dólar
 * siempre; además las que sumó la gerencia, mientras su país siga activo. Solo cambian cómo se
 * muestran y suman los montos, nunca cómo se guardan.
 */
export function viewCurrenciesFor(homeCountry: CountryCode, countries: CountryCode[], extra: CurrencyCode[] = []): CurrencyCode[] {
  const posibles = leadCurrenciesFor(countries);
  return Array.from(new Set([currencyOfCountry(homeCountry), ALWAYS_AVAILABLE_LEAD_CURRENCY, ...extra.filter((c) => posibles.includes(c))]));
}

/** Las que siempre están y no se pueden quitar: la del país base y el dólar */
export const fixedViewCurrencies = (homeCountry: CountryCode): CurrencyCode[] =>
  Array.from(new Set([currencyOfCountry(homeCountry), ALWAYS_AVAILABLE_LEAD_CURRENCY]));

export function convert(amount: number, from: CurrencyCode, to: CurrencyCode, rates: Rates = FALLBACK_RATES): number {
  if (from === to) return amount;
  return (amount / rates[from]) * rates[to];
}

// Redondeo propio de cada moneda: el peso chileno y el guaraní no usan decimales; el resto, dos
export const roundForCurrency = (amount: number, currency: CurrencyCode): number =>
  CURRENCIES[currency].decimals === 0 ? Math.round(amount) : Math.round(amount * 100) / 100;

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
  const partes = Array.from(new Set(currencies))
    .filter((c) => c !== 'USD')
    .map((c) => `${rates[c].toLocaleString('es-CL', { maximumFractionDigits: 2 })} ${c}`);
  // Panamá, Ecuador y El Salvador usan el dólar: puede no haber nada que convertir
  return partes.length === 0 ? 'Montos en dólares (US$)' : `1 US$ = ${partes.join(' = ')}`;
}
