// Exportación de los datos de un CRM (portabilidad): arma las hojas del Excel que el administrador descarga
// para que la empresa pueda llevar sus datos a otro CRM. Función pura: solo incluye datos del CRM indicado.

import type {
  AppUser,
  CatalogItem,
  ClientAccount,
  Company,
  ContactOutcome,
  Lead,
  LeadActivity,
  StageConfig,
  TerritoryMetric,
} from '../types/crm.ts';
import { COUNTRIES, COUNTRY_CODES, type CountryCode } from '../data/countries.ts';
import { enabledCountriesOf, scopeActivities } from './tenantGuards.ts';
import { isManualValue } from './catalog.ts';
import { leadCurrency } from './currency.ts';
import { CHANNEL_LABEL } from './agenda.ts';
import { STATUS_LABEL } from './stages.ts';

export const EXPORT_FORMAT_VERSION = 'Revela · exportación de datos v1';

export type ExportCell = string | number | boolean | null;

export interface ExportColumn {
  header: string;
  description: string;
  width: number;
}

export interface ExportSheet {
  name: string; // máximo 31 caracteres (límite de Excel)
  description: string;
  columns: ExportColumn[];
  rows: ExportCell[][];
  counted: boolean; // se muestra en el resumen de filas
}

export interface TenantExport {
  fileName: string;
  company: Company;
  exportedAt: string;
  sheets: ExportSheet[];
  counts: { label: string; count: number }[];
}

export interface TenantExportInput {
  company: Company;
  users: AppUser[];
  accounts: ClientAccount[];
  leads: Lead[];
  activities: LeadActivity[];
  catalog: CatalogItem[];
  stageConfigs: StageConfig[];
  territories: TerritoryMetric[];
  exportedBy: string;
  now?: Date;
}



const OUTCOME_LABEL: Record<ContactOutcome, string> = {
  interested: 'Interesado',
  no_answer: 'Sin respuesta',
  requested_quote: 'Solicitó cotización',
  rescheduled: 'Reagendado',
  rejected: 'Rechazado',
  paid: 'Pago confirmado',
};

const ROLE_LABEL: Record<AppUser['role'], string> = { agent: 'Usuario base', manager: 'Gerente', superadmin: 'Administrador' };

const GEOCODING_LABEL: Record<Lead['geocodingStatus'], string> = {
  pending: 'Pendiente',
  processing: 'Procesando',
  success: 'Ubicado',
  failed: 'Falló',
  manual_review: 'Sin zona (revisión manual)',
};

const yesNo = (value: boolean) => (value ? 'Sí' : 'No');
const text = (value?: string | null) => value ?? '';
const countryName = (code: CountryCode) => COUNTRIES[code]?.name ?? code;

const column = (header: string, description: string, width = 18): ExportColumn => ({ header, description, width });

const slugDate = (date: Date) => date.toISOString().slice(0, 10);

export function buildTenantExport(input: TenantExportInput): TenantExport {
  const { company } = input;
  const now = input.now ?? new Date();
  const tenantId = company.id;

  // Aislamiento: todo se filtra por el CRM exportado, aunque la entrada traiga datos de otros
  const leads = input.leads.filter((l) => l.companyId === tenantId);
  const accounts = input.accounts.filter((a) => a.companyId === tenantId);
  const catalog = input.catalog.filter((i) => i.companyId === tenantId);
  const users = input.users.filter((u) => u.companyId === tenantId);
  const activities = scopeActivities(input.activities, leads, tenantId);
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const itemById = new Map(catalog.map((i) => [i.id, i]));

  // Países con datos o habilitados: define zonas y columnas de precio
  const enabled = enabledCountriesOf(company);
  const countriesWithData = new Set<CountryCode>([
    ...enabled,
    ...leads.map((l) => l.countryCode),
    ...accounts.map((a) => a.countryCode),
  ]);
  const countries = COUNTRY_CODES.filter((c) => countriesWithData.has(c));
  const hiddenCountries = countries.filter((c) => !enabled.includes(c));
  const territories = input.territories.filter((t) => countries.includes(t.countryCode));
  const territoryById = new Map(territories.map((t) => [t.territoryId, t]));

  // ---------------------------------------------------------------- Empresas cliente
  const accountsSheet: ExportSheet = {
    name: 'Empresas cliente',
    description: 'Empresas u organizaciones a las que pertenecen los leads.',
    counted: true,
    columns: [
      column('ID', 'Identificador único de la empresa cliente. Se usa en Leads → "ID empresa cliente".', 38),
      column('Nombre', 'Nombre de la empresa cliente.', 32),
      column('País', 'País de la empresa.', 12),
      column('Código país', 'Código ISO 3166-1 alfa-2 (CL, PE…).', 12),
      column('ID tributario', 'RUT (Chile), RUC (Perú) u otro según el país.', 16),
      column('Rubro', 'Industria o rubro.', 18),
      column('Contacto principal', 'Persona de contacto principal.', 24),
      column('Email', 'Email de contacto.', 28),
      column('Teléfono', 'Teléfono de contacto.', 18),
      column('Dirección', 'Dirección de la empresa.', 30),
      column('Notas', 'Notas internas.', 30),
      column('Activa', '"Sí" si puede recibir nuevos leads; "No" si fue desactivada (conserva historial).', 10),
      column('Creada', 'Fecha de creación (ISO 8601, UTC).', 22),
    ],
    rows: accounts.map((a) => [
      a.id,
      a.name,
      countryName(a.countryCode),
      a.countryCode,
      text(a.taxId),
      text(a.industry),
      text(a.contactName),
      text(a.email),
      text(a.phone),
      text(a.address),
      text(a.notes),
      yesNo(a.isActive),
      a.createdAt,
    ]),
  };

  // ---------------------------------------------------------------- Leads
  const leadsSheet: ExportSheet = {
    name: 'Leads',
    description: 'Oportunidades comerciales (personas de contacto) con su etapa, valor y ubicación.',
    counted: true,
    columns: [
      column('ID', 'Identificador único del lead. Se usa en "Productos por lead" y "Actividades".', 38),
      column('Nombre contacto', 'Nombre de la persona.', 26),
      column('Cargo', 'Cargo del contacto dentro de su empresa.', 24),
      column('ID empresa cliente', 'ID de la hoja "Empresas cliente" (vacío = persona natural).', 38),
      column('Empresa', 'Nombre de la empresa cliente.', 28),
      column('Email', 'Email del contacto.', 28),
      column('Teléfono', 'Teléfono del contacto.', 18),
      column('País', 'País del lead.', 12),
      column('Código país', 'Código ISO 3166-1 alfa-2.', 12),
      column('Etapa (código)', 'new, contacted, qualified, proposal, pending_payment, won, lost.', 16),
      column('Etapa', 'Nombre de la etapa del pipeline.', 16),
      column('Valor estimado', 'Monto del negocio en la moneda del país (sin conversión).', 16),
      column('Moneda', 'Moneda en que se negoció el lead (ISO 4217: CLP, PEN, USD…). El monto está en esta moneda, sin convertir.', 10),
      column('Origen del valor', '"Calculado" = suma de sus productos/servicios; "Manual" = ingresado a mano.', 16),
      column('Productos y servicios', 'Resumen legible; el detalle está en la hoja "Productos por lead".', 40),
      column('Dirección', 'Dirección ingresada.', 32),
      column('Dirección normalizada', 'Dirección con zona y país.', 40),
      column('ID zona', 'ID de la hoja "Zonas".', 22),
      column('Zona', 'Nombre de la zona (comuna, distrito…).', 20),
      column('Tipo de zona', 'Comuna, Distrito, Municipio, Cantón… según el país.', 14),
      column('Estado de ubicación', 'Si el lead está ubicado en una zona del mapa.', 22),
      column('Creado', 'Fecha de captura (ISO 8601, UTC).', 22),
      column('Último contacto', 'Fecha del último contacto (ISO 8601, UTC).', 22),
      column('Notas', 'Notas comerciales.', 40),
    ],
    rows: leads.map((l) => {
      const account = l.clientAccountId ? accountById.get(l.clientAccountId) : undefined;
      const territory = l.assignedTerritoryId ? territoryById.get(l.assignedTerritoryId) : undefined;
      const summary = (l.items ?? [])
        .map((line) => `${itemById.get(line.itemId)?.name ?? line.itemId} ×${line.quantity}`)
        .join('; ');
      return [
        l.id,
        l.fullName,
        text(l.jobTitle),
        account?.id ?? text(l.clientAccountId),
        account?.name ?? text(l.companyName),
        text(l.email),
        text(l.phone),
        countryName(l.countryCode),
        l.countryCode,
        l.commercialStatus,
        STATUS_LABEL[l.commercialStatus],
        l.estimatedDealValue || 0,
        leadCurrency(l),
        isManualValue(l) ? 'Manual' : 'Calculado',
        summary,
        l.rawAddress,
        text(l.normalizedAddress),
        text(l.assignedTerritoryId),
        territory?.territoryName ?? '',
        COUNTRIES[l.countryCode]?.zoneLabel.singular ?? '',
        GEOCODING_LABEL[l.geocodingStatus],
        l.createdAt,
        text(l.lastContactedAt),
        text(l.notes),
      ];
    }),
  };

  // ---------------------------------------------------------------- Productos por lead
  const leadItemRows: ExportCell[][] = [];
  for (const l of leads) {
    for (const line of l.items ?? []) {
      const item = itemById.get(line.itemId);
      leadItemRows.push([
        l.id,
        l.fullName,
        line.itemId,
        item?.name ?? '',
        item ? (item.type === 'product' ? 'Producto' : 'Servicio') : '',
        line.quantity,
        line.unitPrice,
        line.quantity * line.unitPrice,
        leadCurrency(l),
        STATUS_LABEL[l.commercialStatus],
      ]);
    }
  }
  const leadItemsSheet: ExportSheet = {
    name: 'Productos por lead',
    description: 'Detalle de los productos y servicios incluidos en cada lead (una fila por ítem).',
    counted: true,
    columns: [
      column('ID lead', 'ID de la hoja "Leads".', 38),
      column('Lead', 'Nombre del contacto.', 26),
      column('ID ítem', 'ID de la hoja "Catálogo".', 22),
      column('Producto / servicio', 'Nombre del ítem.', 32),
      column('Tipo', 'Producto o Servicio.', 12),
      column('Cantidad', 'Unidades.', 10),
      column('Precio unitario', 'Precio acordado en la moneda del país del lead.', 16),
      column('Subtotal', 'Cantidad × precio unitario.', 14),
      column('Moneda', 'Código ISO 4217.', 10),
      column('Etapa del lead', 'Etapa actual del lead ("Ganado" = vendido).', 16),
    ],
    rows: leadItemRows,
  };

  // ---------------------------------------------------------------- Contactos por lead
  // Una fila por persona: el contacto principal del lead y los adicionales.
  const leadContactRows: ExportCell[][] = [];
  for (const l of leads) {
    leadContactRows.push([l.id, l.fullName, 'Principal', l.fullName, text(l.jobTitle), text(l.email), text(l.phone)]);
    for (const c of l.contacts ?? []) {
      leadContactRows.push([l.id, l.fullName, 'Adicional', c.fullName, text(c.jobTitle), text(c.email), text(c.phone)]);
    }
  }
  const leadContactsSheet: ExportSheet = {
    name: 'Contactos por lead',
    description: 'Todas las personas de cada lead: el contacto principal y los adicionales (una fila por persona).',
    counted: true,
    columns: [
      column('ID lead', 'ID de la hoja "Leads".', 38),
      column('Lead', 'Nombre del contacto principal del lead.', 26),
      column('Tipo', 'Principal o Adicional.', 12),
      column('Nombre', 'Nombre de la persona.', 26),
      column('Cargo', 'Cargo dentro de su empresa.', 24),
      column('Email', 'Email de la persona.', 28),
      column('Teléfono', 'Teléfono de la persona.', 18),
    ],
    rows: leadContactRows,
  };

  // ---------------------------------------------------------------- Catálogo
  const catalogSheet: ExportSheet = {
    name: 'Catálogo',
    description: 'Productos y servicios que vende la empresa, con precio sugerido por país.',
    counted: true,
    columns: [
      column('ID', 'Identificador del ítem. Se usa en "Productos por lead".', 22),
      column('Tipo', 'Producto o Servicio.', 12),
      column('Nombre', 'Nombre del ítem.', 32),
      column('Código (SKU)', 'Código interno.', 14),
      column('Categoría', 'Categoría.', 18),
      column('Cobro', 'Solo servicios: Pago único o Mensual.', 14),
      column('Descripción', 'Descripción.', 32),
      ...countries.map((code) =>
        column(`Precio ${code} (${COUNTRIES[code].currency})`, `Precio sugerido en ${countryName(code)}, en ${COUNTRIES[code].currency}.`, 16)
      ),
      column('Activo', '"No" = desactivado (no se ofrece en nuevos leads).', 10),
      column('Creado', 'Fecha de creación (ISO 8601, UTC).', 22),
    ],
    rows: catalog.map((i) => [
      i.id,
      i.type === 'product' ? 'Producto' : 'Servicio',
      i.name,
      text(i.sku),
      text(i.category),
      i.type === 'service' ? (i.billing === 'monthly' ? 'Mensual' : 'Pago único') : '',
      text(i.description),
      ...countries.map((code) => i.prices[code] ?? null),
      yesNo(i.isActive),
      i.createdAt,
    ]),
  };

  // ---------------------------------------------------------------- Actividades
  const activitiesSheet: ExportSheet = {
    name: 'Actividades',
    description: 'Bitácora de contactos realizados con cada lead.',
    counted: true,
    columns: [
      column('ID', 'Identificador de la actividad.', 38),
      column('ID lead', 'ID de la hoja "Leads".', 38),
      column('Lead', 'Nombre del contacto.', 26),
      column('Canal (código)', 'call, whatsapp, email, meeting, video_call.', 14),
      column('Canal', 'Canal de contacto.', 14),
      column('Resultado (código)', 'interested, no_answer, requested_quote, rescheduled, rejected, paid.', 18),
      column('Resultado', 'Resultado del contacto.', 20),
      column('Persona contactada', 'Con quién se habló (ver hoja "Contactos por lead").', 26),
      column('Resumen', 'Lo conversado y acordado.', 50),
      column('Próximo seguimiento', 'Fecha agendada (ISO 8601).', 22),
      column('Agente', 'Persona que registró el contacto.', 20),
      column('Fecha', 'Fecha del registro (ISO 8601, UTC).', 22),
    ],
    rows: activities.map((a) => [
      a.id,
      a.leadId,
      leadById.get(a.leadId)?.fullName ?? '',
      a.channel,
      CHANNEL_LABEL[a.channel],
      a.outcome,
      OUTCOME_LABEL[a.outcome],
      text(a.contactName),
      a.summary,
      text(a.nextFollowUpDate),
      a.agentName,
      a.createdAt,
    ]),
  };

  // ---------------------------------------------------------------- Etapas del pipeline
  const stagesSheet: ExportSheet = {
    name: 'Etapas pipeline',
    description: 'Configuración de las etapas del embudo comercial de la empresa.',
    counted: false,
    columns: [
      column('Orden', 'Posición en el embudo.', 8),
      column('Código', 'Código usado en Leads → "Etapa (código)".', 16),
      column('Nombre', 'Nombre visible de la etapa.', 24),
      column('Código corto', 'Abreviatura.', 12),
      column('Probabilidad de cierre (%)', 'Probabilidad estimada de ganar el negocio en esta etapa.', 16),
      column('SLA (días)', 'Días máximos en la etapa (0 = sin límite).', 10),
      column('Descripción', 'Criterios de la etapa.', 50),
      column('Color', 'Color hexadecimal.', 10),
    ],
    rows: [...input.stageConfigs]
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((s) => [s.orderIndex, s.id, s.label, s.shortCode, s.winProbability, s.slaDays, s.description, s.color]),
  };

  // ---------------------------------------------------------------- Zonas
  const zonesSheet: ExportSheet = {
    name: 'Zonas',
    description: 'Zonas geográficas usadas para ubicar los leads (comunas, distritos…).',
    counted: false,
    columns: [
      column('ID', 'Identificador de la zona. Se usa en Leads → "ID zona".', 22),
      column('País', 'País de la zona.', 12),
      column('Código país', 'Código ISO 3166-1 alfa-2.', 12),
      column('Tipo de zona', 'Comuna, Distrito, Municipio, Cantón… según el país.', 14),
      column('Nombre', 'Nombre de la zona.', 24),
      column('Código', 'Código de la zona con prefijo de país: CL + código comunal (CUT), PE + ubigeo del INEI; el resto, región ISO + nombre (MX-JAL-GUADALAJARA).', 14),
      column('Región', 'Región (Chile) o departamento (Perú) de la zona.', 26),
      column('Provincia', 'Provincia de la zona: distingue zonas con el mismo nombre.', 22),
    ],
    rows: territories.map((t) => [
      t.territoryId,
      countryName(t.countryCode),
      t.countryCode,
      COUNTRIES[t.countryCode].zoneLabel.singular,
      t.territoryName,
      t.territoryCode,
      t.regionName ?? '',
      t.provinceName ?? '',
    ]),
  };

  // ---------------------------------------------------------------- Usuarios (sin contraseñas)
  const usersSheet: ExportSheet = {
    name: 'Usuarios',
    description: 'Usuarios del CRM. No incluye contraseñas: deben crearse de nuevo en el CRM de destino.',
    counted: true,
    columns: [
      column('Nombre', 'Nombre del usuario.', 26),
      column('Email', 'Email de acceso.', 30),
      column('Rol', 'Usuario base, Gerente o Administrador.', 16),
      column('Activo', '"No" = sin acceso.', 10),
      column('Creado', 'Fecha de creación (ISO 8601, UTC).', 22),
    ],
    rows: users.map((u) => [u.fullName, u.email, ROLE_LABEL[u.role], yesNo(u.isActive), u.createdAt]),
  };

  const dataSheets = [
    accountsSheet,
    leadsSheet,
    leadContactsSheet,
    leadItemsSheet,
    catalogSheet,
    activitiesSheet,
    stagesSheet,
    zonesSheet,
    usersSheet,
  ];
  const exportedAt = now.toISOString();
  const currencies = Array.from(new Set(leads.map((l) => leadCurrency(l)))).join(', ');

  // ---------------------------------------------------------------- Léeme (resumen e instrucciones)
  const readmeRows: ExportCell[][] = [
    ['Formato', EXPORT_FORMAT_VERSION],
    ['CRM (empresa)', company.name],
    ['Identificador', company.slug],
    ['ID tributario', text(company.taxId)],
    ['Plan', company.plan === 'international' ? 'Internacional' : 'Nacional'],
    ['País base', `${countryName(company.homeCountry)} (${company.homeCountry})`],
    ['Países habilitados', enabled.map((c) => `${countryName(c)} (${c})`).join(', ')],
    ...(hiddenCountries.length
      ? [['Datos de países no habilitados', `Incluye datos de ${hiddenCountries.map(countryName).join(', ')}, hoy ocultos en el CRM.`] as ExportCell[]]
      : []),
    ['Fecha de exportación (UTC)', exportedAt],
    ['Exportado por', input.exportedBy],
    ['Monedas', `${currencies || '—'}. Cada monto está en la moneda de su país (columna "Moneda"); no hay conversiones.`],
    ['Fechas', 'Formato ISO 8601 en UTC (ej. 2026-09-14T13:10:00Z).'],
    [
      'Relaciones',
      'Leads."ID empresa cliente" → Empresas cliente."ID" · Productos por lead."ID lead" → Leads."ID" · Productos por lead."ID ítem" → Catálogo."ID" · Actividades."ID lead" → Leads."ID" · Leads."ID zona" → Zonas."ID" · Leads."Etapa (código)" → Etapas pipeline."Código".',
    ],
    ['No incluye', 'Contraseñas, claves de API ni datos de otros CRMs.'],
    [
      'Datos personales',
      'Contiene nombres, emails y teléfonos de personas. Guárdalo en un lugar seguro, compártelo solo con la empresa dueña de los datos y elimínalo cuando ya no se necesite.',
    ],
    ['', ''],
    ['Hoja', 'Contenido (filas)'],
    ...dataSheets.map((s) => [s.name, `${s.description} (${s.rows.length} filas)`] as ExportCell[]),
    ['Diccionario', 'Descripción de cada columna de cada hoja.'],
    ['', ''],
    [
      'Importar en otro CRM',
      'Con una IA (ej. Claude): adjunta este archivo y pide: "Importa estos datos en mi CRM [nombre]. Crea primero las empresas cliente, luego los leads (asociándolos por ID empresa cliente), después los productos por lead y las actividades. Mantén montos y monedas tal como están y avísame si algún campo no tiene equivalente."',
    ],
    [
      'Orden sugerido',
      '1) Catálogo · 2) Empresas cliente · 3) Leads · 4) Productos por lead · 5) Actividades · 6) Usuarios (crear con nuevas contraseñas).',
    ],
  ];

  const readmeSheet: ExportSheet = {
    name: 'Léeme',
    description: 'Resumen de la exportación e instrucciones.',
    counted: false,
    columns: [column('Campo', '', 30), column('Valor', '', 110)],
    rows: readmeRows,
  };

  const dictionarySheet: ExportSheet = {
    name: 'Diccionario',
    description: 'Descripción de cada columna.',
    counted: false,
    columns: [column('Hoja', '', 20), column('Columna', '', 28), column('Descripción', '', 90)],
    rows: dataSheets.flatMap((s) => s.columns.map((c) => [s.name, c.header, c.description] as ExportCell[])),
  };

  return {
    fileName: `revela-export_${company.slug}_${slugDate(now)}.xlsx`,
    company,
    exportedAt,
    sheets: [readmeSheet, ...dataSheets, dictionarySheet],
    counts: dataSheets.filter((s) => s.counted).map((s) => ({ label: s.name, count: s.rows.length })),
  };
}

// Convierte la exportación al formato de write-excel-file: encabezado en negrita y fila fija
export function toWorkbookSheets(result: TenantExport) {
  return result.sheets.map((sheet) => ({
    sheet: sheet.name,
    stickyRowsCount: sheet.name === 'Léeme' ? 0 : 1,
    columns: sheet.columns.map((c) => ({ width: c.width })),
    data: [
      sheet.columns.map((c) => ({
        value: c.header,
        fontWeight: 'bold' as const,
        backgroundColor: '#E0E7FF',
      })),
      ...sheet.rows.map((row, rowIndex) =>
        row.map((value, cellIndex) => {
          if (value === null || value === '') return null;
          // En el Léeme, la primera columna va en negrita y los títulos de tabla también
          const bold = sheet.name === 'Léeme' && (cellIndex === 0 || readmeHeaderRow(sheet, rowIndex));
          return {
            value,
            type: typeof value === 'number' ? Number : typeof value === 'boolean' ? Boolean : String,
            wrap: sheet.name === 'Léeme' && cellIndex === 1,
            ...(bold ? { fontWeight: 'bold' as const } : {}),
          };
        })
      ),
    ],
  }));
}

const readmeHeaderRow = (sheet: ExportSheet, rowIndex: number) => sheet.rows[rowIndex]?.[0] === 'Hoja';
