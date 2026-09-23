import React from 'react';
import { Globe2, Check } from 'lucide-react';
import { COUNTRIES, type CountryCode } from '../data/countries';
import { CountryFlag } from './CountryFlag';

interface CountryBarProps {
  enabledCountries: CountryCode[];
  selectedCountries: CountryCode[];
  onChange: (countries: CountryCode[]) => void;
  counts: Partial<Record<CountryCode, number>>;
}

// Selector de países del plan Internacional: filtra todos los módulos (KPI, mapa, pipeline, contactos, gerencia, estados)
export const CountryBar: React.FC<CountryBarProps> = ({ enabledCountries, selectedCountries, onChange, counts }) => {
  if (enabledCountries.length < 2) return null;

  const allSelected = selectedCountries.length === enabledCountries.length;

  const toggle = (code: CountryCode) => {
    const isSelected = selectedCountries.includes(code);
    // Siempre queda al menos un país seleccionado
    if (isSelected && selectedCountries.length === 1) return;
    const next = isSelected ? selectedCountries.filter((c) => c !== code) : [...selectedCountries, code];
    onChange(enabledCountries.filter((c) => next.includes(c)));
  };

  return (
    <section
      aria-label="Filtro de países"
      className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3"
    >
      <span className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-indigo-400">
        <Globe2 className="h-4 w-4" />
        Plan Internacional
      </span>
      <span className="hidden text-sm text-slate-400 sm:inline">Países visibles:</span>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Países">
        {enabledCountries.map((code) => {
          const country = COUNTRIES[code];
          const isSelected = selectedCountries.includes(code);
          const isLast = isSelected && selectedCountries.length === 1;
          return (
            <button
              key={code}
              type="button"
              onClick={() => toggle(code)}
              aria-pressed={isSelected}
              title={isLast ? 'Debe quedar al menos un país seleccionado' : undefined}
              className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-1.5 text-[15px] font-semibold transition ${
                isSelected
                  ? 'border-indigo-500 bg-indigo-500/10 text-slate-100'
                  : 'border-slate-600 text-slate-400 hover:bg-slate-800'
              }`}
            >
              {isSelected ? <Check className="h-4 w-4 text-indigo-400" /> : <span className="h-4 w-4" />}
              <CountryFlag code={code} />
              {country.name}
              <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-bold text-slate-300">{counts[code] ?? 0}</span>
            </button>
          );
        })}
      </div>

      {!allSelected && (
        <button
          type="button"
          onClick={() => onChange(enabledCountries)}
          className="cursor-pointer rounded-lg px-2.5 py-1.5 text-sm font-semibold text-indigo-300 hover:bg-indigo-500/10"
        >
          Ver todos
        </button>
      )}
    </section>
  );
};
