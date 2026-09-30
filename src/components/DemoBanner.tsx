import React from 'react';
import { FlaskConical, LogOut } from 'lucide-react';
import { ROLE_LABEL } from '../lib/permissions';

interface DemoBannerProps {
  role: 'manager' | 'agent';
  onViewAs: (role: 'manager' | 'agent') => void;
  onExit: () => void;
}

// Demo pública (?demo): se entra sin contraseña, con datos ficticios que viven solo en esta pestaña.
// El aviso pide no escribir datos reales: nada de lo que se ingrese sale del navegador.
export const DemoBanner: React.FC<DemoBannerProps> = ({ role, onViewAs, onExit }) => (
  <div role="region" aria-label="Aviso de demostración" className="border-b border-amber-500/40 bg-amber-500/10 px-6 py-2.5">
    <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 text-[15px] text-amber-200">
      <p className="flex min-w-0 flex-1 items-start gap-2">
        <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          <strong>Demo:</strong> los datos son ficticios y todo se borra al recargar o salir. No ingreses datos reales.
        </span>
      </p>
      <div role="group" aria-label="Ver la demo como" className="flex items-center gap-1.5">
        <span className="text-sm font-semibold">Ver como:</span>
        {(['manager', 'agent'] as const).map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={role === r}
            onClick={() => onViewAs(r)}
            className={`cursor-pointer rounded-lg border px-2.5 py-1 text-sm font-bold transition ${
              role === r ? 'border-amber-400 bg-amber-400 text-[#1a1a1a]' : 'border-amber-500/50 hover:bg-amber-500/15'
            }`}
          >
            {ROLE_LABEL[r]}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onExit}
        className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-bold hover:bg-amber-500/15"
      >
        <LogOut className="h-4 w-4" />
        Salir de la demo
      </button>
    </div>
  </div>
);
