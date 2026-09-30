// Presupuesto mensual del asistente de IA tal como lo muestra el chat. Lo mide y lo aplica el servidor
// (server/aiBudget.ts); aquí solo se presenta: qué tan cerca está el tope y cómo se escribe el monto.

/** Lo que responde /api/ai/budget (y lo que trae cada respuesta del chat) */
export interface AiBudgetInfo {
  /** Solo la gerencia del CRM cambia el presupuesto */
  canEdit: boolean;
  model: string;
  /** Mes en curso, "2026-10" */
  month: string;
  budgetUsd: number;
  spentUsd: number;
  remainingUsd: number;
  requests: number;
}

/** Desde esta fracción del presupuesto el chat avisa que se está acabando (igual que en el servidor) */
export const BUDGET_WARNING_RATIO = 0.8;

export type BudgetLevel = 'ok' | 'warning' | 'exhausted';

export function budgetLevel(budget: Pick<AiBudgetInfo, 'budgetUsd' | 'spentUsd'>): BudgetLevel {
  if (budget.spentUsd >= budget.budgetUsd) return 'exhausted';
  return budget.spentUsd >= budget.budgetUsd * BUDGET_WARNING_RATIO ? 'warning' : 'ok';
}

/** Porcentaje gastado, de 0 a 100; con el presupuesto en 0 el asistente está apagado: 100 */
export function budgetPercent(budget: Pick<AiBudgetInfo, 'budgetUsd' | 'spentUsd'>): number {
  if (budget.budgetUsd <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((budget.spentUsd / budget.budgetUsd) * 100)));
}

const usdFormat = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'USD', currencyDisplay: 'symbol' });

export const formatUsd = (amount: number): string => usdFormat.format(amount);

/** Un gasto real pero diminuto (una consulta cuesta fracciones de centavo) no se muestra como "US$0,00" */
export function formatSpentUsd(amount: number): string {
  if (amount > 0 && amount < 0.01) return `menos de ${formatUsd(0.01)}`;
  return formatUsd(amount);
}

/** "2026-10" → "octubre de 2026" */
export function monthLabel(month: string): string {
  const [year, number] = month.split('-').map(Number);
  if (!year || !number) return month;
  return new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, number - 1, 1)));
}
