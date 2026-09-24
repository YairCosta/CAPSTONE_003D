import React, { useMemo, useState } from 'react';
import { AlertTriangle, FileDown, FileText, Scale, ShieldCheck } from 'lucide-react';
import expediente from '../data/expedienteCumplimiento.json';
import { cardClass, inputClass, labelClass, secondaryButton, tableCell, tableHeadRow } from '../lib/styles';
import { EmptyState, Pill, type PillTone } from './ui';

// Portal fiscalizador: vista de SOLO LECTURA del expediente de cumplimiento.
// Muestra artículo → aplicabilidad → estado → hechos → evidencia, los hallazgos, las limitaciones y
// el manifiesto con hashes. Nunca muestra datos personales, secretos ni datos de un CRM cliente:
// lo que se ve viene de docs/cumplimiento/, que no los contiene.
// Ver docs/cumplimiento/revela-2026-09/ y la guía del portal en la skill compliance-chile-guardian.

const ESTADO_TONE: Record<string, PillTone> = {
  PROBADO_CON_EVIDENCIA_VIGENTE: 'green',
  CODIGO_NO_DESPLEGADO: 'indigo',
  CONFIGURADO_NO_PROBADO: 'indigo',
  DOCUMENTADO_SIN_IMPLEMENTAR: 'amber',
  REQUIERE_CRITERIO_JURIDICO: 'amber',
  NO_IMPLEMENTADO: 'red',
  PRUEBA_FALLIDA: 'red',
  NO_VERIFICABLE: 'red',
  NO_APLICA_JUSTIFICADO: 'slate',
  NO_EVALUADO: 'red',
};

const SEVERIDAD_TONE: Record<string, PillTone> = { Alta: 'red', Media: 'amber', Baja: 'slate' };

interface ComplianceModuleProps {
  /** Quién está mirando: queda en el registro de accesos */
  viewerName: string;
  accessLog: { at: string; who: string; what: string }[];
  onRecordAccess: (what: string) => void;
}

export const ComplianceModule: React.FC<ComplianceModuleProps> = ({ viewerName, accessLog, onRecordAccess }) => {
  const [estado, setEstado] = useState('all');
  const [query, setQuery] = useState('');

  const disposiciones = useMemo(() => {
    const q = query.trim().toLowerCase();
    return expediente.disposiciones.filter(
      (d) =>
        (estado === 'all' || d.estado === estado) &&
        (!q || `${d.provision} ${d.resumen} ${d.hechos}`.toLowerCase().includes(q))
    );
  }, [estado, query]);

  const descargar = () => {
    const blob = new Blob([JSON.stringify(expediente, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `expediente_${expediente.caso.id}_${new Date().toISOString().slice(0, 10)}.json`;
    enlace.click();
    URL.revokeObjectURL(url);
    onRecordAccess('Descargó el expediente completo');
  };

  return (
    <div className="space-y-6">
      <div className={`${cardClass} p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-black text-slate-100">
              <Scale className="h-5 w-5 text-indigo-400" />
              Expediente de cumplimiento · {expediente.caso.id}
            </h2>
            <p className="mt-1 text-[15px] text-slate-400">
              {expediente.caso.entidad} · escenario {expediente.caso.escenario} · corte{' '}
              {new Date(expediente.caso.corteUtc).toLocaleDateString('es-CL')} · custodio {expediente.caso.custodio}
            </p>
          </div>
          <button type="button" onClick={descargar} className={secondaryButton}>
            <FileDown className="h-4 w-4" />
            Entregar al fiscalizador
          </button>
        </div>

        <p role="note" className="mt-4 flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[15px] text-amber-200">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{expediente.aviso}</span>
        </p>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-[15px] sm:grid-cols-4">
          <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-3">
            <dt className="text-sm text-slate-400">Disposiciones evaluadas</dt>
            <dd className="text-2xl font-black text-slate-100">{expediente.resumen.disposiciones}</dd>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-3">
            <dt className="text-sm text-slate-400">Sin evaluar</dt>
            <dd className="text-2xl font-black text-slate-100">{expediente.resumen.sinEvaluar}</dd>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-3">
            <dt className="text-sm text-slate-400">Hallazgos abiertos</dt>
            <dd className="text-2xl font-black text-slate-100">{expediente.hallazgos.length}</dd>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-3">
            <dt className="text-sm text-slate-400">Norma</dt>
            <dd className="text-[15px] font-semibold text-slate-200">
              {expediente.vigencia.estado} · rige el{' '}
              {new Date(`${expediente.vigencia.vigenciaGeneral}T00:00:00`).toLocaleDateString('es-CL')}
            </dd>
          </div>
        </dl>
        <p className="mt-2 text-sm text-slate-400">{expediente.vigencia.nota}</p>
      </div>

      {/* Matriz artículo por artículo */}
      <div className={cardClass}>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-700 p-4">
          <div className="min-w-[14rem] flex-1">
            <label htmlFor="pf-buscar" className={labelClass}>
              Buscar en la matriz
            </label>
            <input
              id="pf-buscar"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Artículo, materia o hecho"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="pf-estado" className={labelClass}>
              Estado
            </label>
            <select id="pf-estado" value={estado} onChange={(e) => setEstado(e.target.value)} className={inputClass}>
              <option value="all">Todos</option>
              {expediente.resumen.porEstado.map((e) => (
                <option key={e.clave} value={e.clave}>
                  {e.clave} ({e.total})
                </option>
              ))}
            </select>
          </div>
          <p className="pb-2 text-sm text-slate-400">{disposiciones.length} de {expediente.resumen.disposiciones}</p>
        </div>

        {disposiciones.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={FileText} title="Sin resultados" description="Ninguna disposición coincide." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[15px]">
              <thead>
                <tr className={tableHeadRow}>
                  <th className={tableCell}>Disposición</th>
                  <th className={tableCell}>Aplicabilidad</th>
                  <th className={tableCell}>Estado</th>
                  <th className={tableCell}>Hechos y evidencia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/70">
                {disposiciones.map((d) => (
                  <tr key={d.id}>
                    <td className={tableCell}>
                      <div className="font-semibold text-slate-100">{d.provision}</div>
                      <div className="text-sm text-slate-400">{d.resumen}</div>
                    </td>
                    <td className={`${tableCell} text-slate-300`}>{d.aplicabilidad}</td>
                    <td className={tableCell}>
                      <Pill tone={ESTADO_TONE[d.estado] ?? 'slate'}>{d.estado}</Pill>
                    </td>
                    <td className={tableCell}>
                      <p className="text-slate-300">{d.hechos}</p>
                      {d.evidencia && <p className="mt-1 text-sm text-slate-400">Evidencia: {d.evidencia}</p>}
                      {d.riesgo && <p className="mt-1 text-sm text-amber-300">Riesgo residual: {d.riesgo}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Hallazgos */}
      <div className={`${cardClass} p-5`}>
        <h3 className="flex items-center gap-2 text-lg font-black text-slate-100">
          <ShieldCheck className="h-5 w-5 text-indigo-400" />
          Hallazgos y remediación
        </h3>
        <ul className="mt-3 space-y-3">
          {expediente.hallazgos.map((h) => (
            <li key={h.id} className="rounded-xl border border-slate-700 bg-slate-950/40 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={SEVERIDAD_TONE[h.severidad] ?? 'slate'}>{h.severidad}</Pill>
                <span className="font-semibold text-slate-100">
                  {h.id} · {h.titulo}
                </span>
              </div>
              {h.requisito && <p className="mt-1 text-sm text-slate-400">Requisito: {h.requisito}</p>}
              {h.hecho && <p className="mt-1 text-[15px] text-slate-300">{h.hecho}</p>}
              {h.remediacion && <p className="mt-1 text-[15px] text-indigo-300">Remediación: {h.remediacion}</p>}
            </li>
          ))}
        </ul>
      </div>

      {/* Limitaciones y manifiesto */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className={`${cardClass} p-5`}>
          <h3 className="text-lg font-black text-slate-100">Limitaciones declaradas</h3>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] text-slate-300">
            {expediente.limitaciones.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>

        <div className={`${cardClass} p-5`}>
          <h3 className="text-lg font-black text-slate-100">Manifiesto del expediente</h3>
          <p className="mt-1 text-sm text-slate-400">
            {expediente.manifiesto.length} archivos · generado el{' '}
            {new Date(expediente.generadoUtc).toLocaleString('es-CL')}
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {expediente.manifiesto.map((m) => (
              <li key={m.archivo} className="flex flex-wrap justify-between gap-2 border-b border-slate-800 pb-1">
                <span className="text-slate-300">{m.archivo}</span>
                <span className="font-mono text-xs text-slate-500">{m.sha256.slice(0, 16)}…</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Registro de accesos: la vista y la descarga se registran */}
      <div className={`${cardClass} p-5`}>
        <h3 className="text-lg font-black text-slate-100">Registro de accesos a este expediente</h3>
        <p className="mt-1 text-sm text-slate-400">
          Cada vista y cada descarga queda registrada. En producción este registro vive en una tabla que
          solo se agrega, igual que la auditoría del CRM.
        </p>
        <ul className="mt-3 space-y-1 text-[15px] text-slate-300">
          {accessLog.length === 0 ? (
            <li className="text-slate-400">Sin accesos registrados en esta sesión.</li>
          ) : (
            accessLog.map((a, i) => (
              <li key={`${a.at}-${i}`}>
                {new Date(a.at).toLocaleString('es-CL')} · {a.who} · {a.what}
              </li>
            ))
          )}
        </ul>
        <p className="mt-3 text-sm text-slate-500">Sesión de {viewerName}.</p>
      </div>
    </div>
  );
};
