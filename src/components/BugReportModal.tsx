import React, { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { inputClass, labelClass, primaryButton, secondaryButton } from '../lib/styles';
import { BUG_MAX_LENGTH, validateBugDescription } from '../lib/usage';
import { Modal } from './ui';

interface BugReportModalProps {
  /** En qué parte de la app estaba, para el aviso ("Pipeline") */
  pageLabel: string;
  /** Devuelve el mensaje de error, o null si se envió */
  onSubmit: (description: string) => Promise<string | null>;
  onClose: () => void;
}

// Botón del bicho del encabezado: la persona cuenta qué pasó y el reporte llega al panel del
// administrador. Se adjunta solo la pestaña y el navegador; nunca datos de leads.
export const BugReportModal: React.FC<BugReportModalProps> = ({ pageLabel, onSubmit, onClose }) => {
  const [description, setDescription] = useState('');
  const [showError, setShowError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const invalid = validateBugDescription(description);

  const send = async () => {
    setShowError(true);
    if (invalid) return;
    setBusy(true);
    setServerError(null);
    const fallo = await onSubmit(description);
    setBusy(false);
    if (fallo) setServerError(fallo);
    else setSent(true);
  };

  return (
    <Modal
      title="Reportar un error"
      subtitle="Cuéntanos qué pasó y lo revisaremos."
      onClose={onClose}
      footer={
        sent ? (
          <button type="button" onClick={onClose} className={primaryButton}>
            Cerrar
          </button>
        ) : (
          <>
            <button type="button" onClick={onClose} disabled={busy} className={secondaryButton}>
              Cancelar
            </button>
            <button type="button" onClick={() => void send()} disabled={busy} className={primaryButton}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Enviar reporte
            </button>
          </>
        )
      }
    >
      {sent ? (
        <p role="status" className="flex items-start gap-2 text-[15px] text-emerald-300">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          ¡Gracias! Recibimos tu reporte y lo vamos a revisar.
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          noValidate
          className="space-y-3"
        >
          <div>
            <label htmlFor="bug-description" className={labelClass}>
              ¿Qué pasó? *
            </label>
            <textarea
              id="bug-description"
              rows={5}
              maxLength={BUG_MAX_LENGTH}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Por ejemplo: al guardar un lead se queda cargando y no aparece en el pipeline."
              aria-invalid={showError && invalid !== null}
              aria-describedby="bug-ayuda"
              className={inputClass}
            />
            {showError && invalid && (
              <p role="alert" className="mt-1 text-sm font-medium text-rose-300">
                {invalid}
              </p>
            )}
          </div>
          <p id="bug-ayuda" className="text-sm text-slate-400">
            Junto con tu mensaje enviamos la pestaña en que estabas ({pageLabel}) y tu navegador. No escribas nombres ni datos de tus
            clientes.
          </p>
          {serverError && (
            <p role="alert" className="text-sm font-medium text-rose-300">
              {serverError}
            </p>
          )}
        </form>
      )}
    </Modal>
  );
};
