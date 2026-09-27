// Reglas de aislamiento multi-tenant (SaaS).
// Toda escritura pasa por estas funciones: los datos de un CRM nunca pueden quedar asociados a otro.
// Con el plan Internacional, además, un dato solo puede pertenecer a un país habilitado para su CRM.
// En producción, la misma garantía la aplica la base de datos con RLS y triggers (ver supabase/migrations).

import type { AppUser, CatalogItem, ClientAccount, Company, ConsentStatus, Lead, LeadActivity, LeadContact, LeadDataOrigin, LeadItem, NewAppUser, StageConfig } from '../types/crm';
import { isCountryCode, type CountryCode } from '../data/countries.ts';
import { applyLeadValue } from './catalog.ts';
import { isAllowedLeadCurrency } from './currency.ts';
import { MAX_LEAD_CONTACTS } from './contacts.ts';
import {
  anonymizeLead,
  applyFirstContactAnswer,
  canContact,
  isAnonymized,
  isBlocked,
  isPendingProspect,
  openPrivacyRequest,
  resolvePrivacyRequest,
  type FirstContactAnswer,
  type NewPrivacyRequest,
  type PrivacyDecision,
} from './privacy.ts';

const CONSENT_VALUES: ConsentStatus[] = ['inquiry', 'granted', 'not_requested', 'refused', 'withdrawn'];
const ORIGIN_VALUES: LeadDataOrigin[] = ['form', 'call', 'event', 'referral', 'public', 'ai'];

export const isManager = (user: AppUser | null) => user?.role === 'manager';
export const isSuperadmin = (user: AppUser | null) => user?.role === 'superadmin';

// ------------------------------------------------------------------ países habilitados
// Plan Nacional: solo el país base. Plan Internacional: país base + países activados por el administrador.
export function enabledCountriesOf(company: Pick<Company, 'plan' | 'homeCountry' | 'enabledCountries'> | null): CountryCode[] {
  if (!company || !isCountryCode(company.homeCountry)) return [];
  if (company.plan !== 'international') return [company.homeCountry];
  const extra = (company.enabledCountries ?? []).filter(isCountryCode);
  return [company.homeCountry, ...extra.filter((c) => c !== company.homeCountry)];
}

// Normaliza plan y países al guardar un CRM: el país base siempre está incluido
export function normalizeCompanyCountries<T extends Pick<Company, 'plan' | 'homeCountry' | 'enabledCountries'>>(company: T): T {
  const homeCountry = isCountryCode(company.homeCountry) ? company.homeCountry : 'CL';
  const enabled = enabledCountriesOf({ ...company, homeCountry });
  const plan = company.plan === 'international' && enabled.length > 1 ? 'international' : 'national';
  return { ...company, homeCountry, plan, enabledCountries: plan === 'international' ? enabled : [homeCountry] };
}

// Actividades visibles: solo de leads del tenant y, si traen empresa, de esa misma empresa
export function scopeActivities(activities: LeadActivity[], tenantLeads: Lead[], tenantId: string | null): LeadActivity[] {
  if (!tenantId) return [];
  const leadIds = new Set(tenantLeads.filter((l) => l.companyId === tenantId).map((l) => l.id));
  return activities.filter((a) => leadIds.has(a.leadId) && (!a.companyId || a.companyId === tenantId));
}

// Una actividad solo puede registrarse sobre un lead del propio tenant
// Tampoco se registra contacto con quien se opuso, revocó, está bloqueado o fue anonimizado:
// la regla vive aquí y no solo en la pantalla (Ley 21.719, arts. 8 y 8 ter).
export function canRegisterActivity(leadId: string, tenantLeads: Lead[], tenantId: string | null): boolean {
  return Boolean(tenantId) && tenantLeads.some((l) => l.id === leadId && l.companyId === tenantId && canContact(l));
}

/** Un lead con una solicitud del titular pendiente no se mueve de etapa ni se edita (art. 8 ter). */
export const canMoveLeadStage = (lead: Lead): boolean => !isBlocked(lead);

interface TerritoryRef {
  territoryId: string;
  countryCode: CountryCode;
}

// Orden del embudo: retroceder es mover un lead a una etapa anterior de esta lista
export const STAGE_ORDER: Lead['commercialStatus'][] = [
  'new',
  'contacted',
  'qualified',
  'proposal',
  'pending_payment',
  'won',
  'lost',
];

// El usuario base solo avanza leads; retroceder (o sacarlos de "perdido") es de gerencia
export function canChangeStage(role: AppUser['role'], from: Lead['commercialStatus'], to: Lead['commercialStatus']): boolean {
  if (role !== 'agent' && role !== 'manager') return false;
  if (from === to) return true;
  if (role === 'manager') return true;
  return STAGE_ORDER.indexOf(to) > STAGE_ORDER.indexOf(from);
}

const MAX_LEAD_ITEMS = 50;

// Productos/servicios de un lead: solo del catálogo del propio CRM, con cantidad y precio válidos
export function sanitizeLeadItems(items: unknown, catalog: CatalogItem[], tenantId: string | null): LeadItem[] {
  if (!tenantId || !Array.isArray(items)) return [];
  const ownIds = new Set(catalog.filter((item) => item.companyId === tenantId).map((item) => item.id));
  return items
    .filter((line): line is LeadItem => typeof line === 'object' && line !== null)
    .map((line) => ({
      itemId: String(line.itemId),
      quantity: Math.floor(Number(line.quantity)),
      unitPrice: Math.round(Number(line.unitPrice) * 100) / 100,
    }))
    .filter(
      (line) =>
        ownIds.has(line.itemId) &&
        Number.isFinite(line.quantity) &&
        line.quantity >= 1 &&
        line.quantity <= 100000 &&
        Number.isFinite(line.unitPrice) &&
        line.unitPrice >= 0
    )
    .slice(0, MAX_LEAD_ITEMS);
}

// Producto o servicio del catálogo: solo del propio tenant, con precios válidos por país
export function sanitizeCatalogItemUpdate(
  existing: CatalogItem | undefined,
  updated: CatalogItem,
  tenantId: string | null
): CatalogItem | null {
  if (!tenantId || !existing || existing.companyId !== tenantId || existing.id !== updated.id) return null;
  const name = updated.name?.trim();
  if (!name || (updated.type !== 'product' && updated.type !== 'service')) return null;
  const prices: CatalogItem['prices'] = {};
  for (const [code, price] of Object.entries(updated.prices ?? {})) {
    if (isCountryCode(code) && Number.isFinite(price) && (price as number) >= 0) prices[code] = price as number;
  }
  return {
    ...updated,
    name,
    prices,
    billing: updated.type === 'service' ? (updated.billing ?? 'one_time') : undefined,
    id: existing.id,
    companyId: tenantId,
    createdAt: existing.createdAt,
  };
}

// Edición de lead: se ignoran intentos de cambiar de empresa dueña, vincular una empresa cliente ajena
// o moverlo a un país no habilitado. La zona debe pertenecer al país del lead y los ítems al catálogo del CRM.
// Contactos adicionales del lead: se limpian los vacíos, se recortan los textos y se limita
// la cantidad para que la ficha no se convierta en una agenda.
export function sanitizeLeadContacts(contacts: LeadContact[] | undefined, leadId: string): LeadContact[] {
  if (!Array.isArray(contacts)) return [];
  const vistos = new Set<string>();
  return contacts
    .map((c, i) => ({
      id: c.id?.trim() || `${leadId}-c${i + 1}`,
      fullName: (c.fullName ?? '').trim(),
      jobTitle: c.jobTitle?.trim() || undefined,
      email: c.email?.trim().toLowerCase() || undefined,
      phone: c.phone?.trim() || undefined,
    }))
    .filter((c) => {
      if (!c.fullName || vistos.has(c.id)) return false;
      vistos.add(c.id);
      return true;
    })
    .slice(0, MAX_LEAD_CONTACTS);
}

// `role` es obligatorio a propósito: la regla del pipeline se aplica aquí, no en cada pantalla.
// Cualquier vía de escritura nueva (el asistente de IA, una importación, una API futura) queda
// cubierta sin tener que acordarse de validarla en su call-site.
export function sanitizeLeadUpdate(
  existing: Lead | undefined,
  updated: Lead,
  tenantId: string | null,
  tenantAccounts: ClientAccount[],
  enabledCountries: CountryCode[],
  territories: TerritoryRef[],
  catalog: CatalogItem[],
  role: AppUser['role'] | null
): Lead | null {
  if (!tenantId || !existing || existing.companyId !== tenantId || existing.id !== updated.id) return null;
  // Bloqueo del art. 8 ter: mientras el titular espera respuesta, su lead no se edita
  if (isBlocked(existing)) return null;
  if (!isCountryCode(updated.countryCode) || !enabledCountries.includes(updated.countryCode)) return null;

  // Si el perfil no puede hacer ese movimiento, el lead conserva su etapa: el resto de la
  // edición sí se guarda. Sin rol no se cambia de etapa (falla cerrado).
  const stageAllowed =
    updated.commercialStatus === existing.commercialStatus ||
    (role !== null && canChangeStage(role, existing.commercialStatus, updated.commercialStatus));

  // La moneda del lead solo puede ser la de un país habilitado del CRM o dólar.
  // Una moneda no permitida se descarta y se conserva la anterior (si sigue siendo válida).
  const currency = isAllowedLeadCurrency(updated.currency, enabledCountries)
    ? updated.currency
    : isAllowedLeadCurrency(existing.currency, enabledCountries)
      ? existing.currency
      : undefined;

  const account = updated.clientAccountId
    ? tenantAccounts.find(
        (a) => a.id === updated.clientAccountId && a.companyId === tenantId && a.countryCode === updated.countryCode
      )
    : undefined;

  const territoryMatches =
    !updated.assignedTerritoryId ||
    territories.some((t) => t.territoryId === updated.assignedTerritoryId && t.countryCode === updated.countryCode);

  // Un lead anonimizado no vuelve a tener datos personales: la edición no puede re-identificarlo.
  const anonimizado = isAnonymized(existing);
  const personales: Partial<Lead> = anonimizado
    ? {
        fullName: existing.fullName,
        jobTitle: existing.jobTitle,
        email: existing.email,
        phone: existing.phone,
        rawAddress: existing.rawAddress,
        normalizedAddress: existing.normalizedAddress,
        notes: existing.notes,
        contacts: [],
      }
    : {};

  return applyLeadValue({
    ...updated,
    commercialStatus: stageAllowed ? updated.commercialStatus : existing.commercialStatus,
    currency,
    // Origen y consentimiento: valores conocidos o se conserva lo anterior
    dataOrigin: ORIGIN_VALUES.includes(updated.dataOrigin as LeadDataOrigin) ? updated.dataOrigin : existing.dataOrigin,
    consentStatus: CONSENT_VALUES.includes(updated.consentStatus as ConsentStatus)
      ? updated.consentStatus
      : existing.consentStatus,
    consentAt: updated.consentStatus !== existing.consentStatus ? updated.consentAt : existing.consentAt,
    noContact: Boolean(updated.noContact) || anonimizado,
    // La solicitud del titular y la anonimización solo cambian por su flujo propio, nunca editando
    privacyRequest: existing.privacyRequest,
    anonymizedAt: existing.anonymizedAt,
    anonymizedReason: existing.anonymizedReason,
    contacts: sanitizeLeadContacts(updated.contacts, existing.id),
    items: sanitizeLeadItems(updated.items, catalog, tenantId),
    id: existing.id,
    companyId: tenantId,
    createdAt: existing.createdAt,
    clientAccountId: account?.id,
    companyName: account ? account.name : updated.clientAccountId ? undefined : updated.companyName,
    ...(territoryMatches
      ? {}
      : {
          assignedTerritoryId: undefined,
          geocodingStatus: 'manual_review' as const,
        }),
    ...personales,
  });
}

// ------------------------------------------------------------------ derechos del titular
// Una solicitud la puede abrir cualquier perfil del CRM (quien atiende al titular), pero solo el
// gerente la resuelve: aprobarla borra datos personales y eso no se deshace.
export const canResolvePrivacyRequest = (role: AppUser['role'] | null) => role === 'manager';

export function requestLeadPrivacy(
  existing: Lead | undefined,
  tenantId: string | null,
  data: NewPrivacyRequest
): Lead | null {
  if (!tenantId || !existing || existing.companyId !== tenantId) return null;
  if (existing.privacyRequest?.status === 'pending' || isAnonymized(existing)) return null;
  if (!data.reason || !data.requestedBy) return null;
  if (data.reason === 'other' && !data.detail?.trim()) return null;
  return openPrivacyRequest(existing, data);
}

export function resolveLeadPrivacy(
  existing: Lead | undefined,
  tenantId: string | null,
  role: AppUser['role'] | null,
  decision: PrivacyDecision
): Lead | null {
  if (!tenantId || !existing || existing.companyId !== tenantId) return null;
  if (!canResolvePrivacyRequest(role)) return null;
  if (existing.privacyRequest?.status !== 'pending') return null;
  return resolvePrivacyRequest(existing, decision);
}

/** Marca o quita la oposición a ser contactado (art. 8). Un lead anonimizado no vuelve atrás. */
export function setLeadNoContact(
  existing: Lead | undefined,
  tenantId: string | null,
  noContact: boolean
): Lead | null {
  if (!tenantId || !existing || existing.companyId !== tenantId) return null;
  if (isAnonymized(existing) && !noContact) return null;
  return { ...existing, noContact };
}

/** Anonimización directa, solo para el vencimiento del plazo de conservación. */
export function anonymizeLeadOfTenant(existing: Lead | undefined, tenantId: string | null, at: string): Lead | null {
  if (!tenantId || !existing || existing.companyId !== tenantId || isAnonymized(existing)) return null;
  return anonymizeLead(existing, at, 'retention');
}

/** Respuesta del prospecto en el primer contacto: solo cambia un prospecto pendiente de su CRM. */
export function recordFirstContactAnswer(
  existing: Lead | undefined,
  tenantId: string | null,
  answer: FirstContactAnswer,
  at: string
): Lead | null {
  if (!tenantId || !existing || existing.companyId !== tenantId || !isPendingProspect(existing)) return null;
  if (answer === 'unreachable') return null;
  return applyFirstContactAnswer(existing, answer, at);
}

// Edición de empresa cliente: solo del propio tenant, sin moverla a otro y en un país habilitado
export function sanitizeAccountUpdate(
  existing: ClientAccount | undefined,
  updated: ClientAccount,
  tenantId: string | null,
  enabledCountries: CountryCode[]
): ClientAccount | null {
  if (!tenantId || !existing || existing.companyId !== tenantId || existing.id !== updated.id) return null;
  if (!isCountryCode(updated.countryCode) || !enabledCountries.includes(updated.countryCode)) return null;
  return { ...updated, id: existing.id, companyId: tenantId, createdAt: existing.createdAt };
}

// Administración de usuarios: solo superadmin; no se cambia email/CRM/contraseña, no se escala a superadmin
// y nadie puede desactivarse a sí mismo
export function sanitizeUserUpdate(existing: AppUser | undefined, updated: AppUser, actor: AppUser | null): AppUser | null {
  if (!existing || !actor || !isSuperadmin(actor) || existing.id !== updated.id) return null;
  if (existing.id === actor.id && !updated.isActive) return null;

  const role =
    existing.role === 'superadmin' ? 'superadmin' : updated.role === 'superadmin' ? existing.role : updated.role;

  return { ...existing, role, isActive: updated.isActive };
}

// Nuevo usuario: un usuario de CRM debe pertenecer a un tenant existente; el superadmin no pertenece a ninguno
export function validateNewUser(data: NewAppUser, companies: Company[], actor: AppUser | null): string | null {
  if (!isSuperadmin(actor)) return 'Solo el administrador de la plataforma puede crear usuarios.';
  if (data.role === 'superadmin') return data.companyId === null ? null : 'Un administrador no pertenece a ningún CRM.';
  if (!data.companyId || !companies.some((c) => c.id === data.companyId)) return 'Selecciona un CRM válido.';
  return null;
}

// ------------------------------------------------------------------ usuarios administrados por gerencia
// El gerente crea y administra los usuarios de SU CRM: nunca de otro y nunca administradores de plataforma.
export const MIN_PASSWORD_LENGTH = 6;

export function validateNewTeamUser(
  data: NewAppUser,
  users: AppUser[],
  actor: AppUser | null,
  tenantId: string | null,
  // Con Supabase se invita por correo y la persona elige su contraseña: no hay contraseña temporal
  { invitation = false }: { invitation?: boolean } = {}
): string | null {
  if (!isManager(actor) || !tenantId || actor?.companyId !== tenantId) {
    return 'Solo el gerente puede crear usuarios de este CRM.';
  }
  if (data.companyId !== tenantId) return 'El usuario debe pertenecer a tu propio CRM.';
  if (data.role !== 'agent' && data.role !== 'manager') return 'Solo puedes crear usuarios base o gerentes.';
  if (!data.fullName.trim()) return 'Ingresa el nombre del usuario.';

  const email = data.email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return 'El email no es válido.';
  if (users.some((u) => u.email.toLowerCase() === email)) return 'Ya existe un usuario con ese email.';
  if (!invitation && (data.password ?? '').length < MIN_PASSWORD_LENGTH) {
    return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  return null;
}

// Edición por gerencia: solo usuarios de su CRM; no toca emails ni contraseñas, no crea superadmin
// y nadie puede quitarse a sí mismo el acceso.
export function sanitizeTeamUserUpdate(
  existing: AppUser | undefined,
  updated: AppUser,
  actor: AppUser | null,
  tenantId: string | null
): AppUser | null {
  if (!existing || !isManager(actor) || !tenantId) return null;
  if (actor?.companyId !== tenantId || existing.companyId !== tenantId) return null;
  if (existing.id !== updated.id || existing.role === 'superadmin') return null;
  if (existing.id === actor.id && (!updated.isActive || updated.role !== 'manager')) return null;

  const role = updated.role === 'agent' || updated.role === 'manager' ? updated.role : existing.role;
  return { ...existing, fullName: updated.fullName.trim() || existing.fullName, role, isActive: updated.isActive };
}

export function sanitizeCompanyUpdate(existing: Company | undefined, updated: Company, actor: AppUser | null): Company | null {
  if (!existing || !isSuperadmin(actor) || existing.id !== updated.id) return null;
  return normalizeCompanyCountries({ ...updated, id: existing.id, createdAt: existing.createdAt });
}

// Configuración del pipeline por tenant (cada CRM tiene la suya)
export function stageConfigsForTenant(
  byTenant: Record<string, StageConfig[]>,
  tenantId: string | null,
  defaults: StageConfig[]
): StageConfig[] {
  return (tenantId && byTenant[tenantId]) || defaults;
}
