// La API de Revela (/api/*) armada desde las variables de entorno. La usan el servidor de desarrollo
// (vite.config.ts, con .env.local) y la función de Vercel (server/vercel.ts, con las variables del
// proyecto en Vercel): así las dos corren exactamente el mismo código.
// Las variables sin prefijo VITE_ (claves de IA, de Places y la secreta de Supabase) solo existen acá,
// en el servidor: nunca llegan al navegador.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient } from '@supabase/supabase-js';
import { createAiMiddleware, resolveProvider, type AiServerConfig } from './aiChat.ts';
import { DEFAULT_MONTHLY_BUDGET_USD, createMemoryBudgetStore, createSupabaseBudgetStore, type AiBudgetStore } from './aiBudget.ts';
import { createMemoryKeyStore, createSupabaseKeyStore, type AiKeyStore } from './aiKeys.ts';
import { createRatesMiddleware } from './exchangeRates.ts';
import { createAdminMiddleware, type AdminServerConfig } from './adminUsers.ts';
import { identifyCaller, type SessionCaller } from './session.ts';

export type ServerEnv = Record<string, string | undefined>;
type Middleware = (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => void | Promise<void>;

/**
 * Configuración del asistente. Por defecto las claves del servidor exigen una sesión de CRM; solo el
 * servidor de desarrollo local lo apaga (requireSession: false) para probar con la cuenta demo.
 */
export const aiConfigFrom = (env: ServerEnv, { requireSession = true }: { requireSession?: boolean } = {}): AiServerConfig => ({
  provider: resolveProvider(env),
  geminiApiKey: env.GEMINI_API_KEY || undefined,
  geminiModel: env.GEMINI_MODEL || 'gemini-2.5-flash',
  openaiApiKey: env.OPENAI_API_KEY || undefined,
  // El más barato que sirve para buscar y guardar leads: US$0,05 por millón de tokens de entrada (docs/ASISTENTE_IA.md)
  openaiModel: env.OPENAI_MODEL || 'gpt-5-nano',
  openaiReasoningEffort: env.OPENAI_REASONING_EFFORT || 'minimal',
  placesApiKey: env.GOOGLE_PLACES_API_KEY || undefined,
  requireSession,
  identify: sessionIdentifierFrom(env),
  budget: budgetStoreFrom(env),
  keys: keyStoreFrom(env),
});

/**
 * Dónde viven las claves de OpenAI de los CRMs: cifradas en Supabase Vault (con la clave secreta del servidor) o,
 * sin Supabase, en la memoria (solo pruebas: sin Supabase tampoco hay sesiones de CRM que las usen).
 */
export function keyStoreFrom(env: ServerEnv): AiKeyStore {
  const { supabaseUrl, serviceKey } = adminConfigFrom(env);
  if (!supabaseUrl || !serviceKey) return createMemoryKeyStore();
  return createSupabaseKeyStore(createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }));
}

/**
 * Dónde se lleva el gasto del asistente: en Supabase (con la clave secreta del servidor) o, sin ella,
 * en la memoria del servidor (solo desarrollo local). El presupuesto predeterminado es de US$30 al mes
 * y se puede cambiar con AI_DEFAULT_MONTHLY_BUDGET_USD.
 */
export function budgetStoreFrom(env: ServerEnv): AiBudgetStore {
  const predeterminado = Number(env.AI_DEFAULT_MONTHLY_BUDGET_USD);
  const base = Number.isFinite(predeterminado) && predeterminado >= 0 ? predeterminado : DEFAULT_MONTHLY_BUDGET_USD;
  const { supabaseUrl, serviceKey } = adminConfigFrom(env);
  if (!supabaseUrl || !serviceKey) return createMemoryBudgetStore(base);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  // Sin sesión (solo desarrollo local con Supabase configurado) el cupo "local" vive en memoria
  const respaldo = createMemoryBudgetStore(base);
  const enBase = createSupabaseBudgetStore(admin, base);
  const deCrm = (scope: string) => scope !== 'local';
  return {
    status: (scope) => (deCrm(scope) ? enBase.status(scope) : respaldo.status(scope)),
    setBudget: (scope, valor, usuario) => (deCrm(scope) ? enBase.setBudget(scope, valor, usuario) : respaldo.setBudget(scope, valor, usuario)),
    record: (scope, uso) => (deCrm(scope) ? enBase.record(scope, uso) : respaldo.record(scope, uso)),
  };
}

/** Verificador de sesiones de Supabase (necesita la URL y la clave secreta); sin ellas no hay. */
export function sessionIdentifierFrom(env: ServerEnv): ((token: string) => Promise<SessionCaller | null>) | undefined {
  const { supabaseUrl, serviceKey } = adminConfigFrom(env);
  if (!supabaseUrl || !serviceKey) return undefined;
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return async (token) => {
    const quien = await identifyCaller(admin, token);
    return quien.valid ? quien.caller : null;
  };
}

// La clave secreta de Supabase salta RLS: por eso vive solo en el servidor
export const adminConfigFrom = (env: ServerEnv): AdminServerConfig => ({
  supabaseUrl: env.VITE_SUPABASE_URL || undefined,
  serviceKey: env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || undefined,
  appUrl: env.APP_URL || 'http://localhost:5173',
});

const notFound = (res: ServerResponse) => {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ error: 'Ruta de la API no encontrada.' }));
};

/**
 * Un solo manejador para toda la API: reparte por prefijo, como hace Vite con sus middlewares.
 * Vercel puede entregar la ruta original (/api/ai/chat) o la reescrita por config.json
 * (/api?__ruta=ai/chat): se aceptan las dos.
 */
export function createApiHandler(env: ServerEnv) {
  const rutas: [string, Middleware][] = [
    ['/api/ai', createAiMiddleware(aiConfigFrom(env))],
    ['/api/rates', createRatesMiddleware()],
    ['/api/admin', createAdminMiddleware(adminConfigFrom(env))],
  ];
  return (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://revela.local');
    const reescrita = url.searchParams.get('__ruta');
    url.searchParams.delete('__ruta');
    const ruta = reescrita !== null ? `/api/${reescrita.replace(/^\/+/, '')}` : url.pathname;
    const destino = rutas.find(([prefijo]) => ruta === prefijo || ruta.startsWith(`${prefijo}/`));
    if (!destino) return notFound(res);
    const [prefijo, middleware] = destino;
    // Cada middleware ve la ruta relativa a su prefijo, igual que en el servidor de desarrollo
    req.url = (ruta.slice(prefijo.length) || '/') + url.search;
    void middleware(req, res, () => notFound(res));
  };
}
