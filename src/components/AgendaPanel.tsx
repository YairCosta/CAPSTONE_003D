import React, { useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, List, Phone } from 'lucide-react';
import type { Lead, LeadActivity } from '../types/crm';
import {
  BUCKET_LABEL,
  CHANNEL_LABEL,
  BUCKET_ORDER,
  countsByDay,
  dayKeyOf,
  monthGrid,
  pendingFollowUps,
  type FollowUp,
} from '../lib/agenda';

interface AgendaPanelProps {
  leads: Lead[];
  activities: LeadActivity[];
  onSelectLead: (leadId: string) => void;
}


const DIAS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const horaDe = (iso: string) =>
  new Date(iso).toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export const AgendaPanel: React.FC<AgendaPanelProps> = ({ leads, activities, onSelectLead }) => {
  const [view, setView] = useState<'list' | 'month'>('list');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [monthCursor, setMonthCursor] = useState(() => new Date());

  // La hora de referencia se fija al montar: evita que "hoy" cambie en medio de un render
  const now = useMemo(() => new Date(), []);
  const followUps = useMemo(() => pendingFollowUps(leads, activities, now), [leads, activities, now]);
  const porDia = useMemo(() => countsByDay(followUps), [followUps]);

  const atrasados = followUps.filter((f) => f.bucket === 'overdue').length;
  const hoy = followUps.filter((f) => f.bucket === 'today').length;

  const visibles = selectedDay ? followUps.filter((f) => f.dayKey === selectedDay) : followUps;
  const grupos = BUCKET_ORDER.map((bucket) => ({
    bucket,
    items: visibles.filter((f) => f.bucket === bucket),
  })).filter((g) => g.items.length > 0);

  const dias = monthGrid(monthCursor.getFullYear(), monthCursor.getMonth());
  const nombreMes = monthCursor.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
  const moverMes = (delta: number) =>
    setMonthCursor((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-100">Agenda de seguimientos</h3>
          <p className="text-sm text-slate-400">
            {followUps.length === 0
              ? 'Sin contactos agendados. Se agendan al guardar una interacción.'
              : `${followUps.length} ${followUps.length === 1 ? 'contacto agendado' : 'contactos agendados'}${
                  atrasados > 0 ? ` · ${atrasados} ${atrasados === 1 ? 'atrasado' : 'atrasados'}` : ''
                }${hoy > 0 ? ` · ${hoy} para hoy` : ''}`}
          </p>
        </div>
        <div className="flex gap-1 rounded-xl border border-slate-600 bg-slate-950/60 p-1">
          <button
            type="button"
            onClick={() => setView('list')}
            className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              view === 'list' ? 'bg-indigo-600 text-[#fff]' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <List className="h-4 w-4" />
            Lista
          </button>
          <button
            type="button"
            onClick={() => setView('month')}
            className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              view === 'month' ? 'bg-indigo-600 text-[#fff]' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <CalendarDays className="h-4 w-4" />
            Mes
          </button>
        </div>
      </div>

      {view === 'month' && (
        <div className="mb-4 rounded-xl border border-slate-700 bg-slate-950/60 p-3">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => moverMes(-1)}
              aria-label="Mes anterior"
              className="cursor-pointer rounded-lg p-1 text-slate-300 hover:bg-slate-800"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-bold text-slate-200 first-letter:uppercase">{nombreMes}</span>
            <button
              type="button"
              onClick={() => moverMes(1)}
              aria-label="Mes siguiente"
              className="cursor-pointer rounded-lg p-1 text-slate-300 hover:bg-slate-800"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {DIAS.map((d, i) => (
              <span key={`${d}-${i}`} className="text-xs font-bold uppercase text-slate-400">
                {d}
              </span>
            ))}
            {dias.map((dia) => {
              const key = dayKeyOf(dia);
              const cantidad = porDia.get(key) ?? 0;
              const esDeOtroMes = dia.getMonth() !== monthCursor.getMonth();
              const esHoy = key === dayKeyOf(now);
              const estaSeleccionado = key === selectedDay;
              const atrasado = cantidad > 0 && key < dayKeyOf(now);
              return (
                <button
                  key={key}
                  type="button"
                  disabled={cantidad === 0}
                  onClick={() => setSelectedDay(estaSeleccionado ? null : key)}
                  aria-label={`${dia.toLocaleDateString('es-CL')}: ${cantidad} agendados`}
                  className={`flex h-11 flex-col items-center justify-center rounded-lg border text-sm transition ${
                    estaSeleccionado
                      ? 'border-indigo-400 bg-indigo-600 text-[#fff]'
                      : cantidad > 0
                        ? 'cursor-pointer border-slate-600 bg-slate-900 text-slate-100 hover:bg-slate-800'
                        : 'border-transparent text-slate-500'
                  } ${esDeOtroMes ? 'opacity-40' : ''} ${esHoy && !estaSeleccionado ? 'ring-1 ring-indigo-400' : ''}`}
                >
                  <span className="font-semibold">{dia.getDate()}</span>
                  {cantidad > 0 && (
                    <span
                      className={`mt-0.5 h-1.5 w-1.5 rounded-full ${
                        estaSeleccionado ? 'bg-white' : atrasado ? 'bg-rose-400' : 'bg-indigo-400'
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>
          {selectedDay && (
            <button
              type="button"
              onClick={() => setSelectedDay(null)}
              className="mt-2 cursor-pointer text-sm font-semibold text-indigo-300 hover:text-indigo-200"
            >
              Ver todos los días
            </button>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-2">
        {grupos.length === 0 ? (
          <div className="flex h-56 flex-col items-center justify-center text-center">
            <CalendarDays className="mb-2 h-8 w-8 text-slate-400" />
            <p className="text-[15px] font-semibold text-slate-400">
              {selectedDay ? 'Nada agendado ese día' : 'Sin contactos agendados'}
            </p>
            <p className="mt-1 max-w-sm text-sm text-slate-400">
              Al guardar una interacción, la fecha de "Próximo Seguimiento" aparece aquí.
            </p>
          </div>
        ) : (
          grupos.map(({ bucket, items }) => (
            <section key={bucket}>
              <h4
                className={`mb-1.5 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide ${
                  bucket === 'overdue' ? 'text-rose-300' : bucket === 'today' ? 'text-amber-300' : 'text-slate-400'
                }`}
              >
                {bucket === 'overdue' && <AlertTriangle className="h-4 w-4" />}
                {BUCKET_LABEL[bucket]}
                <span className="font-semibold text-slate-400">({items.length})</span>
              </h4>
              <ul className="space-y-2">
                {items.map((f) => (
                  <FollowUpRow key={f.leadId} followUp={f} onSelectLead={onSelectLead} />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
};

function FollowUpRow({ followUp, onSelectLead }: { followUp: FollowUp; onSelectLead: (leadId: string) => void }) {
  const atrasado = followUp.bucket === 'overdue';
  return (
    <li
      className={`rounded-xl border p-3 transition ${
        atrasado ? 'border-rose-500/40 bg-rose-500/5' : 'border-slate-700 bg-slate-950/60 hover:border-slate-600'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-100">
            {followUp.leadName}
            {followUp.companyName && <span className="font-normal text-slate-400"> · {followUp.companyName}</span>}
          </p>
          <p className="text-[13px] text-slate-400">
            {CHANNEL_LABEL[followUp.channel]}
            {followUp.contactName ? ` con ${followUp.contactName}` : ''} · {followUp.agentName}
          </p>
        </div>
        <span className={`shrink-0 text-[13px] font-bold ${atrasado ? 'text-rose-300' : 'text-amber-300'}`}>
          {horaDe(followUp.date)}
        </span>
      </div>
      <p className="mt-1.5 line-clamp-2 text-[13px] text-slate-300">{followUp.summary}</p>
      <button
        type="button"
        onClick={() => onSelectLead(followUp.leadId)}
        className="mt-2 flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800/80 px-2.5 py-1 text-sm font-semibold text-slate-200 transition hover:bg-slate-700"
      >
        <Phone className="h-4 w-4" />
        Registrar este contacto
      </button>
    </li>
  );
}
