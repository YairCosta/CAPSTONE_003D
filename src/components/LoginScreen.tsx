import React, { useState } from 'react';
import { RevelaLogo } from './RevelaLogo';
import { Eye, EyeOff, LogIn, Sun, Moon, AlertTriangle, ShieldCheck, Briefcase, UserRound } from 'lucide-react';
import { inputClass, labelClass, primaryButton } from '../lib/styles';

interface DemoAccount {
  label: string;
  company: string;
  email: string;
  password: string;
}

interface LoginScreenProps {
  onLogin: (email: string, password: string) => string | null;
  demoAccounts: DemoAccount[];
  notice?: string | null;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
}

const PROFILES = [
  {
    icon: UserRound,
    title: 'Usuario base',
    text: 'Captura leads, registra la toma de contacto y avanza el pipeline.',
  },
  {
    icon: Briefcase,
    title: 'Gerente',
    text: 'Todo lo del usuario base, más KPI y mapa, empresas cliente, edición de contactos y leads en cola.',
  },
  {
    icon: ShieldCheck,
    title: 'Administrador',
    text: 'Crea los CRM de cada empresa y activa o desactiva tenants y usuarios.',
  },
];

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, demoAccounts, notice, theme, onToggleTheme }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(onLogin(email, password));
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12 text-slate-100">
      <button
        type="button"
        onClick={onToggleTheme}
        aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        className="absolute right-4 top-4 flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-slate-600 bg-slate-900 text-slate-300 transition hover:bg-slate-800"
      >
        {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>

      <div className="grid w-full max-w-5xl items-center gap-10 lg:grid-cols-2">
        {/* Presentación */}
        <section>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-rose-500 shadow-md">
              <RevelaLogo className="h-7 w-7 text-[#fff]" />
            </div>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-slate-100">Revela</h1>
              <p className="text-[15px] text-slate-400">Captura y análisis geoestratégico de leads</p>
            </div>
          </div>

          <ul className="mt-8 space-y-4">
            {PROFILES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[15px] font-bold text-slate-200">{title}</p>
                  <p className="text-[15px] text-slate-400">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Formulario */}
        <section className="rounded-2xl border border-slate-700 bg-slate-900 p-7 shadow-xl">
          <h2 className="text-2xl font-bold text-slate-100">Iniciar sesión</h2>
          <p className="mt-1 text-[15px] text-slate-400">Ingresa con tu cuenta corporativa.</p>

          {notice && !error && (
            <div role="status" className="mt-5 flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[15px] text-amber-300">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="login-email" className={labelClass}>
                Email
              </label>
              <input
                id="login-email"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nombre@empresa.cl"
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="login-password" className={labelClass}>
                Contraseña
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputClass} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded-lg p-1.5 text-slate-400 hover:text-slate-200"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div role="alert" className="flex gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[15px] text-rose-300">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button type="submit" className={`${primaryButton} w-full py-3`}>
              <LogIn className="h-5 w-5" />
              Ingresar
            </button>
          </form>

          {/* Cuentas de demostración */}
          <div className="mt-7 border-t border-slate-700 pt-5">
            <p className="text-sm font-bold uppercase tracking-wider text-slate-400">Cuentas de demostración</p>
            <div className="mt-3 space-y-2">
              {demoAccounts.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  onClick={() => {
                    setEmail(account.email);
                    setPassword(account.password);
                    setError(null);
                  }}
                  className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-600 px-4 py-2.5 text-left transition hover:bg-slate-800"
                >
                  <span>
                    <span className="block text-[15px] font-semibold text-slate-200">{account.label}</span>
                    <span className="block text-sm text-slate-400">{account.company}</span>
                  </span>
                  <span className="text-sm text-slate-400">{account.email}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
