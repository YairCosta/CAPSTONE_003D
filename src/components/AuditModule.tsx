import React, { useMemo, useState } from 'react';
import {
  History,
  Search,
  Undo2,
  ArrowRight,
  User,
  Package,
  Building2,
  Users,
  PhoneCall,
  Settings,
  ShieldCheck,
  FileSpreadsheet,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import type { AuditAction, AuditEntity, AuditEntry } from '../types/crm';
import { ACTION_LABEL, ENTITY_LABEL, isRevertible } from '../lib/audit';
import { ROLE_LABEL } from '../lib/permissions';
import { cardClass, inputClass, primaryButton, secondaryButton, tableCell, tableHeadRow } from '../lib/styles';
import { EmptyState, Modal, PageHeader, Pill, type PillTone } from './ui';

interface AuditModuleProps {
  entries: AuditEntry[]; // del CRM del usuario, más recientes primero
  canRevert: boolean;
  onRevert: (entryId: string) => string | null; // devuelve un mensaje de error o null si funcionó
}

const ENTITY_ICON: Record<AuditEntity, typeof User> = {
  lead: User,
  account: Building2,
  catalog: Package,
  activity: PhoneCall,
  stage: Settings,
  company: ShieldCheck,
  user: Users,
  export: FileSpreadsheet,
};

const ACTION_TONE: Record<AuditAction, PillTone> = {
  create: 'green',
  update: 'indigo',
  delete: 'red',
  activate: 'green',
  deactivate: 'amber',
  stage: 'indigo',
  locate: 'indigo',
  contact: 'slate',
  export: 'amber',
  revert: 'amber',
};

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const relative = (iso: string, now: number) => {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'recién';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
};

const shorten = (value: string | number | null) => {
  if (value === null) return '—';
  const text = String(value);
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
};

export const AuditModule: React.FC<AuditModuleProps> = ({ entries, canRevert, onRevert }) => {
  const [query, setQuery] = useState('');
  const [entityFilter, setEntityFilter] = useState<AuditEntity | 'all'>('all');
  const [actorFilter, setActorFilter] = useState('all');
  const [onlyRevertible, setOnlyRevertible] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [confirming, setConfirming] = useState<AuditEntry | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  // Una sola referencia de tiempo por render del módulo (para los "hace X min")
  const [now] = useState(() => Date.now());

  const actors = useMemo(
    () => Array.from(new Map(entries.map((e) => [e.actorId, e.actorName])).entries()).sort((a, b) => a[1].localeCompare(b[1], 'es')),
    [entries]
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (entityFilter !== 'all' && e.entity !== entityFilter) return false;
      if (actorFilter !== 'all' && e.actorId !== actorFilter) return false;
      if (onlyRevertible && !isRevertible(e)) return false;
      if (!q) return true;
      const haystack = [e.actorName, e.entityLabel, e.summary, ACTION_LABEL[e.action], ENTITY_LABEL[e.entity]]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q) || e.changes.some((c) => `${c.label} ${c.before} ${c.after}`.toLowerCase().includes(q));
    });
  }, [entries, query, entityFilter, actorFilter, onlyRevertible]);

  const revertibleCount = entries.filter(isRevertible).length;

  const confirmRevert = () => {
    if (!confirming) return;
    const error = onRevert(confirming.id);
    setFeedback(error ? { ok: false, text: error } : { ok: true, text: `Se restauró: ${confirming.entityLabel}` });
    setConfirming(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={History}
        eyebrow="Control y trazabilidad"
        title="Auditoría del CRM"
        description="Todo lo que pasa en este CRM: quién hizo el cambio, qué cambió exactamente y cuándo. El historial no se edita ni se borra."
      />

      {feedback && (
        <div
          role="status"
          className={`rounded-2xl border px-5 py-3 text-[15px] font-semibold ${
            feedback.ok ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <div className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 p-5">
          <div>
            <h3 className="text-lg font-bold text-slate-100">Historial de cambios</h3>
            <p className="text-sm text-slate-400">
              {entries.length} registros · {revertibleCount} se pueden revertir
              {!canRevert && ' · solo gerencia puede revertir'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Persona, dato o valor..."
                aria-label="Buscar en el historial"
                className={`${inputClass} w-64! pl-10`}
              />
            </div>
            <select
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value as AuditEntity | 'all')}
              aria-label="Filtrar por tipo de dato"
              className={`${inputClass} w-52!`}
            >
              <option value="all">Todo el CRM</option>
              {(Object.keys(ENTITY_LABEL) as AuditEntity[]).map((entity) => (
                <option key={entity} value={entity}>
                  {ENTITY_LABEL[entity]}
                </option>
              ))}
            </select>
            <select
              value={actorFilter}
              onChange={(e) => setActorFilter(e.target.value)}
              aria-label="Filtrar por persona"
              className={`${inputClass} w-48!`}
            >
              <option value="all">Todas las personas</option>
              {actors.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-600 px-3 text-sm font-semibold text-slate-300">
              <input
                type="checkbox"
                checked={onlyRevertible}
                onChange={(e) => setOnlyRevertible(e.target.checked)}
                className="h-4 w-4 accent-indigo-600"
              />
              Solo reversibles
            </label>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={History}
              title={entries.length === 0 ? 'Todavía no hay movimientos' : 'Sin resultados'}
              description={
                entries.length === 0
                  ? 'Cuando alguien capture un lead, lo mueva de etapa o edite datos, el cambio aparecerá aquí.'
                  : 'Ningún registro coincide con los filtros.'
              }
            />
          </div>
        ) : (
          <div className="max-h-[640px] overflow-auto">
            <table className="w-full min-w-[1040px] text-[15px]">
              <thead className="sticky top-0 z-10 bg-slate-900">
                <tr className={tableHeadRow}>
                  <th className={tableCell}>Fecha y hora</th>
                  <th className={tableCell}>Persona</th>
                  <th className={tableCell}>Acción</th>
                  <th className={tableCell}>Dato</th>
                  <th className={tableCell}>Detalle</th>
                  <th className={`${tableCell} text-right`}>Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/70">
                {rows.map((entry) => {
                  const Icon = ENTITY_ICON[entry.entity];
                  const isOpen = Boolean(expanded[entry.id]);
                  const reverted = Boolean(entry.revertedAt);
                  return (
                    <tr key={entry.id} className={reverted ? 'bg-slate-950/40' : ''}>
                      <td className={`${tableCell} whitespace-nowrap`}>
                        <div className="text-slate-200">{dateTime(entry.createdAt)}</div>
                        <div className="text-sm text-slate-400">{relative(entry.createdAt, now)}</div>
                      </td>
                      <td className={tableCell}>
                        <div className="font-semibold text-slate-100">{entry.actorName}</div>
                        <div className="text-sm text-slate-400">{ROLE_LABEL[entry.actorRole]}</div>
                      </td>
                      <td className={tableCell}>
                        <Pill tone={ACTION_TONE[entry.action]}>{ACTION_LABEL[entry.action]}</Pill>
                      </td>
                      <td className={tableCell}>
                        <div className="flex items-center gap-2 text-slate-200">
                          <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                          <span className="font-semibold">{entry.entityLabel}</span>
                        </div>
                        <div className="text-sm text-slate-400">{ENTITY_LABEL[entry.entity]}</div>
                      </td>
                      <td className={tableCell}>
                        <div className="text-slate-300">{entry.summary}</div>
                        {reverted && (
                          <div className="mt-1">
                            <Pill tone="amber">
                              <RotateCcw className="h-3.5 w-3.5" />
                              Revertido{entry.revertedBy ? ` por ${entry.revertedBy}` : ''}
                            </Pill>
                          </div>
                        )}
                        {entry.changes.length > 0 && (
                          <>
                            <button
                              type="button"
                              onClick={() => setExpanded((prev) => ({ ...prev, [entry.id]: !isOpen }))}
                              aria-expanded={isOpen}
                              className="mt-1 cursor-pointer text-sm font-semibold text-indigo-300 hover:text-indigo-200"
                            >
                              {isOpen ? 'Ocultar cambios' : `Ver ${entry.changes.length} ${entry.changes.length === 1 ? 'cambio' : 'cambios'}`}
                            </button>
                            {isOpen && (
                              <ul className="mt-2 space-y-1.5 rounded-xl border border-slate-700 bg-slate-950/50 p-3">
                                {entry.changes.map((change) => (
                                  <li key={change.field} className="text-sm">
                                    <span className="font-semibold text-slate-300">{change.label}:</span>{' '}
                                    <span className="text-rose-300 line-through">{shorten(change.before)}</span>
                                    <ArrowRight className="mx-1 inline h-3.5 w-3.5 text-slate-500" />
                                    <span className="text-emerald-300">{shorten(change.after)}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </>
                        )}
                      </td>
                      <td className={`${tableCell} text-right`}>
                        {isRevertible(entry) && canRevert ? (
                          <button
                            type="button"
                            onClick={() => setConfirming(entry)}
                            className={`${secondaryButton} px-3 py-2 text-sm`}
                            aria-label={`Volver atrás: ${entry.summary}`}
                          >
                            <Undo2 className="h-4 w-4" />
                            Volver atrás
                          </button>
                        ) : (
                          <span className="text-sm text-slate-500">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirming && (
        <Modal
          title="Volver atrás este cambio"
          subtitle={`${ACTION_LABEL[confirming.action]} · ${confirming.entityLabel}`}
          onClose={() => setConfirming(null)}
          footer={
            <>
              <button type="button" onClick={() => setConfirming(null)} className={secondaryButton}>
                Cancelar
              </button>
              <button type="button" onClick={confirmRevert} className={primaryButton}>
                <Undo2 className="h-4 w-4" />
                Restaurar como estaba
              </button>
            </>
          }
        >
          <div className="space-y-4">
            <p className="text-[15px] text-slate-300">
              Se restaurará el estado anterior del {ENTITY_LABEL[confirming.entity].toLowerCase()}{' '}
              <strong>{confirming.entityLabel}</strong>, tal como estaba el {dateTime(confirming.createdAt)}.
            </p>

            {confirming.changes.length > 0 && (
              <ul className="space-y-1.5 rounded-xl border border-slate-700 bg-slate-950/50 p-3">
                {confirming.changes.map((change) => (
                  <li key={change.field} className="text-sm">
                    <span className="font-semibold text-slate-300">{change.label}:</span>{' '}
                    <span className="text-rose-300 line-through">{shorten(change.after)}</span>
                    <ArrowRight className="mx-1 inline h-3.5 w-3.5 text-slate-500" />
                    <span className="text-emerald-300">{shorten(change.before)}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <span>
                La reversión queda registrada en el historial como un movimiento más: no borra nada. Los cambios hechos
                después de este quedarán sobrescritos.
              </span>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
