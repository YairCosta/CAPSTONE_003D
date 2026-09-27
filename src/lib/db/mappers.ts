// Traducción entre la base (snake_case) y la app (camelCase), en un solo lugar.
// Ver docs/BASE_DE_DATOS.md, sección 6. Funciones puras: se prueban sin conexión (npm run test:supabase).

import type { AppUser, AuditAction, AuditChange, AuditEntity, AuditEntry, AuditRevert, Company, CompanyPlan, UserRole } from '../../types/crm.ts';
import { COUNTRIES, isCountryCode, type CountryCode } from '../../data/countries.ts';

// ------------------------------------------------------------------ CRMs (companies + company_countries)
export interface CompanyRow {
  id: string;
  name: string;
  slug: string;
  tax_id: string | null;
  is_active: boolean;
  plan: string;
  home_country: string;
  default_lat: number | null;
  default_lng: number | null;
  default_zoom: number | null;
  created_at: string;
}

export interface CompanyCountryRow {
  company_id: string;
  country_code: string;
}

export function companyFromRow(row: CompanyRow, countryRows: CompanyCountryRow[]): Company {
  const home: CountryCode = isCountryCode(row.home_country.trim()) ? (row.home_country.trim() as CountryCode) : 'CL';
  const plan: CompanyPlan = row.plan === 'international' ? 'international' : 'national';
  const extra = countryRows
    .filter((c) => c.company_id === row.id)
    .map((c) => c.country_code.trim())
    .filter(isCountryCode)
    .filter((c) => c !== home) as CountryCode[];
  // El país base va siempre primero. Con el plan Nacional las otras filas se conservan (cuentan de nuevo
  // si se reactiva el plan); qué países cuentan hoy lo dice enabledCountriesOf
  const enabledCountries: CountryCode[] = [home, ...extra];
  const vista = COUNTRIES[home].mapView;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    taxId: row.tax_id ?? undefined,
    isActive: row.is_active,
    plan,
    homeCountry: home,
    enabledCountries,
    createdAt: row.created_at,
    defaultLat: row.default_lat ?? vista.lat,
    defaultLng: row.default_lng ?? vista.lng,
    defaultZoom: row.default_zoom ?? vista.zoom,
  };
}

/** Columnas editables del CRM. Los países van aparte, en company_countries. */
export function companyToRow(company: Omit<Company, 'id' | 'createdAt'>) {
  return {
    name: company.name.trim(),
    slug: company.slug.trim(),
    tax_id: company.taxId?.trim() || null,
    is_active: company.isActive,
    plan: company.plan,
    home_country: company.homeCountry,
    default_lat: company.defaultLat,
    default_lng: company.defaultLng,
    default_zoom: company.defaultZoom,
  };
}

/** Filas de company_countries para un CRM: siempre incluye el país base. */
export function companyCountryRows(companyId: string, company: Pick<Company, 'homeCountry' | 'enabledCountries' | 'plan'>) {
  const paises = company.plan === 'international' ? company.enabledCountries : [company.homeCountry];
  return Array.from(new Set([company.homeCountry, ...paises])).map((country_code) => ({ company_id: companyId, country_code }));
}

// ------------------------------------------------------------------ usuarios (profiles)
export interface ProfileRow {
  id: string;
  company_id: string | null;
  full_name: string;
  email: string | null;
  role: string | null;
  is_active: boolean;
  created_at: string;
}

const ROLES: UserRole[] = ['agent', 'manager', 'superadmin'];

export function userFromRow(row: ProfileRow): AppUser {
  return {
    id: row.id,
    companyId: row.company_id,
    fullName: row.full_name,
    email: row.email ?? '',
    // Con Supabase la contraseña vive solo en Auth, con hash: la app nunca la tiene
    password: '',
    role: ROLES.includes(row.role as UserRole) ? (row.role as UserRole) : 'agent',
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

/** Lo que la administración puede cambiar de un perfil. El email y el id los fija Auth. */
export function profileUpdateRow(user: Pick<AppUser, 'fullName' | 'role' | 'isActive' | 'companyId'>) {
  return {
    full_name: user.fullName.trim(),
    role: user.role,
    is_active: user.isActive,
    company_id: user.role === 'superadmin' ? null : user.companyId,
  };
}

// ------------------------------------------------------------------ auditoría (audit_log)
/**
 * Qué parte del historial vive en la base. Se fue sumando con cada etapa de la conexión; desde la
 * etapa 5 son todas. Si aparece un dato nuevo que aún no está en la base, su entrada queda en
 * memoria hasta que se agregue aquí.
 */
export const CONNECTED_AUDIT_ENTITIES: readonly AuditEntity[] = [
  'company',
  'user',
  'lead',
  'account',
  'catalog',
  'activity',
  'stage',
  'export',
];

export const isAuditEntityConnected = (entity: AuditEntity) => CONNECTED_AUDIT_ENTITIES.includes(entity);

export interface AuditRow {
  id: string;
  company_id: string;
  actor_id: string | null;
  actor_name: string;
  actor_role: string;
  action: string;
  entity: string;
  entity_id: string;
  entity_label: string;
  summary: string;
  changes: AuditChange[] | null;
  revert_snapshot: Record<string, unknown> | null;
  reverted_at: string | null;
  reverted_by: string | null;
  created_at: string;
}

/**
 * La base guarda el estado anterior "plano" (sin datos personales: los quita un trigger). El tipo
 * de reversión se deduce del dato y la acción: eliminar una empresa o un producto se revierte
 * recreándolo; lo demás, restaurando sus campos.
 */
export function revertKindFor(entity: AuditEntity, action: AuditAction): AuditRevert['kind'] | null {
  switch (entity) {
    case 'lead':
      return 'lead';
    case 'account':
      return action === 'delete' ? 'account-deleted' : 'account';
    case 'catalog':
      return action === 'delete' ? 'catalog-deleted' : 'catalog';
    case 'stage':
      return 'stage';
    default:
      return null;
  }
}

/**
 * Fila para insertar. No lleva fecha, autor verificado ni estado de reversión: los fija la base
 * (trigger trg_audit_log_set_actor), así nadie firma por otro ni fecha en el pasado.
 */
export function auditEntryToRow(entry: AuditEntry) {
  return {
    id: entry.id,
    company_id: entry.companyId,
    actor_id: entry.actorId,
    actor_name: entry.actorName,
    actor_role: entry.actorRole,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entityId,
    entity_label: entry.entityLabel,
    summary: entry.summary,
    changes: entry.changes,
    revert_snapshot: entry.revert ? (entry.revert.snapshot as unknown as Record<string, unknown>) : null,
  };
}

export function auditEntryFromRow(row: AuditRow, nameOf: (userId: string) => string | undefined = () => undefined): AuditEntry {
  const kind = row.revert_snapshot ? revertKindFor(row.entity as AuditEntity, row.action as AuditAction) : null;
  return {
    id: row.id,
    companyId: row.company_id,
    // Sin autor: tareas automáticas de la base, como el borrado de prospectos vencidos
    actorId: row.actor_id ?? 'sistema',
    actorName: row.actor_name,
    actorRole: ROLES.includes(row.actor_role as UserRole) ? (row.actor_role as UserRole) : 'agent',
    action: row.action as AuditAction,
    entity: row.entity as AuditEntity,
    entityId: row.entity_id,
    entityLabel: row.entity_label,
    summary: row.summary,
    changes: Array.isArray(row.changes) ? row.changes : [],
    revert: kind ? ({ kind, snapshot: row.revert_snapshot } as unknown as AuditRevert) : undefined,
    revertedAt: row.reverted_at ?? undefined,
    revertedBy: row.reverted_by ? (nameOf(row.reverted_by) ?? 'Gerencia') : undefined,
    createdAt: row.created_at,
  };
}
