// Sesión con Supabase Auth. La contraseña viaja por HTTPS a Supabase, que la guarda con hash: la app
// nunca la guarda ni la puede leer (invariante 10 de CLAUDE.md).

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppUser, Company } from '../../types/crm.ts';
import { companyFromRow, userFromRow, type CompanyCountryRow, type CompanyRow, type ProfileRow } from './mappers.ts';
import { authErrorMessage, dbErrorMessage } from './errors.ts';
import { validateNewPassword } from '../passwords.ts';
import type { DbResult } from './platform.ts';

export interface SessionProfile {
  user: AppUser;
  company: Company | null;
}

/** Perfil y CRM de quien inició sesión. Un usuario de Auth sin perfil no entra a la app. */
export async function loadSessionProfile(db: SupabaseClient, userId: string): Promise<DbResult<SessionProfile>> {
  const { data: perfil, error } = await db
    .from('profiles')
    .select('id, company_id, full_name, email, role, is_active, created_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) return { ok: false, error: dbErrorMessage(error, 'No se pudo cargar tu perfil.') };
  if (!perfil) return { ok: false, error: 'Tu cuenta no tiene un perfil en Revela. Pide al administrador que te invite de nuevo.' };

  const user = userFromRow(perfil as ProfileRow);
  if (!user.companyId) return { ok: true, data: { user, company: null } };

  const [empresa, paises] = await Promise.all([
    db
      .from('companies')
      .select('id, name, slug, tax_id, is_active, plan, home_country, default_lat, default_lng, default_zoom, created_at')
      .eq('id', user.companyId)
      .maybeSingle(),
    db.from('company_countries').select('company_id, country_code').eq('company_id', user.companyId),
  ]);
  if (empresa.error || !empresa.data) {
    return { ok: false, error: dbErrorMessage(empresa.error, 'No se pudo cargar tu CRM.') };
  }
  return {
    ok: true,
    data: { user, company: companyFromRow(empresa.data as CompanyRow, (paises.data ?? []) as CompanyCountryRow[]) },
  };
}

export async function signIn(db: SupabaseClient, email: string, password: string): Promise<DbResult<string>> {
  const { data, error } = await db.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error || !data.user) return { ok: false, error: authErrorMessage(error) };
  return { ok: true, data: data.user.id };
}

export async function signOut(db: SupabaseClient): Promise<void> {
  // "local": cierra la sesión de este navegador aunque el servidor no responda
  await db.auth.signOut({ scope: 'local' });
}

/**
 * Cambio de contraseña propia. Supabase no pide la actual para cambiarla, así que se comprueba
 * iniciando sesión con ella: quien encuentra la sesión abierta en otro computador no puede cambiarla.
 */
export async function changeOwnPassword(
  db: SupabaseClient,
  email: string,
  change: { current: string; next: string; confirm: string }
): Promise<string | null> {
  if (!change.current) return 'Completa los tres campos.';
  const invalida = validateNewPassword(change.next, change.confirm, change.current);
  if (invalida) return invalida;

  const { error: errorActual } = await db.auth.signInWithPassword({ email, password: change.current });
  if (errorActual) {
    return errorActual.status === 429 ? authErrorMessage(errorActual) : 'La contraseña actual no es correcta.';
  }
  const { error } = await db.auth.updateUser({ password: change.next });
  return error ? passwordUpdateError(error) : null;
}

/** Contraseña elegida al abrir una invitación o un enlace de recuperación. */
export async function setPasswordFromLink(db: SupabaseClient, next: string, confirm: string): Promise<string | null> {
  const invalida = validateNewPassword(next, confirm);
  if (invalida) return invalida;
  const { error } = await db.auth.updateUser({ password: next });
  return error ? passwordUpdateError(error) : null;
}

/** Enlace para elegir una contraseña nueva. La respuesta es la misma exista o no la cuenta. */
export async function requestPasswordReset(db: SupabaseClient, email: string): Promise<string | null> {
  const limpio = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpio)) return 'Escribe tu email para enviarte el enlace.';
  const { error } = await db.auth.resetPasswordForEmail(limpio, { redirectTo: window.location.origin });
  if (error?.status === 429) return 'Ya se envió un enlace hace poco. Espera unos minutos antes de pedir otro.';
  return null;
}

function passwordUpdateError(error: { code?: string; message?: string; status?: number }): string {
  const message = (error.message ?? '').toLowerCase();
  if (error.code === 'same_password' || message.includes('different from the old')) {
    return 'La nueva contraseña tiene que ser distinta de la actual.';
  }
  if (error.code === 'weak_password' || message.includes('weak')) {
    return 'Supabase considera débil esa contraseña. Prueba una más larga o menos común.';
  }
  if (error.status === 401 || message.includes('session')) return 'El enlace expiró. Pide uno nuevo desde la pantalla de inicio.';
  return 'No se pudo guardar la contraseña. Inténtalo de nuevo.';
}
