import React, { useState } from 'react';
import { AlertTriangle, KeyRound, Loader2 } from 'lucide-react';
import { RevelaLogo } from './RevelaLogo';
import { inputClass, labelClass, primaryButton, secondaryButton } from '../lib/styles';
import { MIN_PASSWORD_LENGTH } from '../lib/passwords';

interface SetPasswordScreenProps {
  /** invite: primera vez, desde la invitación. recovery: desde "¿Olvidaste tu contraseña?" */
  mode: 'invite' | 'recovery';
  email: string;
  onSubmit: (next: string, confirm: string) => Promise<string | null>;
  onCancel: () => void;
}

// Quien abre su invitación elige aquí su contraseña: la escribe solo esa persona y va directo a
// Supabase Auth, así que ni el administrador ni el gerente que la invitó llegan a conocerla.
export const SetPasswordScreen: React.FC<SetPasswordScreenProps> = ({ mode, email, onSubmit, onCancel }) => {
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const message = await onSubmit(next, confirm);
    setBusy(false);
    setError(message);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12 text-slate-100">
      <section className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-7 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-rose-500 shadow-md">
            <RevelaLogo className="h-6 w-6 text-[#fff]" />
          </div>
          <h1 className="text-2xl font-bold text-slate-100">
            {mode === 'invite' ? 'Bienvenido a Revela' : 'Elige una contraseña nueva'}
          </h1>
        </div>
        <p className="mt-3 text-[15px] text-slate-400">
          {mode === 'invite'
            ? 'Te invitaron a Revela. Elige tu contraseña para entrar: solo tú la conocerás.'
            : 'Escribe tu contraseña nueva. La anterior deja de funcionar.'}
        </p>
        <p className="mt-1 text-sm text-slate-400">Cuenta: {email}</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="sp-nueva" className={labelClass}>
              Contraseña
            </label>
            <input
              id="sp-nueva"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              aria-describedby="sp-ayuda"
              className={inputClass}
            />
            <p id="sp-ayuda" className="mt-1 text-sm text-slate-400">
              Al menos {MIN_PASSWORD_LENGTH} caracteres, con letras y números.
            </p>
          </div>
          <div>
            <label htmlFor="sp-confirmar" className={labelClass}>
              Repite la contraseña
            </label>
            <input
              id="sp-confirmar"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputClass}
            />
          </div>

          {error && (
            <p role="alert" className="flex gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[15px] text-rose-300">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
              <span>{error}</span>
            </p>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={onCancel} className={`${secondaryButton} flex-1`}>
              Cancelar
            </button>
            <button type="submit" disabled={busy} className={`${primaryButton} flex-1`}>
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <KeyRound className="h-5 w-5" />}
              Guardar y entrar
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};
