// Traducción entre las tablas del trabajo diario del CRM y los tipos de la app: leads, contactos,
// productos del lead, actividades, empresas cliente, catálogo, zonas y solicitudes del titular.
// Funciones puras: se prueban sin conexión (npm run test:supabase). Ver docs/BASE_DE_DATOS.md §6.

import type {
  BillingType,
  CatalogItem,
  ClientAccount,
  CommercialStatus,
  ConsentStatus,
  ContactChannel,
  ContactOutcome,
  GeocodingStatus,
  Lead,
  LeadActivity,
  LeadContact,
  LeadDataOrigin,
  LeadItem,
  LeadValueSource,
  PrivacyRequest,
  PrivacyRequestReason,
  StageConfig,
  TerritoryMetric,
} from '../../types/crm.ts';
import { COUNTRIES, isCountryCode, type CountryCode, type CurrencyCode } from '../../data/countries.ts';

/** Texto vacío o con solo espacios: la base lo guarda como NULL (sus CHECK rechazan textos en blanco). */
const blank = (value?: string | null): string | null => {
  const text = value?.trim();
  return text ? text : null;
};
const optional = <T>(value: T | null | undefined): T | undefined => (value === null ? undefined : value);
const toNumber = (value: unknown): number => (typeof value === 'number' ? value : Number(value ?? 0) || 0);
const toCountry = (code: string | null | undefined): CountryCode => {
  const limpio = (code ?? '').trim();
  return isCountryCode(limpio) ? limpio : 'CL';
};

// ------------------------------------------------------------------ empresas cliente
export const ACCOUNT_COLUMNS =
  'id, company_id, country_code, name, tax_id, industry, contact_name, email, phone, address, notes, is_active, created_at';

export interface AccountRow {
  id: string;
  company_id: string;
  country_code: string;
  name: string;
  tax_id: string | null;
  industry: string | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

export function accountFromRow(row: AccountRow): ClientAccount {
  return {
    id: row.id,
    companyId: row.company_id,
    countryCode: toCountry(row.country_code),
    name: row.name,
    taxId: optional(row.tax_id),
    industry: optional(row.industry),
    contactName: optional(row.contact_name),
    email: optional(row.email),
    phone: optional(row.phone),
    address: optional(row.address),
    notes: optional(row.notes),
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

export function accountToRow(account: ClientAccount) {
  return {
    id: account.id,
    company_id: account.companyId,
    country_code: account.countryCode,
    name: account.name.trim(),
    tax_id: blank(account.taxId),
    industry: blank(account.industry),
    contact_name: blank(account.contactName),
    email: blank(account.email),
    phone: blank(account.phone),
    address: blank(account.address),
    notes: blank(account.notes),
    is_active: account.isActive,
  };
}

// ------------------------------------------------------------------ leads
export const LEAD_COLUMNS =
  'id, company_id, full_name, job_title, email, phone, commercial_status, estimated_deal_value, currency_code, raw_address, ' +
  'normalized_address, geocoding_status, assigned_territory_id, last_contacted_at, notes, client_account_id, ' +
  'country_code, value_source, data_origin, consent_status, consent_at, no_contact, anonymized_at, anonymized_reason, created_at';

export interface LeadRow {
  id: string;
  company_id: string;
  full_name: string;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  commercial_status: string | null;
  estimated_deal_value: number | string | null;
  currency_code: string | null;
  raw_address: string;
  normalized_address: string | null;
  geocoding_status: string | null;
  assigned_territory_id: string | null;
  last_contacted_at: string | null;
  notes: string | null;
  client_account_id: string | null;
  country_code: string;
  value_source: string | null;
  data_origin: string | null;
  consent_status: string | null;
  consent_at: string | null;
  no_contact: boolean | null;
  anonymized_at: string | null;
  anonymized_reason: string | null;
  created_at: string;
}

export interface LeadExtras {
  accountName?: string;
  contacts: LeadContact[];
  items: LeadItem[];
  privacyRequest?: PrivacyRequest;
}

export function leadFromRow(row: LeadRow, extras: LeadExtras): Lead {
  const countryCode = toCountry(row.country_code);
  const currency = (row.currency_code ?? '').trim() as CurrencyCode;
  return {
    id: row.id,
    companyId: row.company_id,
    countryCode,
    fullName: row.full_name,
    jobTitle: optional(row.job_title),
    companyName: extras.accountName,
    clientAccountId: optional(row.client_account_id),
    email: optional(row.email),
    phone: optional(row.phone),
    commercialStatus: (row.commercial_status ?? 'new') as CommercialStatus,
    estimatedDealValue: toNumber(row.estimated_deal_value),
    // Sin valor = la moneda del país del lead (así lo entiende toda la app)
    currency: currency && currency !== COUNTRIES[countryCode].currency ? currency : undefined,
    rawAddress: row.raw_address,
    normalizedAddress: optional(row.normalized_address),
    geocodingStatus: (row.geocoding_status ?? 'pending') as GeocodingStatus,
    assignedTerritoryId: optional(row.assigned_territory_id),
    createdAt: row.created_at,
    lastContactedAt: optional(row.last_contacted_at),
    notes: optional(row.notes),
    contacts: extras.contacts,
    items: extras.items,
    valueSource: (row.value_source ?? 'manual') as LeadValueSource,
    dataOrigin: optional(row.data_origin) as LeadDataOrigin | undefined,
    consentStatus: optional(row.consent_status) as ConsentStatus | undefined,
    consentAt: optional(row.consent_at),
    noContact: row.no_contact ? true : undefined,
    privacyRequest: extras.privacyRequest,
    anonymizedAt: optional(row.anonymized_at),
    anonymizedReason: optional(row.anonymized_reason) as Lead['anonymizedReason'],
  };
}

/**
 * Columnas que la app escribe. No incluye la fecha de creación (la fija la base) ni la
 * anonimización: esa solo la hacen las funciones de la base (trigger leads_enforce_privacy).
 */
export function leadToRow(lead: Lead) {
  return {
    id: lead.id,
    company_id: lead.companyId,
    full_name: lead.fullName.trim() || 'Contacto por identificar',
    job_title: blank(lead.jobTitle),
    email: blank(lead.email),
    phone: blank(lead.phone),
    commercial_status: lead.commercialStatus,
    estimated_deal_value: Math.max(0, Number(lead.estimatedDealValue) || 0),
    currency_code: lead.currency ?? COUNTRIES[lead.countryCode].currency,
    raw_address: lead.rawAddress.trim() || 'Dirección por confirmar',
    normalized_address: blank(lead.normalizedAddress),
    geocoding_status: lead.geocodingStatus,
    assigned_territory_id: lead.assignedTerritoryId ?? null,
    last_contacted_at: lead.lastContactedAt ?? null,
    notes: blank(lead.notes),
    client_account_id: lead.clientAccountId ?? null,
    country_code: lead.countryCode,
    value_source: lead.valueSource ?? 'manual',
    data_origin: lead.dataOrigin ?? null,
    consent_status: lead.consentStatus ?? null,
    consent_at: lead.consentAt ?? null,
    no_contact: Boolean(lead.noContact),
  };
}

export type LeadWriteRow = ReturnType<typeof leadToRow>;

// ------------------------------------------------------------------ otras personas del lead
export const CONTACT_COLUMNS = 'id, lead_id, full_name, job_title, email, phone';

export interface ContactRow {
  id: string;
  lead_id: string;
  full_name: string;
  job_title: string | null;
  email: string | null;
  phone: string | null;
}

export const contactFromRow = (row: ContactRow): LeadContact => ({
  id: row.id,
  fullName: row.full_name,
  jobTitle: optional(row.job_title),
  email: optional(row.email),
  phone: optional(row.phone),
});

/** Solo los contactos adicionales: el principal lo copia la base desde el lead (0017). */
export const contactToRow = (lead: Pick<Lead, 'id' | 'companyId'>, contact: LeadContact) => ({
  id: contact.id,
  company_id: lead.companyId,
  lead_id: lead.id,
  full_name: contact.fullName.trim(),
  job_title: blank(contact.jobTitle),
  email: blank(contact.email),
  phone: blank(contact.phone),
  is_primary: false,
});

// ------------------------------------------------------------------ productos y servicios del lead
export interface LeadItemRow {
  lead_id: string;
  catalog_item_id: string;
  quantity: number;
  unit_price: number | string;
}

export const leadItemFromRow = (row: LeadItemRow): LeadItem => ({
  itemId: row.catalog_item_id,
  quantity: row.quantity,
  unitPrice: toNumber(row.unit_price),
});

export const leadItemToRow = (lead: Pick<Lead, 'id' | 'companyId'>, item: LeadItem) => ({
  company_id: lead.companyId,
  lead_id: lead.id,
  catalog_item_id: item.itemId,
  quantity: item.quantity,
  unit_price: item.unitPrice,
});

// ------------------------------------------------------------------ bitácora de contactos
export const ACTIVITY_COLUMNS =
  'id, lead_id, company_id, channel, outcome, summary, next_follow_up_date, agent_name, contact_name, created_at';

export interface ActivityRow {
  id: string;
  lead_id: string;
  company_id: string;
  channel: string;
  outcome: string;
  summary: string;
  next_follow_up_date: string | null;
  agent_name: string;
  contact_name: string | null;
  created_at: string;
}

export const activityFromRow = (row: ActivityRow): LeadActivity => ({
  id: row.id,
  leadId: row.lead_id,
  companyId: row.company_id,
  channel: row.channel as ContactChannel,
  outcome: row.outcome as ContactOutcome,
  summary: row.summary,
  nextFollowUpDate: optional(row.next_follow_up_date),
  agentName: row.agent_name,
  contactName: optional(row.contact_name),
  createdAt: row.created_at,
});

export const activityToRow = (activity: LeadActivity, companyId: string) => ({
  id: activity.id,
  lead_id: activity.leadId,
  company_id: activity.companyId ?? companyId,
  channel: activity.channel,
  outcome: activity.outcome,
  summary: activity.summary.trim() || 'Sin detalle',
  next_follow_up_date: activity.nextFollowUpDate ?? null,
  agent_name: activity.agentName,
  contact_name: blank(activity.contactName),
});

// ------------------------------------------------------------------ catálogo
export const CATALOG_COLUMNS = 'id, company_id, item_type, name, sku, category, description, billing_type, is_active, created_at';

export interface CatalogRow {
  id: string;
  company_id: string;
  item_type: string;
  name: string;
  sku: string | null;
  category: string | null;
  description: string | null;
  billing_type: string | null;
  is_active: boolean;
  created_at: string;
}

export interface PriceRow {
  catalog_item_id: string;
  country_code: string;
  price: number | string;
}

export function catalogFromRow(row: CatalogRow, prices: PriceRow[]): CatalogItem {
  const propios = prices.filter((p) => p.catalog_item_id === row.id);
  return {
    id: row.id,
    companyId: row.company_id,
    type: row.item_type === 'service' ? 'service' : 'product',
    name: row.name,
    sku: optional(row.sku),
    category: optional(row.category),
    description: optional(row.description),
    billing: optional(row.billing_type) as BillingType | undefined,
    prices: Object.fromEntries(propios.map((p) => [toCountry(p.country_code), toNumber(p.price)])),
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

export function catalogToRow(item: CatalogItem) {
  return {
    id: item.id,
    company_id: item.companyId,
    item_type: item.type,
    name: item.name.trim(),
    sku: blank(item.sku),
    category: blank(item.category),
    description: blank(item.description),
    // La base solo acepta periodicidad en servicios
    billing_type: item.type === 'service' ? (item.billing ?? null) : null,
    is_active: item.isActive,
  };
}

export const catalogPriceRows = (item: CatalogItem) =>
  (Object.entries(item.prices) as [CountryCode, number | undefined][])
    .filter(([, price]) => typeof price === 'number' && Number.isFinite(price) && price >= 0)
    .map(([country_code, price]) => ({ catalog_item_id: item.id, country_code, price: price as number }));

// ------------------------------------------------------------------ zonas
export interface TerritoryRow {
  id: string;
  company_id: string;
  country_code: string;
  name: string;
  code: string | null;
  color_hex: string | null;
  /** Se carga aparte y solo para las zonas en uso (loadZonePolygons): sin cargar, vacío */
  polygon?: { type: 'MultiPolygon' | 'Polygon'; coordinates: unknown[] } | null;
  region_code?: string | null;
  region_name?: string | null;
  province_name?: string | null;
  region_order?: number | null;
}

export const territoryFromRow = (row: TerritoryRow): TerritoryMetric => ({
  territoryId: row.id,
  countryCode: toCountry(row.country_code),
  territoryName: row.name,
  territoryCode: row.code ?? '',
  colorHex: row.color_hex ?? '#3B82F6',
  // Las métricas se calculan en la app a partir de los leads
  leadCount: 0,
  totalCompanyLeads: 0,
  percentage: 0,
  geojsonPolygon: row.polygon ?? { type: 'MultiPolygon', coordinates: [] },
  regionCode: optional(row.region_code),
  regionName: optional(row.region_name),
  provinceName: optional(row.province_name),
  regionOrder: optional(row.region_order),
});

// ------------------------------------------------------------------ solicitudes del titular
export const PRIVACY_COLUMNS =
  'id, lead_id, reason, detail, requested_by_name, requested_at, status, decided_by_name, decided_at, decision_note';

export interface PrivacyRequestRow {
  id: string;
  lead_id: string;
  reason: string;
  detail: string | null;
  requested_by_name: string;
  requested_at: string;
  status: string;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string | null;
}

/** La solicitud que muestra el lead: la pendiente si hay una; si no, la última resuelta. */
export function privacyRequestFor(leadId: string, rows: PrivacyRequestRow[]): PrivacyRequest | undefined {
  const propias = rows.filter((r) => r.lead_id === leadId);
  const elegida =
    propias.find((r) => r.status === 'pending') ??
    [...propias].sort((a, b) => (a.requested_at < b.requested_at ? 1 : -1))[0];
  if (!elegida) return undefined;
  return {
    reason: elegida.reason as PrivacyRequestReason,
    detail: optional(elegida.detail),
    requestedBy: elegida.requested_by_name,
    requestedAt: elegida.requested_at,
    status: elegida.status as PrivacyRequest['status'],
    decidedBy: optional(elegida.decided_by_name),
    decidedAt: optional(elegida.decided_at),
    decisionNote: optional(elegida.decision_note),
  };
}

// ------------------------------------------------------------------ etapas del pipeline
export const STAGE_COLUMNS = 'stage, label, short_code, color_hex, description, win_probability, sla_days, order_index';

export interface StageRow {
  stage: string;
  label: string;
  short_code: string;
  color_hex: string;
  description: string | null;
  win_probability: number;
  sla_days: number;
  order_index: number;
}

export const stageFromRow = (row: StageRow): StageConfig => ({
  id: row.stage as CommercialStatus,
  label: row.label,
  shortCode: row.short_code,
  color: row.color_hex,
  description: row.description ?? '',
  winProbability: row.win_probability,
  slaDays: row.sla_days,
  orderIndex: row.order_index,
});

export const stageToRow = (companyId: string, stage: StageConfig) => ({
  company_id: companyId,
  stage: stage.id,
  label: stage.label.trim() || stage.id,
  short_code: stage.shortCode.trim() || stage.id.toUpperCase(),
  color_hex: stage.color,
  description: blank(stage.description),
  // La base exige 0 a 100 y días no negativos, en números enteros
  win_probability: Math.min(100, Math.max(0, Math.round(Number(stage.winProbability) || 0))),
  sla_days: Math.max(0, Math.round(Number(stage.slaDays) || 0)),
  order_index: stage.orderIndex,
});

/**
 * Etapas del CRM: las que el gerente guardó en la base reemplazan a las por defecto. Un CRM que
 * nunca las editó no tiene filas y usa las por defecto.
 */
export const mergeStageConfigs = (defaults: StageConfig[], saved: StageConfig[]): StageConfig[] =>
  defaults.map((d) => saved.find((s) => s.id === d.id) ?? d);

// ------------------------------------------------------------------ todo el CRM de una vez
export interface TenantRows {
  client_accounts: AccountRow[];
  leads: LeadRow[];
  lead_contacts: (ContactRow & { is_primary?: boolean })[];
  lead_items: LeadItemRow[];
  lead_privacy_requests: PrivacyRequestRow[];
  lead_activities: ActivityRow[];
  catalog_items: CatalogRow[];
  catalog_item_prices: PriceRow[];
  pipeline_stage_configs: StageRow[];
  territories: TerritoryRow[];
}

/** Arma los datos del CRM desde sus filas: lo usan la carga al entrar y la exportación. */
export function assembleTenantData(rows: TenantRows) {
  const accounts = rows.client_accounts.map(accountFromRow);
  const nombreDe = new Map(accounts.map((a) => [a.id, a.name]));
  // El contacto principal vive en la fila del lead; lead_contacts solo aporta los adicionales
  const adicionales = rows.lead_contacts.filter((c) => c.is_primary !== true);
  return {
    accounts,
    leads: rows.leads.map((row) =>
      leadFromRow(row, {
        accountName: row.client_account_id ? nombreDe.get(row.client_account_id) : undefined,
        contacts: adicionales.filter((c) => c.lead_id === row.id).map(contactFromRow),
        items: rows.lead_items.filter((i) => i.lead_id === row.id).map(leadItemFromRow),
        privacyRequest: privacyRequestFor(row.id, rows.lead_privacy_requests),
      })
    ),
    activities: rows.lead_activities.map(activityFromRow).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    catalog: rows.catalog_items.map((row) => catalogFromRow(row, rows.catalog_item_prices)),
    stages: rows.pipeline_stage_configs.map(stageFromRow),
    territories: rows.territories.map(territoryFromRow),
  };
}

/**
 * La exportación de la base (export_tenant_snapshot, formato v2) trae las filas con los nombres de
 * sus columnas; solo cambian los precios del catálogo (un objeto por país) y el polígono de las
 * zonas (en "geojson").
 */
export interface TenantSnapshotV2 {
  format_version?: string;
  client_accounts?: AccountRow[];
  leads?: LeadRow[];
  lead_contacts?: (ContactRow & { is_primary?: boolean })[];
  lead_items?: LeadItemRow[];
  lead_privacy_requests?: PrivacyRequestRow[];
  lead_activities?: ActivityRow[];
  catalog_items?: (CatalogRow & { prices?: Record<string, number | string> })[];
  pipeline_stage_configs?: StageRow[];
  territories?: (Omit<TerritoryRow, 'polygon'> & { geojson?: TerritoryRow['polygon'] })[];
}

export function tenantRowsFromSnapshot(snapshot: TenantSnapshotV2): TenantRows {
  const catalogo = snapshot.catalog_items ?? [];
  return {
    client_accounts: snapshot.client_accounts ?? [],
    leads: snapshot.leads ?? [],
    lead_contacts: snapshot.lead_contacts ?? [],
    lead_items: snapshot.lead_items ?? [],
    lead_privacy_requests: snapshot.lead_privacy_requests ?? [],
    lead_activities: snapshot.lead_activities ?? [],
    catalog_items: catalogo,
    catalog_item_prices: catalogo.flatMap((item) =>
      Object.entries(item.prices ?? {}).map(([country_code, price]) => ({ catalog_item_id: item.id, country_code, price }))
    ),
    pipeline_stage_configs: snapshot.pipeline_stage_configs ?? [],
    territories: (snapshot.territories ?? []).map(({ geojson, ...zona }) => ({ ...zona, polygon: geojson ?? null })),
  };
}
