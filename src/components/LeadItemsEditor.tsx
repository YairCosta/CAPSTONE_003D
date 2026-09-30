import React from 'react';
import { Plus, Trash2, Calculator, PencilLine, Package, Wrench } from 'lucide-react';
import type { CatalogItem } from '../types/crm';
import type { CountryCode, CurrencyCode } from '../data/countries';
import { COUNTRIES } from '../data/countries';
import { CURRENCIES, convert, formatMoney, roundForCurrency } from '../lib/currency';
import { useMoney } from '../lib/money';
import { fromDraftItems, itemsSubtotal, type DraftLeadItem } from '../lib/catalog';
import { inputClass, labelClass } from '../lib/styles';
import { ManualValueTag } from './ui';

interface LeadItemsEditorProps {
  idPrefix: string;
  catalog: CatalogItem[];
  countryCode: CountryCode;
  items: DraftLeadItem[];
  onItemsChange: (items: DraftLeadItem[]) => void;
  value: string;
  onValueChange: (value: string) => void;
  isManual: boolean;
  onManualChange: (manual: boolean) => void;
  // Moneda en que se negocia el lead. Los precios del catálogo están en la moneda de cada país:
  // si el lead va en otra, el precio sugerido se convierte con la tasa del día.
  currency?: CurrencyCode;
  currencies?: CurrencyCode[];
  onCurrencyChange?: (currency: CurrencyCode) => void;
}

export const LeadItemsEditor: React.FC<LeadItemsEditorProps> = ({
  idPrefix,
  catalog,
  countryCode,
  items,
  onItemsChange,
  value,
  onValueChange,
  isManual,
  onManualChange,
  currency: currencyProp,
  currencies = [],
  onCurrencyChange,
}) => {
  const { rates } = useMoney();
  const countryCurrency = COUNTRIES[countryCode].currency;
  const currency = currencyProp ?? countryCurrency;
  const symbol = CURRENCIES[currency].symbol;
  const selectedIds = new Set(items.map((i) => i.itemId));
  // Se ofrecen los ítems activos; uno inactivo solo aparece si el lead ya lo tenía
  const options = catalog
    .filter((item) => item.isActive || selectedIds.has(item.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const products = options.filter((i) => i.type === 'product');
  const services = options.filter((i) => i.type === 'service');

  const validItems = fromDraftItems(items);
  const subtotal = itemsSubtotal(validItems);
  const hasItems = validItems.length > 0;
  const showManualInput = !hasItems || isManual;

  const updateRow = (index: number, patch: Partial<DraftLeadItem>) =>
    onItemsChange(items.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const chooseItem = (index: number, itemId: string) => {
    const item = catalog.find((i) => i.id === itemId);
    const listPrice = item?.prices[countryCode];
    const suggested =
      listPrice === undefined ? undefined : roundForCurrency(convert(listPrice, countryCurrency, currency, rates), currency);
    updateRow(index, { itemId, unitPrice: suggested !== undefined ? String(suggested) : items[index].unitPrice || '0' });
  };

  const itemLabel = (item: CatalogItem) =>
    `${item.name}${item.billing === 'monthly' ? ' (mensual)' : ''}${item.isActive ? '' : ' (inactivo)'}`;

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={`${labelClass} mb-0!`}>Productos y servicios</span>
        {onCurrencyChange && currencies.length > 1 ? (
          <label className="flex items-center gap-2 text-sm text-slate-300">
            Moneda del negocio
            <select
              id={`${idPrefix}-currency`}
              value={currency}
              onChange={(e) => onCurrencyChange(e.target.value as CurrencyCode)}
              className="rounded-lg border border-slate-600 bg-slate-950 px-2 py-1 text-sm font-semibold text-slate-100 focus:border-indigo-500 focus:outline-none"
            >
              {currencies.map((code) => (
                <option key={code} value={code}>
                  {code} · {CURRENCIES[code].name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="text-sm text-slate-400">Precios en {currency}</span>
        )}
      </div>
      {currency !== countryCurrency && (
        <p className="mb-2 text-sm text-slate-400">
          Los precios del catálogo están en {countryCurrency}: se sugieren convertidos a {currency} con la tasa del día.
          El monto queda guardado en {currency}.
        </p>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-slate-400">Sin productos ni servicios. El valor estimado se ingresa manualmente.</p>
      ) : (
        <div className="space-y-2">
          {items.map((row, index) => {
            const lineTotal = (Number(row.quantity) || 0) * (Number(row.unitPrice) || 0);
            const item = catalog.find((i) => i.id === row.itemId);
            return (
              <div key={index} className="grid grid-cols-[1fr_72px_110px_auto] items-center gap-2 max-sm:grid-cols-[1fr_72px_auto]">
                <select
                  id={`${idPrefix}-item-${index}`}
                  aria-label={`Producto o servicio ${index + 1}`}
                  value={row.itemId}
                  onChange={(e) => chooseItem(index, e.target.value)}
                  className={`${inputClass} max-sm:col-span-3`}
                >
                  <option value="">Selecciona…</option>
                  {products.length > 0 && (
                    <optgroup label="Productos">
                      {products.map((i) => (
                        <option key={i.id} value={i.id} disabled={selectedIds.has(i.id) && i.id !== row.itemId}>
                          {itemLabel(i)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {services.length > 0 && (
                    <optgroup label="Servicios">
                      {services.map((i) => (
                        <option key={i.id} value={i.id} disabled={selectedIds.has(i.id) && i.id !== row.itemId}>
                          {itemLabel(i)}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <input
                  id={`${idPrefix}-qty-${index}`}
                  aria-label="Cantidad"
                  type="number"
                  min="1"
                  step="1"
                  value={row.quantity}
                  onChange={(e) => updateRow(index, { quantity: e.target.value })}
                  className={`${inputClass} px-2!`}
                />
                <div className="relative">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">{symbol}</span>
                  <input
                    id={`${idPrefix}-price-${index}`}
                    aria-label="Precio unitario"
                    type="number"
                    min="0"
                    value={row.unitPrice}
                    onChange={(e) => updateRow(index, { unitPrice: e.target.value })}
                    className={`${inputClass} ${symbol.length > 1 ? 'pl-9!' : 'pl-6!'} pr-2!`}
                  />
                </div>
                <div className="flex items-center justify-end gap-1">
                  <span className="hidden min-w-[84px] text-right text-sm font-semibold tabular-nums text-slate-200 sm:inline" title={item ? `${row.quantity} × ${row.unitPrice}` : undefined}>
                    {formatMoney(lineTotal, currency)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onItemsChange(items.filter((_, i) => i !== index))}
                    aria-label={`Quitar ${item?.name ?? 'fila'}`}
                    className="cursor-pointer rounded-lg p-2 text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => onItemsChange([...items, { itemId: '', quantity: '1', unitPrice: '' }])}
        disabled={options.length === 0}
        title={options.length === 0 ? 'El catálogo no tiene productos ni servicios activos' : undefined}
        className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-indigo-300 transition hover:bg-indigo-500/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus className="h-4 w-4" />
        Agregar producto o servicio
        <span className="flex items-center gap-0.5 text-slate-500" aria-hidden>
          <Package className="h-3.5 w-3.5" />
          <Wrench className="h-3.5 w-3.5" />
        </span>
      </button>

      {/* Valor estimado: calculado desde los ítems o manual */}
      <div className="mt-3 border-t border-slate-700 pt-3">
        <label htmlFor={`${idPrefix}-value`} className={`${labelClass} flex items-center`}>
          Valor estimado ({currency})
          {showManualInput && <ManualValueTag />}
        </label>

        {showManualInput ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              id={`${idPrefix}-value`}
              type="number"
              min="0"
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
              placeholder="0"
              className={`${inputClass} max-w-[220px]`}
            />
            {hasItems && (
              <button
                type="button"
                onClick={() => onManualChange(false)}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-indigo-300 hover:bg-indigo-500/10"
              >
                <Calculator className="h-4 w-4" />
                Usar total de ítems ({formatMoney(subtotal, currency)})
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <output id={`${idPrefix}-value`} className="text-xl font-black tabular-nums text-slate-100">
              {formatMoney(subtotal, currency)}
            </output>
            <span className="text-sm text-slate-400">Calculado desde los ítems</span>
            <button
              type="button"
              onClick={() => {
                onValueChange(String(subtotal));
                onManualChange(true);
              }}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-300 hover:bg-slate-800"
            >
              <PencilLine className="h-4 w-4" />
              Editar manualmente
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
