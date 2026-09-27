import React, { useState } from 'react';
import type { CatalogItem, Lead, StageConfig, CommercialStatus, TerritoryMetric } from '../types/crm';
import { ManualValueTag } from './ui';
import { isManualValue } from '../lib/catalog';
import {
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  MapPin,
  Phone,
  Mail,
  Plus,
  MessageSquare,
  Search,
} from 'lucide-react';
import { COUNTRIES, zoneLabelFor, type CountryCode } from '../data/countries';
import { formatLeadMoney, leadCurrency } from '../lib/currency';
import { useMoney } from '../lib/money';
import { CountryFlag } from './CountryFlag';
import { contactLine, extraContactsCount, leadSubtitle, leadTitle } from '../lib/contacts';
import { blockedReason, isAnonymized, isBlocked } from '../lib/privacy';

// Orden secuencial del embudo (debe coincidir con STAGE_ORDER de lib/tenantGuards)
const stageOrder: CommercialStatus[] = ['new', 'contacted', 'qualified', 'proposal', 'pending_payment', 'won', 'lost'];

interface KanbanBoardProps {
  leads: Lead[];
  stageConfigs: StageConfig[];
  territories: TerritoryMetric[];
  countries: CountryCode[]; // países visibles
  catalog: CatalogItem[];
  canMoveBackwards: boolean; // el usuario base solo puede avanzar leads
  onUpdateLeadStatus: (leadId: string, newStatus: CommercialStatus) => void;
  onOpenContactModal: (lead: Lead) => void;
  onOpenCreateLead: () => void;
}

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  leads,
  stageConfigs,
  territories,
  countries,
  catalog,
  canMoveBackwards,
  onUpdateLeadStatus,
  onOpenContactModal,
  onOpenCreateLead,
}) => {
  const money = useMoney();
  const isMultiCountry = countries.length > 1;
  const byName = (a: TerritoryMetric, b: TerritoryMetric) => a.territoryName.localeCompare(b.territoryName, 'es');
  const zoneOption = (t: TerritoryMetric) => (
    <option key={t.territoryId} value={t.territoryId}>
      {t.territoryName} ({t.percentage}%)
    </option>
  );
  const [expandedCardIds, setExpandedCardIds] = useState<Record<string, boolean>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTerritory, setFilterTerritory] = useState<string>('all');
  // Estado de arrastrar y soltar
  const [draggingLeadId, setDraggingLeadId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<CommercialStatus | null>(null);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

  // Retroceder es mover el lead a una etapa anterior del embudo: solo gerencia puede
  const isBackwards = (from: CommercialStatus, to: CommercialStatus) => stageOrder.indexOf(to) < stageOrder.indexOf(from);
  const canDropOn = (lead: Lead | undefined, stageId: CommercialStatus) =>
    Boolean(lead) && (canMoveBackwards || !isBackwards(lead!.commercialStatus, stageId));

  const handleDrop = (e: React.DragEvent, stageId: CommercialStatus) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('text/plain') || draggingLeadId;
    const lead = leads.find((l) => l.id === leadId);
    if (lead && lead.commercialStatus !== stageId) {
      if (!canDropOn(lead, stageId)) {
        setBlockedMessage('Solo gerencia puede devolver un lead a una etapa anterior.');
        window.setTimeout(() => setBlockedMessage(null), 4000);
      } else {
        onUpdateLeadStatus(lead.id, stageId);
      }
    }
    setDraggingLeadId(null);
    setDragOverStage(null);
  };

  const toggleCard = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedCardIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const collapseAll = () => setExpandedCardIds({});
  const expandAll = () => {
    const all: Record<string, boolean> = {};
    leads.forEach((l) => (all[l.id] = true));
    setExpandedCardIds(all);
  };

  // Filtrado de leads
  const filteredLeads = leads.filter((lead) => {
    const matchesSearch =
      lead.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lead.jobTitle ?? "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lead.contacts ?? []).some((c) => c.fullName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (lead.companyName ?? "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.rawAddress.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lead.email && lead.email.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesTerritory =
      filterTerritory === 'all' || lead.assignedTerritoryId === filterTerritory;

    return matchesSearch && matchesTerritory;
  });

  const getNextStage = (current: CommercialStatus): CommercialStatus | null => {
    const idx = stageOrder.indexOf(current);
    if (idx >= 0 && idx < stageOrder.length - 2) {
      // De 'pending_payment' pasa a 'won'
      return stageOrder[idx + 1];
    }
    return null;
  };

  const getPrevStage = (current: CommercialStatus): CommercialStatus | null => {
    if (!canMoveBackwards) return null; // el usuario base no retrocede leads
    const idx = stageOrder.indexOf(current);
    if (idx > 0 && current !== 'lost') {
      return stageOrder[idx - 1];
    }
    return null;
  };

  const getTerritory = (territoryId?: string) => {
    return territories.find((t) => t.territoryId === territoryId);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] w-full space-y-4">
      {/* Barra Superior del Kanban: Filtros y Acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700 bg-slate-900/80 p-3.5 backdrop-blur-md">
        <div className="flex items-center space-x-3 flex-1 min-w-[280px]">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por lead, empresa o dirección..."
              className="w-full rounded-xl border border-slate-600 bg-slate-950/70 pl-9 pr-3.5 py-2 text-[15px] text-slate-100 placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <select
            value={filterTerritory}
            onChange={(e) => setFilterTerritory(e.target.value)}
            className="rounded-xl border border-slate-600 bg-slate-950/70 px-3 py-1.5 text-sm text-slate-300 focus:border-indigo-500 focus:outline-none"
          >
            <option value="all">Todas las {zoneLabelFor(countries, 'plural')}</option>
            {isMultiCountry
              ? countries.map((code) => (
                  <optgroup key={code} label={`${COUNTRIES[code].name} · ${COUNTRIES[code].zoneLabel.plural}`}>
                    {territories.filter((t) => t.countryCode === code).sort(byName).map(zoneOption)}
                  </optgroup>
                ))
              : [...territories].sort(byName).map(zoneOption)}
          </select>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={collapseAll}
            className="rounded-lg border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-[13px] font-medium text-slate-300 hover:bg-slate-700 transition cursor-pointer"
          >
            Contraer Todas
          </button>
          <button
            onClick={expandAll}
            className="rounded-lg border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-[13px] font-medium text-slate-300 hover:bg-slate-700 transition cursor-pointer"
          >
            Expandir Todas
          </button>
          <button
            onClick={onOpenCreateLead}
            className="flex items-center space-x-1.5 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-sm font-semibold text-[#fff] shadow-md shadow-indigo-600/30 hover:bg-indigo-500 transition cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Nuevo Lead</span>
          </button>
        </div>
      </div>

      {blockedMessage && (
        <div role="status" className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-[15px] font-semibold text-amber-200">
          {blockedMessage}
        </div>
      )}

      {/* Tablero Kanban con Columnas Horizontales con Scroll */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden pb-2">
        <div className="flex h-full gap-3 w-max xl:w-full">
          {stageConfigs.map((stage) => {
            const isDropTarget = dragOverStage === stage.id;
            const draggingFromHere =
              leads.find((l) => l.id === draggingLeadId)?.commercialStatus === stage.id;
            const stageLeads = filteredLeads.filter((l) => l.commercialStatus === stage.id);
            // Total de la columna en la moneda de la vista
            const stageTotal = money.fmtLeads(stageLeads, { compact: true });
            const nextStageId = getNextStage(stage.id);
            const nextStageConfig = stageConfigs.find((s) => s.id === nextStageId);

            return (
              <div
                key={stage.id}
                onDragOver={(e) => {
                  if (!draggingLeadId) return;
                  const dragged = leads.find((l) => l.id === draggingLeadId);
                  // Sin permiso para retroceder, la columna anterior no acepta la tarjeta
                  if (!canDropOn(dragged, stage.id)) {
                    e.dataTransfer.dropEffect = 'none';
                    return;
                  }
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverStage !== stage.id) setDragOverStage(stage.id);
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDragOverStage((prev) => (prev === stage.id ? null : prev));
                  }
                }}
                onDrop={(e) => handleDrop(e, stage.id)}
                className={`flex flex-col h-full w-[320px] shrink-0 xl:w-auto xl:flex-1 xl:min-w-[240px] rounded-2xl border backdrop-blur-sm overflow-hidden transition-colors ${
                  isDropTarget && !draggingFromHere
                    ? 'border-indigo-400 bg-indigo-950/40 ring-2 ring-indigo-500/60'
                    : 'border-slate-700 bg-slate-900/50'
                }`}
              >
                {/* Cabecera de Columna */}
                <div
                  className="p-3.5 border-b border-slate-700 bg-slate-950/60"
                  style={{ borderTop: `3px solid ${stage.color}` }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: stage.color }}
                      />
                      <h3 className="text-sm font-bold text-slate-100 tracking-tight">
                        {stage.label}
                      </h3>
                    </div>
                    <span className="flex h-5 items-center justify-center rounded-full bg-slate-800 px-2 text-xs font-bold text-slate-300">
                      {stageLeads.length}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[13px] text-slate-400">
                    <span>{stageTotal}</span>
                    <span className="text-xs text-slate-400">
                      Prob: {stage.winProbability}%
                    </span>
                  </div>
                </div>

                {/* Lista de Tarjetas Retraíbles */}
                <div className="flex-1 p-2 space-y-2.5 overflow-y-auto pr-1">
                  {stageLeads.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 rounded-xl border border-dashed border-slate-700 text-center p-3">
                      <p className="text-[13px] text-slate-400 font-medium">Sin leads</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Arrastra o avanza leads hacia esta etapa
                      </p>
                    </div>
                  ) : (
                    stageLeads.map((lead) => {
                      const isExpanded = Boolean(expandedCardIds[lead.id]);
                      const territory = getTerritory(lead.assignedTerritoryId);
                      const prevStageId = getPrevStage(lead.commercialStatus);
                      // Solicitud del titular pendiente: la tarjeta no se mueve (art. 8 ter)
                      const bloqueado = isBlocked(lead);

                      return (
                        <div
                          key={lead.id}
                          draggable={!bloqueado}
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', lead.id);
                            e.dataTransfer.effectAllowed = 'move';
                            setDraggingLeadId(lead.id);
                          }}
                          onDragEnd={() => {
                            setDraggingLeadId(null);
                            setDragOverStage(null);
                          }}
                          title={bloqueado ? 'Bloqueado: hay una solicitud del titular pendiente' : 'Arrastra para mover a otra etapa'}
                          className={`rounded-xl border transition-all duration-200 bg-slate-950/70 ${bloqueado ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'} ${
                            draggingLeadId === lead.id ? 'opacity-40 scale-[0.98]' : ''
                          } ${
                            isExpanded
                              ? 'border-indigo-500/60 shadow-lg ring-1 ring-indigo-500/30'
                              : 'border-slate-700 hover:border-slate-600 hover:bg-slate-900/60 shadow-sm'
                          }`}
                        >
                          {/* ================= VISTA RETRAÍDA (COMPACTA) ================= */}
                          <div
                            onClick={() => toggleCard(lead.id)}
                            className="p-3 cursor-pointer select-none space-y-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <h4 className="text-sm font-bold text-slate-100 hover:text-indigo-400 transition-colors line-clamp-1">
                                  {leadTitle(lead)}
                                </h4>
                                {leadSubtitle(lead) && (
                                  <p className="line-clamp-1 text-[13px] text-slate-400">{leadSubtitle(lead)}</p>
                                )}
                                {extraContactsCount(lead) > 0 && (
                                  <p className="text-[13px] font-semibold text-indigo-300">
                                    +{extraContactsCount(lead)} {extraContactsCount(lead) === 1 ? 'contacto' : 'contactos'}
                                  </p>
                                )}
                                {blockedReason(lead) && (
                                  <p className="mt-1 text-[12px] font-semibold text-amber-300">
                                    {bloqueado ? 'Bloqueado: solicitud del titular' : isAnonymized(lead) ? 'Datos eliminados' : 'No contactar'}
                                  </p>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={(e) => toggleCard(lead.id, e)}
                                className="text-slate-400 hover:text-slate-300 p-0.5"
                                title={isExpanded ? 'Contraer' : 'Expandir'}
                              >
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </button>
                            </div>

                            {/* Badge de Monto y Zona */}
                            <div className="flex items-center justify-between gap-1">
                              <span className="flex items-center gap-1.5 text-sm font-black text-amber-400">
                                {isMultiCountry && (
                                  <CountryFlag code={lead.countryCode} title={COUNTRIES[lead.countryCode].name} />
                                )}
                                <span title={money.isForeign(lead) ? `Negociado en ${formatLeadMoney(lead)}` : undefined}>
                                  {money.fmtLead(lead)}
                                </span>
                                {money.isForeign(lead) && (
                                  <span className="text-[11px] font-semibold text-slate-400">{leadCurrency(lead)}</span>
                                )}
                                {isManualValue(lead) && <ManualValueTag />}
                              </span>

                              {territory ? (
                                <span
                                  className="inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold"
                                  style={{
                                    backgroundColor: `${territory.colorHex}20`,
                                    color: territory.colorHex,
                                  }}
                                >
                                  {territory.territoryName}
                                </span>
                              ) : (
                                <span className="text-xs text-slate-400">
                                  Sin {COUNTRIES[lead.countryCode].zoneLabel.singular.toLowerCase()}
                                </span>
                              )}
                            </div>

                            {/* Botón de Avance Directo hacia la Derecha */}
                            {nextStageId && !bloqueado && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUpdateLeadStatus(lead.id, nextStageId);
                                }}
                                className="w-full mt-1 flex items-center justify-center space-x-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600 border border-indigo-500/30 hover:border-indigo-500 py-1 text-[13px] font-semibold text-indigo-300 hover:text-[#fff] transition cursor-pointer"
                                title={`Avanzar a ${nextStageConfig?.label}`}
                              >
                                <span>Avanzar a {nextStageConfig?.shortCode}</span>
                                <ChevronRight className="h-4 w-4" />
                              </button>
                            )}
                          </div>

                          {/* ================= VISTA EXPANDIDA ================= */}
                          {isExpanded && (
                            <div className="px-3 pb-3 pt-1 border-t border-slate-700 space-y-2.5 text-sm">
                              {/* Dirección (la ubicación en el mapa es la zona, nunca un punto) */}
                              <div className="flex items-start space-x-1.5 text-slate-400 text-[13px]">
                                <MapPin className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                                <div>
                                  <span className="text-slate-300">{lead.rawAddress}</span>
                                </div>
                              </div>

                              {/* Productos y servicios */}
                              {(lead.items?.length ?? 0) > 0 && (
                                <ul className="space-y-0.5 text-[13px] text-slate-300">
                                  {lead.items!.map((line) => (
                                    <li key={line.itemId} className="flex justify-between gap-2">
                                      <span className="truncate">{catalog.find((i) => i.id === line.itemId)?.name ?? 'Ítem'}</span>
                                      <span className="shrink-0 text-slate-400">×{line.quantity}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}

                              {/* Contacto directo */}
                              <div className="space-y-1 text-[13px] text-slate-400">
                                {lead.phone && (
                                  <div className="flex items-center space-x-1.5">
                                    <Phone className="h-4 w-4 text-slate-400" />
                                    <span>{lead.phone}</span>
                                  </div>
                                )}
                                {lead.email && (
                                  <div className="flex items-center space-x-1.5">
                                    <Mail className="h-4 w-4 text-slate-400" />
                                    <span className="truncate">{lead.email}</span>
                                  </div>
                                )}
                              </div>

                              {/* Otras personas con las que también se habla en este lead */}
                              {(lead.contacts?.length ?? 0) > 0 && (
                                <div className="rounded-lg border border-slate-700 bg-slate-900 p-2 text-[13px]">
                                  <span className="block text-xs font-semibold uppercase text-slate-400">
                                    Otros contactos
                                  </span>
                                  <ul className="mt-0.5 space-y-0.5 text-slate-300">
                                    {lead.contacts!.map((c) => (
                                      <li key={c.id} className="truncate">
                                        {contactLine(c)}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}

                              {/* Notas */}
                              {lead.notes && (
                                <div className="rounded-lg bg-slate-900 p-2 text-[13px] text-slate-300 border border-slate-700">
                                  <span className="font-semibold text-slate-400 block text-xs uppercase">
                                    Nota comercial:
                                  </span>
                                  {lead.notes}
                                </div>
                              )}

                              {/* Botón para abrir Toma de Contacto */}
                              <button
                                type="button"
                                onClick={() => onOpenContactModal(lead)}
                                className="w-full flex items-center justify-center space-x-1.5 rounded-lg border border-slate-600 bg-slate-800/80 py-1 text-sm font-semibold text-slate-200 hover:bg-slate-700 transition cursor-pointer"
                              >
                                <MessageSquare className="h-4 w-4 text-indigo-400" />
                                <span>Registrar Toma de Contacto</span>
                              </button>

                              {/* Controles de Navegación de Etapas */}
                              <div className="flex items-center justify-between pt-1 gap-1">
                                {prevStageId ? (
                                  <button
                                    type="button"
                                    onClick={() => onUpdateLeadStatus(lead.id, prevStageId)}
                                    className="flex items-center space-x-1 rounded-md px-2 py-1 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
                                  >
                                    <ChevronLeft className="h-4 w-4" />
                                    <span>Retroceder</span>
                                  </button>
                                ) : (
                                  <div />
                                )}

                                {lead.commercialStatus !== 'won' && (canMoveBackwards || lead.commercialStatus !== 'lost') && (
                                  <button
                                    type="button"
                                    onClick={() => onUpdateLeadStatus(lead.id, 'won')}
                                    className="rounded-md px-2 py-1 text-xs font-bold text-emerald-400 hover:bg-emerald-950/40 transition cursor-pointer"
                                  >
                                    ✓ Ganar
                                  </button>
                                )}

                                {lead.commercialStatus !== 'lost' && (canMoveBackwards || lead.commercialStatus !== 'won') && (
                                  <button
                                    type="button"
                                    onClick={() => onUpdateLeadStatus(lead.id, 'lost')}
                                    className="rounded-md px-2 py-1 text-xs font-medium text-rose-400 hover:bg-rose-950/40 transition cursor-pointer"
                                  >
                                    ✕ Descartar
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
