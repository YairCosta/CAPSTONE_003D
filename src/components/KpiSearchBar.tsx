import React from 'react';
import type { CommercialStatus, TerritoryMetric } from '../types/crm';
import { Search, Building2, MapPin, CalendarDays, Filter, X } from 'lucide-react';
import { COUNTRIES, type CountryCode } from '../data/countries';

export type DatePreset = 'all' | 'today' | '7d' | '30d' | 'custom';

export interface KpiFilters {
  query: string;
  company: string;
  territoryId: string;
  status: CommercialStatus | 'all';
  datePreset: DatePreset;
  dateFrom: string;
  dateTo: string;
}

export const emptyKpiFilters: KpiFilters = {
  query: '',
  company: 'all',
  territoryId: 'all',
  status: 'all',
  datePreset: 'all',
  dateFrom: '',
  dateTo: '',
};

interface KpiSearchBarProps {
  filters: KpiFilters;
  onChange: (filters: KpiFilters) => void;
  companies: string[];
  territories: TerritoryMetric[];
  countries: CountryCode[]; // países visibles (definen las zonas del selector)
  resultCount: number;
  totalCount: number;
}

const datePresets: { id: DatePreset; label: string }[] = [
  { id: 'all', label: 'Todo' },
  { id: 'today', label: 'Hoy' },
  { id: '7d', label: '7 días' },
  { id: '30d', label: '30 días' },
  { id: 'custom', label: 'Rango' },
];

const fieldClass =
  'w-full rounded-xl border border-slate-600 bg-slate-950/70 px-3.5 py-2.5 text-[15px] text-slate-100 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500';

const labelClass = 'mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-300';

export const KpiSearchBar: React.FC<KpiSearchBarProps> = ({
  filters,
  onChange,
  companies,
  territories,
  countries,
  resultCount,
  totalCount,
}) => {
  const zoneLabels = Array.from(new Set(countries.map((c) => COUNTRIES[c].zoneLabel.singular.toLowerCase())));
  const byName = (a: TerritoryMetric, b: TerritoryMetric) => a.territoryName.localeCompare(b.territoryName, 'es');
  const zoneOption = (t: TerritoryMetric) => (
    <option key={t.territoryId} value={t.territoryId}>
      {t.territoryName}
    </option>
  );

  const set = <K extends keyof KpiFilters>(key: K, value: KpiFilters[K]) =>
    onChange({ ...filters, [key]: value });

  const hasActiveFilters =
    filters.query !== '' ||
    filters.company !== 'all' ||
    filters.territoryId !== 'all' ||
    filters.status !== 'all' ||
    filters.datePreset !== 'all';

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-900/80 p-5 backdrop-blur-md">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-white">
          <Filter className="h-5 w-5 text-indigo-400" />
          Buscar y filtrar datos
        </h2>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-slate-600 bg-slate-800 px-3 py-1 text-sm font-semibold text-slate-200">
            {resultCount} de {totalCount} leads
          </span>
          {hasActiveFilters && (
            <button
              onClick={() => onChange(emptyKpiFilters)}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/10"
            >
              <X className="h-4 w-4" />
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-12">
        {/* Texto libre */}
        <div className="xl:col-span-4">
          <label className={labelClass} htmlFor="kpi-query">
            <Search className="h-4 w-4 text-slate-400" /> Búsqueda general
          </label>
          <div className="relative">
            <Search className="absolute left-3.5 top-3 h-4.5 w-4.5 text-slate-400" />
            <input
              id="kpi-query"
              type="text"
              value={filters.query}
              onChange={(e) => set('query', e.target.value)}
              placeholder="Nombre, empresa, email, dirección..."
              className={`${fieldClass} pl-10`}
            />
          </div>
        </div>

        {/* Empresa */}
        <div className="xl:col-span-3">
          <label className={labelClass} htmlFor="kpi-company">
            <Building2 className="h-4 w-4 text-slate-400" /> Empresa
          </label>
          <select
            id="kpi-company"
            value={filters.company}
            onChange={(e) => set('company', e.target.value)}
            className={fieldClass}
          >
            <option value="all">Todas las empresas</option>
            {companies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Lugar */}
        <div className="xl:col-span-3">
          <label className={labelClass} htmlFor="kpi-territory">
            <MapPin className="h-4 w-4 text-slate-400" /> Lugar ({zoneLabels.join(' / ') || 'zona'})
          </label>
          <select
            id="kpi-territory"
            value={filters.territoryId}
            onChange={(e) => set('territoryId', e.target.value)}
            className={fieldClass}
          >
            <option value="all">Todas las zonas</option>
            {countries.length > 1
              ? countries.map((code) => (
                  <optgroup key={code} label={`${COUNTRIES[code].name} · ${COUNTRIES[code].zoneLabel.plural}`}>
                    {territories.filter((t) => t.countryCode === code).sort(byName).map(zoneOption)}
                  </optgroup>
                ))
              : [...territories].sort(byName).map(zoneOption)}
          </select>
        </div>

        {/* Estado */}
        <div className="xl:col-span-2">
          <label className={labelClass} htmlFor="kpi-status">
            Estado
          </label>
          <select
            id="kpi-status"
            value={filters.status}
            onChange={(e) => set('status', e.target.value as KpiFilters['status'])}
            className={fieldClass}
          >
            <option value="all">Todos</option>
            <option value="new">Nuevos</option>
            <option value="contacted">Contactados</option>
            <option value="qualified">Calificados</option>
            <option value="proposal">Propuestas</option>
            <option value="pending_payment">Pendientes de pago</option>
            <option value="won">Ganados</option>
            <option value="lost">Perdidos</option>
          </select>
        </div>
      </div>

      {/* Tiempo */}
      <div className="mt-4 flex flex-wrap items-end gap-4 border-t border-slate-700 pt-4">
        <div>
          <span className={labelClass}>
            <CalendarDays className="h-4 w-4 text-slate-400" /> Fecha de captura
          </span>
          <div className="flex flex-wrap gap-1.5 rounded-xl border border-slate-600 bg-slate-950/70 p-1">
            {datePresets.map((p) => (
              <button
                key={p.id}
                onClick={() => set('datePreset', p.id)}
                className={`cursor-pointer rounded-lg px-4 py-2 text-[15px] font-semibold transition ${
                  filters.datePreset === p.id
                    ? 'bg-indigo-600 text-[#fff]'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {filters.datePreset === 'custom' && (
          <>
            <div>
              <label className={labelClass} htmlFor="kpi-from">
                Desde
              </label>
              <input
                id="kpi-from"
                type="date"
                value={filters.dateFrom}
                onChange={(e) => set('dateFrom', e.target.value)}
                className={`${fieldClass}`}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="kpi-to">
                Hasta
              </label>
              <input
                id="kpi-to"
                type="date"
                value={filters.dateTo}
                onChange={(e) => set('dateTo', e.target.value)}
                className={`${fieldClass}`}
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
};

// Aplica los filtros del panel KPI sobre la lista de leads
export function applyKpiFilters<T extends {
  fullName: string;
  companyName?: string;
  email?: string;
  phone?: string;
  rawAddress: string;
  assignedTerritoryId?: string;
  commercialStatus: CommercialStatus;
  createdAt: string;
}>(leads: T[], f: KpiFilters, now: Date = new Date()): T[] {
  const q = f.query.trim().toLowerCase();

  let from: Date | null = null;
  let to: Date | null = null;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (f.datePreset === 'today') from = startOfToday;
  if (f.datePreset === '7d') from = new Date(startOfToday.getTime() - 6 * 86400000);
  if (f.datePreset === '30d') from = new Date(startOfToday.getTime() - 29 * 86400000);
  if (f.datePreset === 'custom') {
    if (f.dateFrom) from = new Date(`${f.dateFrom}T00:00:00`);
    if (f.dateTo) to = new Date(`${f.dateTo}T23:59:59.999`);
  }

  return leads.filter((l) => {
    if (q) {
      const haystack = [l.fullName, l.companyName, l.email, l.phone, l.rawAddress]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (f.company !== 'all' && l.companyName !== f.company) return false;
    if (f.territoryId !== 'all' && l.assignedTerritoryId !== f.territoryId) return false;
    if (f.status !== 'all' && l.commercialStatus !== f.status) return false;

    const created = new Date(l.createdAt);
    if (from && created < from) return false;
    if (to && created > to) return false;
    return true;
  });
}
