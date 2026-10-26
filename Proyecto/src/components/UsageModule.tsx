import React, { useMemo, useState } from 'react';
import { AlertTriangle, Bug, CheckCircle2, Eye, Layers, Loader2, MessageSquareHeart, RefreshCw, RotateCcw, UserCheck } from 'lucide-react';
import type { AppUser, BugReport, BugStatus, Company, SurveyResponse } from '../types/crm';
import { ROLE_LABEL } from '../lib/permissions';
import { cardClass, formatDate, labelClass, secondaryButton, tableCell, tableHeadRow, inputClass } from '../lib/styles';
import {
  BUG_STATUS_LABEL,
  INACTIVE_OPTIONS,
  PERIOD_OPTIONS,
  STAGNANT_OPTIONS,
  isAlert,
  presenceOf,
  summarizeSurveys,
  unresolvedBugs,
  type Presence,
  type UsageParams,
  type UsageSnapshot,
} from '../lib/usage';
import { EmptyState, Pill, SectionTabs, type PillTone } from './ui';

type Part = 'leads' | 'people' | 'surveys' | 'bugs';

export interface UsageData {
  usage: UsageSnapshot | null;
  surveys: SurveyResponse[];
  bugs: BugReport[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  changeBugStatus: (id: string, status: BugStatus) => Promise<string | null>;
}

interface UsageModuleProps {
  companies: Company[];
  users: AppUser[];
  data: UsageData;
  params: UsageParams;
  onParamsChange: (params: UsageParams) => void;
}

const PAGE_LABEL: Record<string, string> = {
  kpi: 'KPI y mapa',
  kanban: 'Pipeline',
  contact: 'Registro de contacto',
  manager: 'Gerencia',
  audit: 'Auditoría',
  stages: 'Estados',
};

const PRESENCE_LABEL: Record<Presence, string> = {
  active: 'Al día',
  inactive: 'Dejó de ingresar',
  never: 'Nunca ingresó',
  new: 'Recién invitado',
  disabled: 'Desactivado',
};
const PRESENCE_TONE: Record<Presence, PillTone> = { active: 'green', inactive: 'red', never: 'red', new: 'slate', disabled: 'slate' };

const daysAgo = (days: number | null) => (days === null ? '—' : days === 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`);
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

const npsTone = (nps: number | null): PillTone => (nps === null ? 'slate' : nps >= 50 ? 'green' : nps >= 0 ? 'amber' : 'red');
const scoreTone = (score: number): PillTone => (score >= 9 ? 'green' : score >= 7 ? 'amber' : 'red');

function Select<T extends number>({
  id,
  label,
  value,
  options,
  format,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  options: readonly T[];
  format: (n: T) => string;
  onChange: (n: T) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(Number(e.target.value) as T)} className={`${inputClass} !w-auto min-w-40`}>
        {options.map((o) => (
          <option key={o} value={o}>
            {format(o)}
          </option>
        ))}
      </select>
    </div>
  );
}

export const UsageModule: React.FC<UsageModuleProps> = ({ companies, users, data, params, onParamsChange }) => {
  const [part, setPart] = useState<Part>('leads');
  const { usage, surveys, bugs, loading, error, refresh } = data;
  // Hasta que llegan los datos, "hoy" es el momento en que se abrió el panel
  const [abierto] = useState(() => Date.now());
  const now = useMemo(() => new Date(usage?.generatedAt ?? abierto), [usage, abierto]);

  const companyName = (id: string) => companies.find((c) => c.id === id)?.name ?? 'CRM eliminado';
  const userOf = (id: string) => users.find((u) => u.id === id);

  // Personas de los CRMs con su actividad y su estado; primero las que están en rojo
  const people = useMemo(() => {
    const porPersona = new Map((usage?.users ?? []).map((u) => [u.userId, u]));
    return users
      .filter((u) => u.role !== 'superadmin')
      .map((user) => {
        const actividad = porPersona.get(user.id) ?? { userId: user.id, loginsPeriod: 0, loginsTotal: 0, lastLoginAt: null };
        const presencia = presenceOf(user, actividad.lastLoginAt, params.inactiveDays, now);
        return { user, actividad, ...presencia };
      })
      .sort((a, b) => {
        const rojoA = isAlert(a.status) ? 1 : 0;
        const rojoB = isAlert(b.status) ? 1 : 0;
        if (rojoA !== rojoB) return rojoB - rojoA;
        // Dentro del rojo, primero quien lleva más tiempo sin ingresar (quien nunca ingresó, al principio)
        return (b.daysSince ?? Infinity) - (a.daysSince ?? Infinity) || a.user.fullName.localeCompare(b.user.fullName, 'es');
      });
  }, [users, usage, params.inactiveDays, now]);

  const enRojo = people.filter((p) => isAlert(p.status)).length;
  const estancados = (usage?.companies ?? []).reduce((suma, c) => suma + c.leadsStagnant, 0);
  const encuestas = summarizeSurveys(surveys);
  const sinResolver = unresolvedBugs(bugs);

  const resumen: { id: Part; label: string; value: string; hint: string; icon: typeof Layers; alerta: boolean }[] = [
    { id: 'leads', label: 'Leads estancados', value: String(estancados), hint: `sin movimiento hace ${params.stagnantDays} días o más`, icon: Layers, alerta: estancados > 0 },
    { id: 'people', label: 'Personas en rojo', value: String(enRojo), hint: `sin ingresar hace ${params.inactiveDays} días o más`, icon: UserCheck, alerta: enRojo > 0 },
    { id: 'surveys', label: 'Satisfacción (NPS)', value: encuestas.nps === null ? '—' : String(encuestas.nps), hint: encuestas.count === 0 ? 'sin respuestas todavía' : `${plural(encuestas.count, 'respuesta', 'respuestas')} · promedio ${encuestas.average}`, icon: MessageSquareHeart, alerta: encuestas.nps !== null && encuestas.nps < 0 },
    { id: 'bugs', label: 'Errores sin revisar', value: String(sinResolver), hint: `${plural(bugs.length, 'reporte', 'reportes')} en total`, icon: Bug, alerta: sinResolver > 0 },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {resumen.map((r) => {
          const Icon = r.icon;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setPart(r.id)}
              aria-label={`${r.label}: ${r.value}. Ver detalle`}
              className={`${cardClass} cursor-pointer p-5 text-left transition hover:bg-slate-800/70 ${r.alerta ? '!border-rose-500/50' : ''}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-[15px] font-semibold text-slate-300">{r.label}</span>
                <Icon className={`h-5 w-5 ${r.alerta ? 'text-rose-300' : 'text-indigo-300'}`} />
              </div>
              <p className={`mt-2 text-3xl font-black ${r.alerta ? 'text-rose-300' : 'text-slate-100'}`}>{r.value}</p>
              <p className="mt-1 text-sm text-slate-400">{r.hint}</p>
            </button>
          );
        })}
      </div>

      <div className={`${cardClass} flex flex-wrap items-end gap-4 p-5`}>
        <Select
          id="uso-periodo"
          label="Período"
          value={params.days}
          options={PERIOD_OPTIONS}
          format={(n) => `Últimos ${n} días`}
          onChange={(days) => onParamsChange({ ...params, days })}
        />
        <Select
          id="uso-estancado"
          label="Lead estancado si no se mueve en"
          value={params.stagnantDays}
          options={STAGNANT_OPTIONS}
          format={(n) => `${n} días`}
          onChange={(stagnantDays) => onParamsChange({ ...params, stagnantDays })}
        />
        <Select
          id="uso-inactivo"
          label="En rojo si no ingresa en"
          value={params.inactiveDays}
          options={INACTIVE_OPTIONS}
          format={(n) => `${n} días`}
          onChange={(inactiveDays) => onParamsChange({ ...params, inactiveDays })}
        />
        <button type="button" onClick={refresh} disabled={loading} className={`${secondaryButton} ml-auto`}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Actualizar
        </button>
      </div>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-[15px] text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      <SectionTabs
        active={part}
        onChange={setPart}
        tabs={[
          { id: 'leads', label: 'Leads por CRM', icon: Layers },
          { id: 'people', label: 'Ingresos', icon: UserCheck, count: enRojo > 0 ? enRojo : undefined },
          { id: 'surveys', label: 'Satisfacción', icon: MessageSquareHeart, count: surveys.length },
          { id: 'bugs', label: 'Errores reportados', icon: Bug, count: sinResolver > 0 ? sinResolver : undefined },
        ]}
      />

      {part === 'leads' && <LeadsPart companies={companies} usage={usage} params={params} loading={loading} />}
      {part === 'people' && <PeoplePart people={people} companyName={companyName} params={params} loading={loading} />}
      {part === 'surveys' && <SurveysPart surveys={surveys} companies={companies} companyName={companyName} userOf={userOf} />}
      {part === 'bugs' && <BugsPart bugs={bugs} companyName={companyName} userOf={userOf} onChangeStatus={data.changeBugStatus} />}
    </div>
  );
};

/* ================================ LEADS POR CRM ================================ */

function LeadsPart({ companies, usage, params, loading }: { companies: Company[]; usage: UsageSnapshot | null; params: UsageParams; loading: boolean }) {
  const filas = companies
    .map((company) => ({ company, uso: usage?.companies.find((u) => u.companyId === company.id) }))
    .sort((a, b) => a.company.name.localeCompare(b.company.name, 'es'));
  const total = (campo: 'leadsCreated' | 'leadsActive' | 'leadsWon' | 'leadsLost' | 'leadsStagnant' | 'leadsTotal') =>
    filas.reduce((suma, f) => suma + (f.uso?.[campo] ?? 0), 0);

  if (!usage && loading) return <p className="py-10 text-center text-[15px] text-slate-400">Cargando…</p>;
  if (filas.length === 0) return <EmptyState icon={Layers} title="Todavía no hay CRMs" description="Cuando crees el primero, aquí verás cuántos leads trabaja." />;

  return (
    <div className={`${cardClass} overflow-hidden`}>
      <div className="border-b border-slate-700 p-5">
        <h3 className="text-lg font-bold text-slate-100">Leads por CRM</h3>
        <p className="text-sm text-slate-400">
          "Creados" cuenta los últimos {params.days} días; el resto es el estado de hoy. Solo números: el administrador no ve los datos de los leads.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-[15px]">
          <thead>
            <tr className={tableHeadRow}>
              <th className={tableCell}>CRM</th>
              <th className={`${tableCell} text-right`}>Creados</th>
              <th className={`${tableCell} text-right`}>Abiertos</th>
              <th className={`${tableCell} text-right`}>Ganados</th>
              <th className={`${tableCell} text-right`}>Perdidos</th>
              <th className={`${tableCell} text-right`}>Estancados</th>
              <th className={`${tableCell} text-right`}>Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/70">
            {filas.map(({ company, uso }) => (
              <tr key={company.id} data-crm={company.name}>
                <td className={tableCell}>
                  <p className="font-semibold text-slate-100">{company.name}</p>
                  {!company.isActive && <Pill tone="slate">Desactivado</Pill>}
                </td>
                <td className={`${tableCell} text-right text-slate-200`}>{uso?.leadsCreated ?? '—'}</td>
                <td className={`${tableCell} text-right text-slate-200`}>{uso?.leadsActive ?? '—'}</td>
                <td className={`${tableCell} text-right text-emerald-300`}>{uso?.leadsWon ?? '—'}</td>
                <td className={`${tableCell} text-right text-slate-300`}>{uso?.leadsLost ?? '—'}</td>
                <td className={`${tableCell} text-right`}>
                  {uso === undefined ? (
                    '—'
                  ) : uso.leadsStagnant > 0 ? (
                    <Pill tone="red">
                      {uso.leadsStagnant}
                      {uso.leadsActive > 0 ? ` de ${uso.leadsActive}` : ''}
                    </Pill>
                  ) : (
                    <span className="text-slate-400">0</span>
                  )}
                </td>
                <td className={`${tableCell} text-right font-semibold text-slate-100`}>{uso?.leadsTotal ?? '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-600 bg-slate-950/40 font-bold text-slate-100">
              <td className={tableCell}>Todos los CRMs</td>
              <td className={`${tableCell} text-right`}>{total('leadsCreated')}</td>
              <td className={`${tableCell} text-right`}>{total('leadsActive')}</td>
              <td className={`${tableCell} text-right text-emerald-300`}>{total('leadsWon')}</td>
              <td className={`${tableCell} text-right`}>{total('leadsLost')}</td>
              <td className={`${tableCell} text-right`}>{total('leadsStagnant')}</td>
              <td className={`${tableCell} text-right`}>{total('leadsTotal')}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/* ================================ INGRESOS ================================ */

interface PersonRow {
  user: AppUser;
  actividad: { loginsPeriod: number; loginsTotal: number; lastLoginAt: string | null };
  status: Presence;
  daysSince: number | null;
}

function PeoplePart({ people, companyName, params, loading }: { people: PersonRow[]; companyName: (id: string) => string; params: UsageParams; loading: boolean }) {
  const [soloRojo, setSoloRojo] = useState(false);
  const enRojo = people.filter((p) => isAlert(p.status)).length;
  const filas = soloRojo ? people.filter((p) => isAlert(p.status)) : people;

  if (people.length === 0) return <EmptyState icon={UserCheck} title="Todavía no hay usuarios" description="Cuando invites a alguien, aquí verás cuándo ingresa." />;

  return (
    <div className={`${cardClass} overflow-hidden`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-700 p-5">
        <div>
          <h3 className="text-lg font-bold text-slate-100">Ingresos de los usuarios</h3>
          <p className="text-sm text-slate-400">
            Una visita cuenta como un ingreso. En rojo: quien no ingresa hace {params.inactiveDays} días o más, o fue invitado hace más de
            eso y nunca entró.
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[15px] text-slate-200">
          <input type="checkbox" checked={soloRojo} onChange={(e) => setSoloRojo(e.target.checked)} className="h-4 w-4 accent-rose-500" />
          Solo los que están en rojo ({enRojo})
        </label>
      </div>
      {filas.length === 0 ? (
        <p className="p-8 text-center text-[15px] text-slate-400">{loading ? 'Cargando…' : 'Nadie está en rojo. Todos ingresaron dentro del plazo.'}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-[15px]">
            <thead>
              <tr className={tableHeadRow}>
                <th className={tableCell}>Persona</th>
                <th className={tableCell}>CRM</th>
                <th className={tableCell}>Perfil</th>
                <th className={`${tableCell} text-right`}>Ingresos ({params.days} días)</th>
                <th className={`${tableCell} text-right`}>Total</th>
                <th className={tableCell}>Último ingreso</th>
                <th className={tableCell}>Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/70">
              {filas.map(({ user, actividad, status, daysSince }) => (
                <tr key={user.id} data-persona={user.email} data-estado={status} className={isAlert(status) ? 'bg-rose-500/10' : undefined}>
                  <td className={tableCell}>
                    <p className="font-semibold text-slate-100">{user.fullName}</p>
                    <p className="text-sm text-slate-400">{user.email}</p>
                  </td>
                  <td className={`${tableCell} text-slate-300`}>{user.companyId ? companyName(user.companyId) : '—'}</td>
                  <td className={`${tableCell} text-slate-300`}>{ROLE_LABEL[user.role]}</td>
                  <td className={`${tableCell} text-right text-slate-200`}>{actividad.loginsPeriod}</td>
                  <td className={`${tableCell} text-right text-slate-300`}>{actividad.loginsTotal}</td>
                  <td className={`${tableCell} text-slate-300`}>
                    {actividad.lastLoginAt ? (
                      <>
                        {formatDate(actividad.lastLoginAt)} <span className="text-sm text-slate-400">({daysAgo(daysSince)})</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className={tableCell}>
                    <Pill tone={PRESENCE_TONE[status]}>
                      {isAlert(status) && <AlertTriangle className="h-3.5 w-3.5" />}
                      {PRESENCE_LABEL[status]}
                      {status === 'inactive' && daysSince !== null ? ` · ${daysAgo(daysSince)}` : ''}
                    </Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ================================ ENCUESTAS ================================ */

function SurveysPart({
  surveys,
  companies,
  companyName,
  userOf,
}: {
  surveys: SurveyResponse[];
  companies: Company[];
  companyName: (id: string) => string;
  userOf: (id: string) => AppUser | undefined;
}) {
  const [crm, setCrm] = useState('');
  const visibles = crm ? surveys.filter((s) => s.companyId === crm) : surveys;
  const resumen = summarizeSurveys(visibles);

  if (surveys.length === 0) {
    return (
      <EmptyState
        icon={MessageSquareHeart}
        title="Todavía no hay respuestas"
        description="Cada persona recibe la encuesta después de su primera semana y cada 30 días. Cuando responda, aparece aquí."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className={`${cardClass} p-5`}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-slate-100">¿Qué tan probable es que recomiendes Revela?</h3>
            <p className="text-sm text-slate-400">Notas de 0 a 10. El NPS es el % de 9 y 10 menos el % de 0 a 6.</p>
          </div>
          <div>
            <label htmlFor="encuestas-crm" className={labelClass}>
              CRM
            </label>
            <select id="encuestas-crm" value={crm} onChange={(e) => setCrm(e.target.value)} className={`${inputClass} !w-auto min-w-48`}>
              <option value="">Todos</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-5">
          {[
            { label: 'NPS', value: resumen.nps === null ? '—' : String(resumen.nps), tone: npsTone(resumen.nps) },
            { label: 'Promedio', value: resumen.average === null ? '—' : String(resumen.average), tone: 'slate' as PillTone },
            { label: 'Promotores (9-10)', value: String(resumen.promoters), tone: 'green' as PillTone },
            { label: 'Pasivos (7-8)', value: String(resumen.passives), tone: 'amber' as PillTone },
            { label: 'Detractores (0-6)', value: String(resumen.detractors), tone: 'red' as PillTone },
          ].map((m) => (
            <div key={m.label} className="rounded-xl border border-slate-700 bg-slate-950/40 p-4">
              <p className="text-sm text-slate-400">{m.label}</p>
              <p className="mt-1 text-2xl font-black text-slate-100" data-metrica={m.label}>
                {m.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className={`${cardClass} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[15px]">
            <thead>
              <tr className={tableHeadRow}>
                <th className={tableCell}>Fecha</th>
                <th className={tableCell}>Persona</th>
                <th className={tableCell}>CRM</th>
                <th className={tableCell}>Nota</th>
                <th className={tableCell}>Comentario</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/70">
              {visibles.map((s) => (
                <tr key={s.id}>
                  <td className={`${tableCell} whitespace-nowrap text-slate-300`}>{formatDate(s.createdAt)}</td>
                  <td className={`${tableCell} text-slate-100`}>{userOf(s.userId)?.fullName ?? 'Usuario eliminado'}</td>
                  <td className={`${tableCell} text-slate-300`}>{companyName(s.companyId)}</td>
                  <td className={tableCell}>
                    <Pill tone={scoreTone(s.score)}>{s.score}</Pill>
                  </td>
                  <td className={`${tableCell} max-w-md whitespace-pre-wrap text-slate-300`}>{s.comment ?? <span className="text-slate-500">Sin comentario</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ================================ ERRORES REPORTADOS ================================ */

function BugsPart({
  bugs,
  companyName,
  userOf,
  onChangeStatus,
}: {
  bugs: BugReport[];
  companyName: (id: string) => string;
  userOf: (id: string) => AppUser | undefined;
  onChangeStatus: (id: string, status: BugStatus) => Promise<string | null>;
}) {
  const [verResueltos, setVerResueltos] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState<string | null>(null);
  const visibles = verResueltos ? bugs : bugs.filter((b) => b.status !== 'resolved');

  const cambiar = async (id: string, status: BugStatus) => {
    setError(null);
    setPendiente(id);
    const fallo = await onChangeStatus(id, status);
    setPendiente(null);
    if (fallo) setError(fallo);
  };

  if (bugs.length === 0) {
    return (
      <EmptyState
        icon={Bug}
        title="No hay errores reportados"
        description="Las personas los envían con el botón del bicho, arriba a la derecha. Cuando llegue uno, lo verás aquí."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-slate-300">
          {plural(visibles.length, 'reporte', 'reportes')} {verResueltos ? '' : 'sin resolver'}
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-[15px] text-slate-200">
          <input type="checkbox" checked={verResueltos} onChange={(e) => setVerResueltos(e.target.checked)} className="h-4 w-4 accent-indigo-500" />
          Mostrar también los resueltos
        </label>
      </div>
      {error && (
        <p role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-[15px] text-rose-200">
          {error}
        </p>
      )}
      {visibles.length === 0 && <p className="py-8 text-center text-[15px] text-slate-400">No queda ningún error sin resolver.</p>}
      <ul className="space-y-3" aria-label="Errores reportados">
        {visibles.map((b) => {
          const persona = userOf(b.userId);
          return (
            <li key={b.id} data-estado={b.status} className={`${cardClass} p-5 ${b.status === 'new' ? '!border-amber-500/40' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-slate-100">
                    {persona?.fullName ?? 'Usuario eliminado'} <span className="font-normal text-slate-400">· {companyName(b.companyId)}</span>
                  </p>
                  <p className="mt-0.5 text-sm text-slate-400">
                    {new Date(b.createdAt).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}
                    {b.page ? ` · en ${PAGE_LABEL[b.page] ?? b.page}` : ''}
                  </p>
                </div>
                <Pill tone={b.status === 'new' ? 'amber' : b.status === 'seen' ? 'indigo' : 'green'}>{BUG_STATUS_LABEL[b.status]}</Pill>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-[15px] text-slate-200">{b.description}</p>
              {b.userAgent && <p className="mt-2 truncate text-xs text-slate-500" title={b.userAgent}>{b.userAgent}</p>}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {b.status === 'new' && (
                  <button type="button" disabled={pendiente === b.id} onClick={() => void cambiar(b.id, 'seen')} className={secondaryButton}>
                    <Eye className="h-4 w-4" />
                    Marcar como visto
                  </button>
                )}
                {b.status !== 'resolved' && (
                  <button type="button" disabled={pendiente === b.id} onClick={() => void cambiar(b.id, 'resolved')} className={secondaryButton}>
                    <CheckCircle2 className="h-4 w-4" />
                    Resuelto
                  </button>
                )}
                {b.status === 'resolved' && (
                  <button type="button" disabled={pendiente === b.id} onClick={() => void cambiar(b.id, 'new')} className={secondaryButton}>
                    <RotateCcw className="h-4 w-4" />
                    Reabrir
                  </button>
                )}
                {pendiente === b.id && <Loader2 className="h-4 w-4 animate-spin text-indigo-300" aria-label="Guardando" />}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
