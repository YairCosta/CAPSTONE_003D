import React from 'react';
import {
  Plus,
  Globe,
  BarChart3,
  Kanban,
  PhoneCall,
  Settings,
  Sun,
  Moon,
  Briefcase,
  ShieldCheck,
  History,
  LogOut,
} from 'lucide-react';
import type { AppUser, Company } from '../types/crm';
import type { CurrencyCode } from '../data/countries';
import { ROLE_LABEL, type ActiveTab } from '../lib/permissions';
import { CURRENCIES, DISPLAY_CURRENCIES, ratesNote, type Rates } from '../lib/currency';
import type { RatesInfo } from '../lib/money';

const TAB_META: Record<ActiveTab, { label: string; icon: typeof BarChart3 }> = {
  kpi: { label: 'KPI y Mapa', icon: BarChart3 },
  kanban: { label: 'Pipeline', icon: Kanban },
  contact: { label: 'Registro de contacto', icon: PhoneCall },
  manager: { label: 'Gerencia', icon: Briefcase },
  stages: { label: 'Estados', icon: Settings },
  audit: { label: 'Auditoría', icon: History },
  admin: { label: 'Administración', icon: ShieldCheck },
};

interface NavbarProps {
  user: AppUser;
  company: Company | null;
  tabs: ActiveTab[];
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onOpenCapture?: () => void;
  totalLeadsCount?: number;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onLogout: () => void;
  // Moneda con la que se ve todo el CRM (solo para mostrar: los montos se guardan en su moneda)
  displayCurrency?: CurrencyCode;
  onDisplayCurrencyChange?: (currency: CurrencyCode) => void;
  rates?: Rates;
  ratesInfo?: RatesInfo;
}

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

export const Navbar: React.FC<NavbarProps> = ({
  user,
  company,
  tabs,
  activeTab,
  onTabChange,
  onOpenCapture,
  totalLeadsCount,
  theme,
  onToggleTheme,
  onLogout,
  displayCurrency,
  onDisplayCurrencyChange,
  rates,
  ratesInfo,
}) => {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-700 bg-slate-900/95 backdrop-blur-md dark:bg-slate-950/95">
      {/* Fila superior: marca + acciones (siempre a todo el ancho) */}
      <div className="flex w-full items-center justify-between gap-4 px-6 py-3.5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-rose-500 shadow-md shadow-indigo-600/30">
            <Globe className="h-6 w-6 text-[#fff]" />
          </div>
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-white">
              GeoCRM
              <span className="rounded-md border border-indigo-700 bg-indigo-950/60 px-2 py-0.5 text-xs font-semibold text-indigo-300">
                Enterprise
              </span>
            </h1>
            <p className="truncate text-sm font-medium text-slate-300">
              {company ? company.name : 'Consola de plataforma'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {displayCurrency && onDisplayCurrencyChange && (
            <div
              role="group"
              aria-label="Moneda para ver el CRM"
              title={
                rates && ratesInfo
                  ? `${ratesNote(rates)}\nFuente: ${ratesInfo.sources.join(' + ')}${
                      ratesInfo.updatedAt ? ` · ${new Date(ratesInfo.updatedAt).toLocaleDateString('es-CL')}` : ''
                    }${ratesInfo.live ? '' : ' (sin conexión: tasa de respaldo)'}`
                  : undefined
              }
              className="hidden items-center gap-1 rounded-xl border border-slate-600 bg-slate-900 p-1 sm:flex"
            >
              {DISPLAY_CURRENCIES.map((code) => (
                <button
                  key={code}
                  type="button"
                  aria-pressed={displayCurrency === code}
                  onClick={() => onDisplayCurrencyChange(code)}
                  className={`cursor-pointer rounded-lg px-2.5 py-1.5 text-sm font-bold transition ${
                    displayCurrency === code ? 'bg-indigo-600 text-[#fff]' : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {code}
                  <span className="sr-only"> ({CURRENCIES[code].name})</span>
                </button>
              ))}
              {ratesInfo && !ratesInfo.live && (
                <span className="px-1 text-xs font-semibold text-amber-300" aria-label="Tasa de respaldo, sin conexión">
                  ⚠
                </span>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={onToggleTheme}
            title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-slate-600 bg-slate-900 text-slate-300 transition hover:bg-slate-800"
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>

          {totalLeadsCount !== undefined && (
            <div className="hidden items-center gap-2 rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-[15px] text-slate-200 md:flex">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <span>{totalLeadsCount} leads</span>
            </div>
          )}

          {onOpenCapture && (
            <button
              onClick={onOpenCapture}
              className="flex cursor-pointer items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-[15px] font-semibold text-[#fff] shadow-lg shadow-indigo-600/30 transition hover:bg-indigo-500 active:scale-95"
            >
              <Plus className="h-5 w-5" />
              <span className="hidden sm:inline">Capturar Lead</span>
            </button>
          )}

          {/* Usuario en sesión */}
          <div className="flex items-center gap-2.5 border-l border-slate-700 pl-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-sm font-bold text-indigo-300">
              {initials(user.fullName)}
            </div>
            <div className="hidden leading-tight lg:block">
              <p className="text-[15px] font-semibold text-slate-100">{user.fullName}</p>
              <p className="text-sm text-slate-400">{ROLE_LABEL[user.role]}</p>
            </div>
            <button
              type="button"
              onClick={onLogout}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              className="flex h-10 cursor-pointer items-center gap-1.5 rounded-xl px-2.5 text-[15px] font-semibold text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-300"
            >
              <LogOut className="h-5 w-5" />
              <span className="hidden xl:inline">Salir</span>
            </button>
          </div>
        </div>
      </div>

      {/* Fila inferior: módulos permitidos para el perfil */}
      <nav className="border-t border-slate-800">
        <div className="flex w-full gap-1 overflow-x-auto px-6">
          {tabs.map((tabId) => {
            const { label, icon: Icon } = TAB_META[tabId];
            const isActive = activeTab === tabId;

            return (
              <button
                key={tabId}
                onClick={() => onTabChange(tabId)}
                className={`flex cursor-pointer items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-[15px] font-semibold transition-colors ${
                  isActive
                    ? 'border-indigo-500 text-white'
                    : 'border-transparent text-slate-400 hover:border-slate-600 hover:text-slate-200'
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? 'text-indigo-400' : ''}`} />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </header>
  );
};
