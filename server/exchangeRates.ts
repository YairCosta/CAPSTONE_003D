// API de tipos de cambio (/api/rates): corre en Node dentro del servidor de Vite, igual que el asistente.
//
// Fuentes, ambas gratuitas y sin API key:
//   - CLP: "dólar observado" del Banco Central de Chile, publicado por mindicador.cl.
//   - El resto (PEN y cualquier moneda que se agregue con un país nuevo): open.er-api.com,
//     que cubre todas las monedas ISO 4217 con actualización diaria.
// Si una fuente falla se usa la última tasa buena; si nunca hubo una, la tasa de respaldo.
// El navegador nunca llama a estas APIs directo: así se cachea en un solo lugar y no hay CORS.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { FALLBACK_RATES } from '../src/lib/currency.ts';

export interface RatesResponse {
  base: 'USD';
  rates: Record<string, number>; // unidades de cada moneda por 1 USD
  live: boolean; // false = se está usando la tasa de respaldo
  sources: string[];
  updatedAt: string; // fecha de la tasa según la fuente (ISO)
}

// Respaldo si ninguna fuente responde nunca: el mismo que usa la app (una sola fuente de verdad)
const FALLBACK_UNITS_PER_USD: Record<string, number> = { ...FALLBACK_RATES };

const CACHE_MS = 12 * 60 * 60 * 1000;
const TIMEOUT_MS = 8000;

let cache: { data: RatesResponse; fetchedAt: number } | null = null;

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

// Dólar observado del Banco Central de Chile (último valor publicado)
async function fetchClpObservado(): Promise<{ value: number; date: string }> {
  const data = await fetchJson('https://mindicador.cl/api/dolar');
  const serie = isRecord(data) && Array.isArray(data.serie) ? data.serie : [];
  const ultimo = serie[0];
  const value = isRecord(ultimo) ? Number(ultimo.valor) : NaN;
  if (!Number.isFinite(value) || value <= 0) throw new Error('mindicador sin valor');
  return { value, date: isRecord(ultimo) ? String(ultimo.fecha) : new Date().toISOString() };
}

// Todas las monedas contra el dólar
async function fetchAllCurrencies(): Promise<{ rates: Record<string, number>; date: string }> {
  const data = await fetchJson('https://open.er-api.com/v6/latest/USD');
  if (!isRecord(data) || data.result !== 'success' || !isRecord(data.rates)) throw new Error('open.er-api sin datos');
  const rates: Record<string, number> = {};
  for (const [code, value] of Object.entries(data.rates)) {
    const n = Number(value);
    if (/^[A-Z]{3}$/.test(code) && Number.isFinite(n) && n > 0) rates[code] = n;
  }
  const unix = Number(data.time_last_update_unix);
  return { rates, date: Number.isFinite(unix) ? new Date(unix * 1000).toISOString() : new Date().toISOString() };
}

export async function getRates(): Promise<RatesResponse> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_MS) return cache.data;

  const [todas, clp] = await Promise.allSettled([fetchAllCurrencies(), fetchClpObservado()]);
  const rates: Record<string, number> = { ...FALLBACK_UNITS_PER_USD };
  const sources: string[] = [];
  let updatedAt = '';

  if (todas.status === 'fulfilled') {
    Object.assign(rates, todas.value.rates);
    sources.push('open.er-api.com');
    updatedAt = todas.value.date;
  }
  // El peso chileno se toma del Banco Central aunque la otra fuente también lo traiga
  if (clp.status === 'fulfilled') {
    rates.CLP = clp.value.value;
    sources.push('Banco Central de Chile (dólar observado, vía mindicador.cl)');
    updatedAt = updatedAt || clp.value.date;
  }
  rates.USD = 1;

  const live = sources.length > 0;
  if (!live && cache) return { ...cache.data, live: false }; // se sigue con la última tasa buena

  const data: RatesResponse = {
    base: 'USD',
    rates,
    live,
    sources: live ? sources : ['tasa de respaldo'],
    updatedAt: updatedAt || new Date().toISOString(),
  };
  if (live) cache = { data, fetchedAt: Date.now() };
  return data;
}

export function createRatesMiddleware() {
  return async (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => {
    const path = (req.url ?? '').split('?')[0];
    if (req.method !== 'GET' || (path !== '/' && path !== '')) {
      next();
      return;
    }
    const data = await getRates();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // Las tasas cambian una vez al día: el navegador puede reutilizarlas un rato
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.end(JSON.stringify(data));
  };
}
