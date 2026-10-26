// Uso de la plataforma para el administrador: cuánto se usa cada CRM, quién dejó de ingresar, cómo van
// las encuestas de satisfacción y los errores reportados. Lógica pura (se prueba sin navegador). Con
// Supabase los conteos los calcula la base (admin_usage_by_company y admin_user_activity, 0030) con
// estas mismas reglas; aquí se calculan cuando los datos viven en memoria (demo y pruebas).

import type { AppUser, BugReport, BugStatus, Company, Lead, LeadActivity, SurveyResponse } from '../types/crm.ts';

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export interface UsageParams {
  /** Ventana para "leads creados" e "ingresos en el período" */
  days: number;
  /** Un lead abierto sin ningún movimiento en estos días está estancado */
  stagnantDays: number;
  /** Quien no ingresa hace estos días o más se marca en rojo */
  inactiveDays: number;
}

export const DEFAULT_USAGE_PARAMS: UsageParams = { days: 30, stagnantDays: 14, inactiveDays: 7 };
export const PERIOD_OPTIONS = [7, 14, 30, 90] as const;
export const STAGNANT_OPTIONS = [7, 14, 30] as const;
export const INACTIVE_OPTIONS = [7, 14, 30] as const;

export interface CompanyUsage {
  companyId: string;
  leadsTotal: number;
  /** Creados en los últimos `days` días */
  leadsCreated: number;
  /** Abiertos: ni ganados ni perdidos */
  leadsActive: number;
  leadsWon: number;
  leadsLost: number;
  /** Abiertos y sin movimiento en `stagnantDays` días */
  leadsStagnant: number;
}

export interface UserActivity {
  userId: string;
  loginsPeriod: number;
  loginsTotal: number;
  lastLoginAt: string | null;
}

export interface UsageSnapshot {
  companies: CompanyUsage[];
  users: UserActivity[];
  generatedAt: string;
}

/** Un ingreso de una persona a su CRM */
export interface LoginRecord {
  userId: string;
  at: string;
}

const DAY = 24 * 60 * 60 * 1000;

export const isOpenLead = (lead: Pick<Lead, 'commercialStatus'>) => lead.commercialStatus !== 'won' && lead.commercialStatus !== 'lost';

/** Último movimiento de un lead: su creación, el último contacto o la última actividad registrada */
export function lastLeadMovement(lead: Lead, activities: LeadActivity[]): number {
  const fechas = [lead.createdAt, lead.lastContactedAt, ...activities.filter((a) => a.leadId === lead.id).map((a) => a.createdAt)];
  return Math.max(...fechas.map((f) => (f ? new Date(f).getTime() : 0)));
}

export function computeCompanyUsage(companies: Company[], leads: Lead[], activities: LeadActivity[], params: UsageParams, now: Date): CompanyUsage[] {
  const desde = now.getTime() - params.days * DAY;
  const limiteEstancado = now.getTime() - params.stagnantDays * DAY;
  return companies.map((company) => {
    const suyos = leads.filter((l) => l.companyId === company.id);
    const abiertos = suyos.filter(isOpenLead);
    return {
      companyId: company.id,
      leadsTotal: suyos.length,
      leadsCreated: suyos.filter((l) => new Date(l.createdAt).getTime() >= desde).length,
      leadsActive: abiertos.length,
      leadsWon: suyos.filter((l) => l.commercialStatus === 'won').length,
      leadsLost: suyos.filter((l) => l.commercialStatus === 'lost').length,
      leadsStagnant: abiertos.filter((l) => lastLeadMovement(l, activities) < limiteEstancado).length,
    };
  });
}

/** Ingresos por persona. El administrador de la plataforma no cuenta: no trabaja dentro de un CRM. */
export function computeUserActivity(users: AppUser[], logins: LoginRecord[], params: UsageParams, now: Date): UserActivity[] {
  const desde = now.getTime() - params.days * DAY;
  return users
    .filter((u) => u.role !== 'superadmin')
    .map((user) => {
      const suyos = logins.filter((l) => l.userId === user.id).map((l) => new Date(l.at).getTime());
      return {
        userId: user.id,
        loginsPeriod: suyos.filter((t) => t >= desde).length,
        loginsTotal: suyos.length,
        lastLoginAt: suyos.length > 0 ? new Date(Math.max(...suyos)).toISOString() : null,
      };
    });
}

/**
 * Estado de una persona según su último ingreso:
 *   active   ingresó hace menos de `inactiveDays` días
 *   inactive dejó de ingresar (rojo)
 *   never    fue invitada hace más de `inactiveDays` días y nunca ingresó (rojo)
 *   new      invitada hace poco: todavía no cuenta como inactiva
 *   disabled su usuario está desactivado: no se espera que ingrese
 */
export type Presence = 'active' | 'inactive' | 'never' | 'new' | 'disabled';

export function presenceOf(
  user: Pick<AppUser, 'isActive' | 'createdAt'>,
  lastLoginAt: string | null,
  inactiveDays: number,
  now: Date
): { status: Presence; daysSince: number | null } {
  if (!user.isActive) return { status: 'disabled', daysSince: null };
  if (!lastLoginAt) {
    const desdeInvitacion = Math.floor((now.getTime() - new Date(user.createdAt).getTime()) / DAY);
    return { status: desdeInvitacion >= inactiveDays ? 'never' : 'new', daysSince: null };
  }
  const daysSince = Math.max(0, Math.floor((now.getTime() - new Date(lastLoginAt).getTime()) / DAY));
  return { status: daysSince >= inactiveDays ? 'inactive' : 'active', daysSince };
}

export const isAlert = (status: Presence) => status === 'inactive' || status === 'never';

// ------------------------------------------------------------------ encuestas de satisfacción
export const SURVEY_FIRST_AFTER_DAYS = 7;
export const SURVEY_INTERVAL_DAYS = 30;
export const SURVEY_SNOOZE_DAYS = 7;

export interface SurveySummary {
  count: number;
  /** Promedio de 0 a 10, o null si no hay respuestas */
  average: number | null;
  /** Net Promoter Score: % de notas 9 y 10 menos % de notas 0 a 6, de -100 a 100; null sin respuestas */
  nps: number | null;
  promoters: number;
  passives: number;
  detractors: number;
}

export function summarizeSurveys(rows: Pick<SurveyResponse, 'score'>[]): SurveySummary {
  const count = rows.length;
  const promoters = rows.filter((r) => r.score >= 9).length;
  const detractors = rows.filter((r) => r.score <= 6).length;
  return {
    count,
    average: count === 0 ? null : Math.round((rows.reduce((suma, r) => suma + r.score, 0) / count) * 10) / 10,
    nps: count === 0 ? null : Math.round(((promoters - detractors) / count) * 100),
    promoters,
    passives: count - promoters - detractors,
    detractors,
  };
}

/**
 * ¿Toca preguntarle a esta persona? Después de su primera semana en el CRM y cada 30 días desde la última
 * vez que respondió. Si eligió "Ahora no", se vuelve a preguntar en 7 días.
 */
export function shouldAskSurvey(input: {
  now: Date;
  userCreatedAt: string;
  lastAnsweredAt?: string | null;
  snoozedAt?: string | null;
}): boolean {
  const { now, userCreatedAt, lastAnsweredAt, snoozedAt } = input;
  if (now.getTime() - new Date(userCreatedAt).getTime() < SURVEY_FIRST_AFTER_DAYS * DAY) return false;
  if (lastAnsweredAt && now.getTime() - new Date(lastAnsweredAt).getTime() < SURVEY_INTERVAL_DAYS * DAY) return false;
  if (snoozedAt && now.getTime() - new Date(snoozedAt).getTime() < SURVEY_SNOOZE_DAYS * DAY) return false;
  return true;
}

// ------------------------------------------------------------------ reportes de errores
export const BUG_STATUS_LABEL: Record<BugStatus, string> = { new: 'Nuevo', seen: 'Visto', resolved: 'Resuelto' };
export const BUG_MIN_LENGTH = 10;
export const BUG_MAX_LENGTH = 2000;
export const SURVEY_COMMENT_MAX_LENGTH = 1000;

export function validateBugDescription(text: string): string | null {
  const limpio = text.trim();
  if (limpio.length < BUG_MIN_LENGTH) return `Cuéntanos un poco más: al menos ${BUG_MIN_LENGTH} caracteres.`;
  if (limpio.length > BUG_MAX_LENGTH) return `Es muy largo: máximo ${BUG_MAX_LENGTH} caracteres.`;
  return null;
}

/** Reportes sin resolver, para el aviso de la pestaña */
export const unresolvedBugs = (bugs: Pick<BugReport, 'status'>[]) => bugs.filter((b) => b.status === 'new').length;

// ------------------------------------------------------------------ lo que el panel del administrador pide
export interface AdminUsageApi {
  loadUsage: (params: UsageParams) => Promise<Result<UsageSnapshot>>;
  loadSurveys: () => Promise<Result<SurveyResponse[]>>;
  loadBugs: () => Promise<Result<BugReport[]>>;
  setBugStatus: (id: string, status: BugStatus) => Promise<string | null>;
}

/** Datos en memoria (demo y pruebas): las mismas reglas que calcula la base con Supabase */
export interface MemoryUsageSource {
  companies: Company[];
  users: AppUser[];
  leads: Lead[];
  activities: LeadActivity[];
  logins: LoginRecord[];
  surveys: SurveyResponse[];
  bugs: BugReport[];
}

export function createMemoryUsageApi(
  source: () => MemoryUsageSource,
  onBugStatus: (id: string, status: BugStatus) => void,
  now: () => Date = () => new Date()
): AdminUsageApi {
  const masNuevosPrimero = <T extends { createdAt: string }>(filas: T[]) =>
    [...filas].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    loadUsage: async (params) => {
      const { companies, users, leads, activities, logins } = source();
      const ahora = now();
      return {
        ok: true,
        data: {
          companies: computeCompanyUsage(companies, leads, activities, params, ahora),
          users: computeUserActivity(users, logins, params, ahora),
          generatedAt: ahora.toISOString(),
        },
      };
    },
    loadSurveys: async () => ({ ok: true, data: masNuevosPrimero(source().surveys) }),
    loadBugs: async () => ({ ok: true, data: masNuevosPrimero(source().bugs) }),
    setBugStatus: async (id, status) => {
      if (!source().bugs.some((b) => b.id === id)) return 'No se encontró el reporte.';
      onBugStatus(id, status);
      return null;
    },
  };
}
