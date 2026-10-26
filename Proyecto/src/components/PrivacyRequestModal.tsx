import React, { useState } from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import type { Lead, PrivacyRequestReason } from '../types/crm';
import { Modal } from './ui';
import { inputClass, labelClass, primaryButton, secondaryButton } from '../lib/styles';
import { REQUEST_REASON_LABEL } from '../lib/privacy';
import { leadTitle } from '../lib/contacts';

interface PrivacyRequestModalProps {
  lead: Lead;
  onClose: () => void;
  /** Devuelve el mensaje de error, o null si la solicitud quedó registrada */
  onSubmit: (reason: PrivacyRequestReason, detail: string) => string | null;
}

/**
 * Registro de una solicitud del titular sobre sus datos (arts. 7, 8 y 8 ter).
 * Desde que se registra, el lead queda bloqueado hasta que el gerente la resuelve.
 */
export const PrivacyRequestModal: React.FC<PrivacyRequestModalProps> = ({ lead, onClose, onSubmit }) => {
  const [reason, setReason] = useState<PrivacyRequestReason>('erasure');
  const [detail, setDetail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const message = onSubmit(reason, detail);
    if (message) {
      setError(message);
      return;
    }
    onClose();
  };

  return (
    <Modal
      title="Solicitud del titular sobre sus datos"
      subtitle={`${leadTitle(lead)} · ${lead.fullName}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancelar
          </button>
          <button type="submit" form="form-solicitud-privacidad" className={primaryButton}>
            <ShieldAlert className="h-4 w-4" />
            Registrar solicitud
          </button>
        </>
      }
    >
      <form id="form-solicitud-privacidad" onSubmit={handleSubmit} className="space-y-4">
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[15px] text-amber-200">
          Mientras la solicitud esté pendiente, este lead queda <strong>bloqueado</strong>: no aparece en la
          agenda ni para el asistente. Solo el gerente puede resolverla.
        </p>

        <div>
          <label htmlFor="sp-reason" className={labelClass}>
            ¿Qué pidió la persona?
          </label>
          <select
            id="sp-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value as PrivacyRequestReason)}
            className={inputClass}
          >
            {(Object.keys(REQUEST_REASON_LABEL) as PrivacyRequestReason[]).map((key) => (
              <option key={key} value={key}>
                {REQUEST_REASON_LABEL[key]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="sp-detail" className={labelClass}>
            Detalle {reason === 'other' && <span className="text-rose-300">(obligatorio)</span>}
          </label>
          <textarea
            id="sp-detail"
            rows={3}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder="Cómo lo pidió y qué dijo exactamente."
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
    </Modal>
  );
};

interface PrivacyDecisionModalProps {
  lead: Lead;
  onClose: () => void;
  onDecide: (approve: boolean, note: string) => void;
}

/** Resolución del gerente. Aprobar borra los datos personales y no se puede deshacer. */
export const PrivacyDecisionModal: React.FC<PrivacyDecisionModalProps> = ({ lead, onClose, onDecide }) => {
  const [note, setNote] = useState('');
  const request = lead.privacyRequest;
  if (!request) return null;

  return (
    <Modal
      title="Resolver la solicitud del titular"
      subtitle={`${leadTitle(lead)} · ${lead.fullName}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={() => onDecide(false, note)} className={secondaryButton}>
            Rechazar
          </button>
          <button
            type="button"
            onClick={() => onDecide(true, note)}
            className="flex cursor-pointer items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-[15px] font-semibold text-[#fff] transition hover:bg-rose-500"
          >
            <ShieldAlert className="h-4 w-4" />
            Aprobar y eliminar sus datos
          </button>
        </>
      }
    >
      <div className="space-y-4 text-[15px]">
        <dl className="rounded-xl border border-slate-700 bg-slate-950/40 p-4">
          <div className="flex gap-2">
            <dt className="font-semibold text-slate-300">Motivo:</dt>
            <dd className="text-slate-200">{REQUEST_REASON_LABEL[request.reason]}</dd>
          </div>
          {request.detail && (
            <div className="mt-1 flex gap-2">
              <dt className="font-semibold text-slate-300">Detalle:</dt>
              <dd className="text-slate-200">{request.detail}</dd>
            </div>
          )}
          <div className="mt-1 flex gap-2">
            <dt className="font-semibold text-slate-300">Registrada por:</dt>
            <dd className="text-slate-200">
              {request.requestedBy} · {new Date(request.requestedAt).toLocaleString('es-CL')}
            </dd>
          </div>
        </dl>

        <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-rose-200">
          Al aprobar se borran nombre, cargo, correo, teléfono, dirección, notas y los otros contactos.
          <strong> No se puede deshacer.</strong> Se conservan la zona, el monto y la etapa para que las
          métricas del CRM sigan cuadrando, y queda registrado en la auditoría.
        </p>

        <div>
          <label htmlFor="sp-note" className={labelClass}>
            Nota de la decisión
          </label>
          <textarea
            id="sp-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Por ejemplo: se verificó la identidad por correo."
            className={inputClass}
          />
        </div>
      </div>
    </Modal>
  );
};
