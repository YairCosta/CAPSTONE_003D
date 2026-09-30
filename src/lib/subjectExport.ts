import type { Company, Lead, LeadActivity, StageConfig, TerritoryMetric } from '../types/crm';
import type { ExportSheet, TenantExport } from './tenantExport';
import { CONSENT_LABEL, ORIGIN_LABEL } from './privacy';
import { contactsOf } from './contacts';
import { formatLeadMoney } from './currency';

// Informe de un titular: todo lo que el CRM guarda sobre una persona, en un archivo que ella
// puede leer y llevarse. Cubre el derecho de acceso y el de portabilidad (arts. 5 y 9 de la
// Ley 19.628 modificada por la Ley 21.719). Ver docs/LEY_21719.md.

export interface SubjectExportInput {
  company: Company;
  lead: Lead;
  activities: LeadActivity[];
  stageConfigs: StageConfig[];
  territories: TerritoryMetric[];
  requestedBy: string;
  now?: Date;
}

const col = (header: string, description: string, width: number) => ({ header, description, width });

const sheet = (name: string, description: string, columns: ReturnType<typeof col>[], rows: ExportSheet['rows']): ExportSheet => ({
  name,
  description,
  columns,
  rows,
  counted: true,
});

const fecha = (value?: string) => (value ? new Date(value).toLocaleString('es-CL') : 'Sin registro');

export function buildSubjectExport(input: SubjectExportInput): TenantExport {
  const { company, lead, stageConfigs, territories, requestedBy } = input;
  const exportedAt = (input.now ?? new Date()).toISOString();
  const zona = territories.find((t) => t.territoryId === lead.assignedTerritoryId)?.territoryName ?? 'Sin zona';
  const etapa = stageConfigs.find((s) => s.id === lead.commercialStatus)?.label ?? lead.commercialStatus;

  const datos: [string, string][] = [
    ['Nombre', lead.fullName],
    ['Cargo', lead.jobTitle ?? 'Sin dato'],
    ['Empresa', lead.companyName ?? 'Persona natural'],
    ['Email', lead.email ?? 'Sin dato'],
    ['Teléfono', lead.phone ?? 'Sin dato'],
    ['Dirección', lead.rawAddress],
    ['Zona asignada', zona],
    ['Etapa comercial', etapa],
    ['Monto estimado del negocio', formatLeadMoney(lead)],
    ['Notas internas', lead.notes ?? 'Sin notas'],
    ['Fecha de ingreso al CRM', fecha(lead.createdAt)],
    ['Último contacto', fecha(lead.lastContactedAt)],
  ];

  const tratamiento: [string, string][] = [
    ['Quién trata sus datos', company.name],
    ['Origen del dato', lead.dataOrigin ? ORIGIN_LABEL[lead.dataOrigin] : 'No registrado'],
    ['Autorización del titular', lead.consentStatus ? CONSENT_LABEL[lead.consentStatus] : 'No registrada'],
    ['Fecha de esa respuesta', fecha(lead.consentAt)],
    ['Pidió no ser contactado', lead.noContact ? 'Sí' : 'No'],
    ['Solicitud sobre sus datos', lead.privacyRequest ? `${lead.privacyRequest.status} · ${fecha(lead.privacyRequest.requestedAt)}` : 'Ninguna'],
    ['Datos personales eliminados', lead.anonymizedAt ? fecha(lead.anonymizedAt) : 'No'],
    ['Finalidad', 'Gestión comercial: contacto, seguimiento y registro de oportunidades de venta'],
    ['Informe solicitado por', requestedBy],
    ['Fecha del informe', new Date(exportedAt).toLocaleString('es-CL')],
  ];

  const sheets: ExportSheet[] = [
    sheet(
      'Sus datos',
      'Datos personales que este CRM guarda sobre usted.',
      [col('Dato', 'Campo guardado', 34), col('Valor', 'Contenido', 60)],
      datos.map(([k, v]) => [k, v])
    ),
    sheet(
      'Origen y autorización',
      'De dónde salió el dato, qué se hace con él y qué respondió usted.',
      [col('Punto', 'Aspecto del tratamiento', 34), col('Detalle', 'Contenido', 70)],
      tratamiento.map(([k, v]) => [k, v])
    ),
    sheet(
      'Otras personas del registro',
      'Otras personas de contacto anotadas en la misma oportunidad comercial.',
      [col('Nombre', 'Persona', 30), col('Cargo', 'Cargo declarado', 26), col('Email', 'Correo', 32), col('Teléfono', 'Teléfono', 20)],
      contactsOf(lead)
        .filter((c) => !c.isPrimary)
        .map((c) => [c.fullName, c.jobTitle ?? '', c.email ?? '', c.phone ?? ''])
    ),
    sheet(
      'Contactos registrados',
      'Interacciones registradas con usted.',
      [col('Fecha', 'Cuándo', 22), col('Canal', 'Medio', 16), col('Con quién', 'Persona', 28), col('Resumen', 'Qué se conversó', 70)],
      input.activities
        .filter((a) => a.leadId === lead.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((a) => [fecha(a.createdAt), a.channel, a.contactName ?? lead.fullName, a.summary])
    ),
  ];

  const safe = (lead.companyName ?? lead.fullName).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-');
  return {
    fileName: `revela-informe-titular_${safe}_${exportedAt.slice(0, 10)}.xlsx`,
    company,
    exportedAt,
    sheets,
    counts: sheets.map((s) => ({ label: s.name, count: s.rows.length })),
  };
}
