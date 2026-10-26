import type { Lead, LeadContact } from '../types/crm';

// Un lead representa una oportunidad, pero en una empresa se habla con varias personas:
// quien pide la cotización no siempre es quien firma. El contacto de la ficha del lead es
// el principal; los demás se guardan en `lead.contacts`.

export const MAX_LEAD_CONTACTS = 10; // límite razonable: evita convertir la ficha en una agenda

export interface ResolvedContact extends LeadContact {
  isPrimary: boolean;
}

// Contacto principal del lead (el que está en la ficha)
export const primaryContactOf = (lead: Lead): ResolvedContact => ({
  id: `${lead.id}-principal`,
  fullName: lead.fullName,
  jobTitle: lead.jobTitle,
  email: lead.email,
  phone: lead.phone,
  isPrimary: true,
});

// Todas las personas con las que se puede hablar en este lead, empezando por la principal
export const contactsOf = (lead: Lead): ResolvedContact[] => [
  primaryContactOf(lead),
  ...(lead.contacts ?? []).map((c) => ({ ...c, isPrimary: false })),
];

export const extraContactsCount = (lead: Lead): number => lead.contacts?.length ?? 0;

// Línea corta para mostrar un contacto: "Nombre · Cargo"
export const contactLine = (contact: LeadContact): string =>
  [contact.fullName, contact.jobTitle].filter(Boolean).join(' · ');

// El vendedor recuerda el lead por la empresa; solo la persona natural se nombra por sí misma
export const leadTitle = (lead: Lead): string => lead.companyName?.trim() || lead.fullName;

// Debajo del título: la persona y su cargo si hay empresa; si no, solo el cargo
export const leadSubtitle = (lead: Lead): string =>
  lead.companyName?.trim() ? contactLine(lead) : lead.jobTitle ?? '';
