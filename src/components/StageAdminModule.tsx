import React, { useState } from 'react';
import type { StageConfig, Lead, CommercialStatus } from '../types/crm';
import {
  Sliders,
  ShieldCheck,
  Clock,
  TrendingUp,
  DollarSign,
  Users,
  Edit2,
  Check,
  X,
  Layers,
  ArrowRight
} from 'lucide-react';
import { COUNTRIES, type CountryCode } from '../data/countries';
import { leadCurrency, summarizeLeads, summarizeMoney } from '../lib/currency';
import { useMoney } from '../lib/money';

interface StageAdminModuleProps {
  stageConfigs: StageConfig[];
  leads: Lead[];
  countries: CountryCode[]; // países visibles: las métricas se calculan solo con sus leads
  onUpdateStageConfig: (updated: StageConfig) => void;
}

export const StageAdminModule: React.FC<StageAdminModuleProps> = ({
  stageConfigs,
  leads,
  countries,
  onUpdateStageConfig,
}) => {
  const money = useMoney();
  const [editingStageId, setEditingStageId] = useState<CommercialStatus | null>(null);
  const [editForm, setEditForm] = useState<StageConfig | null>(null);

  const startEdit = (stage: StageConfig) => {
    setEditingStageId(stage.id);
    setEditForm({ ...stage });
  };

  const cancelEdit = () => {
    setEditingStageId(null);
    setEditForm(null);
  };

  const saveEdit = () => {
    if (editForm) {
      onUpdateStageConfig(editForm);
      setEditingStageId(null);
      setEditForm(null);
    }
  };

  // Cálculos agregados por etapa
  const totalLeadsCount = leads.length;
  // Montos: moneda local con un país; consolidado aproximado en US$ con varios
  const pipelineSummary = summarizeLeads(leads);
  const isMixedCurrency = pipelineSummary.currencies.length > 1;

  return (
    <div className="space-y-6">
      {/* Header del Módulo de Administración */}
      <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-6 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="flex items-center space-x-1.5 text-sm font-bold uppercase tracking-wider text-indigo-400">
              <Sliders className="h-4 w-4" />
              <span>Configuración de Procesos Comerciales</span>
            </span>
            <h2 className="text-xl font-extrabold text-white mt-1">
              Administración de Estados del Pipeline
            </h2>
            <p className="text-sm text-slate-400 max-w-2xl mt-1">
              Gestiona los criterios de avance, probabilidades de conversión, SLAs máximos y parámetros de cada etapa del Kanban.
            </p>
            {countries.length > 1 && (
              <p className="mt-1 text-sm font-semibold text-indigo-300">
                Métricas de: {countries.map((c) => COUNTRIES[c].name).join(' + ')}
                {isMixedCurrency && <span className="font-normal text-slate-400"> · montos convertidos a {money.display}</span>}
              </p>
            )}
          </div>

          <div className="flex items-center space-x-4">
            <div className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-right">
              <span className="text-xs text-slate-400 uppercase font-bold block">
                Total en Pipeline
              </span>
              <span className="text-base font-black text-amber-400">
                {money.fmtSummary(pipelineSummary, { compact: true })} {money.display}
              </span>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-right">
              <span className="text-xs text-slate-400 uppercase font-bold block">
                Etapas Activas
              </span>
              <span className="text-base font-black text-indigo-400">
                {stageConfigs.length} fases
              </span>
            </div>
          </div>
        </div>

        {/* Funnel Gráfico Visual */}
        <div className="mt-6 pt-5 border-t border-slate-700">
          <h4 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">
            Embudo de Conversión (Funnel Overview)
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {stageConfigs.map((stage, idx) => {
              const count = leads.filter((l) => l.commercialStatus === stage.id).length;
              const ratio = totalLeadsCount > 0 ? ((count / totalLeadsCount) * 100).toFixed(0) : 0;

              return (
                <div
                  key={stage.id}
                  className="rounded-xl border border-slate-700 bg-slate-950/70 p-2.5 flex flex-col justify-between"
                  style={{ borderLeft: `3px solid ${stage.color}` }}
                >
                  <div className="flex items-center justify-between text-[13px] font-bold text-slate-300">
                    <span className="truncate">{stage.shortCode}</span>
                    <span className="text-xs text-slate-400">#{idx + 1}</span>
                  </div>
                  <div className="mt-2 text-lg font-black text-white">{count}</div>
                  <div className="mt-1 h-1 w-full rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${ratio}%`,
                        backgroundColor: stage.color,
                      }}
                    />
                  </div>
                  <span className="text-xs text-slate-400 mt-1 block">
                    {ratio}% de la base
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Grid de Administración de Cada Estado */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {stageConfigs.map((stage) => {
          const isEditing = editingStageId === stage.id;
          const stageLeads = leads.filter((l) => l.commercialStatus === stage.id);
          const stageValue = summarizeLeads(stageLeads);
          const weightedValue = summarizeMoney(
            stageLeads.map((l) => ({
              amount: (l.estimatedDealValue || 0) * (stage.winProbability / 100),
              currency: leadCurrency(l),
            }))
          );

          return (
            <div
              key={stage.id}
              className="flex flex-col justify-between rounded-2xl border border-slate-700 bg-slate-900/80 p-5 shadow-xl transition-all hover:border-slate-600 backdrop-blur-md"
            >
              <div>
                {/* Header de la Etapa */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2.5">
                    <span
                      className="h-4 w-4 rounded-full shadow-sm"
                      style={{ backgroundColor: stage.color }}
                    />
                    <div>
                      <h3 className="text-[15px] font-bold text-slate-100">{stage.label}</h3>
                      <span className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                        Código: {stage.shortCode}
                      </span>
                    </div>
                  </div>

                  {!isEditing && (
                    <button
                      onClick={() => startEdit(stage)}
                      className="rounded-lg border border-slate-700 bg-slate-950 p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer"
                      title="Editar parámetros de esta etapa"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Formulario de Edición en Línea o Vista de Métricas */}
                {isEditing && editForm ? (
                  <div className="mt-4 space-y-3 rounded-xl border border-indigo-500/30 bg-slate-950/90 p-3 text-sm">
                    <div>
                      <label className="block text-[13px] font-bold text-slate-300 mb-1">
                        Nombre de la Etapa
                      </label>
                      <input
                        type="text"
                        value={editForm.label}
                        onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                        className="w-full rounded-lg border border-slate-600 bg-slate-900 px-2.5 py-1 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1">
                          Probabilidad (%)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={editForm.winProbability}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              winProbability: Number(e.target.value) || 0,
                            })
                          }
                          className="w-full rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1">
                          SLA Máx. (Días)
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={editForm.slaDays}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              slaDays: Number(e.target.value) || 0,
                            })
                          }
                          className="w-full rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1">
                        Descripción de Criterios
                      </label>
                      <textarea
                        rows={2}
                        value={editForm.description}
                        onChange={(e) =>
                          setEditForm({ ...editForm, description: e.target.value })
                        }
                        className="w-full rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-sm text-slate-100 focus:outline-none resize-none"
                      />
                    </div>

                    <div className="flex justify-end space-x-1.5 pt-1">
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="rounded-md px-2 py-1 text-[13px] font-medium text-slate-400 hover:bg-slate-800"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={saveEdit}
                        className="flex items-center space-x-1 rounded-md bg-indigo-600 px-3 py-1 text-[13px] font-bold text-[#fff] shadow hover:bg-indigo-500"
                      >
                        <Check className="h-4 w-4" />
                        <span>Guardar</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="mt-3 text-sm text-slate-300 leading-relaxed min-h-[40px]">
                      {stage.description}
                    </p>

                    {/* Strip de Métricas */}
                    <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-2.5">
                        <span className="text-xs text-slate-400 block uppercase font-bold">
                          Leads Activos
                        </span>
                        <span className="text-base font-black text-slate-100">
                          {stageLeads.length}
                        </span>
                      </div>
                      <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-2.5">
                        <span className="text-xs text-slate-400 block uppercase font-bold">
                          Monto Acumulado
                        </span>
                        <span className="text-base font-black text-amber-400">
                          {money.fmtSummary(stageValue, { compact: true })}
                        </span>
                      </div>
                      <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-2.5">
                        <span className="text-xs text-slate-400 block uppercase font-bold">
                          Probabilidad Cierre
                        </span>
                        <span className="text-[15px] font-black text-indigo-400">
                          {stage.winProbability}%
                        </span>
                      </div>
                      <div className="rounded-xl border border-slate-700 bg-slate-950/70 p-2.5">
                        <span className="text-xs text-slate-400 block uppercase font-bold">
                          SLA Máximo
                        </span>
                        <span className="text-[15px] font-black text-slate-300">
                          {stage.slaDays > 0 ? `${stage.slaDays} días` : 'Sin límite'}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Footer de Tarjeta de Administración */}
              <div className="mt-5 pt-3 border-t border-slate-700 flex items-center justify-between text-[13px] text-slate-400">
                <span>Ponderado comercial:</span>
                <span className="font-bold text-slate-200">
                  {money.fmtSummary(weightedValue, { compact: true })} {money.display}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
