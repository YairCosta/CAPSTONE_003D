// Cuánto cuesta cada llamada al modelo. OpenAI cobra por tokens, y lo que informa en cada respuesta
// (usage) alcanza para calcular el gasto exacto con el precio publicado.

export interface ModelUsage {
  /** Tokens de entrada, incluidos los que salieron del caché */
  inputTokens: number;
  /** De los de entrada, los que ya estaban en el caché de OpenAI (cuestan mucho menos) */
  cachedInputTokens: number;
  /** Tokens de salida; incluyen los de razonamiento, que también se cobran */
  outputTokens: number;
}

/** Dólares por millón de tokens */
export interface ModelPrice {
  input: number;
  cachedInput: number;
  output: number;
}

// Precios estándar de OpenAI, revisados el 30-09-2026 en developers.openai.com/api/docs/pricing.
// Si OpenAI los cambia, se actualizan aquí: el gasto que se muestra y el tope dependen de esta tabla.
export const OPENAI_PRICES: Record<string, ModelPrice> = {
  'gpt-5-nano': { input: 0.05, cachedInput: 0.005, output: 0.4 },
  'gpt-5-mini': { input: 0.25, cachedInput: 0.025, output: 2 },
  'gpt-4.1-nano': { input: 0.1, cachedInput: 0.025, output: 0.4 },
  'gpt-4.1-mini': { input: 0.4, cachedInput: 0.1, output: 1.6 },
  'gpt-4o-mini': { input: 0.15, cachedInput: 0.075, output: 0.6 },
};

// Un modelo que no está en la tabla se cobra como uno caro: así el tope protege aunque alguien
// configure un modelo nuevo sin actualizar los precios (se gasta "de más" en el papel, nunca de menos)
export const UNKNOWN_MODEL_PRICE: ModelPrice = { input: 2.5, cachedInput: 1.25, output: 10 };

/** El modelo que informa OpenAI trae la fecha ("gpt-5-nano-2025-08-07"): se busca por el nombre base */
export function priceFor(model: string): { price: ModelPrice; known: boolean } {
  const nombre = model.trim().toLowerCase().replace(/-\d{4}-\d{2}-\d{2}$/, '');
  const exacto = OPENAI_PRICES[nombre];
  if (exacto) return { price: exacto, known: true };
  // Variantes como "gpt-5-mini-high": el nombre conocido más largo que sea su comienzo
  const base = Object.keys(OPENAI_PRICES)
    .filter((k) => nombre.startsWith(`${k}-`))
    .sort((a, b) => b.length - a.length)[0];
  return base ? { price: OPENAI_PRICES[base], known: true } : { price: UNKNOWN_MODEL_PRICE, known: false };
}

/** Costo en dólares de una llamada */
export function costOf(usage: ModelUsage, price: ModelPrice): number {
  const cacheados = Math.min(Math.max(usage.cachedInputTokens, 0), Math.max(usage.inputTokens, 0));
  const nuevos = Math.max(usage.inputTokens, 0) - cacheados;
  return (nuevos * price.input + cacheados * price.cachedInput + Math.max(usage.outputTokens, 0) * price.output) / 1_000_000;
}

/**
 * Cuando OpenAI no informa el uso (no debería pasar), se estima por el tamaño del texto: unos 3
 * caracteres por token, algo por encima de la realidad en español. Mejor contar de más que de menos.
 */
export function estimateUsage(requestChars: number, responseChars: number): ModelUsage {
  return { inputTokens: Math.ceil(requestChars / 3), cachedInputTokens: 0, outputTokens: Math.ceil(responseChars / 3) };
}
