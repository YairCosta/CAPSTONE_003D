import React, { useState } from 'react';
import { CheckCircle2, Loader2, MessageSquareHeart } from 'lucide-react';
import { inputClass, primaryButton, secondaryButton } from '../lib/styles';
import { SURVEY_COMMENT_MAX_LENGTH } from '../lib/usage';

interface SurveyPromptProps {
  /** Devuelve el mensaje de error, o null si se guardó */
  onSubmit: (score: number, comment: string) => Promise<string | null>;
  /** "Ahora no": se vuelve a preguntar en unos días */
  onDismiss: () => void;
}

const NOTAS = Array.from({ length: 11 }, (_, i) => i);

// Encuesta de satisfacción (NPS): una tarjeta abajo, sin tapar el trabajo, que aparece después de la
// primera semana y cada 30 días. Se puede responder con un clic o dejar para otro día.
export const SurveyPrompt: React.FC<SurveyPromptProps> = ({ onSubmit, onDismiss }) => {
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gracias, setGracias] = useState(false);

  const enviar = async () => {
    if (score === null) return;
    setBusy(true);
    setError(null);
    const fallo = await onSubmit(score, comment);
    setBusy(false);
    if (fallo) {
      setError(fallo);
      return;
    }
    setGracias(true);
    window.setTimeout(onDismiss, 2500);
  };

  return (
    <section
      role="dialog"
      aria-label="Encuesta de satisfacción"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-40 w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-slate-600 bg-slate-900 p-5 shadow-2xl"
    >
      {gracias ? (
        <p className="flex items-center gap-2 text-[15px] font-semibold text-emerald-300">
          <CheckCircle2 className="h-5 w-5" />
          ¡Gracias! Tu respuesta nos ayuda a mejorar Revela.
        </p>
      ) : (
        <>
          <div className="flex items-start gap-3">
            <MessageSquareHeart className="mt-0.5 h-5 w-5 shrink-0 text-indigo-300" />
            <div>
              <h2 className="text-[15px] font-bold text-slate-100">¿Qué tan probable es que recomiendes Revela a otra empresa?</h2>
              <p className="text-sm text-slate-400">Toma menos de un minuto y nos sirve mucho.</p>
            </div>
          </div>

          <div role="radiogroup" aria-label="Nota de 0 a 10" className="mt-4 grid grid-cols-11 gap-1">
            {NOTAS.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={score === n}
                aria-label={`${n}`}
                onClick={() => setScore(n)}
                className={`cursor-pointer rounded-lg border py-2 text-[15px] font-bold transition ${
                  score === n ? 'border-indigo-500 bg-indigo-600 text-[#fff]' : 'border-slate-600 text-slate-200 hover:bg-slate-800'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-xs text-slate-400">
            <span>Nada probable</span>
            <span>Muy probable</span>
          </div>

          {score !== null && (
            <div className="mt-4">
              <label htmlFor="encuesta-comentario" className="mb-1.5 block text-sm font-semibold text-slate-300">
                ¿Qué podríamos mejorar? (opcional)
              </label>
              <textarea
                id="encuesta-comentario"
                rows={2}
                maxLength={SURVEY_COMMENT_MAX_LENGTH}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className={inputClass}
                aria-describedby="encuesta-aviso"
              />
              <p id="encuesta-aviso" className="mt-1 text-xs text-slate-400">
                No escribas nombres ni datos de tus clientes.
              </p>
            </div>
          )}

          {error && (
            <p role="alert" className="mt-3 text-sm font-medium text-rose-300">
              {error}
            </p>
          )}

          <div className="mt-4 flex items-center justify-end gap-2">
            <button type="button" onClick={onDismiss} disabled={busy} className={secondaryButton}>
              Ahora no
            </button>
            <button type="button" onClick={() => void enviar()} disabled={score === null || busy} className={primaryButton}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Enviar
            </button>
          </div>
        </>
      )}
    </section>
  );
};
