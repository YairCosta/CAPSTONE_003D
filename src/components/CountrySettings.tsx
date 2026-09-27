import React, { useState } from 'react';
import { Globe2, Info, Loader2 } from 'lucide-react';
import { COUNTRIES, COUNTRY_CODES, type CountryCode } from '../data/countries';
import { CURRENCIES } from '../lib/currency';
import { cardClass, primaryButton, secondaryButton } from '../lib/styles';
import { CountryFlag } from './CountryFlag';
import { ActiveSwitch, Modal, Pill } from './ui';

interface CountrySettingsProps {
  plan: 'national' | 'international';
  homeCountry: CountryCode;
  enabledCountries: CountryCode[];
  /** Leads por país (solo se conocen los de los países activos) */
  leadCounts: Partial<Record<CountryCode, number>>;
  onSetCountry: (code: CountryCode, enabled: boolean) => Promise<string | null> | string | null;
}

const cuantosLeads = (n = 0) => `${n} ${n === 1 ? 'lead' : 'leads'}`;

// Gerencia → Países: con el plan Internacional, la gerencia elige en qué países trabaja su CRM. Cada
// país activo suma sus zonas (comunas, municipios, cantones…), su moneda y su forma de nombrarlas.
export const CountrySettings: React.FC<CountrySettingsProps> = ({ plan, homeCountry, enabledCountries, leadCounts, onSetCountry }) => {
  const [pendiente, setPendiente] = useState<CountryCode | null>(null);
  const [confirmando, setConfirmando] = useState<CountryCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const internacional = plan === 'international';

  const cambiar = async (code: CountryCode, activar: boolean) => {
    setError(null);
    setPendiente(code);
    const resultado = await onSetCountry(code, activar);
    setPendiente(null);
    setConfirmando(null);
    if (resultado) setError(resultado);
  };

  // País base primero, después los activos y al final el resto, cada grupo en orden alfabético
  const orden = [...COUNTRY_CODES].sort((a, b) => {
    const peso = (c: CountryCode) => (c === homeCountry ? 0 : enabledCountries.includes(c) ? 1 : 2);
    return peso(a) - peso(b) || COUNTRIES[a].name.localeCompare(COUNTRIES[b].name, 'es');
  });

  return (
    <section className={`${cardClass} p-5`} aria-labelledby="paises-titulo">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="paises-titulo" className="flex items-center gap-2 text-lg font-bold text-slate-100">
            <Globe2 className="h-5 w-5 text-indigo-400" />
            Países del CRM
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Activa los países donde trabaja tu empresa. Cada país suma sus zonas y su moneda. Desactivar un país oculta sus
            datos, no los borra: vuelven a verse si lo activas de nuevo.
          </p>
        </div>
        <Pill tone={internacional ? 'indigo' : 'slate'}>
          {internacional ? `Plan Internacional · ${enabledCountries.length} de ${COUNTRY_CODES.length} países` : 'Plan Nacional'}
        </Pill>
      </div>

      {!internacional && (
        <p className="mb-4 flex items-start gap-2 rounded-xl border border-slate-600 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
          Tu CRM tiene el plan Nacional: trabaja solo en {COUNTRIES[homeCountry].name}. Para sumar países, pide el plan
          Internacional al administrador de Revela.
        </p>
      )}

      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      )}

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Países disponibles">
        {orden.map((code) => {
          const pais = COUNTRIES[code];
          const activo = code === homeCountry || enabledCountries.includes(code);
          const base = code === homeCountry;
          return (
            <li
              key={code}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                activo ? 'border-indigo-500/40 bg-indigo-500/5' : 'border-slate-700 bg-slate-950/40'
              }`}
            >
              <CountryFlag code={code} className="h-5 w-7" title={pais.name} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-[15px] font-semibold text-slate-100">
                  {pais.name}
                  {base && <Pill tone="indigo">País base</Pill>}
                </p>
                <p className="truncate text-[13px] text-slate-400">
                  {pais.zoneLabel.plural} · {CURRENCIES[pais.currency].name}
                  {activo && leadCounts[code] ? ` · ${cuantosLeads(leadCounts[code])}` : ''}
                </p>
              </div>
              {pendiente === code ? (
                <Loader2 className="h-5 w-5 animate-spin text-indigo-300" aria-label={`Guardando ${pais.name}`} />
              ) : (
                <ActiveSwitch
                  checked={activo}
                  disabled={base || !internacional || pendiente !== null}
                  label={base ? `${pais.name} es el país base` : `${activo ? 'Desactivar' : 'Activar'} ${pais.name}`}
                  onChange={(activar) => (activar || !leadCounts[code] ? void cambiar(code, activar) : setConfirmando(code))}
                />
              )}
            </li>
          );
        })}
      </ul>

      {confirmando && (
        <Modal
          title={`¿Desactivar ${COUNTRIES[confirmando].name}?`}
          onClose={() => setConfirmando(null)}
          footer={
            <>
              <button type="button" className={secondaryButton} onClick={() => setConfirmando(null)}>
                Cancelar
              </button>
              <button type="button" className={primaryButton} onClick={() => void cambiar(confirmando, false)}>
                Desactivar
              </button>
            </>
          }
        >
          <p className="text-[15px] text-slate-300">
            {leadCounts[confirmando] === 1 ? 'Su lead' : `Sus ${leadCounts[confirmando]} leads`}, empresas y zonas dejan de verse
            en todo el CRM. No se borran: vuelven a aparecer si activas {COUNTRIES[confirmando].name} otra vez.
          </p>
        </Modal>
      )}
    </section>
  );
};
