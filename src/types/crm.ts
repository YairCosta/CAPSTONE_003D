import type { CountryCode, CurrencyCode } from '../data/countries.ts';

export type CommercialStatus =
  | 'new'
  | 'contacted'
  | 'qualified'
  | 'proposal'
  | 'pending_payment'
  | 'won'
  | 'lost';

export type GeocodingStatus =
  | 'pending'
  | 'processing'
  | 'success'
  | 'failed'
  | 'manual_review';

export type ContactChannel = 'call' | 'whatsapp' | 'email' | 'meeting' | 'video_call';

export type ContactOutcome =
  | 'interested'
  | 'no_answer'
  | 'requested_quote'
  | 'rescheduled'
  | 'rejected'
  | 'paid';

// Otra persona con la que se habla dentro del mismo lead (quien cotiza no siempre es quien firma)
export interface LeadContact {
  id: string;
  fullName: string;
  jobTitle?: string;
  email?: string;
  phone?: string;
}

export interface LeadActivity {
  id: string;
  leadId: string;
  companyId?: string; // CRM (tenant) dueño de la actividad
  channel: ContactChannel;
  outcome: ContactOutcome;
  contactName?: string; // con quién se habló: el contacto principal u otro del mismo lead
  summary: string;
  nextFollowUpDate?: string;
  agentName: string;
  createdAt: string;
}

// Respuesta a la encuesta de satisfacción: qué tan probable es que la persona recomiende Revela (0 a 10)
export interface SurveyResponse {
  id: string;
  companyId: string;
  userId: string;
  score: number;
  comment?: string;
  createdAt: string;
}

// Error que una persona reporta desde el botón del encabezado. Nunca lleva datos de leads.
export type BugStatus = 'new' | 'seen' | 'resolved';
export interface BugReport {
  id: string;
  companyId: string;
  userId: string;
  description: string;
  page?: string; // pestaña en que estaba (kpi, kanban…), nunca la dirección completa
  userAgent?: string;
  status: BugStatus;
  createdAt: string;
  resolvedAt?: string;
}

export interface StageConfig {
  id: CommercialStatus;
  label: string;
  shortCode: string;
  color: string;
  description: string;
  winProbability: number; // Porcentaje de 0 a 100
  slaDays: number; // Días máximos permitidos en esta etapa
  orderIndex: number;
}

export interface Lead {
  id: string;
  companyId: string;
  countryCode: CountryCode; // país del lead (define moneda y tipo de zona)
  fullName: string;
  jobTitle?: string; // Cargo del contacto: indica si se está hablando con quien decide
  companyName?: string; // Empresa u organización del lead
  clientAccountId?: string;
  email?: string;
  phone?: string;
  commercialStatus: CommercialStatus;
  estimatedDealValue: number;
  // Moneda en que se negoció: la de un país habilitado del CRM o dólar. El monto (y los precios de sus
  // ítems) se guardan en esta moneda y nunca se convierten. Sin valor = la moneda del país del lead.
  currency?: CurrencyCode;
  rawAddress: string;
  normalizedAddress?: string;
  geocodingStatus: GeocodingStatus;
  assignedTerritoryId?: string;
  createdAt: string;
  lastContactedAt?: string;
  notes?: string;
  // Otras personas de la misma empresa con las que también se habla en este lead.
  // El contacto de arriba (fullName, jobTitle, email, phone) es el principal.
  contacts?: LeadContact[];
  // Productos y servicios del negocio. Con ítems, el valor se calcula solo salvo que se edite a mano.
  items?: LeadItem[];
  valueSource?: LeadValueSource;
  // ---- Datos personales: de dónde salió el dato y qué pidió el titular (Ley 21.719) ----
  dataOrigin?: LeadDataOrigin;
  consentStatus?: ConsentStatus;
  consentAt?: string; // cuándo se registró la respuesta del titular
  noContact?: boolean; // se opuso a ser contactado (art. 8)
  privacyRequest?: PrivacyRequest; // pendiente = tratamiento bloqueado (art. 8 ter)
  anonymizedAt?: string; // sus datos personales fueron eliminados (art. 7)
  anonymizedReason?: 'request' | 'retention'; // a pedido del titular o por vencer el plazo de prospecto
}

// De dónde salió el dato: la ley pide poder decir el origen de lo que se guarda
export type LeadDataOrigin = 'form' | 'call' | 'event' | 'referral' | 'public' | 'ai';

// Por qué se pueden guardar los datos de esta persona:
// - inquiry: ella nos contactó o pidió cotización (no hace falta preguntarle nada más)
// - granted: autorizó que guardemos sus datos
// - not_requested: prospecto; se le informa y pregunta en el primer contacto (plazo limitado)
// - refused / withdrawn: no autoriza o revocó
export type ConsentStatus = 'inquiry' | 'granted' | 'not_requested' | 'refused' | 'withdrawn';

export type PrivacyRequestReason = 'erasure' | 'no_consent' | 'wrong_data' | 'other';

// Solicitud del titular sobre sus datos. La resuelve el gerente del CRM.
export interface PrivacyRequest {
  reason: PrivacyRequestReason;
  detail?: string;
  requestedBy: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  decidedBy?: string;
  decidedAt?: string;
  decisionNote?: string;
}

// Origen del valor estimado: calculado desde los ítems o ingresado manualmente
export type LeadValueSource = 'items' | 'manual';

// Producto o servicio incluido en un lead (precio unitario en la moneda del país del lead)
export interface LeadItem {
  itemId: string;
  quantity: number;
  unitPrice: number;
}

// Catálogo de productos y servicios de cada CRM (tenant)
export type CatalogItemType = 'product' | 'service';
export type BillingType = 'one_time' | 'monthly';

export interface CatalogItem {
  id: string;
  companyId: string;
  type: CatalogItemType;
  name: string;
  sku?: string;
  category?: string;
  description?: string;
  billing?: BillingType; // solo servicios: pago único o mensual
  prices: Partial<Record<CountryCode, number>>; // precio sugerido por país, en su moneda
  isActive: boolean;
  createdAt: string;
}

export type NewCatalogItem = Omit<CatalogItem, 'id' | 'companyId' | 'createdAt'>;

// ------------------------------------------------------------------ auditoría
export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'activate'
  | 'deactivate'
  | 'stage'
  | 'locate'
  | 'contact'
  | 'export'
  | 'revert';

export type AuditEntity = 'lead' | 'account' | 'catalog' | 'activity' | 'stage' | 'company' | 'user' | 'export';

// Un campo que cambió, con su valor anterior y el nuevo (ya formateados para mostrar)
export interface AuditChange {
  field: string;
  label: string;
  before: string | number | null;
  after: string | number | null;
  // Dato personal: se registra que cambió, nunca su valor (Ley 21.719, derecho de supresión)
  redacted?: boolean;
}

// Cómo deshacer el cambio: se guarda el estado anterior completo
export type AuditRevert =
  | { kind: 'lead'; snapshot: Lead }
  | { kind: 'account'; snapshot: ClientAccount }
  | { kind: 'catalog'; snapshot: CatalogItem }
  | { kind: 'stage'; snapshot: StageConfig }
  | { kind: 'account-deleted'; snapshot: ClientAccount }
  | { kind: 'catalog-deleted'; snapshot: CatalogItem };

// Entrada del historial. Es inmutable: revertir un cambio agrega otra entrada, no borra esta.
export interface AuditEntry {
  id: string;
  companyId: string; // CRM al que pertenece el hecho registrado
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  entityLabel: string;
  summary: string;
  changes: AuditChange[];
  revert?: AuditRevert;
  revertedAt?: string;
  revertedBy?: string;
  createdAt: string;
}

export interface TerritoryMetric {
  territoryId: string;
  countryCode: CountryCode;
  territoryName: string;
  territoryCode: string;
  colorHex: string;
  leadCount: number;
  totalCompanyLeads: number;
  percentage: number;
  geojsonPolygon: {
    type: 'MultiPolygon' | 'Polygon';
    coordinates: any[];
  };
  // Región (Chile) o departamento (Perú) y provincia: para elegir primero la región y distinguir
  // zonas con el mismo nombre (en Perú hay 10 distritos "Santa Rosa")
  regionCode?: string;
  regionName?: string;
  provinceName?: string;
  regionOrder?: number; // orden de la región en los selectores (Chile de norte a sur)
}

// Plan del CRM: Nacional (un país) o Internacional (varios países)
export type CompanyPlan = 'national' | 'international';

// Empresa dueña de un CRM (tenant)
export interface Company {
  id: string;
  name: string;
  slug: string;
  taxId?: string;
  isActive: boolean;
  plan: CompanyPlan;
  homeCountry: CountryCode;
  enabledCountries: CountryCode[]; // incluye el país base
  // Divisas que la gerencia sumó al selector de moneda (la del país base y el dólar están siempre)
  viewCurrencies?: CurrencyCode[];
  createdAt: string;
  defaultLat: number;
  defaultLng: number;
  defaultZoom: number;
  // Última exportación de datos (portabilidad), registrada por el administrador
  lastExportedAt?: string;
  lastExportedBy?: string;
}

export type NewCompany = Omit<Company, 'id' | 'createdAt'>;

// agent = usuario base, manager = gerente, superadmin = administrador de la plataforma
export type UserRole = 'agent' | 'manager' | 'superadmin';

export interface AppUser {
  id: string;
  companyId: string | null; // null solo para superadmin
  fullName: string;
  email: string;
  // Solo desarrollo y pruebas: la demo pública entra sin contraseña y en producción la resuelve Supabase Auth
  password?: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

export type NewAppUser = Omit<AppUser, 'id' | 'createdAt'>;

// Empresa cliente (contenedor de leads) dentro de un tenant
export interface ClientAccount {
  id: string;
  companyId: string;
  countryCode: CountryCode;
  name: string;
  taxId?: string;
  industry?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
}
