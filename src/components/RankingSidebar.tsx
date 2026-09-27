import React, { useMemo } from 'react';
import type { Lead, TerritoryMetric } from '../types/crm';
import { TrendingUp, Award, Building2 } from 'lucide-react';
import { COUNTRIES, zoneLabelFor, type CountryCode } from '../data/countries';
import { formatMoney, leadCurrency } from '../lib/currency';
import { useMoney } from '../lib/money';
import { computeZoneResults, zoneResultValue, type ZoneMetric, type ZoneResult } from '../lib/metrics';
import { CountryFlag } from './CountryFlag';

interface RankingSidebarProps {
  territories: TerritoryMetric[];
  leads: Lead[]; // leads visibles con los filtros del KPI
  countries: CountryCode[]; // países visibles
  // El ranking usa el mismo criterio que los botones "Colorear por" del mapa
  zoneMetric: ZoneMetric;
  selectedTerritoryId: string | null;
  onSelectTerritory: (id: string | null) => void;
  totalLeads: number;
}

const rankBadge = (idx: number) =>
  idx === 0
    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
    : idx === 1
    ? 'bg-slate-700/60 text-slate-200'
    : idx === 2
    ? 'bg-amber-900/20 text-amber-400'
    : 'bg-slate-800 text-slate-400';

const METRIC_TITLE: Record<ZoneMetric, string> = {
  money: 'por dinero ganado',
  deals: 'por leads cerrados',
};

export const RankingSidebar: React.FC<RankingSidebarProps> = ({
  territories,
  leads,
  countries,
  zoneMetric,
  selectedTerritoryId,
  onSelectTerritory,
  totalLeads,
}) => {
  const isMultiCountry = countries.length > 1;
  const zonesLabel = zoneLabelFor(countries, 'plural');
  const money = useMoney();
  // Todo el dinero se suma ya en la moneda de la vista: así se comparan zonas de países distintos
  const results = useMemo(
    () => computeZoneResults(leads, territories, (l) => money.toDisplay(l.estimatedDealValue, leadCurrency(l))),
    [leads, territories, money]
  );

  const valueOf = (t: TerritoryMetric) => zoneResultValue(results.get(t.territoryId), zoneMetric);

  const byValue = (a: TerritoryMetric, b: TerritoryMetric) =>
    valueOf(b) - valueOf(a) ||
    (results.get(b.territoryId)?.money ?? 0) - (results.get(a.territoryId)?.money ?? 0) ||
    b.leadCount - a.leadCount ||
    a.territoryName.localeCompare(b.territoryName, 'es');

  // Con empate (p. ej. varias zonas con 1 cierre) gana la que más dinero trajo, luego la de más leads
  const moneyOf = (t: TerritoryMetric) => results.get(t.territoryId)?.money ?? 0;
  const leader = [...territories].sort(
    (a, b) => valueOf(b) - valueOf(a) || moneyOf(b) - moneyOf(a) || b.leadCount - a.leadCount
  )[0];
  const hasResults = leader !== undefined && valueOf(leader) > 0;

  const groups = (
    isMultiCountry
      ? countries.map((code) => ({ code, items: territories.filter((t) => t.countryCode === code) }))
      : [{ code: countries[0], items: territories }]
  )
    // Un país tiene cientos de zonas: el ranking muestra las que tienen leads
    .map((g) => ({ ...g, items: g.items.filter((t) => t.leadCount > 0 || t.territoryId === selectedTerritoryId) }))
    .filter((g) => g.items.length > 0)
    .map((g) => ({ ...g, items: [...g.items].sort(byValue) }));

  const describe = (result: ZoneResult | undefined): string => {
    if (!result || zoneResultValue(result, zoneMetric) === 0) return 'sin cierres';
    return zoneMetric === 'money'
      ? formatMoney(result.money, money.display)
      : `${result.deals} ${result.deals === 1 ? 'cierre' : 'cierres'}`;
  };

  const renderTerritory = (territory: TerritoryMetric, idx: number, groupMax: number) => {
    const isSelected = selectedTerritoryId === territory.territoryId;
    const result = results.get(territory.territoryId);
    const value = valueOf(territory);
    const width = groupMax > 0 ? Math.round((value / groupMax) * 100) : 0;
    return (
      <div
        key={territory.territoryId}
        onClick={() => onSelectTerritory(isSelected ? null : territory.territoryId)}
        className={`group cursor-pointer rounded-xl border p-3.5 transition-all duration-200 ${
          isSelected
            ? 'border-indigo-500 bg-indigo-950/30 shadow-lg ring-1 ring-indigo-500'
            : 'border-slate-700 bg-slate-950/50 hover:border-slate-600 hover:bg-slate-800/60'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2.5">
            <span className={`flex h-6 w-6 items-center justify-center rounded-lg text-sm font-black transition-colors ${rankBadge(value > 0 ? idx : 99)}`}>
              {idx + 1}
            </span>
            <div>
              <h4 className="text-[15px] font-bold text-slate-200 group-hover:text-indigo-400 transition-colors">
                {territory.territoryName}
              </h4>
              <span className="text-[13px] text-slate-400">
                {territory.leadCount} {territory.leadCount === 1 ? 'lead' : 'leads'}
              </span>
            </div>
          </div>

          <div className="text-right">
            <div className={`text-[15px] font-black ${value > 0 ? 'text-slate-100' : 'text-slate-400'}`}>
              {describe(result)}
            </div>
            {value > 0 && zoneMetric === 'money' && (
              <div className="text-[13px] text-slate-400">
                {result?.deals} {result?.deals === 1 ? 'cierre' : 'cierres'}
              </div>
            )}
          </div>
        </div>

        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-700"
            style={{ width: `${width}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col rounded-2xl border border-slate-700 bg-slate-900/90 p-5 shadow-2xl backdrop-blur-md">
      <div className="mb-5">
        <div className="flex items-center justify-between">
          <span className="flex items-center space-x-1.5 text-sm font-bold uppercase tracking-wider text-indigo-400">
            <TrendingUp className="h-4 w-4" />
            <span>Inteligencia Espacial</span>
          </span>
          <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[13px] font-semibold text-slate-300">
            {totalLeads} leads
          </span>
        </div>
        <h2 className="mt-1 text-lg font-extrabold text-slate-100">
          {zonesLabel} líderes {METRIC_TITLE[zoneMetric]}
        </h2>
        <p className="text-sm text-slate-400">
          Sigue los botones «Colorear por» del mapa.
          {zoneMetric === 'money' ? ` Montos en ${money.display}.` : ''}
        </p>
      </div>

      {leader && (
        <div className="mb-5 rounded-xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/40 via-slate-900/60 to-slate-900 p-4 shadow-inner">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-400">
                <Award className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium text-slate-300">Zona líder</span>
            </div>
            {hasResults && (
              <span className="text-sm font-bold text-indigo-400">{describe(results.get(leader.territoryId))}</span>
            )}
          </div>
          {hasResults ? (
            <>
              <div className="mt-2 flex items-center gap-2 text-xl font-black text-white">
                {isMultiCountry && <CountryFlag code={leader.countryCode} title={COUNTRIES[leader.countryCode].name} />}
                {leader.territoryName}
              </div>
              <p className="mt-0.5 text-[13px] text-slate-400">
                {zoneMetric === 'money' ? 'La que más dinero ha cerrado' : 'La que más negocios ha cerrado'}
              </p>
            </>
          ) : (
            <p className="mt-2 text-[15px] text-slate-300">Todavía no hay negocios ganados con estos filtros.</p>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto pr-1">
        {groups.map((group) => {
          const groupMax = Math.max(0, ...group.items.map(valueOf));
          return (
            <React.Fragment key={group.code}>
              {isMultiCountry && (
                <div className="flex items-center justify-between pt-1 text-sm font-bold text-slate-300">
                  <span className="flex items-center gap-2">
                    <CountryFlag code={group.code} />
                    {COUNTRIES[group.code].name} · {COUNTRIES[group.code].zoneLabel.plural}
                  </span>
                </div>
              )}
              {group.items.map((t, i) => renderTerritory(t, i, groupMax))}
            </React.Fragment>
          );
        })}
      </div>

      <div className="mt-4 pt-3 border-t border-slate-700 flex items-center justify-between text-[13px] text-slate-400">
        <span className="flex items-center space-x-1">
          <Building2 className="h-4 w-4 text-slate-400" />
          <span>PostGIS EPSG:4326</span>
        </span>
        <button
          onClick={() => onSelectTerritory(null)}
          className="text-indigo-400 hover:text-indigo-300 font-medium transition"
        >
          {selectedTerritoryId ? 'Limpiar Selección' : 'Ver Todas las Zonas'}
        </button>
      </div>
    </div>
  );
};
