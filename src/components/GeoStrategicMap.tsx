import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { CatalogItem, CommercialStatus, Lead, TerritoryMetric } from '../types/crm';
import { isManualValue } from '../lib/catalog';
import { STATUS_LABEL } from '../lib/stages';
import { computeZoneResults, zoneResultValue, type ZoneMetric } from '../lib/metrics';
import { leadSubtitle, leadTitle } from '../lib/contacts';
import { Map as MapIcon, BarChart3, DollarSign, Trophy, Globe2, X, Users } from 'lucide-react';
import { COUNTRIES, zoneLabelFor, type CountryCode } from '../data/countries';
import { formatLeadMoney, formatMoney, leadCurrency } from '../lib/currency';
import { useMoney } from '../lib/money';
import { CountryFlag } from './CountryFlag';
import { zoneCenter } from '../lib/geocoding';

// El mapa trabaja por zona, nunca por punto: cada zona muestra cuántos leads tiene y, al elegirla,
// se abre la lista de sus leads. Revela no guarda coordenadas de los leads (minimización de datos,
// Ley 21.719; ver docs/LEY_21719.md).

type ViewMode = 'map' | 'bars';
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
  catalog?: CatalogItem[]; // para mostrar los productos y servicios de cada lead en la lista de la zona
  // Grupos de color (ej. uno por búsqueda del catálogo): la burbuja de cada zona cuenta sus leads por color
  leadColorFor?: (lead: Lead) => string | undefined;
  colorLegend?: { label: string; color: string }[];
  highlightItemIds?: Set<string>; // ítems buscados: se destacan en la lista de la zona
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

const STAGE_COLORS = { won: '#059669', lost: '#E11D48', active: '#4F46E5' };
const stageColor = (status: CommercialStatus) =>
  status === 'won' ? STAGE_COLORS.won : status === 'lost' ? STAGE_COLORS.lost : STAGE_COLORS.active;
const BUBBLE_COLOR = '#4F46E5';
const PANEL_WIDTH = 330;
// Más lejos que este zoom, las etiquetas por comuna se tapan entre sí: se agrupan por región
const REGION_ZOOM = 9;

type BubbleGroup = { color: string; count: number };

// Construye nodos con textContent para no inyectar HTML con datos del usuario
function node(tag: string, className: string, text?: string): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

// Etiqueta de la zona, en su centro. Compacta (una línea: nombre y burbuja) para que zonas vecinas
// no se tapen; el resultado de la zona lo dice su color, y aparece completo al pasar el mouse y en
// el panel. Las zonas sin leads no llevan etiqueta fija: su nombre aparece al pasar el mouse.
function buildBubble(className: string, groups: BubbleGroup[], ariaLabel: string): HTMLElement {
  const total = groups.reduce((acc, g) => acc + g.count, 0);
  const bubble = node('span', className);
  bubble.setAttribute('role', 'button');
  bubble.setAttribute('aria-label', ariaLabel);
  for (const group of groups) {
    const part = node('span', 'zone-bubble-part');
    const dot = node('span', 'zone-bubble-dot');
    dot.style.backgroundColor = group.color;
    part.appendChild(dot);
    part.appendChild(node('span', '', String(group.count)));
    bubble.appendChild(part);
  }
  bubble.appendChild(node('span', 'zone-bubble-text', total === 1 ? 'lead' : 'leads'));
  return bubble;
}

function buildLabel(name: string, title: string, bubble: HTMLElement | null, onClick: () => void, extraClass = ''): HTMLElement {
  const root = node('div', `zone-label-content ${extraClass}`.trim());
  root.title = title;
  root.appendChild(node('span', 'zone-name', name));
  if (bubble) root.appendChild(bubble);
  L.DomEvent.disableClickPropagation(root);
  L.DomEvent.disableScrollPropagation(root);
  root.addEventListener('click', onClick);
  return root;
}

// Marcador centrado en un punto con una etiqueta HTML (el contenido se arma con nodos, sin HTML crudo)
const labelMarker = (lat: number, lng: number, content: HTMLElement, className: string) => {
  const wrapper = node('div', 'zone-label-anchor');
  wrapper.appendChild(content);
  return L.marker([lat, lng], {
    icon: L.divIcon({ html: wrapper, className: `zone-label ${className}`.trim(), iconSize: undefined }),
    keyboard: false,
    riseOnHover: true,
  });
};

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

const ITEM_TYPE_TAG = {
  product: { label: 'Producto', className: 'bg-indigo-500/15 text-indigo-300' },
  service: { label: 'Servicio', className: 'bg-emerald-500/15 text-emerald-300' },
} as const;

// Un lead en la lista de la zona: quién es, en qué etapa está, qué compra y cuánto vale.
// Sin dirección, teléfono ni correo: el mapa es para ver el negocio; el contacto está en la ficha.
function ZoneLeadCard({ lead, catalog, highlight }: { lead: Lead; catalog: CatalogItem[]; highlight?: Set<string> }) {
  const money = useMoney();
  const items = lead.items ?? [];
  const types = new Set(items.map((line) => catalog.find((i) => i.id === line.itemId)?.type).filter(Boolean));
  const kind =
    types.size === 0 ? 'Sin productos ni servicios' : types.size === 2 ? 'Productos y servicios' : types.has('product') ? 'Productos' : 'Servicios';

  return (
    <li className="space-y-2 rounded-xl border border-slate-700 bg-slate-950/50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[15px] font-bold leading-tight text-slate-100">{leadTitle(lead)}</p>
          {leadSubtitle(lead) && <p className="text-[13px] text-slate-400">{leadSubtitle(lead)}</p>}
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold text-[#fff]"
          style={{ backgroundColor: stageColor(lead.commercialStatus) }}
        >
          {STATUS_LABEL[lead.commercialStatus]}
        </span>
      </div>

      <div className="flex items-center justify-between border-t border-slate-700 pt-2 text-[13px]">
        <span className="font-semibold uppercase tracking-wide text-slate-400">Tipo de lead</span>
        <span className="font-bold text-slate-200">{kind}</span>
      </div>
      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((line) => {
            const item = catalog.find((i) => i.id === line.itemId);
            const tag = item ? ITEM_TYPE_TAG[item.type] : null;
            return (
              <li
                key={line.itemId}
                className={`flex items-center gap-1.5 text-[13px] ${highlight?.has(line.itemId) ? 'font-bold text-slate-100' : 'text-slate-300'}`}
              >
                {tag && <span className={`shrink-0 rounded px-1.5 text-[10px] font-bold uppercase ${tag.className}`}>{tag.label}</span>}
                <span className="min-w-0 flex-1 truncate">
                  {item?.name ?? 'Ítem'}
                  {item?.billing === 'monthly' ? ' (mensual)' : ''}
                </span>
                <span className="shrink-0 text-slate-400">×{line.quantity}</span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center justify-between border-t border-slate-700 pt-2">
        <span className="text-[13px] font-semibold uppercase tracking-wide text-slate-400">Valor</span>
        <span className="text-[15px] font-black text-slate-100">
          {money.fmtLead(lead)}
          {isManualValue(lead) && (
            <span className="ml-1.5 rounded border border-slate-600 px-1 align-middle text-[10px] font-semibold uppercase text-slate-400">
              manual
            </span>
          )}
        </span>
      </div>
      {money.isForeign(lead) && <p className="text-right text-[13px] text-slate-400">Negociado en {formatLeadMoney(lead)}</p>}
    </li>
  );
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
  leadColorFor,
  colorLegend,
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
  const labelsLayerRef = useRef<L.LayerGroup | null>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(COUNTRIES[countries[0] ?? 'CL'].mapView.zoom);

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
  // Los descartados siguen en la lista de su zona (sirve ver dónde se pierde), pero no cuentan en
  // el ranking de zonas ni en los ingresos estimados.
  const activeFocusLeads = useMemo(() => focusLeads.filter((l) => l.commercialStatus !== 'lost'), [focusLeads]);
  const initialView = COUNTRIES[countries[0] ?? 'CL'].mapView;
  const zoneLabel = zoneLabelFor(focusCountries).toLowerCase();
  const money = useMoney();

  const selectedZone = focusTerritories.find((t) => t.territoryId === selectedTerritoryId) ?? null;
  const selectedZoneLeads = useMemo(
    () =>
      selectedZone
        ? focusLeads
            .filter((l) => l.assignedTerritoryId === selectedZone.territoryId)
            .sort((a, b) => money.toDisplay(b.estimatedDealValue, leadCurrency(b)) - money.toDisplay(a.estimatedDealValue, leadCurrency(a)))
        : [],
    [selectedZone, focusLeads, money]
  );

  const handleFocusCountry = (focus: CountryFocus) => {
    setCountryFocus(focus);
    // Una zona de otro país no puede quedar seleccionada
    const selected = territories.find((t) => t.territoryId === selectedTerritoryId);
    if (focus !== 'all' && selected && selected.countryCode !== focus) onSelectTerritory(null);
  };

  // Creación del mapa (solo mientras la vista de mapa está activa)
  useEffect(() => {
    if (view !== 'map' || !containerRef.current) return;

    // Canvas: con cientos o miles de zonas es mucho más liviano que un SVG por zona
    const map = L.map(containerRef.current, { zoomControl: true, maxZoom: 16, preferCanvas: true }).setView(
      [initialView.lat, initialView.lng],
      initialView.zoom
    );
    mapRef.current = map;
    zonesLayerRef.current = L.layerGroup().addTo(map);
    labelsLayerRef.current = L.layerGroup().addTo(map);
    map.on('zoomend', () => setZoom(map.getZoom()));

    // Recalcula el tamaño del mapa cuando cambia el alto/ancho de su contenedor
    const resizeObserver = new ResizeObserver(() => map.invalidateSize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      tileRef.current = null;
      zonesLayerRef.current = null;
      labelsLayerRef.current = null;
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

  // Cuántos leads tiene cada zona, separados por color (un grupo por búsqueda, o uno solo)
  const zoneGroups = useMemo(() => {
    const groups = new Map<string, Map<string, number>>();
    for (const lead of focusLeads) {
      if (!lead.assignedTerritoryId) continue;
      const color = leadColorFor?.(lead) ?? BUBBLE_COLOR;
      const byColor = groups.get(lead.assignedTerritoryId) ?? new Map<string, number>();
      byColor.set(color, (byColor.get(color) ?? 0) + 1);
      groups.set(lead.assignedTerritoryId, byColor);
    }
    const order = colorLegend?.map((c) => c.color) ?? [BUBBLE_COLOR];
    return new Map(
      [...groups].map(([zoneId, byColor]) => [
        zoneId,
        [...byColor]
          .map(([color, count]) => ({ color, count }))
          .sort((a, b) => order.indexOf(a.color) - order.indexOf(b.color)),
      ])
    );
  }, [focusLeads, leadColorFor, colorLegend]);

  // Centro de cada zona con leads (o elegida): ahí va su etiqueta
  const zoneCenters = useMemo(() => {
    const centros = new Map<string, { latitude: number; longitude: number }>();
    for (const territory of focusTerritories) {
      if (!zoneGroups.has(territory.territoryId) && territory.territoryId !== selectedTerritoryId) continue;
      const centro = zoneCenter(territory);
      if (centro) centros.set(territory.territoryId, centro);
    }
    return centros;
  }, [focusTerritories, zoneGroups, selectedTerritoryId]);

  // Vista lejana: una burbuja por región, en el promedio de los centros de sus zonas con leads
  const regionBubbles = useMemo(() => {
    const regiones = new Map<string, { name: string; zones: TerritoryMetric[]; groups: Map<string, number> }>();
    for (const territory of focusTerritories) {
      const grupos = zoneGroups.get(territory.territoryId);
      if (!grupos || !zoneCenters.has(territory.territoryId)) continue;
      const clave = `${territory.countryCode}|${territory.regionCode ?? territory.territoryId}`;
      const region = regiones.get(clave) ?? { name: territory.regionName ?? territory.territoryName, zones: [] as TerritoryMetric[], groups: new Map<string, number>() };
      region.zones.push(territory);
      for (const g of grupos) region.groups.set(g.color, (region.groups.get(g.color) ?? 0) + g.count);
      regiones.set(clave, region);
    }
    const orden = colorLegend?.map((c) => c.color) ?? [BUBBLE_COLOR];
    return [...regiones.entries()].map(([clave, region]) => {
      const centros = region.zones.map((z) => zoneCenters.get(z.territoryId)!);
      return {
        key: clave,
        name: region.name,
        zones: region.zones,
        latitude: centros.reduce((acc, c) => acc + c.latitude, 0) / centros.length,
        longitude: centros.reduce((acc, c) => acc + c.longitude, 0) / centros.length,
        groups: [...region.groups]
          .map(([color, count]) => ({ color, count }))
          .sort((a, b) => orden.indexOf(a.color) - orden.indexOf(b.color)),
      };
    });
  }, [focusTerritories, zoneGroups, zoneCenters, colorLegend]);

  const boundsOf = (zones: TerritoryMetric[]) =>
    L.geoJSON({
      type: 'FeatureCollection',
      features: zones.map((t) => ({ type: 'Feature', properties: {}, geometry: t.geojsonPolygon })),
    } as GeoJSON.FeatureCollection).getBounds();

  const zoneDetail = (territory: TerritoryMetric) => {
    const stats = zoneStats.get(territory.territoryId);
    if (!stats || (zoneMetric === 'money' ? stats.money : stats.deals) === 0) return 'sin cierres';
    return zoneMetric === 'money'
      ? formatMoney(stats.money, money.display)
      : `${stats.deals} ${stats.deals === 1 ? 'cierre' : 'cierres'}`;
  };

  // Zonas pintadas según su rendimiento. Al pasar el mouse, su nombre, provincia y resultado.
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
      const withLeads = zoneGroups.has(territory.territoryId);
      const zone = L.geoJSON(
        { type: 'Feature', properties: {}, geometry: territory.geojsonPolygon } as GeoJSON.Feature,
        {
          style: {
            color,
            // Las zonas sin leads (la mayoría) van tenues para que el país no se vea como un mosaico
            weight: isSelected ? 4 : withLeads ? 2 : 0.6,
            opacity: withLeads || isSelected ? 0.9 : 0.5,
            fillColor: color,
            fillOpacity: isSelected ? 0.6 : empty ? (withLeads ? 0.2 : 0.06) : 0.4,
          },
        }
      );
      zone.on('click', () => onSelectTerritory(isSelected ? null : territory.territoryId));
      const hover = node('div', 'zone-label-content');
      hover.appendChild(node('span', 'zone-name', territory.territoryName));
      const lugar = [territory.provinceName && territory.provinceName !== territory.territoryName ? territory.provinceName : '', territory.regionName]
        .filter(Boolean)
        .join(', ');
      hover.appendChild(node('span', 'zone-detail', `${lugar ? `${lugar} · ` : ''}${withLeads ? zoneDetail(territory) : 'sin leads'}`));
      zone.bindTooltip(hover, { sticky: true, direction: 'top', className: 'zone-label zone-label-hover' });
      layer.addLayer(zone);
    });
    // zoneDetail se deriva de zoneStats y de la métrica elegida
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, focusTerritories, zoneStats, zoneGroups, zoneMetric, selectedTerritoryId, onSelectTerritory]);

  // Etiquetas: de cerca, una por zona con leads; de lejos, una por región (se tapaban entre sí)
  useEffect(() => {
    const layer = labelsLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.clearLayers();

    if (zoom < REGION_ZOOM && !selectedTerritoryId) {
      for (const region of regionBubbles) {
        const total = region.groups.reduce((acc, g) => acc + g.count, 0);
        const bubble = buildBubble('region-bubble', region.groups, `Acercar a ${region.name}: ${total} leads`);
        const acercar = () =>
          map.flyToBounds(boundsOf(region.zones), { padding: [60, 60], duration: 0.6, maxZoom: Math.max(REGION_ZOOM + 2, 11) });
        labelMarker(region.latitude, region.longitude, buildLabel(region.name, `${region.name}: ${total} leads`, bubble, acercar, 'region-label'), 'region-marker').addTo(layer);
      }
      return;
    }

    for (const territory of focusTerritories) {
      const centro = zoneCenters.get(territory.territoryId);
      if (!centro) continue;
      const isSelected = territory.territoryId === selectedTerritoryId;
      const groups = zoneGroups.get(territory.territoryId) ?? [];
      const total = groups.reduce((acc, g) => acc + g.count, 0);
      const bubble = total > 0 ? buildBubble('zone-bubble', groups, `Ver los ${total} leads de ${territory.territoryName}`) : null;
      const toggle = () => onSelectTerritory(isSelected ? null : territory.territoryId);
      labelMarker(
        centro.latitude,
        centro.longitude,
        buildLabel(territory.territoryName, `${territory.territoryName}: ${zoneDetail(territory)}`, bubble, toggle),
        isSelected ? 'zone-label-selected' : ''
      ).addTo(layer);
    }
    // zoneDetail se deriva de zoneStats y de la métrica elegida; boundsOf es una función pura
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, zoom, focusTerritories, zoneCenters, zoneGroups, regionBubbles, zoneStats, zoneMetric, selectedTerritoryId, onSelectTerritory]);

  // Encuadre: la zona elegida; si no, las zonas con leads; si no hay, la vista inicial de cada país.
  // Nunca el país entero: en Chile incluiría Isla de Pascua y el mapa quedaría en el Pacífico.
  const zonasConLeadsKey = [...zoneGroups.keys()].sort().join(',');
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const elegida = selectedTerritoryId ? territories.filter((t) => t.territoryId === selectedTerritoryId) : [];
    const conLeads = focusTerritories.filter((t) => zoneGroups.has(t.territoryId));
    const target = elegida.length > 0 ? elegida : conLeads;
    // Se deja libre el alto de la leyenda (abajo a la izquierda) y, con una zona elegida, el panel de sus leads
    const legendHeight = legendRef.current?.offsetHeight ?? 0;
    const padding = {
      paddingTopLeft: [40, 40] as L.PointTuple,
      paddingBottomRight: [40 + (selectedTerritoryId ? PANEL_WIDTH : 0), 40 + legendHeight] as L.PointTuple,
    };
    if (target.length > 0) {
      map.flyToBounds(boundsOf(target), { ...padding, duration: 0.6, maxZoom: 14 });
      return;
    }
    const vistas = focusCountries.map((c) => COUNTRIES[c].mapView);
    if (vistas.length === 1) {
      map.flyTo([vistas[0].lat, vistas[0].lng], vistas[0].zoom, { duration: 0.6 });
    } else {
      map.flyToBounds(L.latLngBounds(vistas.map((v) => [v.lat, v.lng] as L.LatLngTuple)), { ...padding, duration: 0.6, maxZoom: 12 });
    }
    // Las geometrías de las zonas son estáticas; solo reencuadrar al cambiar la selección, el país,
    // la vista o el conjunto de zonas con leads
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedTerritoryId, countryFocus, countries.join(','), frameKey, zonasConLeadsKey]);

  // Datos del gráfico de barras, con los montos en la moneda de la vista
  const barRows = useMemo(() => {
    const rows = focusTerritories.filter((t) => zoneGroups.has(t.territoryId)).map((territory) => {
      const zoneLeads = activeFocusLeads.filter((l) => l.assignedTerritoryId === territory.territoryId);
      // Ingresos estimados: solo lo que sigue abierto; lo ganado ya tiene su propia métrica
      const pipeline = money.sumLeads(zoneLeads.filter((l) => l.commercialStatus !== 'won'));
      return { territory, count: zoneLeads.length, pipeline };
    });
    const valueOf = (r: (typeof rows)[number]) => (barMetric === 'leads' ? r.count : r.pipeline);
    return rows.sort((a, b) => valueOf(b) - valueOf(a)).map((r) => ({ ...r, value: valueOf(r) }));
  }, [focusTerritories, zoneGroups, activeFocusLeads, barMetric, money]);

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

          {/* Leads de la zona elegida */}
          {selectedZone && (
            <aside
              aria-label={`Leads de ${selectedZone.territoryName}`}
              className="absolute right-3 top-3 z-[1000] flex max-h-[calc(100%-24px)] flex-col rounded-xl border border-slate-600 bg-slate-900/95 shadow-xl"
              style={{ width: PANEL_WIDTH }}
            >
              <div className="flex items-start justify-between gap-2 border-b border-slate-700 px-4 py-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[15px] font-bold text-slate-100">
                    {isMultiCountry && <CountryFlag code={selectedZone.countryCode} title={COUNTRIES[selectedZone.countryCode].name} />}
                    {selectedZone.territoryName}
                  </p>
                  <p className="text-[13px] text-slate-400">
                    {selectedZoneLeads.length} {selectedZoneLeads.length === 1 ? 'lead' : 'leads'} en esta{' '}
                    {COUNTRIES[selectedZone.countryCode].zoneLabel.singular.toLowerCase()} · {zoneDetail(selectedZone)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectTerritory(null)}
                  aria-label={`Cerrar la lista de leads de ${selectedZone.territoryName}`}
                  className="cursor-pointer rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              {selectedZoneLeads.length === 0 ? (
                <p className="px-4 py-4 text-[15px] text-slate-400">Esta zona no tiene leads con los filtros actuales.</p>
              ) : (
                <ul className="min-h-0 space-y-2 overflow-y-auto p-3">
                  {selectedZoneLeads.map((lead) => (
                    <ZoneLeadCard key={lead.id} lead={lead} catalog={catalog} highlight={highlightItemIds} />
                  ))}
                </ul>
              )}
            </aside>
          )}

          {/* Leyenda */}
          <div ref={legendRef} className="absolute bottom-6 left-3 z-[1000] space-y-1.5 rounded-xl border border-slate-600 bg-slate-900/95 px-3.5 py-2.5 text-sm text-slate-300 shadow-md">
            {colorLegend && (
              <div className="flex max-w-[420px] flex-wrap items-center gap-x-4 gap-y-1">
                {colorLegend.map((entry) => (
                  <span key={entry.label} className="flex items-center gap-1.5">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
                    {entry.label}
                  </span>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-slate-400">
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
            <div className="flex items-center gap-1.5 border-t border-slate-700 pt-1.5 text-[13px] text-slate-400">
              <Users className="h-3.5 w-3.5 shrink-0" />
              La burbuja cuenta los leads de cada zona (de lejos, de cada región). Haz clic para verlos.
            </div>
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
