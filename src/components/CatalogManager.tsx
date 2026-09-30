import React, { useMemo, useState } from 'react';
import { Package, Wrench, Plus, Pencil, Search, Trash2, Boxes } from 'lucide-react';
import type { BillingType, CatalogItem, CatalogItemType, Lead, NewCatalogItem } from '../types/crm';
import { COUNTRIES, type CountryCode } from '../data/countries';
import { CURRENCIES, formatMoney } from '../lib/currency';
import { ITEM_TYPE_LABEL, suggestedCatalogPrice } from '../lib/catalog';
import { useMoney } from '../lib/money';
import { cardClass, inputClass, labelClass, primaryButton, secondaryButton, tableCell, tableHeadRow } from '../lib/styles';
import { ActiveSwitch, EmptyState, Modal, Pill } from './ui';
import { TYPE_ICON } from './catalogIcons';

type TypeFilter = 'all' | CatalogItemType;

interface CatalogManagerProps {
  catalog: CatalogItem[];
  leads: Lead[]; // leads visibles, para contar el uso de cada ítem
  usedItemIds: Set<string>; // ítems usados en cualquier lead del CRM (no se pueden eliminar)
  countries: CountryCode[]; // países habilitados: un precio por país
  onCreate: (item: NewCatalogItem) => void;
  onUpdate: (item: CatalogItem) => void;
  onDelete: (itemId: string) => void;
}

export const CatalogManager: React.FC<CatalogManagerProps> = ({
  catalog,
  leads,
  usedItemIds,
  countries,
  onCreate,
  onUpdate,
  onDelete,
}) => {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<CatalogItem | 'new' | null>(null);
  const [deleting, setDeleting] = useState<CatalogItem | null>(null);

  const usage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const lead of leads) for (const line of lead.items ?? []) counts.set(line.itemId, (counts.get(line.itemId) ?? 0) + 1);
    return counts;
  }, [leads]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog
      .filter((item) => typeFilter === 'all' || item.type === typeFilter)
      .filter((item) => !q || [item.name, item.sku, item.category].filter(Boolean).join(' ').toLowerCase().includes(q))
      .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name, 'es'));
  }, [catalog, typeFilter, query]);

  const countOf = (type: CatalogItemType) => catalog.filter((i) => i.type === type).length;
  const filters: { id: TypeFilter; label: string; count: number; icon: typeof Package }[] = [
    { id: 'all', label: 'Todos', count: catalog.length, icon: Boxes },
    { id: 'product', label: 'Productos', count: countOf('product'), icon: Package },
    { id: 'service', label: 'Servicios', count: countOf('service'), icon: Wrench },
  ];

  return (
    <div className={cardClass}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 p-5">
        <div>
          <h3 className="text-lg font-bold text-slate-100">Catálogo de productos y servicios</h3>
          <p className="text-sm text-slate-400">
            Se agregan a los leads para calcular su valor y medir qué se vende más y dónde.
          </p>
        </div>
        <button type="button" onClick={() => setEditing('new')} className={primaryButton}>
          <Plus className="h-5 w-5" />
          Nuevo producto o servicio
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 px-5 py-3">
        <div className="flex gap-1 rounded-xl border border-slate-600 bg-slate-950/60 p-1" role="group" aria-label="Tipo de ítem">
          {filters.map((f) => {
            const Icon = f.icon;
            const active = typeFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={active}
                onClick={() => setTypeFilter(f.id)}
                className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-3.5 py-2 text-[15px] font-semibold transition ${
                  active ? 'bg-indigo-600 text-[#fff]' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Icon className="h-4 w-4" />
                {f.label}
                <span className={`rounded-full px-1.5 text-xs font-bold ${active ? 'bg-[#fff]/20' : 'bg-slate-800 text-slate-400'}`}>
                  {f.count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nombre, código o categoría..."
            aria-label="Buscar en el catálogo"
            className={`${inputClass} w-64! pl-10`}
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="p-5">
          <EmptyState icon={Boxes} title="Sin resultados" description="No hay productos ni servicios que coincidan." />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[15px]">
            <thead>
              <tr className={tableHeadRow}>
                <th className={tableCell}>Producto / servicio</th>
                <th className={tableCell}>Tipo</th>
                <th className={tableCell}>Precio sugerido</th>
                <th className={tableCell}>Leads</th>
                <th className={tableCell}>Estado</th>
                <th className={`${tableCell} text-right`}>Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/70">
              {rows.map((item) => {
                const Icon = TYPE_ICON[item.type];
                const used = usedItemIds.has(item.id);
                return (
                  <tr key={item.id} className={item.isActive ? '' : 'bg-slate-950/40'}>
                    <td className={tableCell}>
                      <div className={`font-semibold ${item.isActive ? 'text-slate-100' : 'text-slate-400'}`}>{item.name}</div>
                      <div className="text-sm text-slate-400">
                        {[item.sku, item.category].filter(Boolean).join(' · ') || 'Sin código ni categoría'}
                      </div>
                    </td>
                    <td className={tableCell}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Pill tone={item.type === 'product' ? 'indigo' : 'green'}>
                          <Icon className="h-3.5 w-3.5" />
                          {ITEM_TYPE_LABEL[item.type].singular}
                        </Pill>
                        {item.billing === 'monthly' && <Pill tone="slate">Mensual</Pill>}
                      </div>
                    </td>
                    <td className={`${tableCell} tabular-nums text-slate-200`}>
                      {countries
                        .filter((code) => item.prices[code] !== undefined)
                        .map((code) => formatMoney(item.prices[code] ?? 0, COUNTRIES[code].currency))
                        .join(' · ') || <span className="text-slate-400">Sin precio</span>}
                    </td>
                    <td className={`${tableCell} tabular-nums text-slate-300`}>{usage.get(item.id) ?? 0}</td>
                    <td className={tableCell}>
                      <div className="flex items-center gap-2.5">
                        <ActiveSwitch
                          checked={item.isActive}
                          onChange={(isActive) => onUpdate({ ...item, isActive })}
                          label={item.isActive ? `Desactivar ${item.name}` : `Activar ${item.name}`}
                        />
                        <span className={`text-sm font-semibold ${item.isActive ? 'text-emerald-300' : 'text-slate-400'}`}>
                          {item.isActive ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                    </td>
                    <td className={`${tableCell} text-right`}>
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setEditing(item)} className={`${secondaryButton} px-3 py-2 text-sm`}>
                          <Pencil className="h-4 w-4" />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(item)}
                          disabled={used}
                          title={used ? 'Está en leads: desactívalo en vez de eliminarlo' : `Eliminar ${item.name}`}
                          aria-label={`Eliminar ${item.name}`}
                          className={`${secondaryButton} px-3 py-2 text-sm text-rose-300`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <CatalogItemModal
          item={editing === 'new' ? null : editing}
          defaultType={typeFilter === 'service' ? 'service' : 'product'}
          existingNames={catalog.filter((i) => editing === 'new' || i.id !== editing.id).map((i) => i.name.toLowerCase())}
          categories={Array.from(new Set(catalog.map((i) => i.category).filter((c): c is string => !!c))).sort()}
          countries={countries}
          onClose={() => setEditing(null)}
          onSave={(data) => {
            if (editing === 'new') onCreate(data);
            else onUpdate({ ...editing, ...data });
            setEditing(null);
          }}
        />
      )}

      {deleting && (
        <Modal
          title="Eliminar del catálogo"
          subtitle={deleting.name}
          onClose={() => setDeleting(null)}
          footer={
            <>
              <button type="button" onClick={() => setDeleting(null)} className={secondaryButton}>
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onDelete(deleting.id);
                  setDeleting(null);
                }}
                className={`${primaryButton} bg-rose-600! hover:bg-rose-500!`}
              >
                <Trash2 className="h-4 w-4" />
                Eliminar
              </button>
            </>
          }
        >
          <p className="text-[15px] text-slate-300">No está en ningún lead. Se eliminará definitivamente del catálogo. ¿Continuar?</p>
        </Modal>
      )}
    </div>
  );
};

function CatalogItemModal({
  item,
  defaultType,
  existingNames,
  categories,
  countries,
  onClose,
  onSave,
}: {
  item: CatalogItem | null;
  defaultType: CatalogItemType;
  existingNames: string[];
  categories: string[];
  countries: CountryCode[];
  onClose: () => void;
  onSave: (data: NewCatalogItem) => void;
}) {
  const [type, setType] = useState<CatalogItemType>(item?.type ?? defaultType);
  const [name, setName] = useState(item?.name ?? '');
  const [sku, setSku] = useState(item?.sku ?? '');
  const [category, setCategory] = useState(item?.category ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [billing, setBilling] = useState<BillingType>(item?.billing ?? 'one_time');
  const [isActive, setIsActive] = useState(item?.isActive ?? true);
  const [prices, setPrices] = useState<Partial<Record<CountryCode, string>>>(() =>
    Object.fromEntries(countries.map((c) => [c, item?.prices[c] !== undefined ? String(item.prices[c]) : '']))
  );
  const [showErrors, setShowErrors] = useState(false);
  const { rates, info } = useMoney();

  const trimmed = name.trim();
  const nameError = !trimmed
    ? 'El nombre es obligatorio.'
    : existingNames.includes(trimmed.toLowerCase())
      ? 'Ya existe otro ítem con ese nombre.'
      : null;
  const invalidPrice = countries.some((c) => prices[c] !== '' && prices[c] !== undefined && !(Number(prices[c]) >= 0));

  const submit = () => {
    setShowErrors(true);
    if (nameError || invalidPrice) return;
    const parsedPrices: CatalogItem['prices'] = { ...(item?.prices ?? {}) };
    for (const code of countries) {
      if (prices[code] === '' || prices[code] === undefined) delete parsedPrices[code];
      else parsedPrices[code] = Number(prices[code]);
    }
    onSave({
      type,
      name: trimmed,
      sku: sku.trim() || undefined,
      category: category.trim() || undefined,
      description: description.trim() || undefined,
      billing: type === 'service' ? billing : undefined,
      prices: parsedPrices,
      isActive,
    });
  };

  const typeButton = (value: CatalogItemType) => {
    const Icon = TYPE_ICON[value];
    const active = type === value;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={active}
        onClick={() => setType(value)}
        className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border px-4 py-3 text-[15px] font-semibold transition ${
          active ? 'border-indigo-500 bg-indigo-500/10 text-indigo-200' : 'border-slate-600 text-slate-300 hover:bg-slate-800'
        }`}
      >
        <Icon className="h-5 w-5" />
        {ITEM_TYPE_LABEL[value].singular}
      </button>
    );
  };

  return (
    <Modal
      title={item ? 'Editar producto o servicio' : 'Nuevo producto o servicio'}
      subtitle="El precio es sugerido: al agregarlo a un lead se puede ajustar."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancelar
          </button>
          <button type="submit" form="catalog-form" className={primaryButton}>
            {item ? 'Guardar cambios' : 'Crear'}
          </button>
        </>
      }
    >
      <form
        id="catalog-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <div className="flex gap-2 sm:col-span-2" role="radiogroup" aria-label="Tipo">
          {typeButton('product')}
          {typeButton('service')}
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="cat-name" className={labelClass}>Nombre *</label>
          <input
            id="cat-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={showErrors && !!nameError}
            className={`${inputClass} ${showErrors && nameError ? 'border-rose-500! ring-2! ring-rose-500/30!' : ''}`}
          />
          {showErrors && nameError && <p className="mt-1 text-sm font-medium text-rose-300">{nameError}</p>}
        </div>
        <div>
          <label htmlFor="cat-sku" className={labelClass}>Código (SKU)</label>
          <input id="cat-sku" value={sku} onChange={(e) => setSku(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="cat-category" className={labelClass}>Categoría</label>
          <input id="cat-category" list="cat-categories" value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass} />
          <datalist id="cat-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
        {type === 'service' && (
          <div className="sm:col-span-2">
            <label htmlFor="cat-billing" className={labelClass}>Cobro del servicio</label>
            <select id="cat-billing" value={billing} onChange={(e) => setBilling(e.target.value as BillingType)} className={inputClass}>
              <option value="one_time">Pago único</option>
              <option value="monthly">Mensual</option>
            </select>
          </div>
        )}
        <fieldset className="sm:col-span-2">
          <legend className={labelClass}>Precio sugerido por país</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {countries.map((code) => {
              const currency = COUNTRIES[code].currency;
              // Solo una referencia en gris: no llena el campo ni se guarda
              const sugerido = suggestedCatalogPrice(prices, countries, code, rates);
              return (
                <div key={code}>
                  <label htmlFor={`cat-price-${code}`} className="mb-1 block text-sm text-slate-400">
                    {COUNTRIES[code].name} ({CURRENCIES[currency].symbol} {currency})
                  </label>
                  <input
                    id={`cat-price-${code}`}
                    type="number"
                    min="0"
                    value={prices[code] ?? ''}
                    onChange={(e) => setPrices((p) => ({ ...p, [code]: e.target.value }))}
                    placeholder="Sin precio"
                    aria-describedby={sugerido ? `cat-price-${code}-sugerido` : undefined}
                    className={inputClass}
                  />
                  {sugerido && (
                    <p id={`cat-price-${code}-sugerido`} className="mt-1 text-sm text-slate-500">
                      Sugerido: ≈ {formatMoney(sugerido.amount, currency)} · convertido desde {COUNTRIES[sugerido.from].name}
                      {info.live ? '' : ' (tasa de respaldo)'}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          {showErrors && invalidPrice && <p className="mt-1 text-sm font-medium text-rose-300">Los precios no pueden ser negativos.</p>}
        </fieldset>
        <div className="sm:col-span-2">
          <label htmlFor="cat-description" className={labelClass}>Descripción</label>
          <textarea id="cat-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
        </div>
        <div className="flex items-center gap-3 sm:col-span-2">
          <ActiveSwitch checked={isActive} onChange={setIsActive} label="Ítem activo" />
          <span className="text-[15px] text-slate-300">Activo (se puede agregar a nuevos leads)</span>
        </div>
      </form>
    </Modal>
  );
}
