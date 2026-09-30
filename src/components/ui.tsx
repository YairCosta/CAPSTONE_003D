import React, { useEffect } from 'react';
import type { LucideIcon } from 'lucide-react';
import { X } from 'lucide-react';

export type PillTone = 'green' | 'red' | 'amber' | 'indigo' | 'slate';

const PILL_TONES: Record<PillTone, string> = {
  green: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  red: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  amber: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  indigo: 'border-indigo-500/30 bg-indigo-500/10 text-indigo-300',
  slate: 'border-slate-600 bg-slate-800 text-slate-300',
};

export const Pill: React.FC<{ tone: PillTone; children: React.ReactNode }> = ({ tone, children }) => (
  <span
    className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[13px] font-semibold ${PILL_TONES[tone]}`}
  >
    {children}
  </span>
);

interface ActiveSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

export const ActiveSwitch: React.FC<ActiveSwitchProps> = ({ checked, onChange, label, disabled }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    title={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
      checked ? 'bg-emerald-500' : 'bg-slate-600'
    }`}
  >
    <span
      className={`inline-block h-5 w-5 rounded-full bg-[#fff] shadow transition-transform ${
        checked ? 'translate-x-6' : 'translate-x-1'
      }`}
    />
  </button>
);

// Marca discreta para valores ingresados a mano (no calculados desde productos/servicios)
export const ManualValueTag: React.FC = () => (
  <span
    title="Valor ingresado manualmente: no se calcula desde los productos y servicios del lead"
    className="ml-1.5 inline-flex items-center rounded border border-slate-600 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400"
  >
    manual
  </span>
);

interface ModalProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'md' | 'lg';
}

export const Modal: React.FC<ModalProps> = ({ title, subtitle, onClose, children, footer, size = 'md' }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[90vh] w-full ${size === 'lg' ? 'max-w-3xl' : 'max-w-xl'} flex-col rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-700 px-6 py-4">
          <div>
            <h3 className="text-lg font-bold text-slate-100">{title}</h3>
            {subtitle && <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-700 px-6 py-4">{footer}</div>
        )}
      </div>
    </div>
  );
};

interface PageHeaderProps {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ icon: Icon, eyebrow, title, description, actions }) => (
  <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-700 bg-slate-900 p-6">
    <div className="flex items-start gap-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm font-bold uppercase tracking-wider text-indigo-400">{eyebrow}</p>
        <h2 className="mt-0.5 text-2xl font-extrabold text-slate-100">{title}</h2>
        <p className="mt-1 max-w-2xl text-[15px] text-slate-400">{description}</p>
      </div>
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

interface SectionTab<T extends string> {
  id: T;
  label: string;
  icon: LucideIcon;
  count?: number;
  highlight?: boolean;
}

export function SectionTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: SectionTab<T>[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 text-[15px] font-semibold transition ${
              isActive
                ? 'border-indigo-500 bg-indigo-600 text-[#fff]'
                : 'border-slate-600 bg-slate-900 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Icon className="h-4.5 w-4.5" />
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                  isActive
                    ? 'bg-[#fff]/20 text-[#fff]'
                    : tab.highlight
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-slate-800 text-slate-300'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export const EmptyState: React.FC<{ icon: LucideIcon; title: string; description: string }> = ({
  icon: Icon,
  title,
  description,
}) => (
  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-600 px-6 py-14 text-center">
    <Icon className="h-10 w-10 text-slate-400" />
    <p className="mt-3 text-lg font-bold text-slate-200">{title}</p>
    <p className="mt-1 max-w-md text-[15px] text-slate-400">{description}</p>
  </div>
);
