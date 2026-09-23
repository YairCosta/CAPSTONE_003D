import type { CountryCode, CurrencyCode } from '../data/countries';

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
  latitude?: number;
  longitude?: number;
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
  password: string; // Solo demo local: en producción la autenticación la resuelve Supabase Auth
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
