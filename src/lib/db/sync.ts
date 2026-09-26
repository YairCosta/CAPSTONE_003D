// Sincronización del CRM con la base. La app sigue trabajando sobre su estado (con sus guards), y
// cada cambio se compara con lo último que quedó guardado para mandar a la base solo lo distinto,
// en un orden que respeta las claves foráneas: catálogo → empresas → leads → sus contactos y
// productos → actividades → bajas. Función pura: se prueba en npm run test:supabase.
//
// Lo que NO pasa por aquí:
//   · Derechos del titular: la solicitud y su resolución van por su propia llamada, y anonimizar
//     solo lo hace la base (resolve_lead_privacy_request).
//   · Leads eliminados: la app no elimina leads.
//   · Actividades editadas: la bitácora solo se agrega.

import type { CatalogItem, ClientAccount, Lead, LeadActivity } from '../../types/crm.ts';
import {
  accountToRow,
  activityToRow,
  catalogPriceRows,
  catalogToRow,
  contactToRow,
  leadItemToRow,
  leadToRow,
  type LeadWriteRow,
} from './crmMappers.ts';

export interface TenantSnapshot {
  leads: Lead[];
  accounts: ClientAccount[];
  activities: LeadActivity[];
  catalog: CatalogItem[];
}

type Row = Record<string, unknown>;

export type SyncOp =
  | { kind: 'catalog-upsert'; row: ReturnType<typeof catalogToRow>; prices: ReturnType<typeof catalogPriceRows>; removedCountries: string[] }
  | { kind: 'catalog-delete'; id: string }
  | { kind: 'account-insert'; row: ReturnType<typeof accountToRow> }
  | { kind: 'account-update'; id: string; patch: Row }
  | { kind: 'account-delete'; id: string }
  | { kind: 'lead-insert'; row: LeadWriteRow }
  | { kind: 'lead-update'; id: string; patch: Partial<LeadWriteRow> }
  | { kind: 'lead-contacts'; leadId: string; upserts: ReturnType<typeof contactToRow>[]; deleteIds: string[] }
  | { kind: 'lead-items'; leadId: string; upserts: ReturnType<typeof leadItemToRow>[]; deleteItemIds: string[] }
  | { kind: 'activity-insert'; row: ReturnType<typeof activityToRow> };

/** Lo del CRM activo, para compararlo sin mezclar otros CRMs. */
export function snapshotFor(companyId: string, data: TenantSnapshot): TenantSnapshot {
  return {
    leads: data.leads.filter((l) => l.companyId === companyId),
    accounts: data.accounts.filter((a) => a.companyId === companyId),
    activities: data.activities.filter((a) => (a.companyId ?? companyId) === companyId),
    catalog: data.catalog.filter((i) => i.companyId === companyId),
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Solo las columnas que cambiaron: dos personas editando campos distintos no se pisan. */
function changedColumns<T extends Row>(before: T, after: T, skip: string[] = []): Partial<T> {
  const patch: Partial<T> = {};
  for (const key of Object.keys(after) as (keyof T & string)[]) {
    if (skip.includes(key)) continue;
    if (!same(before[key], after[key])) patch[key] = after[key];
  }
  return patch;
}

const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]));

export function diffTenantData(prev: TenantSnapshot, next: TenantSnapshot): SyncOp[] {
  const catalogOps: SyncOp[] = [];
  const accountOps: SyncOp[] = [];
  const leadOps: SyncOp[] = [];
  const childOps: SyncOp[] = [];
  const activityOps: SyncOp[] = [];
  const deleteOps: SyncOp[] = [];

  // Catálogo (con precios por país)
  const prevCatalog = byId(prev.catalog);
  const nextCatalog = byId(next.catalog);
  for (const item of next.catalog) {
    const before = prevCatalog.get(item.id);
    const row = catalogToRow(item);
    const prices = catalogPriceRows(item);
    const beforePrices = before ? catalogPriceRows(before) : [];
    if (before && same(catalogToRow(before), row) && same(beforePrices, prices)) continue;
    const removedCountries = beforePrices
      .map((p) => p.country_code)
      .filter((code) => !prices.some((p) => p.country_code === code));
    catalogOps.push({ kind: 'catalog-upsert', row, prices, removedCountries });
  }
  for (const item of prev.catalog) {
    if (!nextCatalog.has(item.id)) deleteOps.push({ kind: 'catalog-delete', id: item.id });
  }

  // Empresas cliente
  const prevAccounts = byId(prev.accounts);
  const nextAccounts = byId(next.accounts);
  for (const account of next.accounts) {
    const before = prevAccounts.get(account.id);
    if (!before) {
      accountOps.push({ kind: 'account-insert', row: accountToRow(account) });
      continue;
    }
    const patch = changedColumns(accountToRow(before), accountToRow(account), ['id', 'company_id']);
    if (Object.keys(patch).length > 0) accountOps.push({ kind: 'account-update', id: account.id, patch });
  }
  for (const account of prev.accounts) {
    if (!nextAccounts.has(account.id)) deleteOps.push({ kind: 'account-delete', id: account.id });
  }

  // Leads, sus otras personas de contacto y sus productos
  const prevLeads = byId(prev.leads);
  for (const lead of next.leads) {
    const before = prevLeads.get(lead.id);
    if (!before) {
      leadOps.push({ kind: 'lead-insert', row: leadToRow(lead) });
    } else {
      const patch = changedColumns(leadToRow(before), leadToRow(lead), ['id', 'company_id']);
      if (Object.keys(patch).length > 0) leadOps.push({ kind: 'lead-update', id: lead.id, patch });
    }

    const beforeContacts = before?.contacts ?? [];
    const contacts = lead.contacts ?? [];
    const contactUpserts = contacts
      .filter((c) => !same(beforeContacts.find((b) => b.id === c.id), c))
      .map((c) => contactToRow(lead, c));
    const contactDeletes = beforeContacts.filter((b) => !contacts.some((c) => c.id === b.id)).map((b) => b.id);
    if (contactUpserts.length > 0 || contactDeletes.length > 0) {
      childOps.push({ kind: 'lead-contacts', leadId: lead.id, upserts: contactUpserts, deleteIds: contactDeletes });
    }

    const beforeItems = before?.items ?? [];
    const items = lead.items ?? [];
    const itemUpserts = items
      .filter((i) => !same(beforeItems.find((b) => b.itemId === i.itemId), i))
      .map((i) => leadItemToRow(lead, i));
    const itemDeletes = beforeItems.filter((b) => !items.some((i) => i.itemId === b.itemId)).map((b) => b.itemId);
    if (itemUpserts.length > 0 || itemDeletes.length > 0) {
      childOps.push({ kind: 'lead-items', leadId: lead.id, upserts: itemUpserts, deleteItemIds: itemDeletes });
    }
  }

  // Bitácora: solo altas
  const prevActivities = new Set(prev.activities.map((a) => a.id));
  for (const activity of next.activities) {
    if (prevActivities.has(activity.id)) continue;
    const lead = next.leads.find((l) => l.id === activity.leadId);
    activityOps.push({ kind: 'activity-insert', row: activityToRow(activity, lead?.companyId ?? activity.companyId ?? '') });
  }

  // Las bajas van al final: primero se sueltan las referencias
  return [...catalogOps, ...accountOps, ...leadOps, ...childOps, ...activityOps, ...deleteOps];
}

/** Reemplaza en lo ya sincronizado los leads que la base cambió por su cuenta (p. ej. al anonimizar). */
export function acceptLeads(snapshot: TenantSnapshot, leads: Lead[]): TenantSnapshot {
  const nuevos = byId(leads);
  return { ...snapshot, leads: snapshot.leads.map((l) => nuevos.get(l.id) ?? l) };
}
