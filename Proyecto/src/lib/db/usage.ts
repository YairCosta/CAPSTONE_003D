// Uso de la plataforma, encuestas y reportes de errores contra Supabase (migración 0030). El
// administrador lee conteos que calcula la base (nunca datos de leads); cada persona solo escribe lo suyo.
// Las filas se traducen aquí, con funciones puras que se prueban sin conexión (npm run test:supabase).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppUser, BugReport, BugStatus, SurveyResponse } from '../../types/crm.ts';
import type { AdminUsageApi, CompanyUsage, Result, UsageParams, UserActivity } from '../usage.ts';
import { BUG_MAX_LENGTH, SURVEY_COMMENT_MAX_LENGTH } from '../usage.ts';
import { dbErrorMessage } from './errors.ts';

// ------------------------------------------------------------------ filas
export interface CompanyUsageRow {
  crm_id: string;
  leads_total: number | string;
  leads_created: number | string;
  leads_active: number | string;
  leads_won: number | string;
  leads_lost: number | string;
  leads_stagnant: number | string;
}

export interface UserActivityRow {
  person_id: string;
  logins_period: number | string;
  logins_total: number | string;
  last_login_at: string | null;
}

export interface SurveyRow {
  id: string;
  company_id: string;
  user_id: string;
  score: number;
  comment: string | null;
  created_at: string;
}

export interface BugRow {
  id: string;
  company_id: string;
  user_id: string;
  description: string;
  page: string | null;
  user_agent: string | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
}

// PostgREST devuelve los bigint como número o como texto según el tamaño: se leen siempre como número
const num = (valor: number | string | null | undefined) => Number(valor ?? 0) || 0;

export const companyUsageFromRow = (row: CompanyUsageRow): CompanyUsage => ({
  companyId: row.crm_id,
  leadsTotal: num(row.leads_total),
  leadsCreated: num(row.leads_created),
  leadsActive: num(row.leads_active),
  leadsWon: num(row.leads_won),
  leadsLost: num(row.leads_lost),
  leadsStagnant: num(row.leads_stagnant),
});

export const userActivityFromRow = (row: UserActivityRow): UserActivity => ({
  userId: row.person_id,
  loginsPeriod: num(row.logins_period),
  loginsTotal: num(row.logins_total),
  lastLoginAt: row.last_login_at,
});

export const surveyFromRow = (row: SurveyRow): SurveyResponse => ({
  id: row.id,
  companyId: row.company_id,
  userId: row.user_id,
  score: row.score,
  comment: row.comment?.trim() || undefined,
  createdAt: row.created_at,
});

const BUG_STATUS: BugStatus[] = ['new', 'seen', 'resolved'];
export const bugFromRow = (row: BugRow): BugReport => ({
  id: row.id,
  companyId: row.company_id,
  userId: row.user_id,
  description: row.description,
  page: row.page ?? undefined,
  userAgent: row.user_agent ?? undefined,
  // Un estado desconocido se muestra como nuevo: mejor revisarlo de más que perderlo
  status: BUG_STATUS.includes(row.status as BugStatus) ? (row.status as BugStatus) : 'new',
  createdAt: row.created_at,
  resolvedAt: row.resolved_at ?? undefined,
});

// ------------------------------------------------------------------ persona con sesión
/** Anota el ingreso. Si falla no se avisa: contar una visita nunca debe estorbar el trabajo. */
export async function recordLogin(db: SupabaseClient): Promise<void> {
  try {
    await db.rpc('record_login');
  } catch {
    // sin conexión: se anotará en el próximo ingreso
  }
}

export async function submitSurvey(db: SupabaseClient, user: AppUser, score: number, comment: string): Promise<Result<null>> {
  if (!user.companyId) return { ok: false, error: 'La encuesta es para las personas de un CRM.' };
  const { error } = await db.from('satisfaction_surveys').insert({
    company_id: user.companyId,
    user_id: user.id,
    score,
    comment: comment.trim().slice(0, SURVEY_COMMENT_MAX_LENGTH) || null,
  });
  if (error) return { ok: false, error: dbErrorMessage(error, 'No se pudo enviar tu respuesta. Inténtalo de nuevo.') };
  return { ok: true, data: null };
}

/** Cuándo respondió la persona por última vez (RLS le devuelve solo lo suyo) */
export async function loadMyLastSurveyAt(db: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await db
    .from('satisfaction_surveys')
    .select('created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);
  return (data?.[0] as { created_at: string } | undefined)?.created_at ?? null;
}

export async function submitBugReport(
  db: SupabaseClient,
  user: AppUser,
  report: { description: string; page?: string; userAgent?: string }
): Promise<Result<null>> {
  if (!user.companyId) return { ok: false, error: 'El reporte es para las personas de un CRM.' };
  const { error } = await db.from('bug_reports').insert({
    company_id: user.companyId,
    user_id: user.id,
    description: report.description.trim().slice(0, BUG_MAX_LENGTH),
    page: report.page?.slice(0, 40) || null,
    user_agent: report.userAgent?.slice(0, 300) || null,
  });
  if (error) return { ok: false, error: dbErrorMessage(error, 'No se pudo enviar el reporte. Inténtalo de nuevo.') };
  return { ok: true, data: null };
}

// ------------------------------------------------------------------ administrador de la plataforma
export async function loadUsageSnapshot(db: SupabaseClient, params: UsageParams): Promise<Result<{ companies: CompanyUsage[]; users: UserActivity[] }>> {
  const [empresas, personas] = await Promise.all([
    db.rpc('admin_usage_by_company', { p_days: params.days, p_stagnant_days: params.stagnantDays }),
    db.rpc('admin_user_activity', { p_days: params.days }),
  ]);
  const error = empresas.error ?? personas.error;
  if (error) return { ok: false, error: dbErrorMessage(error, 'No se pudo cargar el uso de los CRMs.') };
  return {
    ok: true,
    data: {
      companies: ((empresas.data ?? []) as CompanyUsageRow[]).map(companyUsageFromRow),
      users: ((personas.data ?? []) as UserActivityRow[]).map(userActivityFromRow),
    },
  };
}

const LIMITE = 200;

export async function loadSurveyResponses(db: SupabaseClient): Promise<Result<SurveyResponse[]>> {
  const { data, error } = await db
    .from('satisfaction_surveys')
    .select('id, company_id, user_id, score, comment, created_at')
    .order('created_at', { ascending: false })
    .limit(LIMITE);
  if (error) return { ok: false, error: dbErrorMessage(error, 'No se pudieron cargar las encuestas.') };
  return { ok: true, data: ((data ?? []) as SurveyRow[]).map(surveyFromRow) };
}

export async function loadBugReports(db: SupabaseClient): Promise<Result<BugReport[]>> {
  const { data, error } = await db
    .from('bug_reports')
    .select('id, company_id, user_id, description, page, user_agent, status, created_at, resolved_at')
    .order('created_at', { ascending: false })
    .limit(LIMITE);
  if (error) return { ok: false, error: dbErrorMessage(error, 'No se pudieron cargar los reportes.') };
  return { ok: true, data: ((data ?? []) as BugRow[]).map(bugFromRow) };
}

export async function updateBugStatus(db: SupabaseClient, id: string, status: BugStatus): Promise<string | null> {
  const { data, error } = await db.from('bug_reports').update({ status }).eq('id', id).select('id');
  if (error) return dbErrorMessage(error, 'No se pudo cambiar el estado del reporte.');
  return data && data.length > 0 ? null : 'No se encontró el reporte.';
}

/** Lo que el panel del administrador pide, resuelto contra la base */
export function createDbUsageApi(db: SupabaseClient): AdminUsageApi {
  return {
    loadUsage: async (params) => {
      const resultado = await loadUsageSnapshot(db, params);
      return resultado.ok ? { ok: true, data: { ...resultado.data, generatedAt: new Date().toISOString() } } : resultado;
    },
    loadSurveys: () => loadSurveyResponses(db),
    loadBugs: () => loadBugReports(db),
    setBugStatus: (id, status) => updateBugStatus(db, id, status),
  };
}
