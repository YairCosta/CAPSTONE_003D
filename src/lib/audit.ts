// Auditoría: registro de todo lo que pasa dentro de un CRM (quién, qué, cuándo y qué cambió).
// El registro es un historial: nunca se edita ni se borra. Revertir un cambio agrega una entrada nueva.

import type {
  AppUser,
  AuditAction,
  AuditChange,
  AuditEntity,
  AuditEntry,
  AuditRevert,
  CatalogItem,
  ClientAccount,
  Company,
  Lead,
  StageConfig,
} from '../types/crm.ts';
import { COUNTRIES } from '../data/countries.ts';
import { formatMoney, leadCurrency, viewCurrenciesFor } from './currency.ts';
import { isManualValue, itemsSubtotal } from './catalog.ts';
import { contactLine } from './contacts.ts';
import { CONSENT_LABEL, ORIGIN_LABEL } from './privacy.ts';

export const ACTION_LABEL: Record<AuditAction, string> = {
  create: 'Creó',
  update: 'Editó',
  delete: 'Eliminó',
  activate: 'Activó',
  deactivate: 'Desactivó',
  stage: 'Cambió de etapa',
  locate: 'Ubicó en el mapa',
  contact: 'Registró contacto',
  export: 'Exportó datos',
  revert: 'Revirtió',
};

export const ENTITY_LABEL: Record<AuditEntity, string> = {
  lead: 'Lead',
  account: 'Empresa cliente',
  catalog: 'Producto / servicio',
  activity: 'Contacto',
  stage: 'Etapa del pipeline',
  company: 'CRM',
  user: 'Usuario',
  export: 'Exportación',
};

// ------------------------------------------------------------------ comparación de campos
export interface FieldDef<T> {
  key: string;
  label: string;
  value: (item: T) => string | number | null | undefined;
  // Identifica a una persona: el historial registra que cambió, nunca el valor
  personal?: boolean;
}

// Devuelve solo los campos que cambiaron, con su valor anterior y el nuevo
export function diffFields<T>(before: T, after: T, fields: FieldDef<T>[]): AuditChange[] {
  const changes: AuditChange[] = [];
  for (const field of fields) {
    const from = field.value(before);
    const to = field.value(after);
    const norm = (v: string | number | null | undefined) => (v === undefined || v === null || v === '' ? null : v);
    if (norm(from) === norm(to)) continue;
    changes.push(
      field.personal
        ? { field: field.key, label: field.label, before: null, after: null, redacted: true }
        : { field: field.key, label: field.label, before: norm(from), after: norm(to) }
    );
  }
  return changes;
}

const yesNo = (value: boolean) => (value ? 'Sí' : 'No');

export interface AuditContext {
  zoneName: (territoryId?: string) => string;
  itemName: (itemId: string) => string;
  stageLabel: (stage: Lead['commercialStatus']) => string;
}

export const leadFields = (ctx: AuditContext): FieldDef<Lead>[] => [
  { key: 'fullName', label: 'Nombre', value: (l) => l.fullName, personal: true },
  { key: 'jobTitle', label: 'Cargo del contacto', value: (l) => l.jobTitle ?? 'Sin cargo', personal: true },
  { key: 'companyName', label: 'Empresa cliente', value: (l) => l.companyName ?? 'Persona natural' },
  { key: 'email', label: 'Email', value: (l) => l.email, personal: true },
  { key: 'phone', label: 'Teléfono', value: (l) => l.phone, personal: true },
  {
    key: 'contacts',
    label: 'Otros contactos',
    value: (l) => (l.contacts ?? []).map((c) => contactLine(c)).join(', ') || 'Sin otros contactos',
    personal: true,
  },
  { key: 'countryCode', label: 'País', value: (l) => COUNTRIES[l.countryCode]?.name },
  { key: 'currency', label: 'Moneda del lead', value: (l) => leadCurrency(l) },
  { key: 'commercialStatus', label: 'Etapa', value: (l) => ctx.stageLabel(l.commercialStatus) },
  {
    key: 'estimatedDealValue',
    label: 'Valor estimado',
    value: (l) =>
      `${formatMoney(l.estimatedDealValue || 0, leadCurrency(l))}${isManualValue(l) ? ' (manual)' : ''}`,
  },
  { key: 'rawAddress', label: 'Dirección', value: (l) => l.rawAddress, personal: true },
  { key: 'assignedTerritoryId', label: 'Zona', value: (l) => ctx.zoneName(l.assignedTerritoryId) },
  { key: 'notes', label: 'Notas', value: (l) => l.notes, personal: true },
  { key: 'dataOrigin', label: 'Origen del dato', value: (l) => (l.dataOrigin ? ORIGIN_LABEL[l.dataOrigin] : 'No registrado') },
  {
    key: 'consentStatus',
    label: 'Autorización del titular',
    value: (l) => (l.consentStatus ? CONSENT_LABEL[l.consentStatus] : 'No registrada'),
  },
  { key: 'noContact', label: 'No contactar', value: (l) => yesNo(Boolean(l.noContact)) },
  {
    key: 'items',
    label: 'Productos y servicios',
    value: (l) => (l.items ?? []).map((i) => `${ctx.itemName(i.itemId)} ×${i.quantity}`).join(', ') || 'Sin ítems',
  },
];

export const accountFields: FieldDef<ClientAccount>[] = [
  { key: 'name', label: 'Nombre', value: (a) => a.name },
  { key: 'countryCode', label: 'País', value: (a) => COUNTRIES[a.countryCode]?.name },
  { key: 'taxId', label: 'ID tributario', value: (a) => a.taxId },
  { key: 'industry', label: 'Rubro', value: (a) => a.industry },
  { key: 'contactName', label: 'Contacto principal', value: (a) => a.contactName, personal: true },
  { key: 'email', label: 'Email', value: (a) => a.email, personal: true },
  { key: 'phone', label: 'Teléfono', value: (a) => a.phone, personal: true },
  { key: 'address', label: 'Dirección', value: (a) => a.address },
  { key: 'notes', label: 'Notas', value: (a) => a.notes, personal: true },
  { key: 'isActive', label: 'Activa', value: (a) => yesNo(a.isActive) },
];

export const catalogFields: FieldDef<CatalogItem>[] = [
  { key: 'name', label: 'Nombre', value: (i) => i.name },
  { key: 'type', label: 'Tipo', value: (i) => (i.type === 'product' ? 'Producto' : 'Servicio') },
  { key: 'sku', label: 'Código', value: (i) => i.sku },
  { key: 'category', label: 'Categoría', value: (i) => i.category },
  { key: 'billing', label: 'Cobro', value: (i) => (i.billing === 'monthly' ? 'Mensual' : i.billing ? 'Pago único' : null) },
  {
    key: 'prices',
    label: 'Precios',
    value: (i) =>
      Object.entries(i.prices)
        .map(([code, price]) => `${code} ${formatMoney(price ?? 0, COUNTRIES[code as keyof typeof COUNTRIES].currency)}`)
        .join(' · ') || 'Sin precio',
  },
  { key: 'isActive', label: 'Activo', value: (i) => yesNo(i.isActive) },
];

export const stageFields: FieldDef<StageConfig>[] = [
  { key: 'label', label: 'Nombre', value: (s) => s.label },
  { key: 'shortCode', label: 'Código corto', value: (s) => s.shortCode },
  { key: 'winProbability', label: 'Probabilidad de cierre', value: (s) => `${s.winProbability}%` },
  { key: 'slaDays', label: 'SLA', value: (s) => (s.slaDays > 0 ? `${s.slaDays} días` : 'Sin límite') },
  { key: 'description', label: 'Descripción', value: (s) => s.description },
];

export const companyFields: FieldDef<Company>[] = [
  { key: 'name', label: 'Nombre', value: (c) => c.name },
  { key: 'taxId', label: 'ID tributario', value: (c) => c.taxId },
  { key: 'isActive', label: 'CRM activo', value: (c) => yesNo(c.isActive) },
  { key: 'plan', label: 'Plan', value: (c) => (c.plan === 'international' ? 'Internacional' : 'Nacional') },
  // Los países que cuentan: con el plan Nacional, solo el base (la lista guardada no se muestra)
  {
    key: 'enabledCountries',
    label: 'Países',
    value: (c) => (c.plan === 'international' ? c.enabledCountries : [c.homeCountry]).map((x) => COUNTRIES[x]?.name ?? x).join(', '),
  },
  {
    key: 'viewCurrencies',
    label: 'Divisas para ver el CRM',
    value: (c) =>
      viewCurrenciesFor(c.homeCountry, c.plan === 'international' ? c.enabledCountries : [c.homeCountry], c.viewCurrencies).join(', '),
  },
];

export const userFields: FieldDef<AppUser>[] = [
  { key: 'role', label: 'Rol', value: (u) => u.role },
  { key: 'isActive', label: 'Activo', value: (u) => yesNo(u.isActive) },
];

// ------------------------------------------------------------------ creación de entradas
export interface NewAuditEntry {
  companyId: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  entityLabel: string;
  summary: string;
  changes?: AuditChange[];
  revert?: AuditRevert;
}

export function buildAuditEntry(data: NewAuditEntry, actor: AppUser, id: string, now: Date = new Date()): AuditEntry {
  return {
    ...data,
    id,
    actorId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    changes: data.changes ?? [],
    createdAt: now.toISOString(),
  };
}

// Entradas visibles: solo las del propio CRM (mismo aislamiento que el resto de los datos)
export const scopeAuditLog = (log: AuditEntry[], tenantId: string | null) =>
  tenantId ? log.filter((e) => e.companyId === tenantId) : [];

// Se puede revertir si el cambio guardó cómo estaba antes y nadie lo revirtió ya
export const isRevertible = (entry: AuditEntry) => Boolean(entry.revert) && !entry.revertedAt;

// Resumen del valor de un lead para los mensajes del historial
export const leadSummary = (lead: Lead) =>
  `${lead.companyName?.trim() || 'Persona natural'} · ${formatMoney(
    lead.items?.length && lead.valueSource !== 'manual' ? itemsSubtotal(lead.items) : lead.estimatedDealValue || 0,
    leadCurrency(lead)
  )}`;
