// Administración de la plataforma contra Supabase: CRMs (companies + company_countries) y usuarios
// (profiles). Lo protege RLS: solo el administrador de plataforma escribe estas tablas, y quien no
// lo es solo lee su propio CRM y su equipo. Invitar usuarios pasa por el servidor (/api/admin/invite),
// porque crear una cuenta en Auth exige la clave secreta.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppUser, Company, NewAppUser, NewCompany } from '../../types/crm.ts';
import {
  companyCountryRows,
  companyFromRow,
  companyToRow,
  profileUpdateRow,
  userFromRow,
  type CompanyCountryRow,
  type CompanyRow,
  type CompanyViewCurrencyRow,
  type ProfileRow,
} from './mappers.ts';
import { dbErrorMessage } from './errors.ts';

export type DbResult<T> = { ok: true; data: T } | { ok: false; error: string };

const COMPANY_COLUMNS = 'id, name, slug, tax_id, is_active, plan, home_country, default_lat, default_lng, default_zoom, created_at';
const PROFILE_COLUMNS = 'id, company_id, full_name, email, role, is_active, created_at';

/** Todos los CRMs y usuarios que la sesión puede ver (RLS decide cuáles). */
export async function loadPlatform(db: SupabaseClient): Promise<DbResult<{ companies: Company[]; users: AppUser[] }>> {
  const [empresas, paises, divisas, perfiles, exportaciones] = await Promise.all([
    db.from('companies').select(COMPANY_COLUMNS).order('created_at'),
    db.from('company_countries').select('company_id, country_code'),
    db.from('company_view_currencies').select('company_id, currency_code'),
    db.from('profiles').select(PROFILE_COLUMNS).order('created_at'),
    // Solo el administrador ve las exportaciones (RLS); para el resto llega vacío
    db.from('data_exports').select('company_id, exported_by, exported_at').order('exported_at', { ascending: false }).limit(500),
  ]);
  const error = empresas.error ?? paises.error ?? perfiles.error;
  if (error) return { ok: false, error: dbErrorMessage(error, 'No se pudieron cargar los CRMs y usuarios.') };
  const filasPaises = (paises.data ?? []) as CompanyCountryRow[];
  // Las divisas de la vista son una preferencia: si no se pueden leer, el CRM igual se carga
  const filasDivisas = (divisas.data ?? []) as CompanyViewCurrencyRow[];
  const users = ((perfiles.data ?? []) as ProfileRow[]).map(userFromRow);
  const ultimas = (exportaciones.data ?? []) as { company_id: string; exported_by: string | null; exported_at: string }[];
  return {
    ok: true,
    data: {
      companies: ((empresas.data ?? []) as CompanyRow[]).map((row) => {
        const company = companyFromRow(row, filasPaises, filasDivisas);
        const ultima = ultimas.find((e) => e.company_id === row.id);
        if (!ultima) return company;
        const quien = users.find((u) => u.id === ultima.exported_by)?.fullName;
        return { ...company, lastExportedAt: ultima.exported_at, lastExportedBy: quien };
      }),
      users,
    },
  };
}

export async function insertCompany(db: SupabaseClient, data: NewCompany): Promise<DbResult<Company>> {
  const { data: fila, error } = await db.from('companies').insert(companyToRow(data)).select(COMPANY_COLUMNS).single();
  if (error || !fila) {
    return { ok: false, error: dbErrorMessage(error, 'No se pudo crear el CRM.') };
  }
  const filasPaises = companyCountryRows(fila.id, data);
  const { error: errorPaises } = await db.from('company_countries').upsert(filasPaises, { ignoreDuplicates: true });
  if (errorPaises) {
    // Un CRM sin sus países no sirve: se deshace para no dejarlo a medias
    await db.from('companies').delete().eq('id', fila.id);
    return { ok: false, error: dbErrorMessage(errorPaises, 'No se pudieron habilitar los países del CRM.') };
  }
  return { ok: true, data: companyFromRow(fila as CompanyRow, filasPaises) };
}

export async function updateCompany(db: SupabaseClient, company: Company): Promise<DbResult<Company>> {
  const { data: fila, error } = await db
    .from('companies')
    .update(companyToRow(company))
    .eq('id', company.id)
    .select(COMPANY_COLUMNS)
    .single();
  if (error || !fila) return { ok: false, error: dbErrorMessage(error, 'No se pudo guardar el CRM.') };

  // Plan Nacional: se conservan las filas de los otros países (la base las ignora mientras el plan
  // esté apagado), así reactivar el plan recupera la configuración. Plan Internacional: la lista
  // queda exactamente como la eligió el administrador.
  const deseadas = companyCountryRows(company.id, company);
  const { error: errorAlta } = await db.from('company_countries').upsert(deseadas, { ignoreDuplicates: true });
  if (errorAlta) return { ok: false, error: dbErrorMessage(errorAlta, 'No se pudieron actualizar los países del CRM.') };
  if (company.plan === 'international') {
    const { error: errorBaja } = await db
      .from('company_countries')
      .delete()
      .eq('company_id', company.id)
      .not('country_code', 'in', `(${deseadas.map((d) => d.country_code).join(',')})`);
    if (errorBaja) return { ok: false, error: dbErrorMessage(errorBaja, 'No se pudieron actualizar los países del CRM.') };
  }

  const { data: paises } = await db.from('company_countries').select('company_id, country_code').eq('company_id', company.id);
  // Las divisas de la vista no se editan aquí (las elige la gerencia): se conservan las que ya tenía
  return {
    ok: true,
    data: { ...companyFromRow(fila as CompanyRow, (paises ?? deseadas) as CompanyCountryRow[]), viewCurrencies: company.viewCurrencies ?? [] },
  };
}

/**
 * La gerencia activa o desactiva un país de su CRM (plan Internacional). La base revisa que sea su CRM,
 * su plan y su perfil (RLS), y al activarlo copia las zonas del país al CRM (trigger).
 */
export async function setCompanyCountry(db: SupabaseClient, companyId: string, countryCode: string, enabled: boolean): Promise<DbResult<null>> {
  const { error } = enabled
    ? await db.from('company_countries').upsert({ company_id: companyId, country_code: countryCode }, { ignoreDuplicates: true })
    : await db.from('company_countries').delete().eq('company_id', companyId).eq('country_code', countryCode);
  if (error) return { ok: false, error: dbErrorMessage(error, enabled ? 'No se pudo activar el país.' : 'No se pudo desactivar el país.') };
  return { ok: true, data: null };
}

/** La gerencia suma o quita una divisa del selector de moneda de su CRM. La base revisa su CRM, su perfil y que la moneda sea de un país activo. */
export async function setCompanyViewCurrency(db: SupabaseClient, companyId: string, currency: string, enabled: boolean): Promise<DbResult<null>> {
  const { error } = enabled
    ? await db
        .from('company_view_currencies')
        .upsert({ company_id: companyId, currency_code: currency }, { onConflict: 'company_id,currency_code', ignoreDuplicates: true })
    : await db.from('company_view_currencies').delete().eq('company_id', companyId).eq('currency_code', currency);
  if (error) return { ok: false, error: dbErrorMessage(error, enabled ? 'No se pudo agregar la divisa.' : 'No se pudo quitar la divisa.') };
  return { ok: true, data: null };
}

export async function updateProfile(db: SupabaseClient, user: AppUser): Promise<DbResult<AppUser>> {
  const { data: fila, error } = await db
    .from('profiles')
    .update(profileUpdateRow(user))
    .eq('id', user.id)
    .select(PROFILE_COLUMNS)
    .single();
  if (error || !fila) return { ok: false, error: dbErrorMessage(error, 'No se pudo guardar el usuario.') };
  return { ok: true, data: userFromRow(fila as ProfileRow) };
}

/** Invitación por correo: la persona elige su contraseña al abrir el enlace. Nadie más la conoce. */
export async function inviteUser(db: SupabaseClient, data: Omit<NewAppUser, 'password'>): Promise<DbResult<AppUser>> {
  const { data: sesion } = await db.auth.getSession();
  const token = sesion.session?.access_token;
  if (!token) return { ok: false, error: 'Tu sesión expiró. Vuelve a iniciar sesión.' };

  try {
    const respuesta = await fetch('/api/admin/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        email: data.email,
        fullName: data.fullName,
        role: data.role,
        companyId: data.role === 'superadmin' ? null : data.companyId,
      }),
    });
    const cuerpo = (await respuesta.json().catch(() => ({}))) as { error?: string; profile?: ProfileRow };
    if (!respuesta.ok || !cuerpo.profile) {
      return { ok: false, error: cuerpo.error ?? 'No se pudo enviar la invitación.' };
    }
    return { ok: true, data: userFromRow(cuerpo.profile) };
  } catch {
    return { ok: false, error: 'No hay conexión con el servidor de Revela.' };
  }
}
