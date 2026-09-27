import React, { useCallback, useId, useMemo, useRef, useState } from 'react';
import type { ZoneMetric } from '../lib/metrics';
import { Award, Boxes, DollarSign, MapPin, Package, Percent, Search, Tag, Wrench, X, Receipt } from 'lucide-react';
import type { CatalogItem, CatalogItemType, Lead, TerritoryMetric } from '../types/crm';
import { zoneLabelFor, type CountryCode } from '../data/countries';
import { formatMoney, leadCurrency, ratesNote, summarizeMoney, type MoneySummary } from '../lib/currency';
import { useMoney } from '../lib/money';
import { ITEM_TYPE_LABEL, computeItemSales, itemsSubtotal, leadsWithItems, type SalesScope } from '../lib/catalog';
import { computeTerritoryMetrics } from '../lib/metrics';
import { cardClass, tableCell, tableHeadRow } from '../lib/styles';
import { GeoStrategicMap } from './GeoStrategicMap';
import { RankingSidebar } from './RankingSidebar';
import { EmptyState, Pill } from './ui';
import { TYPE_ICON } from './catalogIcons';

type TypeFilter = 'all' | CatalogItemType;
type RankBy = 'revenue' | 'units' | 'conversion';
type Selection = { kind: 'item'; id: string } | { kind: 'category'; name: string };

// Varias búsquedas a la vez en el mapa, cada una con su color
const MAX_SEARCHES = 6;
const SEARCH_COLORS = ['#4F46E5', '#F97316', '#059669', '#DB2777', '#0EA5E9', '#CA8A04'];
const selectionKey = (s: Selection) => (s.kind === 'item' ? `item:${s.id}` : `cat:${s.name}`);

interface CatalogInsightsProps {
  leads: Lead[]; // leads ya filtrados por país, empresa, fecha, estado y búsqueda
  catalog: CatalogItem[];
  territories: TerritoryMetric[];
  countries: CountryCode[];
  theme: 'light' | 'dark';
}

const SCOPES: { id: SalesScope; label: string; hint: string }[] = [
  { id: 'won', label: 'Vendidos', hint: 'Leads ganados: dónde ya se vende o se presta' },
  { id: 'open', label: 'En negociación', hint: 'Leads abiertos: dónde hay demanda en curso' },
  { id: 'all', label: 'Todos', hint: 'Ganados y abiertos (sin perdidos)' },
];

const segment = (active: boolean) =>
  `flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
    active ? 'bg-indigo-600 text-[#fff]' : 'text-slate-300 hover:bg-slate-800'
  }`;

export const CatalogInsights: React.FC<CatalogInsightsProps> = ({ leads, catalog, territories, countries, theme }) => {
  const money = useMoney();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [rankBy, setRankBy] = useState<RankBy>('revenue');
  const [searches, setSearches] = useState<Selection[]>([]);
  const [scope, setScope] = useState<SalesScope>('won');
  const [zoneMetric, setZoneMetric] = useState<ZoneMetric>('money');
  const [selectedTerritoryId, setSelectedTerritoryId] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  const visibleCatalog = useMemo(
    () => catalog.filter((item) => typeFilter === 'all' || item.type === typeFilter),
    [catalog, typeFilter]
  );
  const visibleIds = useMemo(() => new Set(visibleCatalog.map((i) => i.id)), [visibleCatalog]);

  // ---------------------------------------------------------------- ranking de ventas
  const sales = useMemo(
    () => computeItemSales(leads, visibleCatalog).filter((m) => m.leads > 0 || m.item.isActive),
    [leads, visibleCatalog]
  );
  const ranked = useMemo(() => {
    const valueOf = (m: (typeof sales)[number]) =>
      rankBy === 'revenue' ? money.summaryTotal(m.revenueWon) : rankBy === 'units' ? m.unitsWon : (m.conversion ?? -1);
    return [...sales].sort((a, b) => valueOf(b) - valueOf(a) || b.leads - a.leads);
  }, [sales, rankBy, money]);

  // ---------------------------------------------------------------- tarjetas
  const leadsWithVisible = leads.filter((l) => (l.items ?? []).some((line) => visibleIds.has(line.itemId)));
  const wonLeads = leadsWithVisible.filter((l) => l.commercialStatus === 'won');
  const lostCount = leadsWithVisible.filter((l) => l.commercialStatus === 'lost').length;
  const closeRate = wonLeads.length + lostCount > 0 ? Math.round((wonLeads.length / (wonLeads.length + lostCount)) * 100) : null;

  const revenueWon = summarizeMoney(
    wonLeads.map((lead) => ({
      amount: itemsSubtotal((lead.items ?? []).filter((line) => visibleIds.has(line.itemId))),
      currency: leadCurrency(lead),
    }))
  );
  const avgTicket =
    wonLeads.length === 0 ? '—' : formatMoney(money.sumLeads(wonLeads) / wonLeads.length, money.display);
  const topSeller = [...sales]
    .filter((m) => m.wonLeads > 0)
    .sort((a, b) => money.summaryTotal(b.revenueWon) - money.summaryTotal(a.revenueWon))[0];
  // Todo en la moneda de la vista; si se sumaron otras monedas, el detalle queda en el tooltip
  const otherCurrencies = (summary: MoneySummary) => summary.currencies.filter((c) => c !== money.display);
  const rowMoney = (summary: MoneySummary) =>
    summary.currencies.length === 0 ? '—' : money.fmtSummary(summary, { compact: true });
  const rowTitle = (summary: MoneySummary) =>
    otherCurrencies(summary).length > 0 ? `Incluye ${otherCurrencies(summary).join(' y ')} convertido · ${ratesNote(money.rates)}` : undefined;
  const mixed = otherCurrencies(revenueWon).length > 0;

  const cards = [
    {
      label: 'Más vendido',
      value: topSeller?.item.name ?? 'Sin ventas',
      hint: topSeller ? `${topSeller.unitsWon} unidades · ${rowMoney(topSeller.revenueWon)}` : 'Ajusta los filtros',
      icon: Award,
      tone: 'bg-rose-500/15 text-rose-300',
      small: true,
    },
    {
      label: 'Ingresos ganados',
      value: money.fmtSummary(revenueWon),
      hint: mixed
        ? `Incluye ${otherCurrencies(revenueWon).join(' y ')} convertido a ${money.display}`
        : 'Suma de ítems en leads ganados',
      icon: DollarSign,
      tone: 'bg-amber-500/15 text-amber-300',
      title: mixed ? ratesNote(money.rates) : undefined,
    },
    {
      label: 'Ticket promedio',
      value: avgTicket,
      hint: `${wonLeads.length} leads ganados con productos o servicios`,
      icon: Receipt,
      tone: 'bg-indigo-500/15 text-indigo-300',
    },
    {
      label: 'Tasa de cierre',
      value: closeRate === null ? '—' : `${closeRate}%`,
      hint: `${wonLeads.length} ganados · ${lostCount} perdidos`,
      icon: Percent,
      tone: 'bg-emerald-500/15 text-emerald-300',
    },
  ];

  // ---------------------------------------------------------------- mapa: dónde se vende
  const idsOf = useCallback(
    (s: Selection) =>
      new Set(s.kind === 'item' ? [s.id] : visibleCatalog.filter((i) => i.category === s.name).map((i) => i.id)),
    [visibleCatalog]
  );

  // Cada búsqueda con su color, sus ítems y cuántos leads encuentra
  const searchGroups = useMemo(
    () =>
      searches.map((s, index) => {
        const ids = idsOf(s);
        return {
          selection: s,
          key: selectionKey(s),
          color: SEARCH_COLORS[index % SEARCH_COLORS.length],
          ids,
          label: s.kind === 'item' ? (catalog.find((i) => i.id === s.id)?.name ?? 'Ítem') : `Categoría: ${s.name}`,
          count: leadsWithItems(leads, ids, scope).length,
        };
      }),
    [searches, idsOf, catalog, leads, scope]
  );

  // Sin búsquedas se muestran todos los ítems visibles; con búsquedas, la unión de todas
  const selectedIds = useMemo(
    () => (searchGroups.length === 0 ? visibleIds : new Set(searchGroups.flatMap((g) => [...g.ids]))),
    [searchGroups, visibleIds]
  );

  const mapLeads = useMemo(() => leadsWithItems(leads, selectedIds, scope), [leads, selectedIds, scope]);

  // Color de cada lead en la burbuja de su zona: el de la primera búsqueda que coincide con él
  const leadColorFor = useCallback(
    (lead: Lead) =>
      searchGroups.find((g) => (lead.items ?? []).some((line) => g.ids.has(line.itemId)))?.color,
    [searchGroups]
  );
  const mapMetrics = useMemo(() => computeTerritoryMetrics(mapLeads, territories), [mapLeads, territories]);
  // El mapa muestra solo las zonas donde está el producto o servicio (si no hay ninguna, todas)
  const demandMetrics = mapMetrics.filter((t) => t.leadCount > 0);
  const zonesWithDemand = demandMetrics.length;
  const shownMetrics = zonesWithDemand > 0 ? demandMetrics : mapMetrics;
  const frameKey = `${searchGroups.map((g) => g.key).join(';') || 'all'}|${scope}|${typeFilter}|${shownMetrics.map((t) => t.territoryId).join(',')}`;
  const unlocated = mapLeads.filter((l) => !l.assignedTerritoryId).length;
  const zonePlural = zoneLabelFor(countries, 'plural').toLowerCase();

  const allLabel =
    typeFilter === 'all' ? 'Todos los productos y servicios' : `Todos los ${ITEM_TYPE_LABEL[typeFilter].plural.toLowerCase()}`;

  const addSearch = (next: Selection) => {
    setSearches((prev) =>
      prev.some((s) => selectionKey(s) === selectionKey(next)) || prev.length >= MAX_SEARCHES ? prev : [...prev, next]
    );
    setSelectedTerritoryId(null);
  };
  const removeSearch = (key: string) => {
    setSearches((prev) => prev.filter((s) => selectionKey(s) !== key));
    setSelectedTerritoryId(null);
  };

  const selectItemAndShowMap = (id: string) => {
    addSearch({ kind: 'item', id });
    mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const typeFilters: { id: TypeFilter; label: string; icon: typeof Package }[] = [
    { id: 'all', label: 'Todos', icon: Boxes },
    { id: 'product', label: 'Productos', icon: Package },
    { id: 'service', label: 'Servicios', icon: Wrench },
  ];

  if (catalog.length === 0) {
    return (
      <EmptyState
        icon={Boxes}
        title="Aún no hay productos ni servicios"
        description="El gerente puede crearlos en Gerencia → Catálogo y luego agregarlos a los leads."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Tipo de ítem */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl border border-slate-600 bg-slate-900 p-1" role="group" aria-label="Tipo de ítem">
          {typeFilters.map((f) => {
            const Icon = f.icon;
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={typeFilter === f.id}
                onClick={() => {
                  setTypeFilter(f.id);
                  setSearches([]);
                }}
                className={segment(typeFilter === f.id)}
              >
                <Icon className="h-4 w-4" />
                {f.label}
              </button>
            );
          })}
        </div>
        <p className="text-sm text-slate-400">Los filtros de búsqueda, país, empresa, zona, estado y fecha también se aplican aquí.</p>
      </div>

      {/* Tarjetas */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5" title={card.title}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[15px] font-semibold text-slate-300">{card.label}</span>
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.tone}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
              <div className={`mt-3 font-black leading-tight text-slate-100 ${card.small ? 'text-xl' : 'text-3xl'}`}>{card.value}</div>
              <div className="mt-1.5 text-sm text-slate-400">{card.hint}</div>
            </div>
          );
        })}
      </div>

      {/* Ranking */}
      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 p-5">
          <div>
            <h3 className="text-lg font-bold text-slate-100">Ranking de productos y servicios</h3>
            <p className="text-sm text-slate-400">Haz clic en una fila para ver en el mapa dónde se vende.</p>
          </div>
          <div className="flex gap-1 rounded-xl border border-slate-600 bg-slate-950/60 p-1" role="group" aria-label="Ordenar ranking">
            <button type="button" aria-pressed={rankBy === 'revenue'} onClick={() => setRankBy('revenue')} className={segment(rankBy === 'revenue')}>
              Ingresos
            </button>
            <button type="button" aria-pressed={rankBy === 'units'} onClick={() => setRankBy('units')} className={segment(rankBy === 'units')}>
              Unidades
            </button>
            <button type="button" aria-pressed={rankBy === 'conversion'} onClick={() => setRankBy('conversion')} className={segment(rankBy === 'conversion')}>
              Conversión
            </button>
          </div>
        </div>

        {ranked.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={Boxes} title="Sin datos" description="No hay leads con productos o servicios para estos filtros." />
          </div>
        ) : (
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full min-w-[980px] text-[15px]">
              <thead className="sticky top-0 z-10 bg-slate-900">
                <tr className={tableHeadRow}>
                  <th className={tableCell}>#</th>
                  <th className={tableCell}>Producto / servicio</th>
                  <th className={`${tableCell} text-right`}>Leads</th>
                  <th className={`${tableCell} text-right`}>Ganados</th>
                  <th className={`${tableCell} text-right`}>Conversión</th>
                  <th className={`${tableCell} text-right`}>Unidades vendidas</th>
                  <th className={`${tableCell} text-right`}>Ingresos ganados</th>
                  <th className={`${tableCell} text-right`}>Pipeline abierto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/70">
                {ranked.map((m, index) => {
                  const Icon = TYPE_ICON[m.item.type];
                  const isSelected = searches.some((s) => s.kind === 'item' && s.id === m.item.id);
                  return (
                    <tr
                      key={m.item.id}
                      onClick={() => selectItemAndShowMap(m.item.id)}
                      className={`cursor-pointer transition ${isSelected ? 'bg-indigo-500/10' : 'hover:bg-slate-800/40'}`}
                    >
                      <td className={`${tableCell} font-bold text-slate-400`}>{index + 1}</td>
                      <td className={tableCell}>
                        <div className="flex items-center gap-2 font-semibold text-slate-100">
                          <Icon className={`h-4 w-4 ${m.item.type === 'product' ? 'text-indigo-300' : 'text-emerald-300'}`} />
                          {m.item.name}
                          {!m.item.isActive && <Pill tone="slate">Inactivo</Pill>}
                        </div>
                        <div className="text-sm text-slate-400">
                          {[ITEM_TYPE_LABEL[m.item.type].singular, m.item.category, m.item.billing === 'monthly' ? 'Mensual' : null]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      </td>
                      <td className={`${tableCell} text-right tabular-nums text-slate-300`}>{m.leads}</td>
                      <td className={`${tableCell} text-right tabular-nums text-slate-300`}>{m.wonLeads}</td>
                      <td className={`${tableCell} text-right tabular-nums text-slate-300`}>{m.conversion === null ? '—' : `${m.conversion}%`}</td>
                      <td className={`${tableCell} text-right tabular-nums text-slate-300`}>{m.unitsWon}</td>
                      <td className={`${tableCell} text-right font-bold tabular-nums text-slate-100`} title={rowTitle(m.revenueWon)}>
                        {rowMoney(m.revenueWon)}
                      </td>
                      <td className={`${tableCell} text-right tabular-nums text-slate-300`} title={rowTitle(m.pipelineOpen)}>
                        {rowMoney(m.pipelineOpen)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dónde se vende */}
      <div ref={mapRef} className={`${cardClass} scroll-mt-24 p-5`}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-bold text-slate-100">
              <MapPin className="h-5 w-5 text-indigo-400" />
              ¿Dónde se vende?
            </h3>
            <p className="text-sm text-slate-400">
              Busca uno o varios productos, servicios o categorías (hasta {MAX_SEARCHES}) para comparar en qué {zonePlural} se venden o se prestan.
            </p>
          </div>
          <div className="flex gap-1 rounded-xl border border-slate-600 bg-slate-950/60 p-1" role="group" aria-label="Etapa de los leads">
            {SCOPES.map((s) => (
              <button key={s.id} type="button" title={s.hint} aria-pressed={scope === s.id} onClick={() => setScope(s.id)} className={segment(scope === s.id)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <ItemSearch
            catalog={visibleCatalog}
            excludeKeys={new Set(searches.map(selectionKey))}
            disabled={searches.length >= MAX_SEARCHES}
            placeholder={
              searches.length >= MAX_SEARCHES
                ? `Máximo ${MAX_SEARCHES} búsquedas`
                : searches.length > 0
                  ? 'Agregar otra búsqueda...'
                  : 'Buscar producto, servicio o categoría...'
            }
            onSelect={addSearch}
          />
          <span className="text-sm text-slate-400" role="status">
            {mapLeads.length} leads · en {zonesWithDemand} {zonePlural}
            {unlocated > 0 ? ` · ${unlocated} sin ${zoneLabelFor(countries).toLowerCase()}` : ''}
          </span>
        </div>

        {/* Búsquedas activas */}
        <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Búsquedas en el mapa">
          {searchGroups.length === 0 ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-600 px-3 py-1.5 text-sm font-semibold text-slate-300">
              <Tag className="h-4 w-4" />
              {allLabel}
            </span>
          ) : (
            <>
              {searchGroups.map((g) => (
                <span
                  key={g.key}
                  className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold text-slate-100"
                  style={{ borderColor: g.color, backgroundColor: `${g.color}1A` }}
                >
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: g.color }} aria-hidden />
                  {g.label}
                  <span className="rounded-full bg-slate-800 px-1.5 text-xs font-bold text-slate-300">{g.count}</span>
                  <button
                    type="button"
                    onClick={() => removeSearch(g.key)}
                    aria-label={`Quitar búsqueda ${g.label}`}
                    className="cursor-pointer rounded-full p-0.5 text-slate-300 hover:bg-slate-700"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
              {searchGroups.length > 1 && (
                <button
                  type="button"
                  onClick={() => setSearches([])}
                  className="cursor-pointer rounded-lg px-2 py-1.5 text-sm font-semibold text-rose-300 hover:bg-rose-500/10"
                >
                  Limpiar búsquedas
                </button>
              )}
            </>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:grid-rows-[600px]">
          <div className="h-[480px] min-h-0 lg:col-span-8 lg:h-full">
            <GeoStrategicMap
              leads={mapLeads}
              territories={shownMetrics}
              frameKey={frameKey}
              selectedTerritoryId={selectedTerritoryId}
              onSelectTerritory={setSelectedTerritoryId}
              theme={theme}
              countries={countries}
              catalog={catalog}
              leadColorFor={searchGroups.length > 0 ? leadColorFor : undefined}
              colorLegend={searchGroups.length > 0 ? searchGroups.map((g) => ({ label: g.label, color: g.color })) : undefined}
              highlightItemIds={searchGroups.length > 0 ? selectedIds : undefined}
              zoneMetric={zoneMetric}
              onZoneMetricChange={setZoneMetric}
            />
          </div>
          <div className="h-[600px] min-h-0 lg:col-span-4 lg:h-full">
            <RankingSidebar
              territories={shownMetrics}
              leads={mapLeads}
              zoneMetric={zoneMetric}
              countries={countries}
              selectedTerritoryId={selectedTerritoryId}
              onSelectTerritory={setSelectedTerritoryId}
              totalLeads={mapLeads.length}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ buscador de productos, servicios y categorías
function ItemSearch({
  catalog,
  onSelect,
  excludeKeys,
  disabled,
  placeholder,
}: {
  catalog: CatalogItem[];
  onSelect: (selection: Selection) => void;
  excludeKeys: Set<string>;
  disabled: boolean;
  placeholder: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const listId = useId();

  const normalize = (value: string) => value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const q = normalize(query.trim());

  const categories = Array.from(new Set(catalog.map((i) => i.category).filter((c): c is string => !!c)))
    .filter((c) => !q || normalize(c).includes(q))
    .map((name) => ({
      key: `cat:${name}`,
      label: name,
      detail: `Categoría · ${catalog.filter((i) => i.category === name).length} ítems`,
      selection: { kind: 'category', name } as Selection,
      type: undefined as CatalogItemType | undefined,
    }));
  const items = catalog
    .filter((i) => !q || normalize([i.name, i.sku, i.category].filter(Boolean).join(' ')).includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
    .map((i) => ({
      key: `item:${i.id}`,
      label: i.name,
      detail: [ITEM_TYPE_LABEL[i.type].singular, i.sku].filter(Boolean).join(' · '),
      selection: { kind: 'item', id: i.id } as Selection,
      type: i.type as CatalogItemType | undefined,
    }));
  // Las búsquedas ya agregadas no se vuelven a ofrecer
  const options = [...items, ...categories].filter((o) => !excludeKeys.has(o.key)).slice(0, 10);

  const choose = (index: number) => {
    const option = options[index];
    if (!option) return;
    onSelect(option.selection);
    setQuery('');
    setOpen(false);
  };

  return (
    <div className="relative w-full sm:w-80">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        id="catalog-map-search"
        role="combobox"
        aria-expanded={open && options.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options[highlighted] ? `${listId}-${highlighted}` : undefined}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlighted(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setHighlighted((h) => Math.min(h + 1, options.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlighted((h) => Math.max(h - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            choose(highlighted);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        disabled={disabled}
        placeholder={placeholder}
        aria-label="Buscar producto, servicio o categoría en el mapa"
        className="w-full rounded-xl border border-slate-600 bg-slate-950/70 py-2.5 pl-10 pr-3.5 disabled:opacity-60 text-[15px] text-slate-100 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      {open && options.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-[1100] mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-slate-600 bg-slate-900 py-1 shadow-xl"
        >
          {options.map((option, index) => {
            const Icon = option.type ? TYPE_ICON[option.type] : Tag;
            return (
              <li
                key={option.key}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === highlighted}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(index);
                }}
                onMouseEnter={() => setHighlighted(index)}
                className={`flex cursor-pointer items-center gap-2.5 px-3.5 py-2 ${index === highlighted ? 'bg-indigo-500/15' : ''}`}
              >
                <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold text-slate-100">{option.label}</span>
                  <span className="block truncate text-[13px] text-slate-400">{option.detail}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
