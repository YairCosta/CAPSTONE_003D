// Traducción entre la base (snake_case) y la app (camelCase), en un solo lugar.
// Ver docs/BASE_DE_DATOS.md, sección 6. Funciones puras: se prueban sin conexión (npm run test:supabase).

import type { AppUser, Company, CompanyPlan, UserRole } from '../../types/crm.ts';
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
  // El país base va siempre primero; el plan Nacional solo tiene ese
  const enabledCountries: CountryCode[] = plan === 'international' ? [home, ...extra] : [home];
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
