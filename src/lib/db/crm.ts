// El trabajo diario del CRM contra Supabase: cargar todo lo del CRM al entrar y aplicar, en orden,
// lo que cambió (ver sync.ts). RLS y los triggers de la base vuelven a revisar cada escritura:
// aislamiento entre CRMs, país habilitado, bloqueo por derechos del titular y bitácora que solo se
// agrega. Si la base rechaza algo, se devuelve el motivo y la app recarga lo que de verdad quedó.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PrivacyRequestReason } from '../../types/crm.ts';
import {
  ACCOUNT_COLUMNS,
  ACTIVITY_COLUMNS,
  CATALOG_COLUMNS,
  CONTACT_COLUMNS,
  LEAD_COLUMNS,
  PRIVACY_COLUMNS,
  STAGE_COLUMNS,
  assembleTenantData,
  tenantRowsFromSnapshot,
  type AccountRow,
  type ActivityRow,
  type CatalogRow,
  type ContactRow,
  type LeadItemRow,
  type LeadRow,
  type PriceRow,
  type PrivacyRequestRow,
  type StageRow,
  type TenantSnapshotV2,
  type TerritoryRow,
} from './crmMappers.ts';
import { dbErrorMessage, type DbErrorLike } from './errors.ts';
import type { DbResult } from './platform.ts';
import type { SyncOp } from './sync.ts';

/** Leads, empresas, bitácora, catálogo, etapas guardadas y zonas de un CRM. */
export type TenantData = ReturnType<typeof assembleTenantData>;

// Supabase entrega como máximo 1.000 filas por consulta: se pide por páginas
const PAGE = 1000;
// Las columnas se piden como texto armado: el tipo de cada fila lo fija quien llama
type Page = PromiseLike<{ data: unknown; error: DbErrorLike | null }>;

async function fetchAll<T>(page: (from: number, to: number) => Page): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    const lote = (Array.isArray(data) ? data : []) as T[];
    rows.push(...lote);
    if (lote.length < PAGE) return rows;
  }
}

/** Todo lo del CRM que la sesión puede ver (RLS decide qué). */
export async function loadTenantData(db: SupabaseClient, companyId: string): Promise<DbResult<TenantData>> {
  const de = (tabla: string, columnas: string, orden = 'id') => (from: number, to: number) =>
    db.from(tabla).select(columnas).eq('company_id', companyId).order(orden).range(from, to);
  try {
    const [cuentas, leads, contactos, items, actividades, solicitudes, catalogo, precios, etapas, zonas] = await Promise.all([
      fetchAll<AccountRow>(de('client_accounts', ACCOUNT_COLUMNS)),
      fetchAll<LeadRow>(de('leads', LEAD_COLUMNS)),
      fetchAll<ContactRow>(
        (from: number, to: number) =>
          db.from('lead_contacts').select(CONTACT_COLUMNS).eq('company_id', companyId).eq('is_primary', false).order('id').range(from, to)
      ),
      fetchAll<LeadItemRow>(de('lead_items', 'id, lead_id, catalog_item_id, quantity, unit_price')),
      fetchAll<ActivityRow>(de('lead_activities', ACTIVITY_COLUMNS)),
      fetchAll<PrivacyRequestRow>(de('lead_privacy_requests', PRIVACY_COLUMNS)),
      fetchAll<CatalogRow>(de('catalog_items', CATALOG_COLUMNS)),
      // Los precios no tienen company_id: RLS solo deja ver los del catálogo propio
      fetchAll<PriceRow>(
        (from: number, to: number) =>
          db.from('catalog_item_prices').select('catalog_item_id, country_code, price').order('catalog_item_id').order('country_code').range(from, to)
      ),
      fetchAll<StageRow>(de('pipeline_stage_configs', STAGE_COLUMNS, 'order_index')),
      fetchAll<TerritoryRow>(
        de('territories_geojson', 'id, company_id, country_code, name, code, color_hex, polygon, region_code, region_name, province_name, region_order', 'code')
      ),
    ]);
    return {
      ok: true,
      data: assembleTenantData({
        client_accounts: cuentas,
        leads,
        lead_contacts: contactos,
        lead_items: items,
        lead_privacy_requests: solicitudes,
        lead_activities: actividades,
        catalog_items: catalogo,
        catalog_item_prices: precios,
        pipeline_stage_configs: etapas,
        territories: zonas,
      }),
    };
  } catch (error) {
    return { ok: false, error: dbErrorMessage(error as DbErrorLike, 'No se pudieron cargar los datos del CRM.') };
  }
}

// ------------------------------------------------------------------ exportación (administrador de plataforma)
/**
 * Datos de un CRM para exportarlo. El administrador no puede leer las tablas de un CRM (RLS);
 * export_tenant_snapshot() se lo entrega completo, y solo a él.
 */
export async function loadCompanyExportData(db: SupabaseClient, companyId: string): Promise<DbResult<TenantData>> {
  const { data, error } = await db.rpc('export_tenant_snapshot', { p_company_id: companyId });
  if (error || !data) return { ok: false, error: dbErrorMessage(error, 'No se pudieron leer los datos del CRM para exportarlos.') };
  return { ok: true, data: assembleTenantData(tenantRowsFromSnapshot(data as TenantSnapshotV2)) };
}

/** Deja constancia de la exportación en data_exports (quién, cuándo y cuántas filas). */
export async function recordDataExport(
  db: SupabaseClient,
  data: { companyId: string; userId: string; rowCounts: Record<string, number> }
): Promise<string | null> {
  const { error } = await db.from('data_exports').insert({
    company_id: data.companyId,
    exported_by: data.userId,
    format: 'xlsx',
    format_version: 'v2',
    row_counts: data.rowCounts,
  });
  return error ? dbErrorMessage(error, 'No se pudo registrar la exportación.') : null;
}

const QUE: Record<SyncOp['kind'], string> = {
  'stage-upsert': 'No se pudo guardar la etapa del pipeline',
  'catalog-upsert': 'No se pudo guardar el producto o servicio',
  'catalog-delete': 'No se pudo eliminar el producto o servicio',
  'account-insert': 'No se pudo crear la empresa cliente',
  'account-update': 'No se pudo guardar la empresa cliente',
  'account-delete': 'No se pudo eliminar la empresa cliente',
  'lead-insert': 'No se pudo guardar el lead',
  'lead-update': 'No se pudo guardar el cambio del lead',
  'lead-contacts': 'No se pudieron guardar las personas de contacto',
  'lead-items': 'No se pudieron guardar los productos del lead',
  'activity-insert': 'No se pudo registrar el contacto',
};

async function applyOne(db: SupabaseClient, op: SyncOp, userId: string): Promise<DbErrorLike | 'sin-filas' | null> {
  switch (op.kind) {
    case 'stage-upsert':
      return (await db.from('pipeline_stage_configs').upsert(op.row, { onConflict: 'company_id,stage' })).error;
    case 'catalog-upsert': {
      const { error } = await db.from('catalog_items').upsert(op.row);
      if (error) return error;
      if (op.prices.length > 0) {
        const { error: errorPrecios } = await db.from('catalog_item_prices').upsert(op.prices, { onConflict: 'catalog_item_id,country_code' });
        if (errorPrecios) return errorPrecios;
      }
      if (op.removedCountries.length > 0) {
        const { error: errorBaja } = await db
          .from('catalog_item_prices')
          .delete()
          .eq('catalog_item_id', op.row.id)
          .in('country_code', op.removedCountries);
        if (errorBaja) return errorBaja;
      }
      return null;
    }
    case 'catalog-delete': {
      const { data, error } = await db.from('catalog_items').delete().eq('id', op.id).select('id');
      return error ?? (data?.length ? null : 'sin-filas');
    }
    case 'account-insert':
      return (await db.from('client_accounts').insert(op.row)).error;
    case 'account-update': {
      const { data, error } = await db.from('client_accounts').update(op.patch).eq('id', op.id).select('id');
      return error ?? (data?.length ? null : 'sin-filas');
    }
    case 'account-delete': {
      const { data, error } = await db.from('client_accounts').delete().eq('id', op.id).select('id');
      return error ?? (data?.length ? null : 'sin-filas');
    }
    case 'lead-insert':
      return (await db.from('leads').insert({ ...op.row, created_by: userId })).error;
    case 'lead-update': {
      const { data, error } = await db.from('leads').update(op.patch).eq('id', op.id).select('id');
      return error ?? (data?.length ? null : 'sin-filas');
    }
    case 'lead-contacts': {
      if (op.upserts.length > 0) {
        const { error } = await db.from('lead_contacts').upsert(op.upserts);
        if (error) return error;
      }
      if (op.deleteIds.length > 0) {
        const { error } = await db.from('lead_contacts').delete().in('id', op.deleteIds).eq('is_primary', false);
        if (error) return error;
      }
      return null;
    }
    case 'lead-items': {
      // Primero se agregan y después se quitan: si el lead quedara un instante sin productos, la
      // base lo pasaría a valor manual (recalculate_lead_value)
      if (op.upserts.length > 0) {
        const { error } = await db.from('lead_items').upsert(op.upserts, { onConflict: 'lead_id,catalog_item_id' });
        if (error) return error;
      }
      if (op.deleteItemIds.length > 0) {
        const { error } = await db.from('lead_items').delete().eq('lead_id', op.leadId).in('catalog_item_id', op.deleteItemIds);
        if (error) return error;
      }
      return null;
    }
    case 'activity-insert':
      return (await db.from('lead_activities').insert({ ...op.row, created_by: userId })).error;
  }
}

/** Aplica las operaciones en orden y se detiene en la primera que la base rechace. */
export async function applySyncOps(db: SupabaseClient, ops: SyncOp[], ctx: { userId: string }): Promise<string | null> {
  for (const op of ops) {
    let resultado: DbErrorLike | 'sin-filas' | null;
    try {
      resultado = await applyOne(db, op, ctx.userId);
    } catch {
      return `${QUE[op.kind]}: no hay conexión con la base.`;
    }
    if (resultado === 'sin-filas') {
      return `${QUE[op.kind]}: la base no lo permitió para tu perfil o el dato ya no existe.`;
    }
    if (resultado) return `${QUE[op.kind]}: ${dbErrorMessage(resultado, 'la base lo rechazó.')}`;
  }
  return null;
}

// ------------------------------------------------------------------ derechos del titular
export async function insertPrivacyRequest(
  db: SupabaseClient,
  data: { companyId: string; leadId: string; reason: PrivacyRequestReason; detail?: string; userId: string; userName: string }
): Promise<string | null> {
  const { error } = await db.from('lead_privacy_requests').insert({
    company_id: data.companyId,
    lead_id: data.leadId,
    reason: data.reason,
    detail: data.detail?.trim() || null,
    requested_by: data.userId,
    // La base lo reemplaza por el nombre real del perfil (trigger lead_privacy_requests_before_insert)
    requested_by_name: data.userName,
  });
  return error ? `No se pudo registrar la solicitud: ${dbErrorMessage(error, 'la base la rechazó.')}` : null;
}

/** Aprobar anonimiza en la base (anonymize_lead_internal); la app no puede hacerlo por su cuenta. */
export async function resolvePrivacyRequest(db: SupabaseClient, leadId: string, approve: boolean, note: string): Promise<string | null> {
  const { data: pendiente, error: errorBusqueda } = await db
    .from('lead_privacy_requests')
    .select('id')
    .eq('lead_id', leadId)
    .eq('status', 'pending')
    .maybeSingle();
  if (errorBusqueda) return `No se pudo resolver la solicitud: ${dbErrorMessage(errorBusqueda, 'la base no respondió.')}`;
  if (!pendiente) return 'No se pudo resolver la solicitud: ya no hay una pendiente para este lead.';
  const { error } = await db.rpc('resolve_lead_privacy_request', {
    p_request_id: pendiente.id,
    p_approve: approve,
    p_note: note.trim() || null,
  });
  return error ? `No se pudo resolver la solicitud: ${dbErrorMessage(error, 'la base la rechazó.')}` : null;
}

// ------------------------------------------------------------------ auditoría
export async function markAuditReverted(db: SupabaseClient, entryId: string): Promise<string | null> {
  const { error } = await db.rpc('mark_audit_entry_reverted', { p_entry_id: entryId });
  return error ? `No se pudo marcar el cambio como revertido: ${dbErrorMessage(error, 'la base lo rechazó.')}` : null;
}
