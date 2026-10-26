// Historial de auditoría en la base (audit_log). Solo se agrega: no hay edición ni borrado, y la
// base firma cada entrada con el autor real de la sesión. Ver docs/AUDITORIA.md.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuditEntry } from '../../types/crm.ts';
import { auditEntryFromRow, auditEntryToRow, type AuditRow } from './mappers.ts';
import { dbErrorMessage } from './errors.ts';
import type { DbResult } from './platform.ts';

/** Cuántas entradas se cargan al abrir el CRM (las más recientes). */
export const AUDIT_PAGE_SIZE = 500;

/**
 * Guarda una entrada. Sin devolverla: el administrador de la plataforma escribe en el historial
 * de un CRM pero no puede leerlo, y pedir la fila de vuelta haría fallar su inserción.
 */
export async function saveAuditEntry(db: SupabaseClient, entry: AuditEntry): Promise<string | null> {
  const { error } = await db.from('audit_log').insert(auditEntryToRow(entry));
  return error ? dbErrorMessage(error, 'No se pudo registrar el cambio en la auditoría.') : null;
}

/** Historial del CRM, del más nuevo al más antiguo. RLS solo lo muestra a su gerencia. */
export async function loadAuditLog(
  db: SupabaseClient,
  companyId: string,
  nameOf: (userId: string) => string | undefined = () => undefined
): Promise<DbResult<AuditEntry[]>> {
  const { data, error } = await db
    .from('audit_log')
    .select(
      'id, company_id, actor_id, actor_name, actor_role, action, entity, entity_id, entity_label, summary, changes, revert_snapshot, reverted_at, reverted_by, created_at'
    )
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(AUDIT_PAGE_SIZE);
  if (error) return { ok: false, error: dbErrorMessage(error, 'No se pudo cargar el historial de auditoría.') };
  return { ok: true, data: ((data ?? []) as AuditRow[]).map((row) => auditEntryFromRow(row, nameOf)) };
}
