import type { AppUser, CatalogItem, ClientAccount, Company, Lead, LeadItem, TerritoryMetric, StageConfig, LeadActivity } from '../types/crm';
import type { CountryCode } from './countries';
import { FALLBACK_RATES, convert, currencyOfCountry, leadCurrency, roundForCurrency } from '../lib/currency.ts';

// Cuenta de demostración pública (datos ficticios de una empresa de servicios y mobiliario para oficinas en Chile y Perú).
// Es la que se abre desde la landing page; el CRM real de cada cliente se crea en producción.
export const TENANT_DEMO_ID = 'c4444444-5555-6666-7777-888888888888';

// Empresas dueñas de un CRM (tenants)
export const mockCompanies: Company[] = [
  {
    id: TENANT_DEMO_ID,
    name: 'Revela Demo',
    slug: 'revela-demo',
    taxId: '77.412.908-5',
    isActive: true,
    plan: 'international',
    homeCountry: 'CL',
    enabledCountries: ['CL', 'PE'],
    createdAt: '2026-02-05T12:00:00Z',
    defaultLat: -33.4250,
    defaultLng: -70.6050,
    defaultZoom: 13,
  }
];

// Credenciales solo para la demo local. En producción la autenticación la resuelve Supabase Auth.
export const mockUsers: AppUser[] = [
  { id: 'user-gerente-demo', companyId: TENANT_DEMO_ID, fullName: 'Andrés Vega', email: 'gerente@demo.revelacrm.com', password: 'demo1234', role: 'manager', isActive: true, createdAt: '2026-02-05T12:30:00Z' },
  { id: 'user-base-demo-cl', companyId: TENANT_DEMO_ID, fullName: 'Marcela Ortiz', email: 'vendedor@demo.revelacrm.com', password: 'demo1234', role: 'agent', isActive: true, createdAt: '2026-02-06T09:00:00Z' },
  { id: 'user-base-demo-pe', companyId: TENANT_DEMO_ID, fullName: 'Diego Fuentes', email: 'vendedor2@demo.revelacrm.com', password: 'demo1234', role: 'agent', isActive: true, createdAt: '2026-02-20T09:00:00Z' },
];

// Accesos rápidos de la pantalla de login (solo demo)
// Accesos que ofrece la pantalla de login: solo la cuenta de demostración.
export const demoAccounts = [
  { label: 'Gerente', company: 'Revela Demo', email: 'gerente@demo.revelacrm.com', password: 'demo1234' },
  { label: 'Usuario base', company: 'Revela Demo', email: 'vendedor@demo.revelacrm.com', password: 'demo1234' },
];

// El administrador de plataforma no se ofrece en el login y solo existe en desarrollo: se agrega
// aparte para que no viaje en la app compilada. En producción vive en Supabase Auth.
export const platformAdminUser: AppUser = {
  id: 'user-admin',
  companyId: null,
  fullName: 'Administrador Revela',
  email: 'admin@revelacrm.com',
  password: 'dev-admin-solo-local',
  role: 'superadmin',
  isActive: true,
  createdAt: '2026-01-01T12:00:00Z',
};

export const platformAdminAccount = {
  label: 'Administrador',
  company: 'Plataforma Revela',
  email: 'admin@revelacrm.com',
  password: 'dev-admin-solo-local',
};

export const account = (
  id: string,
  companyId: string,
  name: string,
  industry: string,
  contactName: string,
  email: string,
  phone: string,
  isActive = true,
  countryCode: CountryCode = 'CL',
  taxId?: string
): ClientAccount => ({ id, companyId, countryCode, name, taxId, industry, contactName, email, phone, isActive, createdAt: '2026-08-01T12:00:00Z' });

// Empresas cliente (contenedores de leads) de cada tenant
export const mockClientAccounts: ClientAccount[] = [
  // Empresas cliente de la cuenta demo: a quienes presta servicios de administración, mantención y proyectos de oficinas
  account('acc-g1', TENANT_DEMO_ID, 'Clínica Vitacura Salud', 'Salud', 'Paulina Ibáñez', 'pibanez@clinicavitacura.cl', '+56 9 8821 4455', true, 'CL', '96.842.110-4'),
  account('acc-g2', TENANT_DEMO_ID, 'Centro Comercial Plaza Oriente', 'Comercio', 'Ignacio Bravo', 'ibravo@plazaoriente.cl', '+56 9 7712 8899', true, 'CL', '76.331.220-9'),
  account('acc-g3', TENANT_DEMO_ID, 'Banco Andes Sucursales', 'Banca', 'Carolina Peña', 'cpena@bancoandes.cl', '+56 9 6654 3321', true, 'CL', '97.004.000-5'),
  account('acc-g4', TENANT_DEMO_ID, 'Bodegas Central Express', 'Logística', 'Héctor Navarro', 'hnavarro@centralexpress.cl', '+56 9 5590 1122', true, 'CL', '76.998.554-2'),
  account('acc-g5', TENANT_DEMO_ID, 'Universidad del Valle Central', 'Educación', 'Marcela Zúñiga', 'mzuniga@uvcentral.cl', '+56 9 4412 0077', true, 'CL', '71.220.400-8'),
  account('acc-g6', TENANT_DEMO_ID, 'Corporación Salud Lima SAC', 'Salud', 'Diego Ramírez', 'dramirez@saludlima.pe', '+51 987 112 334', true, 'PE', '20512889904'),
  account('acc-g7', TENANT_DEMO_ID, 'Centro Comercial Surco Plaza SAC', 'Comercio', 'Patricia Chávez', 'pchavez@surcoplaza.pe', '+51 944 556 778', true, 'PE', '20603344551'),
  account('acc-g8', TENANT_DEMO_ID, 'Naviera Costa Verde SAC', 'Naviera', 'Álvaro Mendoza', 'amendoza@navieracostaverde.pe', '+51 933 220 118', true, 'PE', '20478822003'),
];

export const defaultStageConfigs: StageConfig[] = [
  {
    id: 'new',
    label: 'Nuevo Lead',
    shortCode: 'NUEVO',
    color: '#64748B', // Slate
    description: 'Lead capturado desde formulario web, landing o ingreso directo. Pendiente de primer contacto.',
    winProbability: 10,
    slaDays: 1,
    orderIndex: 0,
  },
  {
    id: 'contacted',
    label: 'Toma de Contacto',
    shortCode: 'CONTACTO',
    color: '#38BDF8', // Sky
    description: 'Primer acercamiento en curso vía llamada, WhatsApp o correo. Verificando disponibilidad.',
    winProbability: 25,
    slaDays: 2,
    orderIndex: 1,
  },
  {
    id: 'qualified',
    label: 'Calificado',
    shortCode: 'CALIFICADO',
    color: '#818CF8', // Indigo
    description: 'Lead con interés confirmado, presupuesto y necesidad que encaja con el producto.',
    winProbability: 45,
    slaDays: 4,
    orderIndex: 2,
  },
  {
    id: 'proposal',
    label: 'Propuesta / Negociación',
    shortCode: 'PROPUESTA',
    color: '#FBBF24', // Amber
    description: 'Cotización formal o términos enviados. En evaluación de detalles comerciales.',
    winProbability: 70,
    slaDays: 5,
    orderIndex: 3,
  },
  {
    id: 'pending_payment',
    label: 'Pendientes de Pago',
    shortCode: 'PAGO PEND.',
    color: '#FB923C', // Orange
    description: 'Acuerdo comercial cerrado, contrato emitido. Esperando acreditación de pago o anticipo.',
    winProbability: 90,
    slaDays: 3,
    orderIndex: 4,
  },
  {
    id: 'won',
    label: 'Lead Cerrado (Ganado)',
    shortCode: 'CERRADO',
    color: '#34D399', // Emerald
    description: 'Venta concretada y validada. Transición a entrega u onboarding.',
    winProbability: 100,
    slaDays: 0,
    orderIndex: 5,
  },
  {
    id: 'lost',
    label: 'Perdido / Descartado',
    shortCode: 'PERDIDO',
    color: '#F87171', // Rose
    description: 'No calificado, desinterés o elección de competidor.',
    winProbability: 0,
    slaDays: 0,
    orderIndex: 6,
  },
];

export const mockTerritories: TerritoryMetric[] = [
  {
    territoryId: 't-providencia',
    countryCode: 'CL',
    territoryName: 'Providencia',
    territoryCode: 'CL-13123',
    regionCode: 'CL-13',
    regionName: 'Metropolitana de Santiago',
    provinceName: 'Santiago',
    regionOrder: 6,
    colorHex: '#3B82F6',
    leadCount: 5,
    totalCompanyLeads: 12,
    percentage: 41.67,
    geojsonPolygon: {
      type: 'MultiPolygon',
      coordinates: [[[
        [-70.6300, -33.4200],
        [-70.5850, -33.4150],
        [-70.5900, -33.4450],
        [-70.6350, -33.4400],
        [-70.6300, -33.4200]
      ]]]
    }
  },
  {
    territoryId: 't-las-condes',
    countryCode: 'CL',
    territoryName: 'Las Condes',
    territoryCode: 'CL-13114',
    regionCode: 'CL-13',
    regionName: 'Metropolitana de Santiago',
    provinceName: 'Santiago',
    regionOrder: 6,
    colorHex: '#8B5CF6',
    leadCount: 3,
    totalCompanyLeads: 12,
    percentage: 25.00,
    geojsonPolygon: {
      type: 'MultiPolygon',
      coordinates: [[[
        [-70.5850, -33.4150],
        [-70.5200, -33.3900],
        [-70.5100, -33.4300],
        [-70.5900, -33.4450],
        [-70.5850, -33.4150]
      ]]]
    }
  },
  {
    territoryId: 't-santiago-centro',
    countryCode: 'CL',
    territoryName: 'Santiago Centro',
    territoryCode: 'CL-13101',
    regionCode: 'CL-13',
    regionName: 'Metropolitana de Santiago',
    provinceName: 'Santiago',
    regionOrder: 6,
    colorHex: '#10B981',
    leadCount: 2,
    totalCompanyLeads: 12,
    percentage: 16.67,
    geojsonPolygon: {
      type: 'MultiPolygon',
      coordinates: [[[
        [-70.6800, -33.4300],
        [-70.6300, -33.4200],
        [-70.6350, -33.4600],
        [-70.6850, -33.4650],
        [-70.6800, -33.4300]
      ]]]
    }
  },
  {
    territoryId: 't-vitacura',
    countryCode: 'CL',
    territoryName: 'Vitacura',
    territoryCode: 'CL-13132',
    regionCode: 'CL-13',
    regionName: 'Metropolitana de Santiago',
    provinceName: 'Santiago',
    regionOrder: 6,
    colorHex: '#F59E0B',
    leadCount: 1,
    totalCompanyLeads: 12,
    percentage: 8.33,
    geojsonPolygon: {
      type: 'MultiPolygon',
      coordinates: [[[
        [-70.6100, -33.3900],
        [-70.5400, -33.3600],
        [-70.5200, -33.3900],
        [-70.5850, -33.4150],
        [-70.6100, -33.3900]
      ]]]
    }
  },
  {
    territoryId: 't-nunoa',
    countryCode: 'CL',
    territoryName: 'Ñuñoa',
    territoryCode: 'CL-13120',
    regionCode: 'CL-13',
    regionName: 'Metropolitana de Santiago',
    provinceName: 'Santiago',
    regionOrder: 6,
    colorHex: '#EC4899',
    leadCount: 1,
    totalCompanyLeads: 12,
    percentage: 8.33,
    geojsonPolygon: {
      type: 'MultiPolygon',
      coordinates: [[[
        [-70.6350, -33.4400],
        [-70.5900, -33.4450],
        [-70.5800, -33.4750],
        [-70.6350, -33.4700],
        [-70.6350, -33.4400]
      ]]]
    }
  },
  // Perú · distritos de Lima Metropolitana (polígonos aproximados)
  {
    territoryId: 'pe-san-isidro',
    countryCode: 'PE',
    territoryName: 'San Isidro',
    territoryCode: 'PE-150131',
    regionCode: 'PE-15',
    regionName: 'Lima',
    provinceName: 'Lima',
    regionOrder: 14,
    colorHex: '#0EA5E9',
    leadCount: 0,
    totalCompanyLeads: 0,
    percentage: 0,
    geojsonPolygon: {
      type: 'MultiPolygon',
      coordinates: [[[
        [-77.0475, -12.0865],
        [-77.0255, -12.0885],
        [-77.0275, -12.1085],
        [-77.0455, -12.1065],
        [-77.0475, -12.0865]
      ]]]
    }
  },
  {
    territoryId: 'pe-miraflores',
    countryCode: 'PE',
    territoryName: 'Miraflores',
    territoryCode: 'PE-150122',
    regionCode: 'PE-15',
    regionName: 'Lima',
    provinceName: 'Lima',
    regionOrder: 14,
    colorHex: '#F97316',
    leadCount: 0,
    totalCompanyLeads: 0,
    percentage: 0,
    geojsonPolygon: {
      type: 'MultiPolygon',
      coordinates: [[[
        [-77.0410, -12.1115],
        [-77.0190, -12.1135],
        [-77.0210, -12.1335],
        [-77.0390, -12.1315],
        [-77.0410, -12.1115]
      ]]]
    }
  },
  {
    territoryId: 'pe-surco',
    countryCode: 'PE',
    territoryName: 'Santiago de Surco',
    territoryCode: 'PE-150140',
    regionCode: 'PE-15',
    regionName: 'Lima',
    provinceName: 'Lima',
    regionOrder: 14,
    colorHex: '#22C55E',
    leadCount: 0,
    totalCompanyLeads: 0,
    percentage: 0,
    geojsonPolygon: {
      type: 'MultiPolygon',
      coordinates: [[[
        [-77.0070, -12.1315],
        [-76.9770, -12.1335],
        [-76.9790, -12.1595],
        [-77.0050, -12.1575],
        [-77.0070, -12.1315]
      ]]]
    }
  },
  {
    territoryId: 'pe-san-borja',
    countryCode: 'PE',
    territoryName: 'San Borja',
    territoryCode: 'PE-150130',
    regionCode: 'PE-15',
    regionName: 'Lima',
    provinceName: 'Lima',
    regionOrder: 14,
    colorHex: '#A855F7',
    leadCount: 0,
    totalCompanyLeads: 0,
    percentage: 0,
    geojsonPolygon: {
      type: 'MultiPolygon',
      coordinates: [[[
        [-77.0100, -12.0950],
        [-76.9880, -12.0970],
        [-76.9900, -12.1170],
        [-77.0080, -12.1150],
        [-77.0100, -12.0950]
      ]]]
    }
  },
  {
    territoryId: 'pe-la-molina',
    countryCode: 'PE',
    territoryName: 'La Molina',
    territoryCode: 'PE-150114',
    regionCode: 'PE-15',
    regionName: 'Lima',
    provinceName: 'Lima',
    regionOrder: 14,
    colorHex: '#E11D48',
    leadCount: 0,
    totalCompanyLeads: 0,
    percentage: 0,
    geojsonPolygon: {
      type: 'MultiPolygon',
      coordinates: [[[
        [-76.9440, -12.0640],
        [-76.9120, -12.0660],
        [-76.9140, -12.0940],
        [-76.9420, -12.0920],
        [-76.9440, -12.0640]
      ]]]
    }
  }
];

const baseLeads: Lead[] = [
  // ---------------- Cuenta demo (servicios para oficinas, Chile y Perú) ----------------
  {
    id: 'lead-g1',
    companyId: TENANT_DEMO_ID,
    dataOrigin: 'form',
    consentStatus: 'inquiry',
    consentAt: '2026-06-18T09:15:00Z',
    countryCode: 'CL',
    fullName: 'Paulina Ibáñez',
    jobTitle: 'Jefa de Informática',
    companyName: 'Clínica Vitacura Salud',
    clientAccountId: 'acc-g1',
    email: 'pibanez@clinicavitacura.cl',
    phone: '+56 9 8821 4455',
    commercialStatus: 'won',
    estimatedDealValue: 1380000,
    rawAddress: 'Av. Vitacura 5951, Vitacura',
    normalizedAddress: 'Av. Vitacura 5951, Vitacura, Región Metropolitana',
    geocodingStatus: 'success',
    assignedTerritoryId: 't-vitacura',
    createdAt: '2026-06-18T09:15:00Z',
    lastContactedAt: '2026-09-02T15:30:00Z',
    notes: 'Mantención preventiva para tres pisos clínicos y limpieza de oficinas. Contrato anual, renovación en junio.',
  },
  {
    id: 'lead-g2',
    companyId: TENANT_DEMO_ID,
    dataOrigin: 'call',
    consentStatus: 'granted',
    consentAt: '2026-07-01T11:40:00Z',
    countryCode: 'CL',
    fullName: 'Ignacio Bravo',
    jobTitle: 'Gerente de Operaciones',
    companyName: 'Centro Comercial Plaza Oriente',
    clientAccountId: 'acc-g2',
    email: 'ibravo@plazaoriente.cl',
    phone: '+56 9 7712 8899',
    commercialStatus: 'won',
    estimatedDealValue: 3370000,
    rawAddress: 'Av. Apoquindo 4501, Las Condes',
    normalizedAddress: 'Av. Apoquindo 4501, Las Condes, Región Metropolitana',
    geocodingStatus: 'success',
    assignedTerritoryId: 't-las-condes',
    createdAt: '2026-07-01T11:40:00Z',
    lastContactedAt: '2026-09-10T10:00:00Z',
    notes: 'Externalizó la administración de sus oficinas: mantención, aseo y recepción. Decide el gerente, no el jefe de local.',
    contacts: [
      { id: 'lead-g2-c1', fullName: 'Rodrigo Salinas', jobTitle: 'Jefe de Administración', email: 'rsalinas@plazaoriente.cl', phone: '+56 9 7712 8834' },
      { id: 'lead-g2-c2', fullName: 'Karla Mora', jobTitle: 'Encargada de Pagos', email: 'kmora@plazaoriente.cl' },
    ],
  },
  {
    id: 'lead-g3',
    companyId: TENANT_DEMO_ID,
    dataOrigin: 'referral',
    consentStatus: 'granted',
    consentAt: '2026-08-22T16:05:00Z',
    countryCode: 'CL',
    fullName: 'Carolina Peña',
    jobTitle: 'Subgerenta de Tecnología',
    companyName: 'Banco Andes Sucursales',
    clientAccountId: 'acc-g3',
    email: 'cpena@bancoandes.cl',
    phone: '+56 9 6654 3321',
    commercialStatus: 'proposal',
    estimatedDealValue: 1130000,
    rawAddress: 'Av. Providencia 1760, Providencia',
    normalizedAddress: 'Av. Providencia 1760, Providencia, Región Metropolitana',
    geocodingStatus: 'success',
    assignedTerritoryId: 't-providencia',
    createdAt: '2026-08-22T16:05:00Z',
    lastContactedAt: '2026-09-15T12:20:00Z',
    notes: 'Propuesta de remodelación para sus sucursales; espera aprobación del directorio.',
    contacts: [
      { id: 'lead-g3-c1', fullName: 'Felipe Arriagada', jobTitle: 'Gerente de Finanzas', email: 'farriagada@bancoandes.cl', phone: '+56 9 6654 3300' },
    ],
  },
  {
    id: 'lead-g4',
    companyId: TENANT_DEMO_ID,
    dataOrigin: 'form',
    consentStatus: 'inquiry',
    consentAt: '2026-09-05T08:50:00Z',
    countryCode: 'CL',
    fullName: 'Héctor Navarro',
    jobTitle: 'Jefe de Operaciones',
    companyName: 'Bodegas Central Express',
    clientAccountId: 'acc-g4',
    email: 'hnavarro@centralexpress.cl',
    phone: '+56 9 5590 1122',
    commercialStatus: 'contacted',
    // Cliente que pidió cotizar en dólares: el monto queda guardado en US$
    currency: 'USD',
    estimatedDealValue: 2700,
    rawAddress: 'Av. Santa Rosa 1250, Santiago Centro',
    normalizedAddress: 'Av. Santa Rosa 1250, Santiago, Región Metropolitana',
    geocodingStatus: 'success',
    assignedTerritoryId: 't-santiago-centro',
    createdAt: '2026-09-05T08:50:00Z',
    lastContactedAt: '2026-09-16T09:10:00Z',
    notes: 'Pide mantención preventiva para la bodega y dos estaciones de trabajo antes del peak de fin de año; valor negociado bajo el precio de lista.',
  },
  {
    id: 'lead-g5',
    companyId: TENANT_DEMO_ID,
    dataOrigin: 'event',
    consentStatus: 'granted',
    consentAt: '2026-06-30T14:00:00Z',
    countryCode: 'CL',
    fullName: 'Marcela Zúñiga',
    jobTitle: 'Directora de Tecnologías de la Información',
    companyName: 'Universidad del Valle Central',
    clientAccountId: 'acc-g5',
    email: 'mzuniga@uvcentral.cl',
    phone: '+56 9 4412 0077',
    commercialStatus: 'lost',
    estimatedDealValue: 3110000,
    rawAddress: 'Av. Irarrázaval 3300, Ñuñoa',
    normalizedAddress: 'Av. Irarrázaval 3300, Ñuñoa, Región Metropolitana',
    geocodingStatus: 'success',
    assignedTerritoryId: 't-nunoa',
    createdAt: '2026-06-30T14:00:00Z',
    lastContactedAt: '2026-08-12T11:00:00Z',
    notes: 'Licitación del rediseño de oficinas adjudicada a otra empresa por precio. Volver a presentar en 2027.',
  },
  {
    id: 'lead-g6',
    companyId: TENANT_DEMO_ID,
    dataOrigin: 'referral',
    consentStatus: 'inquiry',
    consentAt: '2026-07-14T10:30:00Z',
    countryCode: 'PE',
    fullName: 'Diego Ramírez',
    jobTitle: 'Gerente de Administración',
    companyName: 'Corporación Salud Lima SAC',
    clientAccountId: 'acc-g6',
    email: 'dramirez@saludlima.pe',
    phone: '+51 987 112 334',
    commercialStatus: 'won',
    estimatedDealValue: 14000,
    rawAddress: 'Av. Javier Prado Este 1066, San Isidro',
    normalizedAddress: 'Av. Javier Prado Este 1066, San Isidro, Lima',
    geocodingStatus: 'success',
    assignedTerritoryId: 'pe-san-isidro',
    createdAt: '2026-07-14T10:30:00Z',
    lastContactedAt: '2026-09-08T16:45:00Z',
    notes: 'Primer contrato en Perú: administración integral para dos sedes.',
  },
  {
    id: 'lead-g7',
    companyId: TENANT_DEMO_ID,
    dataOrigin: 'call',
    consentStatus: 'granted',
    consentAt: '2026-08-04T09:20:00Z',
    countryCode: 'PE',
    fullName: 'Patricia Chávez',
    jobTitle: 'Jefa de Operaciones',
    companyName: 'Centro Comercial Surco Plaza SAC',
    clientAccountId: 'acc-g7',
    email: 'pchavez@surcoplaza.pe',
    phone: '+51 944 556 778',
    commercialStatus: 'pending_payment',
    estimatedDealValue: 16900,
    rawAddress: 'Av. Caminos del Inca 2350, Santiago de Surco',
    normalizedAddress: 'Av. Caminos del Inca 2350, Santiago de Surco, Lima',
    geocodingStatus: 'success',
    assignedTerritoryId: 'pe-surco',
    createdAt: '2026-08-04T09:20:00Z',
    lastContactedAt: '2026-09-17T14:00:00Z',
    notes: 'Mantención preventiva y dos salas de reuniones equipadas. Contrato firmado; esperando la primera factura del mes.',
    contacts: [
      { id: 'lead-g7-c1', fullName: 'Luis Paredes', jobTitle: 'Encargado de Redes', phone: '+51 944 556 700' },
    ],
  },
  {
    id: 'lead-g8',
    companyId: TENANT_DEMO_ID,
    dataOrigin: 'form',
    consentStatus: 'inquiry',
    consentAt: '2026-09-01T13:10:00Z',
    countryCode: 'PE',
    fullName: 'Álvaro Mendoza',
    jobTitle: 'Dueño / Socio',
    companyName: 'Naviera Costa Verde SAC',
    clientAccountId: 'acc-g8',
    email: 'amendoza@navieracostaverde.pe',
    phone: '+51 933 220 118',
    commercialStatus: 'qualified',
    estimatedDealValue: 4600,
    rawAddress: 'Av. Larco 1301, Miraflores',
    normalizedAddress: 'Av. Larco 1301, Miraflores, Lima',
    geocodingStatus: 'success',
    assignedTerritoryId: 'pe-miraflores',
    createdAt: '2026-09-01T13:10:00Z',
    lastContactedAt: '2026-09-13T17:30:00Z',
    notes: 'Quiere coordinar el traslado de su centro de distribución. Ya revisó el plan de seguridad de la sede.',
  },
  {
    id: 'lead-g9',
    companyId: TENANT_DEMO_ID,
    dataOrigin: 'public',
    consentStatus: 'not_requested',
    consentAt: '2026-09-18T11:25:00Z',
    countryCode: 'PE',
    fullName: 'Rosa Anticona',
    jobTitle: 'Asistente de Administración',
    companyName: 'Corporación Salud Lima SAC',
    clientAccountId: 'acc-g6',
    email: 'ranticona@saludlima.pe',
    phone: '+51 921 445 660',
    commercialStatus: 'new',
    estimatedDealValue: 2900,
    rawAddress: 'Av. Aviación 2405, San Borja',
    normalizedAddress: 'Av. Aviación 2405, San Borja, Lima',
    geocodingStatus: 'success',
    assignedTerritoryId: 'pe-san-borja',
    createdAt: '2026-09-18T11:25:00Z',
    notes: 'Consulta por cajas de papel para la nueva sede; no es quien decide.',
  }
];

// Catálogo de productos y servicios de cada CRM (precios sugeridos por país, en su moneda)
export const catalogItem = (
  id: string,
  companyId: string,
  type: CatalogItem['type'],
  name: string,
  sku: string,
  category: string,
  prices: CatalogItem['prices'],
  extra: Partial<CatalogItem> = {}
): CatalogItem => ({ id, companyId, type, name, sku, category, prices, isActive: true, createdAt: '2026-08-01T12:00:00Z', ...extra });

export const mockCatalogItems: CatalogItem[] = [
  // Catálogo de la cuenta demo (Chile + Perú): administración, mantención, proyectos, diseño, seguridad, mobiliario e insumos.
  catalogItem('cat-d-admin', TENANT_DEMO_ID, 'service', 'Administración integral de oficinas', 'DEMO-ADM', 'Administración', { CL: 4200000, PE: 15500 }, { billing: 'monthly' }),
  catalogItem('cat-d-mant', TENANT_DEMO_ID, 'service', 'Mantención preventiva de instalaciones', 'DEMO-MPI', 'Mantención', { CL: 1450000, PE: 5300 }, { billing: 'monthly' }),
  catalogItem('cat-d-limpieza', TENANT_DEMO_ID, 'service', 'Limpieza y aseo de oficinas', 'DEMO-LIM', 'Mantención', { CL: 890000, PE: 3300 }, { billing: 'monthly' }),
  catalogItem('cat-d-equipo', TENANT_DEMO_ID, 'service', 'Equipo de proyectos dedicado', 'DEMO-EPD', 'Proyectos', { CL: 6500000, PE: 24000 }, { billing: 'monthly' }),
  catalogItem('cat-d-remodel', TENANT_DEMO_ID, 'service', 'Remodelación de oficinas (por etapa)', 'DEMO-REM', 'Proyectos', { CL: 9800000, PE: 36000 }, { billing: 'one_time' }),
  catalogItem('cat-d-traslado', TENANT_DEMO_ID, 'service', 'Traslado de oficinas', 'DEMO-TRA', 'Proyectos', { CL: 3200000, PE: 11800 }, { billing: 'one_time' }),
  catalogItem('cat-d-diseno', TENANT_DEMO_ID, 'service', 'Diseño de espacios de trabajo', 'DEMO-DIS', 'Diseño', { CL: 2600000, PE: 9600 }, { billing: 'one_time' }),
  catalogItem('cat-d-asesoria', TENANT_DEMO_ID, 'service', 'Asesoría mensual de uso de espacios', 'DEMO-AME', 'Diseño', { CL: 350000, PE: 1300 }, { billing: 'monthly' }),
  catalogItem('cat-d-seguridad', TENANT_DEMO_ID, 'service', 'Plan de seguridad y evacuación', 'DEMO-SEG', 'Seguridad', { CL: 2900000, PE: 10700 }, { billing: 'one_time' }),
  catalogItem('cat-d-primeros', TENANT_DEMO_ID, 'service', 'Capacitación en primeros auxilios', 'DEMO-CPA', 'Seguridad', { CL: 650000, PE: 2400 }, { billing: 'one_time' }),
  catalogItem('cat-d-estacion', TENANT_DEMO_ID, 'product', 'Estación de trabajo completa', 'DEMO-EST', 'Mobiliario', { CL: 890000, PE: 3300 }),
  catalogItem('cat-d-sala', TENANT_DEMO_ID, 'product', 'Sala de reuniones equipada', 'DEMO-SAL', 'Mobiliario', { CL: 1250000, PE: 4600 }),
  catalogItem('cat-d-papel', TENANT_DEMO_ID, 'product', 'Caja de papel carta (10 resmas)', 'DEMO-PAP', 'Insumos', { CL: 13500, PE: 50 }),
];

// Productos y servicios de cada lead. [ítem, cantidad]; el precio unitario es el del catálogo para el país del lead.
// Los leads marcados como manuales tienen un valor negociado distinto a la suma de sus ítems.
const LEAD_ITEMS: Record<string, { lines: [string, number][]; manual?: boolean }> = {
  'lead-g1': { lines: [['cat-d-mant', 1], ['cat-d-limpieza', 1]] },
  'lead-g2': { lines: [['cat-d-admin', 1], ['cat-d-estacion', 4]] },
  'lead-g3': { lines: [['cat-d-remodel', 1], ['cat-d-traslado', 1]] },
  'lead-g4': { lines: [['cat-d-mant', 1], ['cat-d-estacion', 2]], manual: true },
  'lead-g5': { lines: [['cat-d-diseno', 1], ['cat-d-asesoria', 1], ['cat-d-primeros', 1]] },
  'lead-g6': { lines: [['cat-d-admin', 1], ['cat-d-papel', 40]] },
  'lead-g7': { lines: [['cat-d-mant', 1], ['cat-d-sala', 2]] },
  'lead-g8': { lines: [['cat-d-traslado', 1], ['cat-d-seguridad', 1]] },
  'lead-g9': { lines: [['cat-d-papel', 25]] },
};

// Arma los ítems de cada lead con los precios del catálogo de su CRM. La usan también los CRMs de
// prueba (testTenants.ts), con su propio catálogo.
export const leadWithItems =
  (catalog: CatalogItem[], leadItems: Record<string, { lines: [string, number][]; manual?: boolean }>) =>
  (lead: Lead): Lead => {
    const config = leadItems[lead.id];
    if (!config) return { ...lead, items: [], valueSource: 'manual' };
    const items: LeadItem[] = config.lines.map(([itemId, quantity]) => {
      const item = catalog.find((i) => i.id === itemId && i.companyId === lead.companyId);
      if (!item) throw new Error(`Ítem ${itemId} no pertenece al CRM del lead ${lead.id}`);
      // El catálogo tiene precio por país; si el lead se negoció en otra moneda, se convierte
      const listPrice = item.prices[lead.countryCode] ?? 0;
      const currency = leadCurrency(lead);
      const unitPrice = roundForCurrency(convert(listPrice, currencyOfCountry(lead.countryCode), currency, FALLBACK_RATES), currency);
      return { itemId, quantity, unitPrice };
    });
    if (config.manual) return { ...lead, items, valueSource: 'manual' };
    return { ...lead, items, valueSource: 'items', estimatedDealValue: items.reduce((acc, i) => acc + i.quantity * i.unitPrice, 0) };
  };

export const mockLeads: Lead[] = baseLeads.map(leadWithItems(mockCatalogItems, LEAD_ITEMS));

export const mockActivities: LeadActivity[] = [
  // Cuenta demo: compromisos de seguimiento repartidos en el tiempo para ver la agenda
  {
    id: 'act-g1',
    leadId: 'lead-g3',
    companyId: TENANT_DEMO_ID,
    channel: 'email',
    outcome: 'requested_quote',
    contactName: 'Carolina Peña',
    summary: 'Enviada la propuesta de la app de sucursales. Queda de responder tras el directorio del jueves.',
    nextFollowUpDate: '2026-09-18T15:00:00Z',
    agentName: 'Marcela Ortiz',
    createdAt: '2026-09-15T12:20:00Z',
  },
  {
    id: 'act-g2',
    leadId: 'lead-g4',
    companyId: TENANT_DEMO_ID,
    channel: 'call',
    outcome: 'interested',
    contactName: 'Héctor Navarro',
    summary: 'Pide mantención preventiva y dos estaciones de trabajo para el peak de diciembre. Hay que confirmar el plazo antes de cotizar.',
    nextFollowUpDate: '2026-09-20T17:00:00Z',
    agentName: 'Marcela Ortiz',
    createdAt: '2026-09-16T09:10:00Z',
  },
  {
    id: 'act-g3',
    leadId: 'lead-g8',
    companyId: TENANT_DEMO_ID,
    channel: 'whatsapp',
    outcome: 'rescheduled',
    contactName: 'Álvaro Mendoza',
    summary: 'Reagendó la reunión por viaje. Quiere el traslado de oficinas antes de fin de año.',
    nextFollowUpDate: '2026-09-23T14:30:00Z',
    agentName: 'Diego Fuentes',
    createdAt: '2026-09-13T17:30:00Z',
  },
  {
    id: 'act-g4',
    leadId: 'lead-g7',
    companyId: TENANT_DEMO_ID,
    channel: 'meeting',
    outcome: 'paid',
    contactName: 'Patricia Chávez',
    summary: 'Contrato firmado. Coordinar la entrega de las salas de reuniones y la emisión de la primera factura.',
    nextFollowUpDate: '2026-10-01T16:00:00Z',
    agentName: 'Diego Fuentes',
    createdAt: '2026-09-17T14:00:00Z',
  }
];

// La app publicada trae solo esta cuenta demo. Los CRMs de prueba (GeoDemo, Constructora Norte y
// Logística Sur) viven en testTenants.ts y solo se cargan en desarrollo, con ?pruebas.
export interface DemoData {
  companies: Company[];
  users: AppUser[];
  accounts: ClientAccount[];
  leads: Lead[];
  activities: LeadActivity[];
  catalog: CatalogItem[];
}

export interface DemoDataOptions {
  /** Datos que reemplazan a la demo: los 4 CRMs de ejemplo (solo en desarrollo, con ?pruebas) */
  replaceWith?: DemoData;
  /** Usuarios que solo existen en desarrollo, como el administrador de plataforma */
  extraUsers?: AppUser[];
}

export const demoDataFor = ({ replaceWith, extraUsers = [] }: DemoDataOptions = {}): DemoData => {
  const base = replaceWith ?? {
    companies: mockCompanies,
    users: mockUsers,
    accounts: mockClientAccounts,
    leads: mockLeads,
    activities: mockActivities,
    catalog: mockCatalogItems,
  };
  return { ...base, users: [...extraUsers, ...base.users] };
};
