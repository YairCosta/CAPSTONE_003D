import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { CatalogItem, CommercialStatus, Lead, TerritoryMetric } from '../types/crm';
import { isManualValue } from '../lib/catalog';
import { STATUS_LABEL } from '../lib/stages';
import { computeZoneResults, zoneResultValue, type ZoneMetric } from '../lib/metrics';
import { contactLine, leadSubtitle, leadTitle } from '../lib/contacts';
import { formatDate } from '../lib/styles';
import { Map as MapIcon, BarChart3, DollarSign, Trophy, Globe2 } from 'lucide-react';
import { COUNTRIES, zoneLabelFor, type CountryCode } from '../data/countries';
import { formatLeadMoney, formatMoney, leadCurrency } from '../lib/currency';
import { useMoney, type MoneyApi } from '../lib/money';
import { CountryFlag } from './CountryFlag';

type ViewMode = 'map' | 'bars';

const LEAD_POINTS_PANE = 'puntosLeads';
type BarMetric = 'leads' | 'pipeline';

type CountryFocus = 'all' | CountryCode;

interface GeoStrategicMapProps {
  leads: Lead[];
  territories: TerritoryMetric[];
  selectedTerritoryId: string | null;
  onSelectTerritory: (territoryId: string | null) => void;
  theme: 'light' | 'dark';
  countries: CountryCode[]; // países visibles; con más de uno aparece la vista por país
  frameKey?: string; // al cambiar, el mapa vuelve a encuadrar las zonas (ej. otro producto buscado)
  catalog?: CatalogItem[]; // para mostrar los productos y servicios en la ficha del lead
  // Colores de punto personalizados (ej. uno por búsqueda); si no se indican, el color es por etapa
  pointColorFor?: (lead: Lead) => string | undefined;
  pointLegend?: { label: string; color: string }[];
  highlightItemIds?: Set<string>; // ítems buscados: se destacan en la ficha del lead
  // Métrica de "Colorear por". Si se entrega, la controla el padre (así el ranking de zonas
  // usa el mismo criterio que el mapa); si no, el mapa la maneja solo.
  zoneMetric?: ZoneMetric;
  onZoneMetricChange?: (metric: ZoneMetric) => void;
}

// Mapas base Esri "Canvas" gris claro / gris oscuro (no requieren API key)
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas';
const TILE_URLS = {
  light: { base: `${ESRI}/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, labels: `${ESRI}/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}` },
  dark: { base: `${ESRI}/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, labels: `${ESRI}/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}` },
};
const TILE_ATTRIBUTION = 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors';


const POINT_COLORS = { won: '#059669', lost: '#E11D48', active: '#4F46E5' };

const pointColor = (status: CommercialStatus) =>
  status === 'won' ? POINT_COLORS.won : status === 'lost' ? POINT_COLORS.lost : POINT_COLORS.active;

// Construye nodos con textContent para no inyectar HTML con datos del usuario
function node(tag: string, className: string, text?: string): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

const ITEM_TYPE_TAG = {
  product: { label: 'Producto', className: 'bg-indigo-500/15 text-indigo-300' },
  service: { label: 'Servicio', className: 'bg-emerald-500/15 text-emerald-300' },
} as const;

// Ficha del lead al hacer clic en su punto: qué tipo de lead es y qué compra o contrata
function buildLeadPopup(
  lead: Lead,
  zoneName: string | undefined,
  catalog: CatalogItem[],
  highlight: Set<string> | undefined,
  money: MoneyApi
): HTMLElement {
  const root = node('div', 'w-[270px] space-y-2.5');

  // Encabezado: empresa (o persona natural), persona de contacto y etapa
  const header = node('div', 'flex items-start justify-between gap-2');
  const title = node('div', 'min-w-0');
  title.appendChild(node('div', 'text-[15px] font-bold leading-tight', leadTitle(lead)));
  if (leadSubtitle(lead)) title.appendChild(node('div', 'text-[13px] text-slate-400', leadSubtitle(lead)));
  if (!lead.companyName?.trim()) title.appendChild(node('div', 'text-sm font-medium text-indigo-400', 'Persona natural'));
  header.appendChild(title);
  const badge = node('span', 'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold text-[#fff]', STATUS_LABEL[lead.commercialStatus]);
  badge.style.backgroundColor = pointColor(lead.commercialStatus);
  header.appendChild(badge);
  root.appendChild(header);

  // Tipo de lead según lo que incluye: productos, servicios o ambos
  const items = lead.items ?? [];
  const types = new Set(items.map((line) => catalog.find((i) => i.id === line.itemId)?.type).filter(Boolean));
  const kind =
    types.size === 0 ? 'Sin productos ni servicios' : types.size === 2 ? 'Productos y servicios' : types.has('product') ? 'Productos' : 'Servicios';
  const kindRow = node('div', 'flex items-center justify-between border-t border-slate-700 pt-2 text-[13px]');
  kindRow.appendChild(node('span', 'font-semibold uppercase tracking-wide text-slate-400', 'Tipo de lead'));
  kindRow.appendChild(node('span', 'font-bold text-slate-200', kind));
  root.appendChild(kindRow);

  if (items.length > 0) {
    const list = node('ul', 'space-y-1');
    for (const line of items) {
      const item = catalog.find((i) => i.id === line.itemId);
      const isMatch = highlight?.has(line.itemId);
      const li = node('li', `flex items-center gap-1.5 text-[13px] ${isMatch ? 'font-bold text-slate-100' : 'text-slate-300'}`);
      if (item) {
        const tag = ITEM_TYPE_TAG[item.type];
        li.appendChild(node('span', `shrink-0 rounded px-1.5 text-[10px] font-bold uppercase ${tag.className}`, tag.label));
      }
      li.appendChild(node('span', 'min-w-0 flex-1 truncate', `${item?.name ?? 'Ítem'}${item?.billing === 'monthly' ? ' (mensual)' : ''}`));
      li.appendChild(node('span', 'shrink-0 text-slate-400', `×${line.quantity}`));
      list.appendChild(li);
    }
    root.appendChild(list);
  }

  // Valor, ubicación y contacto
  const value = node('div', 'flex items-center justify-between border-t border-slate-700 pt-2');
  value.appendChild(node('span', 'text-[13px] font-semibold uppercase tracking-wide text-slate-400', 'Valor'));
  const amount = node('span', 'text-[15px] font-black', money.fmtLead(lead));
  if (isManualValue(lead)) {
    amount.appendChild(node('span', 'ml-1.5 rounded border border-slate-600 px-1 align-middle text-[10px] font-semibold uppercase text-slate-400', 'manual'));
  }
  value.appendChild(amount);
  root.appendChild(value);
  // Negociado en otra moneda: se muestra también el monto real guardado
  if (money.isForeign(lead)) {
    root.appendChild(node('div', 'text-right text-[13px] text-slate-400', `Negociado en ${formatLeadMoney(lead)}`));
  }

  const zoneLabel = COUNTRIES[lead.countryCode].zoneLabel.singular;
  root.appendChild(node('div', 'text-[13px] text-slate-400', lead.rawAddress));
  root.appendChild(
    node('div', 'text-[13px] text-slate-400', `${zoneLabel}: ${zoneName ?? 'sin asignar'} · ${COUNTRIES[lead.countryCode].name}`)
  );
  const contact = [lead.phone, lead.email].filter(Boolean).join(' · ');
  if (contact) root.appendChild(node('div', 'text-[13px] text-slate-400', contact));
  const otros = lead.contacts ?? [];
  if (otros.length > 0) {
    root.appendChild(
      node('div', 'text-[13px] text-slate-400', `Otros contactos: ${otros.map(contactLine).join(' · ')}`)
    );
  }
  root.appendChild(
    node(
      'div',
      'text-xs text-slate-500',
      `Ingresado ${formatDate(lead.createdAt)}${lead.lastContactedAt ? ` · último contacto ${formatDate(lead.lastContactedAt)}` : ''}`
    )
  );
  return root;
}

function buildZoneLabel(territory: TerritoryMetric, detail: string): HTMLElement {
  const root = node('div', '');
  root.appendChild(node('span', 'zone-name', territory.territoryName));
  root.appendChild(node('span', 'zone-pct', detail));
  return root;
}

// Escala de rendimiento de la zona: gris = todavía sin resultados; después de rojo (lo más bajo) a verde (lo más alto)
const ZONE_SCALE = [
  { color: '#ef4444', label: 'Bajo' },
  { color: '#f97316', label: '' },
  { color: '#eab308', label: 'Medio' },
  { color: '#84cc16', label: '' },
  { color: '#22c55e', label: 'Alto' },
];
const ZONE_EMPTY_COLOR = '#94a3b8';

function zoneColor(value: number, max: number): string {
  if (value <= 0 || max <= 0) return ZONE_EMPTY_COLOR;
  const index = Math.min(ZONE_SCALE.length - 1, Math.floor((value / max) * ZONE_SCALE.length - 1e-9));
  return ZONE_SCALE[Math.max(0, index)].color;
}

export const GeoStrategicMap: React.FC<GeoStrategicMapProps> = ({
  leads,
  territories,
  selectedTerritoryId,
  onSelectTerritory,
  theme,
  countries,
  frameKey,
  catalog = [],
  pointColorFor,
  pointLegend,
  highlightItemIds,
  zoneMetric: zoneMetricProp,
  onZoneMetricChange,
}) => {
  const [view, setView] = useState<ViewMode>('map');
  const [countryFocusState, setCountryFocus] = useState<CountryFocus>('all');
  const [internalZoneMetric, setInternalZoneMetric] = useState<ZoneMetric>('money');
  const zoneMetric = zoneMetricProp ?? internalZoneMetric;
  const setZoneMetric = (metric: ZoneMetric) => {
    setInternalZoneMetric(metric);
    onZoneMetricChange?.(metric);
  };
  const [barMetric, setBarMetric] = useState<BarMetric>('leads');
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.LayerGroup | null>(null);
  const zonesLayerRef = useRef<L.LayerGroup | null>(null);
  const pointsLayerRef = useRef<L.LayerGroup | null>(null);
  const legendRef = useRef<HTMLDivElement>(null);

  // Vista por país: "Todos" o un país concreto (si ese país deja de estar visible se vuelve a "Todos")
  const isMultiCountry = countries.length > 1;
  const countryFocus: CountryFocus =
    isMultiCountry && countryFocusState !== 'all' && countries.includes(countryFocusState) ? countryFocusState : 'all';
  const focusCountries = countryFocus === 'all' ? countries : [countryFocus];
  const focusTerritories = useMemo(
    () => (countryFocus === 'all' ? territories : territories.filter((t) => t.countryCode === countryFocus)),
    [territories, countryFocus]
  );
  const focusLeads = useMemo(
    () => (countryFocus === 'all' ? leads : leads.filter((l) => l.countryCode === countryFocus)),
    [leads, countryFocus]
  );
  // Los descartados siguen apareciendo como puntos en el mapa (sirve ver dónde se pierde),
  // pero no cuentan en el ranking de zonas ni en los ingresos estimados.
  const activeFocusLeads = useMemo(() => focusLeads.filter((l) => l.commercialStatus !== 'lost'), [focusLeads]);
  const initialView = COUNTRIES[countries[0] ?? 'CL'].mapView;
  const zoneLabel = zoneLabelFor(focusCountries).toLowerCase();
  const money = useMoney();

  const handleFocusCountry = (focus: CountryFocus) => {
    setCountryFocus(focus);
    // Una zona de otro país no puede quedar seleccionada
    const selected = territories.find((t) => t.territoryId === selectedTerritoryId);
    if (focus !== 'all' && selected && selected.countryCode !== focus) onSelectTerritory(null);
  };

  // Creación del mapa (solo mientras la vista de mapa está activa)
  useEffect(() => {
    if (view !== 'map' || !containerRef.current) return;

    const map = L.map(containerRef.current, { zoomControl: true, maxZoom: 16 }).setView(
      [initialView.lat, initialView.lng],
      initialView.zoom
    );
    mapRef.current = map;
    zonesLayerRef.current = L.layerGroup().addTo(map);
    // Los puntos van en su propia capa, por encima de las zonas (overlayPane = 400). Si compartieran capa,
    // cada vez que las zonas se redibujan (al cambiar "Colorear por", la moneda o la zona elegida)
    // quedarían pintadas encima y se tragarían el clic sobre el punto.
    map.createPane(LEAD_POINTS_PANE).style.zIndex = '450';
    pointsLayerRef.current = L.layerGroup().addTo(map);

    // Recalcula el tamaño del mapa cuando cambia el alto/ancho de su contenedor
    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      tileRef.current = null;
      zonesLayerRef.current = null;
      pointsLayerRef.current = null;
    };
    // La vista inicial solo se usa al crear el mapa; luego encuadra el efecto de encuadre
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Mapa base según tema claro / oscuro
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    tileRef.current?.remove();
    tileRef.current = L.layerGroup([
      L.tileLayer(TILE_URLS[theme].base, { attribution: TILE_ATTRIBUTION, maxZoom: 16 }),
      L.tileLayer(TILE_URLS[theme].labels, { maxZoom: 16, pane: 'shadowPane' }),
    ]).addTo(map);
  }, [view, theme]);

  // Resultados cerrados por zona: lo ganado en dinero (ya en la moneda de la vista, para que zonas
  // de países distintos se comparen en la misma escala) y la cantidad de negocios ganados.
  const zoneStats = useMemo(() => {
    const results = computeZoneResults(focusLeads, focusTerritories, (l) =>
      money.toDisplay(l.estimatedDealValue, leadCurrency(l))
    );
    const stats = new Map<string, { money: number; deals: number; comparable: number }>();
    focusTerritories.forEach((territory) => {
      const result = results.get(territory.territoryId) ?? { money: 0, deals: 0 };
      stats.set(territory.territoryId, { ...result, comparable: zoneResultValue(result, zoneMetric) });
    });
    return stats;
  }, [focusTerritories, focusLeads, zoneMetric, money]);

  const zoneDetail = (territory: TerritoryMetric) => {
    const stats = zoneStats.get(territory.territoryId);
    if (!stats || (zoneMetric === 'money' ? stats.money : stats.deals) === 0) return 'sin cierres';
    return zoneMetric === 'money'
      ? formatMoney(stats.money, money.display)
      : `${stats.deals} ${stats.deals === 1 ? 'cierre' : 'cierres'}`;
  };

  // Zonas pintadas según su rendimiento: gris sin resultados, y de rojo a verde según lo ganado
  useEffect(() => {
    const layer = zonesLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    const max = Math.max(0, ...focusTerritories.map((t) => zoneStats.get(t.territoryId)?.comparable ?? 0));

    focusTerritories.forEach((territory) => {
      const isSelected = territory.territoryId === selectedTerritoryId;
      const stats = zoneStats.get(territory.territoryId);
      const color = zoneColor(stats?.comparable ?? 0, max);
      const empty = color === ZONE_EMPTY_COLOR;
      const zone = L.geoJSON(
        { type: 'Feature', properties: {}, geometry: territory.geojsonPolygon } as GeoJSON.Feature,
        {
          style: {
            color,
            weight: isSelected ? 4 : 2,
            opacity: 0.9,
            fillColor: color,
            fillOpacity: isSelected ? 0.6 : empty ? 0.12 : 0.4,
          },
        }
      );
      zone.on('click', () => onSelectTerritory(isSelected ? null : territory.territoryId));
      zone.bindTooltip(buildZoneLabel(territory, zoneDetail(territory)), {
        permanent: true,
        direction: 'center',
        className: 'zone-label',
      });
      layer.addLayer(zone);
    });
    // zoneDetail se deriva de zoneStats y de la métrica elegida
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, focusTerritories, zoneStats, zoneMetric, selectedTerritoryId, onSelectTerritory]);

  // Puntos de cada lead
  useEffect(() => {
    const layer = pointsLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    focusLeads
      .filter((lead) => lead.latitude && lead.longitude)
      .forEach((lead) => {
        L.circleMarker([lead.latitude!, lead.longitude!], {
          pane: LEAD_POINTS_PANE,
          radius: 8,
          color: '#ffffff',
          weight: 2,
          fillColor: pointColorFor?.(lead) ?? pointColor(lead.commercialStatus),
          fillOpacity: 1,
        })
          .bindPopup(
            () =>
              buildLeadPopup(
                lead,
                territories.find((t) => t.territoryId === lead.assignedTerritoryId)?.territoryName,
                catalog,
                highlightItemIds,
                money
              ),
            { maxWidth: 320 }
          )
          .addTo(layer);
      });
    // Las funciones de color y los datos de la ficha se recalculan junto con los leads visibles
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, focusLeads, pointColorFor, catalog, highlightItemIds, money]);

  // Encuadre: la zona seleccionada, las zonas del país elegido o las de todos los países visibles
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const target = selectedTerritoryId
      ? territories.filter((t) => t.territoryId === selectedTerritoryId)
      : focusTerritories;
    if (target.length === 0) return;
    const bounds = L.geoJSON({
      type: 'FeatureCollection',
      features: target.map((t) => ({ type: 'Feature', properties: {}, geometry: t.geojsonPolygon })),
    } as GeoJSON.FeatureCollection).getBounds();
    // Se deja libre el alto de la leyenda (abajo a la izquierda) para que no tape puntos ni zonas
    const legendHeight = legendRef.current?.offsetHeight ?? 0;
    map.flyToBounds(bounds, {
      paddingTopLeft: [40, 40],
      paddingBottomRight: [40, 40 + legendHeight],
      duration: 0.6,
      maxZoom: 14,
    });
    // Las geometrías de las zonas son estáticas; solo reencuadrar al cambiar la selección, el país o la vista
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedTerritoryId, countryFocus, countries.join(','), frameKey]);

  // Datos del gráfico de barras, con los montos en la moneda de la vista
  const barRows = useMemo(() => {
    const rows = focusTerritories.map((territory) => {
      const zoneLeads = activeFocusLeads.filter((l) => l.assignedTerritoryId === territory.territoryId);
      // Ingresos estimados: solo lo que sigue abierto; lo ganado ya tiene su propia métrica
      const pipeline = money.sumLeads(zoneLeads.filter((l) => l.commercialStatus !== 'won'));
      return { territory, count: zoneLeads.length, pipeline };
    });
    const valueOf = (r: (typeof rows)[number]) => (barMetric === 'leads' ? r.count : r.pipeline);
    return rows.sort((a, b) => valueOf(b) - valueOf(a)).map((r) => ({ ...r, value: valueOf(r) }));
  }, [focusTerritories, activeFocusLeads, barMetric, money]);

  const barMax = Math.max(1, ...barRows.map((r) => r.value));
  const barGroups: { code: CountryCode | null; rows: typeof barRows }[] =
    isMultiCountry && countryFocus === 'all'
      ? countries.map((code) => ({ code, rows: barRows.filter((r) => r.territory.countryCode === code) }))
      : [{ code: null, rows: barRows }];

  const pipelineText = (_territory: TerritoryMetric, pipeline: number) => formatMoney(pipeline, money.display);

  const segmentButton = (active: boolean) =>
    `flex cursor-pointer items-center gap-1.5 rounded-lg px-3.5 py-2 text-[15px] font-semibold transition ${
      active ? 'bg-indigo-600 text-[#fff] shadow-sm' : 'text-slate-300 hover:bg-slate-800'
    }`;

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-sm">
      {/* Barra de herramientas */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 px-4 py-3">
        <div className="flex gap-1 rounded-xl border border-slate-600 bg-slate-950/60 p-1">
          <button type="button" onClick={() => setView('map')} className={segmentButton(view === 'map')}>
            <MapIcon className="h-4 w-4" />
            Mapa
          </button>
          <button type="button" onClick={() => setView('bars')} className={segmentButton(view === 'bars')}>
            <BarChart3 className="h-4 w-4" />
            Barras
          </button>
        </div>

        {isMultiCountry && (
          <div className="flex gap-1 rounded-xl border border-slate-600 bg-slate-950/60 p-1" role="group" aria-label="Vista por país">
            <button type="button" onClick={() => handleFocusCountry('all')} className={segmentButton(countryFocus === 'all')}>
              <Globe2 className="h-4 w-4" />
              Todos
            </button>
            {countries.map((code) => (
              <button key={code} type="button" onClick={() => handleFocusCountry(code)} className={segmentButton(countryFocus === code)}>
                <CountryFlag code={code} />
                {COUNTRIES[code].name}
              </button>
            ))}
          </div>
        )}

        {view === 'map' ? (
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-400">Colorear por</span>
            <div className="flex gap-1 rounded-xl border border-slate-600 bg-slate-950/60 p-1">
              <button type="button" onClick={() => setZoneMetric('money')} className={segmentButton(zoneMetric === 'money')}>
                <DollarSign className="h-4 w-4" />
                $ ganado
              </button>
              <button type="button" onClick={() => setZoneMetric('deals')} className={segmentButton(zoneMetric === 'deals')}>
                <Trophy className="h-4 w-4" />
                Leads cerrados
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-1 rounded-xl border border-slate-600 bg-slate-950/60 p-1">
            <button type="button" onClick={() => setBarMetric('leads')} className={segmentButton(barMetric === 'leads')}>
              Leads
            </button>
            <button type="button" onClick={() => setBarMetric('pipeline')} className={segmentButton(barMetric === 'pipeline')}>
              Ingresos $
            </button>
          </div>
        )}
      </div>

      {view === 'map' ? (
        <div className="relative isolate min-h-0 flex-1">
          <div ref={containerRef} className="h-full w-full" />

          {/* Leyenda */}
          <div ref={legendRef} className="absolute bottom-6 left-3 z-[1000] space-y-1.5 rounded-xl border border-slate-600 bg-slate-900/95 px-3.5 py-2.5 text-sm text-slate-300 shadow-md">
            {pointLegend && (
              <div className="flex max-w-[420px] flex-wrap items-center gap-x-4 gap-y-1">
                {pointLegend.map((entry) => (
                  <span key={entry.label} className="flex items-center gap-1.5">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
                    {entry.label}
                  </span>
                ))}
              </div>
            )}
            {!pointLegend && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: POINT_COLORS.active }} />
                  En gestión
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: POINT_COLORS.won }} />
                  Ganado
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full" style={{ backgroundColor: POINT_COLORS.lost }} />
                  Perdido
                </span>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-700 pt-1.5 text-[13px] text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: ZONE_EMPTY_COLOR, opacity: 0.5 }} />
                Sin cierres
              </span>
              {ZONE_SCALE.map((step) => (
                <span key={step.color} className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: step.color, opacity: 0.8 }} />
                  {step.label}
                </span>
              ))}
              <span>
                {zoneMetric === 'money' ? '$ ganado por zona' : 'leads cerrados por zona'}
                {zoneMetric === 'money' ? ` (en ${money.display})` : ''}
              </span>
            </div>
            <div className="text-[13px] text-slate-400">Haz clic en un punto para ver la ficha del lead</div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-y-auto px-5 py-5">
          <div className="mb-5">
            <h3 className="text-lg font-bold text-slate-100">
              {barMetric === 'leads' ? `Leads vigentes por ${zoneLabel}` : `Ingresos estimados por ${zoneLabel}`}
            </h3>
            <p className="text-sm text-slate-400">
              Haz clic en una barra para seleccionar la zona en el ranking. No se cuentan los leads descartados.
              {barMetric === 'pipeline' && ` Montos en ${money.display}.`}
              {barMetric === 'leads' && isMultiCountry && ' El % se calcula dentro de cada país.'}
            </p>
          </div>

          <div className="space-y-3">
            {barGroups.map((group) => (
              <React.Fragment key={group.code ?? 'all'}>
                {group.code && (
                  <div className="flex items-center gap-2 px-3 pt-2 text-sm font-bold uppercase tracking-wider text-slate-400">
                    <CountryFlag code={group.code} />
                    {COUNTRIES[group.code].name} · {COUNTRIES[group.code].zoneLabel.plural}
                  </div>
                )}

                {group.rows.map(({ territory, count, pipeline, value }) => {
                  const isSelected = territory.territoryId === selectedTerritoryId;
                  const isHovered = territory.territoryId === hoveredZoneId;
                  const widthPct = (value / barMax) * 100;

                  return (
                    <button
                      key={territory.territoryId}
                      type="button"
                      onClick={() => onSelectTerritory(isSelected ? null : territory.territoryId)}
                      onMouseEnter={() => setHoveredZoneId(territory.territoryId)}
                      onMouseLeave={() => setHoveredZoneId(null)}
                      onFocus={() => setHoveredZoneId(territory.territoryId)}
                      onBlur={() => setHoveredZoneId(null)}
                      className={`relative grid w-full cursor-pointer grid-cols-[minmax(110px,150px)_1fr_auto] items-center gap-4 rounded-xl px-3 py-2.5 text-left transition ${
                        isSelected ? 'bg-indigo-500/10 ring-1 ring-indigo-500/50' : 'hover:bg-slate-800/70'
                      }`}
                    >
                      <span className="truncate text-[15px] font-semibold text-slate-200">{territory.territoryName}</span>

                      <span className="relative h-8 border-l-2 border-slate-600">
                        <span
                          className={`absolute inset-y-0 left-0 rounded-r-[4px] transition-all duration-500 ${
                            isSelected || isHovered ? 'bg-indigo-600' : 'bg-indigo-500'
                          }`}
                          style={{ width: `${widthPct}%` }}
                        />
                      </span>

                      <span className="min-w-[88px] text-right text-[15px] font-bold tabular-nums text-slate-100">
                        {barMetric === 'leads' ? `${count} (${territory.percentage}%)` : pipelineText(territory, pipeline)}
                      </span>

                      {isHovered && (
                        <span className="pointer-events-none absolute -top-2 right-3 z-10 -translate-y-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-300 shadow-lg">
                          <span className="block font-bold text-slate-100">{territory.territoryName}</span>
                          <span className="block">
                            {count} leads · {territory.percentage}%{' '}
                            {isMultiCountry ? `de ${COUNTRIES[territory.countryCode].name}` : 'del total'}
                          </span>
                          <span className="block">Ingresos estimados {pipelineText(territory, pipeline)}</span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
