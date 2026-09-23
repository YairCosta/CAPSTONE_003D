import React, { useState } from 'react';
import { AlertTriangle, KeyRound } from 'lucide-react';
import { Modal } from './ui';
import { inputClass, labelClass, primaryButton, secondaryButton } from '../lib/styles';
import { MIN_PASSWORD_LENGTH } from '../lib/passwords';

interface ChangePasswordModalProps {
  userName: string;
  onClose: () => void;
  /** Devuelve el mensaje de error, o null si la contraseña se cambió */
  onSubmit: (current: string, next: string, confirm: string) => string | null;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ userName, onClose, onSubmit }) => {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const message = onSubmit(current, next, confirm);
    if (message) {
      setError(message);
      return;
    }
    setError(null);
    setDone(true);
  };

  return (
    <Modal
      title="Cambiar mi contraseña"
      subtitle={`Cuenta de ${userName}. Solo tú puedes cambiarla: nadie de la plataforma la ve.`}
      onClose={onClose}
      footer={
        done ? (
          <button type="button" onClick={onClose} className={primaryButton}>
            Listo
          </button>
        ) : (
          <>
            <button type="button" onClick={onClose} className={secondaryButton}>
              Cancelar
            </button>
            <button type="submit" form="form-cambiar-clave" className={primaryButton}>
              <KeyRound className="h-4 w-4" />
              Guardar contraseña
            </button>
          </>
        )
      }
    >
      {done ? (
        <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-[15px] text-emerald-300">
          Tu contraseña quedó cambiada. Úsala la próxima vez que inicies sesión.
        </p>
      ) : (
        <form id="form-cambiar-clave" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="cc-actual" className={labelClass}>
              Contraseña actual
            </label>
            <input
              id="cc-actual"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="cc-nueva" className={labelClass}>
              Contraseña nueva
            </label>
            <input
              id="cc-nueva"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className={inputClass}
              aria-describedby="cc-ayuda"
            />
            <p id="cc-ayuda" className="mt-1 text-sm text-slate-400">
              Al menos {MIN_PASSWORD_LENGTH} caracteres, con letras y números.
            </p>
          </div>

          <div>
            <label htmlFor="cc-confirmar" className={labelClass}>
              Repite la contraseña nueva
            </label>
            <input
              id="cc-confirmar"
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
        </form>
      )}
    </Modal>
  );
};
