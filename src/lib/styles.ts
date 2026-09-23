// Clases compartidas para formularios, botones y tablas de los módulos de gestión

export const inputClass =
  'w-full rounded-xl border border-slate-600 bg-slate-950/70 px-3.5 py-2.5 text-[15px] text-slate-100 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-60';

export const labelClass = 'mb-1.5 block text-sm font-semibold text-slate-300';

export const primaryButton =
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-[15px] font-semibold text-[#fff] shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50';

export const secondaryButton =
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-600 bg-slate-900 px-4 py-2.5 text-[15px] font-semibold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50';

export const cardClass = 'rounded-2xl border border-slate-700 bg-slate-900';

export const tableHeadRow =
  'border-b border-slate-700 bg-slate-950/50 text-left text-[13px] font-bold uppercase tracking-wider text-slate-400';

export const tableCell = 'px-4 py-3.5 align-middle';

export const formatCLP = (value: number) => `$${value.toLocaleString('es-CL')}`;

export const formatDate = (iso?: string) =>
  iso
    ? new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';
