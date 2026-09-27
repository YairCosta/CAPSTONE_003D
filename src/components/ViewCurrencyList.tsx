import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { COUNTRIES, type CountryCode, type CurrencyCode } from '../data/countries';
import { CURRENCIES, fixedViewCurrencies, leadCurrenciesFor } from '../lib/currency';
import { ActiveSwitch } from './ui';

interface ViewCurrencyListProps {
  homeCountry: CountryCode;
  /** Países activos del CRM: cada uno ofrece su moneda */
  countries: CountryCode[];
  /** Divisas que hoy ofrece el selector de moneda */
  viewCurrencies: CurrencyCode[];
  onSetViewCurrency: (currency: CurrencyCode, enabled: boolean) => Promise<string | null> | string | null;
  /** Qué hacer para sumar otra divisa cuando no hay más países activos */
  emptyHint: string;
}

// Divisas en que se puede VER el CRM: la del país base y el dólar siempre; la gerencia suma la de sus
// otros países activos. Se usa en Gerencia → Países y divisas y en el botón "$" del encabezado.
export const ViewCurrencyList: React.FC<ViewCurrencyListProps> = ({ homeCountry, countries, viewCurrencies, onSetViewCurrency, emptyHint }) => {
  const [pendiente, setPendiente] = useState<CurrencyCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fijas = fixedViewCurrencies(homeCountry);
  const opcionales = leadCurrenciesFor(countries)
    .filter((c) => !fijas.includes(c))
    .sort((a, b) => CURRENCIES[a].name.localeCompare(CURRENCIES[b].name, 'es'));
  const paisesDe = (currency: CurrencyCode) =>
    countries
      .filter((c) => COUNTRIES[c].currency === currency)
      .map((c) => COUNTRIES[c].name)
      .join(', ');

  const cambiar = async (currency: CurrencyCode, enabled: boolean) => {
    setError(null);
    setPendiente(currency);
    const resultado = await onSetViewCurrency(currency, enabled);
    setPendiente(null);
    if (resultado) setError(resultado);
  };

  const fila = (currency: CurrencyCode, fija: boolean) => {
    const activa = fija || viewCurrencies.includes(currency);
    const donde = paisesDe(currency);
    return (
      <li key={currency} className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-950/40 px-3 py-2.5">
        <span className="w-12 shrink-0 text-[15px] font-bold text-slate-100">{currency}</span>
        <span className="min-w-0 flex-1 text-[13px] text-slate-400">
          <span className="block truncate text-slate-200">{CURRENCIES[currency].name}</span>
          {fija ? 'Siempre disponible' : donde}
        </span>
        {pendiente === currency ? (
          <Loader2 className="h-5 w-5 animate-spin text-indigo-300" aria-label={`Guardando ${currency}`} />
        ) : (
          <ActiveSwitch
            checked={activa}
            disabled={fija || pendiente !== null}
            label={
              fija
                ? `${currency} siempre está disponible`
                : `${activa ? `Quitar ${currency} de` : `Agregar ${currency} a`} las divisas para ver el CRM`
            }
            onChange={(on) => void cambiar(currency, on)}
          />
        )}
      </li>
    );
  };

  return (
    <div>
      {error && (
        <p role="alert" className="mb-3 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      )}
      <ul className="grid gap-2" aria-label="Divisas para ver el CRM">
        {fijas.map((c) => fila(c, true))}
        {opcionales.map((c) => fila(c, false))}
      </ul>
      {opcionales.length === 0 && <p className="mt-3 text-sm text-slate-400">{emptyHint}</p>}
    </div>
  );
};
