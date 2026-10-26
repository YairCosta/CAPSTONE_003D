// Presupuesto mensual del asistente de IA: cuánto puede gastar cada CRM por mes y cuánto lleva. Lo mide
// y lo aplica el servidor (migración 0031): el navegador solo muestra y pide cambiarlo, nunca decide.

import type { SupabaseClient } from '@supabase/supabase-js';

export const DEFAULT_MONTHLY_BUDGET_USD = 30;
export const MAX_MONTHLY_BUDGET_USD = 1000;
/** Desde esta fracción del presupuesto el chat avisa que se está acabando */
export const BUDGET_WARNING_RATIO = 0.8;

export interface AiBudgetStatus {
  /** Mes en curso, "2026-10" (UTC: el mismo ciclo con que cobra OpenAI) */
  month: string;
  budgetUsd: number;
  spentUsd: number;
  requests: number;
}

export interface AiUsageRecord {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface AiBudgetStore {
  status(scope: string): Promise<AiBudgetStatus>;
  setBudget(scope: string, budgetUsd: number, userId: string | null): Promise<void>;
  record(scope: string, usage: AiUsageRecord): Promise<void>;
}

export const monthKey = (fecha: Date): string => fecha.toISOString().slice(0, 7);

/** El presupuesto se guarda en dólares y centavos */
export function validateBudget(value: unknown): { ok: true; value: number } | { ok: false; error: string } {
  // Una casilla vacía no es un 0: apagaría el asistente sin que nadie lo haya pedido
  if (typeof value === 'string' && value.trim() === '') return { ok: false, error: 'Escribe el presupuesto en dólares, por ejemplo 30.' };
  let texto = typeof value === 'string' ? value.trim() : '';
  // En es-CL "1.000" son mil, no uno: los puntos que separan grupos de tres dígitos son de miles
  if (/^[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/.test(texto)) texto = texto.replace(/\./g, '');
  const numero = typeof value === 'string' ? Number(texto.replace(',', '.')) : value;
  if (typeof numero !== 'number' || !Number.isFinite(numero)) return { ok: false, error: 'Escribe el presupuesto en dólares, por ejemplo 30.' };
  if (numero < 0) return { ok: false, error: 'El presupuesto no puede ser negativo.' };
  if (numero > MAX_MONTHLY_BUDGET_USD) {
    return { ok: false, error: `El máximo es US$ ${MAX_MONTHLY_BUDGET_USD.toLocaleString('es-CL')} al mes.` };
  }
  return { ok: true, value: Math.round(numero * 100) / 100 };
}

/** Lo que se le muestra a la persona: sin tokens ni precios */
export function publicBudget(status: AiBudgetStatus) {
  return {
    month: status.month,
    budgetUsd: status.budgetUsd,
    spentUsd: Math.round(status.spentUsd * 10_000) / 10_000,
    remainingUsd: Math.max(0, Math.round((status.budgetUsd - status.spentUsd) * 10_000) / 10_000),
    requests: status.requests,
  };
}

export const isExhausted = (status: AiBudgetStatus) => status.spentUsd >= status.budgetUsd;

// ------------------------------------------------------------------ en memoria (desarrollo y pruebas)
/** Se reinicia al apagar el servidor. Sirve para probar el chat sin Supabase. */
export function createMemoryBudgetStore(defaultBudget = DEFAULT_MONTHLY_BUDGET_USD, now: () => Date = () => new Date()): AiBudgetStore {
  const presupuestos = new Map<string, number>();
  const gasto = new Map<string, { spentUsd: number; requests: number }>();
  const clave = (scope: string) => `${scope}|${monthKey(now())}`;
  return {
    status: async (scope) => ({
      month: monthKey(now()),
      budgetUsd: presupuestos.get(scope) ?? defaultBudget,
      spentUsd: gasto.get(clave(scope))?.spentUsd ?? 0,
      requests: gasto.get(clave(scope))?.requests ?? 0,
    }),
    setBudget: async (scope, budgetUsd) => {
      presupuestos.set(scope, budgetUsd);
    },
    record: async (scope, usage) => {
      const actual = gasto.get(clave(scope)) ?? { spentUsd: 0, requests: 0 };
      gasto.set(clave(scope), { spentUsd: actual.spentUsd + usage.costUsd, requests: actual.requests + 1 });
    },
  };
}

// ------------------------------------------------------------------ Supabase (producción)
/** Con la clave secreta del servidor: ninguna persona con sesión escribe estas tablas. */
export function createSupabaseBudgetStore(admin: SupabaseClient, defaultBudget = DEFAULT_MONTHLY_BUDGET_USD, now: () => Date = () => new Date()): AiBudgetStore {
  return {
    status: async (companyId) => {
      const month = `${monthKey(now())}-01`;
      const [ajustes, gasto] = await Promise.all([
        admin.from('company_ai_settings').select('monthly_budget_usd').eq('company_id', companyId).maybeSingle(),
        admin.from('ai_usage_monthly').select('requests, cost_usd').eq('company_id', companyId).eq('month', month).maybeSingle(),
      ]);
      if (ajustes.error) throw new Error(`presupuesto: ${ajustes.error.message}`);
      if (gasto.error) throw new Error(`gasto: ${gasto.error.message}`);
      return {
        month: monthKey(now()),
        budgetUsd: ajustes.data ? Number(ajustes.data.monthly_budget_usd) : defaultBudget,
        spentUsd: gasto.data ? Number(gasto.data.cost_usd) : 0,
        requests: gasto.data ? Number(gasto.data.requests) : 0,
      };
    },
    // La función de la base exige que quien cambia sea gerente activo de ese CRM y deja el cambio en change_log
    setBudget: async (companyId, budgetUsd, userId) => {
      if (!userId) throw new Error('presupuesto: falta la persona que lo cambia');
      const { error } = await admin.rpc('set_company_ai_budget', { p_company_id: companyId, p_user_id: userId, p_budget_usd: budgetUsd });
      if (error) throw new Error(`presupuesto: ${error.message}`);
    },
    record: async (companyId, usage) => {
      const { error } = await admin.rpc('record_ai_usage', {
        p_company_id: companyId,
        p_input_tokens: usage.inputTokens,
        p_cached_input_tokens: usage.cachedInputTokens,
        p_output_tokens: usage.outputTokens,
        p_cost_usd: Math.round(usage.costUsd * 1_000_000) / 1_000_000,
      });
      if (error) throw new Error(`gasto: ${error.message}`);
    },
  };
}
