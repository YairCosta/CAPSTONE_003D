import React from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
import type { LeadContact } from '../types/crm';
import { MAX_LEAD_CONTACTS } from '../lib/contacts';
import { inputClass, labelClass, secondaryButton } from '../lib/styles';

interface LeadContactsEditorProps {
  idPrefix: string;
  primaryName: string;
  contacts: LeadContact[];
  onChange: (contacts: LeadContact[]) => void;
}

// Personas adicionales del mismo lead: en una empresa casi nunca se habla con una sola.
export const LeadContactsEditor: React.FC<LeadContactsEditorProps> = ({ idPrefix, primaryName, contacts, onChange }) => {
  const update = (index: number, patch: Partial<LeadContact>) =>
    onChange(contacts.map((c, i) => (i === index ? { ...c, ...patch } : c)));

  const add = () =>
    onChange([...contacts, { id: `${idPrefix}-${Date.now()}-${contacts.length}`, fullName: '' }]);

  const remove = (index: number) => onChange(contacts.filter((_, i) => i !== index));

  return (
    <fieldset className="rounded-xl border border-slate-700 bg-slate-950/40 p-4">
      <legend className="flex items-center gap-2 px-1 text-[15px] font-bold text-slate-200">
        <Users className="h-4 w-4 text-indigo-400" />
        Otros contactos de este lead
      </legend>
      <p className="mb-3 text-sm text-slate-400">
        <span className="font-semibold text-slate-300">{primaryName || 'El contacto de arriba'}</span> es el contacto
        principal. Agrega aquí a las demás personas con las que también se habla (quien cotiza no siempre es quien firma).
      </p>

      {contacts.length === 0 ? (
        <p className="mb-3 text-sm text-slate-400">Todavía no hay otros contactos.</p>
      ) : (
        <ul className="mb-3 space-y-3">
          {contacts.map((contact, index) => (
            <li key={contact.id} className="rounded-xl border border-slate-700 bg-slate-900/60 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold uppercase tracking-wide text-slate-400">Contacto {index + 2}</span>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  aria-label={`Quitar a ${contact.fullName || `contacto ${index + 2}`}`}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-rose-300 transition hover:bg-rose-500/10 cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" />
                  Quitar
                </button>
              </div>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div>
                  <label htmlFor={`${idPrefix}-c-name-${index}`} className={labelClass}>Nombre *</label>
                  <input
                    id={`${idPrefix}-c-name-${index}`}
                    value={contact.fullName}
                    onChange={(e) => update(index, { fullName: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor={`${idPrefix}-c-job-${index}`} className={labelClass}>Cargo</label>
                  <input
                    id={`${idPrefix}-c-job-${index}`}
                    value={contact.jobTitle ?? ''}
                    onChange={(e) => update(index, { jobTitle: e.target.value })}
                    placeholder="Ej. Jefe de Compras"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor={`${idPrefix}-c-email-${index}`} className={labelClass}>Email</label>
                  <input
                    id={`${idPrefix}-c-email-${index}`}
                    type="email"
                    value={contact.email ?? ''}
                    onChange={(e) => update(index, { email: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor={`${idPrefix}-c-phone-${index}`} className={labelClass}>Teléfono</label>
                  <input
                    id={`${idPrefix}-c-phone-${index}`}
                    value={contact.phone ?? ''}
                    onChange={(e) => update(index, { phone: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {contacts.length < MAX_LEAD_CONTACTS ? (
        <button type="button" onClick={add} className={`${secondaryButton} px-3 py-2 text-sm`}>
          <Plus className="h-4 w-4" />
          Agregar contacto
        </button>
      ) : (
        <p className="text-sm text-slate-400">Máximo {MAX_LEAD_CONTACTS} contactos adicionales por lead.</p>
      )}
      <p className="mt-2 text-sm text-slate-400">Los contactos sin nombre no se guardan.</p>
    </fieldset>
  );
};
