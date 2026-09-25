import type { ClientAccount, Lead, LeadActivity, PrivacyRequest, PrivacyRequestReason } from '../types/crm';

// Derechos del titular sobre sus datos (Ley 19.628 modificada por la Ley 21.719).
// Aquí vive la lógica pura: qué se puede hacer con un lead según lo que la persona pidió.
// Ver docs/cumplimiento/revela-2026-09/ y docs/LEY_21719.md.

export const ORIGIN_LABEL: Record<NonNullable<Lead['dataOrigin']>, string> = {
  form: 'Formulario web',
  call: 'Llamada o visita',
  event: 'Feria o evento',
  referral: 'Referido por un cliente',
  public: 'Fuente pública (sitio web, registro)',
  ai: 'Búsqueda del asistente',
};

export const CONSENT_LABEL: Record<NonNullable<Lead['consentStatus']>, string> = {
  inquiry: 'Nos contactó o pidió cotización',
  granted: 'Autorizó que guardemos sus datos',
  not_requested: 'Prospecto: se le preguntará en el primer contacto',
  refused: 'No autoriza',
  withdrawn: 'Revocó su autorización',
};

// Un prospecto (no nos buscó y aún no se le pregunta) solo puede quedar guardado un tiempo acotado.
// Si nadie habla con la persona en este plazo, sus datos se anonimizan solos.
// Es una política de Revela (minimización y conservación, art. 3), no un plazo fijado por la ley.
export const PROSPECT_RETENTION_DAYS = 30;
const DIA_MS = 24 * 60 * 60 * 1000;

export const isPendingProspect = (lead: Lead): boolean =>
  lead.consentStatus === 'not_requested' && !lead.anonymizedAt;

/** Fecha en que vence el plazo del prospecto, o null si no es un prospecto pendiente. */
export const prospectDeadline = (lead: Lead): Date | null => {
  if (!isPendingProspect(lead)) return null;
  const desde = new Date(lead.consentAt ?? lead.createdAt);
  if (Number.isNaN(desde.getTime())) return null;
  return new Date(desde.getTime() + PROSPECT_RETENTION_DAYS * DIA_MS);
};

/** Días que le quedan al prospecto (0 o negativo = vencido). */
export const prospectDaysLeft = (lead: Lead, now: Date = new Date()): number | null => {
  const limite = prospectDeadline(lead);
  return limite ? Math.ceil((limite.getTime() - now.getTime()) / DIA_MS) : null;
};

/** Prospectos cuyo plazo ya venció sin que nadie hablara con la persona. */
export const expiredProspects = (leads: Lead[], now: Date = new Date()): Lead[] =>
  leads.filter((l) => {
    const limite = prospectDeadline(l);
    return limite !== null && limite.getTime() <= now.getTime();
  });

/** Respuesta que el vendedor registra en el primer contacto real con un prospecto. */
export type FirstContactAnswer = 'granted' | 'refused' | 'unreachable';

export const applyFirstContactAnswer = (lead: Lead, answer: FirstContactAnswer, at: string): Lead => {
  if (!isPendingProspect(lead) || answer === 'unreachable') return lead;
  return { ...lead, consentStatus: answer, consentAt: at, noContact: answer === 'refused' ? true : lead.noContact };
};

export const REQUEST_REASON_LABEL: Record<PrivacyRequestReason, string> = {
  erasure: 'Pide que borremos sus datos',
  no_consent: 'No autoriza que guardemos sus datos',
  wrong_data: 'Los datos no le corresponden o están errados',
  other: 'Otro motivo (se detalla)',
};

/** Una solicitud pendiente bloquea el tratamiento mientras se resuelve (art. 8 ter). */
export const isBlocked = (lead: Lead): boolean => lead.privacyRequest?.status === 'pending';

export const isAnonymized = (lead: Lead): boolean => Boolean(lead.anonymizedAt);

/**
 * Si se puede seguir contactando a esta persona. Se respeta la oposición, la falta o revocación
 * del consentimiento, la solicitud pendiente y la anonimización.
 */
export const canContact = (lead: Lead): boolean =>
  !lead.noContact &&
  !isBlocked(lead) &&
  !isAnonymized(lead) &&
  lead.consentStatus !== 'refused' &&
  lead.consentStatus !== 'withdrawn';

/** Motivo corto para explicar en pantalla por qué un lead no se puede trabajar. */
export const blockedReason = (lead: Lead): string | null => {
  if (isAnonymized(lead))
    return lead.anonymizedReason === 'retention'
      ? `Datos personales eliminados: pasaron ${PROSPECT_RETENTION_DAYS} días sin contactar al prospecto`
      : 'Datos personales eliminados a solicitud del titular';
  if (isBlocked(lead)) return 'Bloqueado: hay una solicitud del titular pendiente de resolver';
  if (lead.noContact) return 'El titular pidió no ser contactado';
  if (lead.consentStatus === 'withdrawn') return 'El titular revocó su autorización';
  if (lead.consentStatus === 'refused') return 'El titular no autoriza que guardemos sus datos';
  return null;
};

export interface NewPrivacyRequest {
  reason: PrivacyRequestReason;
  detail?: string;
  requestedBy: string;
  at: string;
}

/** Deja la solicitud pendiente en el lead. Desde aquí queda bloqueado hasta que se resuelva. */
export const openPrivacyRequest = (lead: Lead, data: NewPrivacyRequest): Lead => ({
  ...lead,
  privacyRequest: {
    reason: data.reason,
    detail: data.detail?.trim() || undefined,
    requestedBy: data.requestedBy,
    requestedAt: data.at,
    status: 'pending',
  },
});

/**
 * Anonimiza: borra los datos personales y conserva la operación comercial (zona, monto, etapa),
 * para que el historial y las métricas del CRM sigan cuadrando. La ley exige demostrar que el
 * dato ya no permite identificar a la persona: por eso no se guarda ningún seudónimo reversible.
 */
export const anonymizeLead = (lead: Lead, at: string, reason: 'request' | 'retention' = 'request'): Lead => ({
  ...lead,
  fullName: 'Titular eliminado',
  jobTitle: undefined,
  email: undefined,
  phone: undefined,
  rawAddress: 'Dirección eliminada',
  normalizedAddress: undefined,
  // Un punto exacto en el mapa identifica tanto como el nombre; se conserva solo la zona
  latitude: undefined,
  longitude: undefined,
  notes: undefined,
  contacts: [],
  noContact: true,
  consentStatus: 'withdrawn',
  anonymizedAt: at,
  anonymizedReason: reason,
});

export interface PrivacyDecision {
  approve: boolean;
  decidedBy: string;
  note?: string;
  at: string;
}

/** Resuelve la solicitud. Aprobarla anonimiza el lead; rechazarla lo desbloquea con el motivo. */
export const resolvePrivacyRequest = (lead: Lead, decision: PrivacyDecision): Lead => {
  const request = lead.privacyRequest;
  if (!request || request.status !== 'pending') return lead;
  const resolved: PrivacyRequest = {
    ...request,
    status: decision.approve ? 'approved' : 'rejected',
    decidedBy: decision.decidedBy,
    decidedAt: decision.at,
    decisionNote: decision.note?.trim() || undefined,
  };
  const base: Lead = { ...lead, privacyRequest: resolved };
  return decision.approve ? anonymizeLead(base, decision.at) : base;
};

/** Leads que la agenda y el asistente no deben proponer. */
export const contactableLeads = (leads: Lead[]): Lead[] => leads.filter(canContact);

// ------------------------------------------------------------------ datos personales fuera del historial
// La auditoría nunca guarda valores que identifiquen a una persona (opción A, 25-09-2026): así el
// historial puede seguir siendo inalterable y, aun así, respetar el derecho de supresión (art. 7).
// Se registra QUE un dato personal cambió, nunca cuál era ni cuál es.

/** Campos del lead que identifican a la persona. */
export const LEAD_PERSONAL_FIELDS = [
  'fullName',
  'jobTitle',
  'email',
  'phone',
  'contacts',
  'rawAddress',
  'normalizedAddress',
  'latitude',
  'longitude',
  'notes',
] as const satisfies readonly (keyof Lead)[];

/** Campos de la empresa cliente que identifican a una persona (su contacto). */
export const ACCOUNT_PERSONAL_FIELDS = ['contactName', 'email', 'phone', 'notes'] as const satisfies readonly (keyof ClientAccount)[];

const pick = <T extends object, K extends keyof T>(obj: T, keys: readonly K[]) =>
  Object.fromEntries(keys.map((k) => [k, obj[k]])) as Pick<T, K>;

const blank = <T extends object, K extends keyof T>(keys: readonly K[]) =>
  Object.fromEntries(keys.map((k) => [k, undefined])) as Partial<T>;

/** Copia del lead para el historial, sin datos de la persona. */
export const leadWithoutPersonalData = (lead: Lead): Lead => ({
  ...lead,
  ...blank<Lead, (typeof LEAD_PERSONAL_FIELDS)[number]>(LEAD_PERSONAL_FIELDS),
  fullName: '',
  rawAddress: '',
  contacts: [],
});

export const accountWithoutPersonalData = (account: ClientAccount): ClientAccount => ({
  ...account,
  ...blank<ClientAccount, (typeof ACCOUNT_PERSONAL_FIELDS)[number]>(ACCOUNT_PERSONAL_FIELDS),
});

/**
 * Lo que decidió el titular sobre sus datos. Nunca vuelve atrás por revertir un cambio: si revocó
 * su autorización, restaurar un estado anterior no puede volver a dejarlo "autorizado".
 */
export const LEAD_PRIVACY_STATE_FIELDS = [
  'dataOrigin',
  'consentStatus',
  'consentAt',
  'noContact',
  'privacyRequest',
  'anonymizedAt',
  'anonymizedReason',
] as const satisfies readonly (keyof Lead)[];

/**
 * Revertir un cambio restaura los datos del negocio del snapshot. Los datos personales y lo que
 * decidió el titular quedan como están hoy: el historial no guarda lo primero, y restaurar lo
 * segundo podría revivir a quien pidió su eliminación o revocó su autorización.
 */
export const restoreLeadKeepingPersonalData = (current: Lead, snapshot: Lead): Lead => ({
  ...snapshot,
  ...pick(current, LEAD_PERSONAL_FIELDS),
  ...pick(current, LEAD_PRIVACY_STATE_FIELDS),
});

export const restoreAccountKeepingPersonalData = (current: ClientAccount, snapshot: ClientAccount): ClientAccount => ({
  ...snapshot,
  ...pick(current, ACCOUNT_PERSONAL_FIELDS),
});

/** Nombre del lead en el historial: la empresa, nunca la persona. */
export const auditLeadLabel = (lead: Lead): string =>
  lead.companyName?.trim() || `Persona natural · ref. ${lead.id.slice(-4)}`;

/** Al anonimizar, la bitácora de ese lead también pierde con quién se habló y qué se dijo. */
export const anonymizeActivitiesOf = (activities: LeadActivity[], leadId: string): LeadActivity[] =>
  activities.map((a) =>
    a.leadId === leadId
      ? { ...a, contactName: undefined, summary: 'Contenido eliminado junto con los datos del titular' }
      : a
  );

