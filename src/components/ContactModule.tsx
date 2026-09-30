import React, { useState } from 'react';
import type { Lead, LeadActivity, ContactChannel, ContactOutcome, CommercialStatus, PrivacyRequestReason } from '../types/crm';
import {
  Phone,
  MessageSquare,
  Mail,
  Calendar,
  Video,
  CalendarDays,
  Clock,
  UserPlus,
  Send,
  MapPin,
  ShieldAlert
} from 'lucide-react';
import { COUNTRIES } from '../data/countries';
import { AgendaPanel } from './AgendaPanel';
import { pendingFollowUps } from '../lib/agenda';
import { contactsOf, extraContactsCount, leadSubtitle, leadTitle } from '../lib/contacts';
import { blockedReason, canContact, isPendingProspect, prospectDaysLeft, type FirstContactAnswer } from '../lib/privacy';
import { useMoney } from '../lib/money';
import { STATUS_LABEL } from '../lib/stages';
import { CountryFlag } from './CountryFlag';
import { Modal } from './ui';
import { PrivacyRequestModal } from './PrivacyRequestModal';
import { inputClass, labelClass, primaryButton, secondaryButton } from '../lib/styles';

interface ContactModuleProps {
  leads: Lead[];
  activities: LeadActivity[];
  selectedLeadId?: string | null;
  onAddActivity: (activity: Omit<LeadActivity, 'id' | 'createdAt'>, advanceStageTo?: CommercialStatus) => void;
  // Agregar otra persona del mismo lead sin salir del módulo
  onAddContact: (leadId: string, contact: { fullName: string; jobTitle?: string; email?: string; phone?: string }) => void;
  onSelectLead: (leadId: string) => void;
  // El titular pidió algo sobre sus datos: cualquier perfil lo registra, solo gerencia lo resuelve
  onRequestPrivacy?: (leadId: string, reason: PrivacyRequestReason, detail: string) => string | null;
  // Prospecto: qué respondió la persona en el primer contacto sobre guardar sus datos
  onRecordFirstContact?: (leadId: string, answer: FirstContactAnswer) => void;
  agentName?: string;
  showCountry?: boolean; // plan Internacional: muestra el país de cada lead
}

export const ContactModule: React.FC<ContactModuleProps> = ({
  leads,
  activities,
  selectedLeadId,
  onAddActivity,
  onAddContact,
  onSelectLead,
  onRequestPrivacy,
  onRecordFirstContact,
  agentName: currentAgentName = 'Carlos Mendoza',
  showCountry = false,
}) => {
  const money = useMoney();
  const [activeLeadIdState, setActiveLeadId] = useState<string>(
    selectedLeadId || (leads[0]?.id ?? '')
  );
  // Si el lead elegido quedó fuera del filtro de países, se muestra la bitácora global
  const activeLeadId = leads.some((l) => l.id === activeLeadIdState) ? activeLeadIdState : '';
  const [channel, setChannel] = useState<ContactChannel>('call');
  const [outcome, setOutcome] = useState<ContactOutcome>('interested');
  const [summary, setSummary] = useState('');
  const [contactName, setContactName] = useState('');
  const [nextFollowUpDate, setNextFollowUpDate] = useState('');
  const [agentName, setAgentName] = useState(currentAgentName);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [suggestedStage, setSuggestedStage] = useState<CommercialStatus>('contacted');
  const [filterChannel, setFilterChannel] = useState<string>('all');
  const [panel, setPanel] = useState<'agenda' | 'history'>('agenda');
  const [addingContact, setAddingContact] = useState(false);
  const [requestingPrivacy, setRequestingPrivacy] = useState<Lead | null>(null);
  const [firstContactAnswer, setFirstContactAnswer] = useState<FirstContactAnswer | ''>('');
  const [firstContactError, setFirstContactError] = useState<string | null>(null);

  const currentLead = leads.find((l) => l.id === activeLeadId);
  // Resumen para la pestaña Agenda: cuántos seguimientos hay y cuántos están atrasados
  const followUps = pendingFollowUps(leads, activities);
  const pendientes = followUps.length;
  const atrasados = followUps.filter((f) => f.bucket === 'overdue').length;
  // Con quién se habló: el contacto principal del lead o cualquiera de los adicionales
  const leadContacts = currentLead ? contactsOf(currentLead) : [];
  const selectedContact =
    leadContacts.find((c) => c.fullName === contactName) ?? leadContacts[0];

  // Filtrar actividades del lead activo o todas
  const displayedActivities = activities.filter((act) => {
    const matchesLead = activeLeadId ? act.leadId === activeLeadId : true;
    const matchesChannel = filterChannel === 'all' || act.channel === filterChannel;
    return matchesLead && matchesChannel;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLeadId || !summary.trim()) return;
    const esProspecto = currentLead ? isPendingProspect(currentLead) : false;
    if (esProspecto && !firstContactAnswer) {
      setFirstContactError('Indica qué respondió la persona sobre guardar sus datos.');
      document.getElementById('first-contact-answer')?.focus();
      return;
    }

    onAddActivity(
      {
        leadId: activeLeadId,
        channel,
        outcome,
        contactName: selectedContact?.fullName,
        summary,
        nextFollowUpDate: nextFollowUpDate || undefined,
        agentName,
      },
      autoAdvance ? suggestedStage : undefined
    );

    if (esProspecto && firstContactAnswer && onRecordFirstContact) {
      onRecordFirstContact(activeLeadId, firstContactAnswer);
    }
    setFirstContactAnswer('');
    setFirstContactError(null);
    setSummary('');
    setNextFollowUpDate('');
  };

  const getChannelIcon = (ch: ContactChannel) => {
    switch (ch) {
      case 'call':
        return <Phone className="h-4 w-4 text-sky-400" />;
      case 'whatsapp':
        return <MessageSquare className="h-4 w-4 text-emerald-400" />;
      case 'email':
        return <Mail className="h-4 w-4 text-amber-400" />;
      case 'meeting':
        return <Calendar className="h-4 w-4 text-indigo-400" />;
      case 'video_call':
        return <Video className="h-4 w-4 text-purple-400" />;
    }
  };

  const getOutcomeBadge = (out: ContactOutcome) => {
    switch (out) {
      case 'interested':
        return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40';
      case 'requested_quote':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'paid':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'rescheduled':
        return 'bg-sky-500/20 text-sky-300 border-sky-500/40';
      case 'no_answer':
        return 'bg-slate-700/40 text-slate-300 border-slate-600';
      case 'rejected':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
    }
  };

  const getOutcomeLabel = (out: ContactOutcome) => {
    switch (out) {
      case 'interested':
        return 'Interesado';
      case 'requested_quote':
        return 'Solicitó Cotización';
      case 'paid':
        return 'Pago Acreditado';
      case 'rescheduled':
        return 'Reagendado';
      case 'no_answer':
        return 'Sin Respuesta';
      case 'rejected':
        return 'Rechazado';
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[640px]">
      {/* Columna Izquierda: Formulario de Toma de Contacto */}
      <div className="lg:col-span-5 flex flex-col rounded-2xl border border-slate-700 bg-slate-900/80 p-5 shadow-2xl backdrop-blur-md">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-black text-slate-100">
          <Phone className="h-5 w-5 text-indigo-400" />
          Registro de Toma de Contacto
        </h2>

        {/* Selector de Lead */}
        <div className="mb-4">
          <label className="block text-sm font-bold text-slate-300 mb-1">
            Lead a Contactar *
          </label>
          <select
            value={activeLeadId}
            onChange={(e) => {
              setActiveLeadId(e.target.value);
              onSelectLead(e.target.value);
            }}
            className="w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
          >
            <option value="">-- Ver Bitácora Global (Todos los Leads) --</option>
            {leads.filter(canContact).map((lead) => (
              <option key={lead.id} value={lead.id}>
                {/* Se busca por empresa antes que por persona: es como se acuerda el vendedor del lead */}
                {lead.companyName ?? 'Persona natural'} · {lead.fullName}
                {extraContactsCount(lead) > 0 ? ` (+${extraContactsCount(lead)})` : ''} —{' '}
                {STATUS_LABEL[lead.commercialStatus]} · {money.fmtLead(lead)}
                {showCountry ? ` · ${COUNTRIES[lead.countryCode].name}` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Ficha Resumen del Lead Seleccionado */}
        {currentLead && (
          <div className="mb-4 rounded-xl border border-slate-700 bg-slate-950/60 p-3 text-sm space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-bold text-slate-200">
                {showCountry && <CountryFlag code={currentLead.countryCode} title={COUNTRIES[currentLead.countryCode].name} />}
                {leadTitle(currentLead)}
              </span>
              <span className="rounded-md bg-indigo-500/20 px-2 py-0.5 text-xs font-bold text-indigo-300 uppercase">
                {STATUS_LABEL[currentLead.commercialStatus]}
              </span>
            </div>
            {leadSubtitle(currentLead) && (
              <div className="text-[13px] text-slate-400">{leadSubtitle(currentLead)}</div>
            )}
            {blockedReason(currentLead) && (
              <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[13px] text-amber-200">
                {blockedReason(currentLead)}: no registres nuevos contactos con esta persona.
              </p>
            )}
            {isPendingProspect(currentLead) && (
              <p role="status" className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-1.5 text-[13px] text-sky-200">
                Prospecto: aún no sabe que tenemos sus datos. Al hablar con la persona, infórmale y pregúntale si
                autoriza. Si nadie la contacta, sus datos se eliminan en{' '}
                <strong>{Math.max(prospectDaysLeft(currentLead) ?? 0, 0)} días</strong>.
              </p>
            )}
            {leadContacts.length > 1 && (
              <div className="text-[13px] text-indigo-300">
                +{leadContacts.length - 1} {leadContacts.length === 2 ? 'contacto más' : 'contactos más'}:{' '}
                {leadContacts
                  .filter((c) => !c.isPrimary)
                  .map((c) => c.fullName)
                  .join(', ')}
              </div>
            )}
            {onRequestPrivacy && (
              <button
                type="button"
                onClick={() => setRequestingPrivacy(currentLead)}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[13px] font-semibold text-amber-300 transition hover:bg-amber-500/20"
              >
                <ShieldAlert className="h-4 w-4" />
                El titular pide algo sobre sus datos
              </button>
            )}
            <button
              type="button"
              onClick={() => setAddingContact(true)}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800/70 px-2.5 py-1 text-[13px] font-semibold text-slate-200 transition hover:bg-slate-700"
            >
              <UserPlus className="h-4 w-4" />
              Agregar contacto de esta empresa
            </button>
            <div className="text-[13px] text-slate-400 flex items-center space-x-3">
              <span>{currentLead.phone || 'Sin teléfono'}</span>
              <span>•</span>
              <span className="truncate">{currentLead.email || 'Sin email'}</span>
            </div>
            <div className="text-[13px] text-slate-400 flex items-center space-x-1.5">
              <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
              <span className="truncate">{currentLead.rawAddress}</span>
            </div>
          </div>
        )}

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col justify-between space-y-3.5">
          {/* Canal de Contacto */}
          <div>
            <label className="block text-sm font-bold text-slate-300 mb-1.5">
              Canal Utilizado
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {[
                { id: 'call', label: 'Llamada', icon: Phone },
                { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
                { id: 'email', label: 'Email', icon: Mail },
                { id: 'meeting', label: 'Reunión', icon: Calendar },
                { id: 'video_call', label: 'Meet/Zoom', icon: Video },
              ].map((item) => {
                const Icon = item.icon;
                const isSelected = channel === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setChannel(item.id as ContactChannel)}
                    className={`flex flex-col items-center justify-center rounded-xl border p-2 text-center transition cursor-pointer ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-950/50 text-indigo-300 shadow-sm'
                        : 'border-slate-700 bg-slate-950/50 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="h-4 w-4 mb-1" />
                    <span className="text-xs font-semibold">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Con quién se habló: el lead puede tener varias personas */}
          {leadContacts.length > 1 && (
            <div>
              <label htmlFor="contact-person" className="block text-sm font-bold text-slate-300 mb-1">
                ¿Con quién hablaste?
              </label>
              <select
                id="contact-person"
                value={selectedContact?.fullName ?? ''}
                onChange={(e) => setContactName(e.target.value)}
                className="w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
              >
                {leadContacts.map((c) => (
                  <option key={c.id} value={c.fullName}>
                    {c.fullName}
                    {c.jobTitle ? ` · ${c.jobTitle}` : ''}
                    {c.isPrimary ? ' (principal)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Resultado de la Interacción */}
          <div>
            <label className="block text-sm font-bold text-slate-300 mb-1">
              Resultado Comercial
            </label>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as ContactOutcome)}
              className="w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
            >
              <option value="interested">Interesado (Requiere seguimiento)</option>
              <option value="requested_quote">Solicitó Cotización Formal</option>
              <option value="paid">Pago Confirmado / Anticipo Acreditado</option>
              <option value="rescheduled">Reagendado para otra fecha</option>
              <option value="no_answer">No Contesta / Buzón de Voz</option>
              <option value="rejected">Rechazado / No Interesado</option>
            </select>
          </div>

          {currentLead && isPendingProspect(currentLead) && (
            <div>
              <label htmlFor="first-contact-answer" className="block text-sm font-bold text-slate-300 mb-1">
                ¿Qué respondió sobre guardar sus datos? *
              </label>
              <select
                id="first-contact-answer"
                value={firstContactAnswer}
                onChange={(e) => {
                  setFirstContactAnswer(e.target.value as FirstContactAnswer);
                  setFirstContactError(null);
                }}
                aria-invalid={!!firstContactError}
                aria-describedby={firstContactError ? 'first-contact-error' : undefined}
                className="w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
              >
                <option value="" disabled>Elige una opción</option>
                <option value="granted">Autoriza que guardemos sus datos</option>
                <option value="refused">No autoriza: no contactar más</option>
                <option value="unreachable">No se pudo hablar con la persona</option>
              </select>
              {firstContactError && (
                <p id="first-contact-error" role="alert" className="mt-1 text-sm font-medium text-rose-300">
                  {firstContactError}
                </p>
              )}
            </div>
          )}

          {/* Resumen / Notas */}
          <div>
            <label className="block text-sm font-bold text-slate-300 mb-1">
              Bitácora y Acuerdos de la Conversación *
            </label>
            <textarea
              required
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Detalla lo conversado, objeciones, montos discutidos o pasos a seguir..."
              className="w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder-slate-400 focus:border-indigo-500 focus:outline-none resize-none"
            />
          </div>

          {/* Próximo Seguimiento y Agente */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-sm font-bold text-slate-300 mb-1">
                Próximo Seguimiento
              </label>
              <input
                type="datetime-local"
                value={nextFollowUpDate}
                onChange={(e) => setNextFollowUpDate(e.target.value)}
                className="w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-300 mb-1">
                Agente Responsable
              </label>
              <input
                type="text"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                className="w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-1.5 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Opciones de Avance Automático */}
          <div className="rounded-xl border border-slate-700 bg-slate-950/80 p-2.5 space-y-2">
            <label className="flex items-center space-x-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={autoAdvance}
                onChange={(e) => setAutoAdvance(e.target.checked)}
                className="rounded border-slate-600 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
              />
              <span>Avanzar estado del lead tras guardar</span>
            </label>

            {autoAdvance && (
              <select
                value={suggestedStage}
                onChange={(e) => setSuggestedStage(e.target.value as CommercialStatus)}
                className="w-full rounded-lg border border-slate-600 bg-slate-900 px-2.5 py-1 text-sm text-indigo-300 font-semibold focus:outline-none"
              >
                <option value="contacted">Pasar a: Toma de Contacto</option>
                <option value="qualified">Pasar a: Calificado</option>
                <option value="proposal">Pasar a: Propuesta / Negociación</option>
                <option value="pending_payment">Pasar a: Pendientes de Pago</option>
                <option value="won">Pasar a: Lead Cerrado (Ganado)</option>
              </select>
            )}
          </div>

          <button
            type="submit"
            className="w-full flex items-center justify-center space-x-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-[#fff] shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition cursor-pointer"
          >
            <Send className="h-4 w-4" />
            <span>Guardar Interacción y Actualizar Lead</span>
          </button>
        </form>
      </div>

      {requestingPrivacy && onRequestPrivacy && (
        <PrivacyRequestModal
          lead={requestingPrivacy}
          onClose={() => setRequestingPrivacy(null)}
          onSubmit={(reason, detail) => onRequestPrivacy(requestingPrivacy.id, reason, detail)}
        />
      )}

      {addingContact && currentLead && (
        <NewContactModal
          leadName={currentLead.fullName}
          companyName={currentLead.companyName}
          onClose={() => setAddingContact(false)}
          onSave={(data) => {
            onAddContact(currentLead.id, data);
            // El contacto recién agregado queda elegido para la interacción que se está registrando
            setContactName(data.fullName.trim());
            setAddingContact(false);
          }}
        />
      )}

      {/* Columna Derecha: agenda de seguimientos o bitácora histórica */}
      <div className="lg:col-span-7 flex flex-col rounded-2xl border border-slate-700 bg-slate-900/80 p-5 shadow-2xl backdrop-blur-md">
        <div className="mb-4 flex gap-1 rounded-xl border border-slate-600 bg-slate-950/60 p-1">
          <button
            type="button"
            onClick={() => setPanel('agenda')}
            className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
              panel === 'agenda' ? 'bg-indigo-600 text-[#fff]' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <CalendarDays className="h-4 w-4" />
            Agenda
            {pendientes > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${
                  atrasados > 0 ? 'bg-rose-500/25 text-rose-200' : 'bg-slate-700 text-slate-200'
                }`}
              >
                {pendientes}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setPanel('history')}
            className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition ${
              panel === 'history' ? 'bg-indigo-600 text-[#fff]' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Clock className="h-4 w-4" />
            Historial
          </button>
        </div>

        {panel === 'agenda' ? (
          <AgendaPanel
            leads={leads}
            activities={activities}
            onSelectLead={(leadId) => {
              setActiveLeadId(leadId);
              onSelectLead(leadId);
            }}
          />
        ) : (
        <>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-100">
              Historial de Bitácora & Contactos
            </h3>
            <p className="text-sm text-slate-400">
              Línea de tiempo cronológica de contactos realizados por el equipo comercial.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <select
              value={filterChannel}
              onChange={(e) => setFilterChannel(e.target.value)}
              className="rounded-lg border border-slate-600 bg-slate-950 px-2.5 py-1 text-sm text-slate-300 focus:outline-none"
            >
              <option value="all">Todos los canales</option>
              <option value="call">Llamadas</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Emails</option>
              <option value="meeting">Reuniones</option>
            </select>
          </div>
        </div>

        {/* Timeline */}
        <div className="flex-1 space-y-4 overflow-y-auto pr-2">
          {displayedActivities.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <Clock className="h-8 w-8 text-slate-400 mb-2" />
              <p className="text-[15px] font-semibold text-slate-400">
                Sin interacciones registradas aún
              </p>
              <p className="text-sm text-slate-400 mt-1 max-w-sm">
                Utiliza el formulario de la izquierda para registrar la primera llamada, mensaje de WhatsApp o reunión.
              </p>
            </div>
          ) : (
            displayedActivities.map((act) => {
              const leadTarget = leads.find((l) => l.id === act.leadId);

              return (
                <div
                  key={act.id}
                  className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 transition-all hover:border-slate-600 shadow-sm"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 border border-slate-600">
                        {getChannelIcon(act.channel)}
                      </div>
                      <div>
                        <h4 className="flex items-center gap-2 text-sm font-bold text-slate-200">
                          {showCountry && leadTarget && (
                            <CountryFlag code={leadTarget.countryCode} title={COUNTRIES[leadTarget.countryCode].name} />
                          )}
                          {leadTarget?.fullName ?? 'Lead'}
                        </h4>
                        <span className="text-[13px] text-slate-400">
                          {act.contactName ? `Con ${act.contactName} • ` : ''}Por {act.agentName} •{' '}
                          {new Date(act.createdAt).toLocaleString('es-CL')}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold ${getOutcomeBadge(
                        act.outcome
                      )}`}
                    >
                      {getOutcomeLabel(act.outcome)}
                    </span>
                  </div>

                  <p className="mt-3 text-sm text-slate-300 leading-relaxed bg-slate-900/80 p-2.5 rounded-lg border border-slate-700">
                    {act.summary}
                  </p>

                  {act.nextFollowUpDate && (
                    <div className="mt-2.5 flex items-center space-x-1.5 text-[13px] text-amber-400 font-medium">
                      <Clock className="h-4 w-4" />
                      <span>
                        Próximo contacto agendado:{' '}
                        {new Date(act.nextFollowUpDate).toLocaleString('es-CL')}
                      </span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        </>
        )}
      </div>
    </div>
  );
};

// Alta rápida de otra persona del mismo lead, sin salir de la toma de contacto
function NewContactModal({
  leadName,
  companyName,
  onClose,
  onSave,
}: {
  leadName: string;
  companyName?: string;
  onClose: () => void;
  onSave: (data: { fullName: string; jobTitle?: string; email?: string; phone?: string }) => void;
}) {
  const [fullName, setFullName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [showError, setShowError] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setShowError(true);
      return;
    }
    onSave({
      fullName: fullName.trim(),
      jobTitle: jobTitle.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
    });
  };

  return (
    <Modal
      title="Nuevo contacto del lead"
      subtitle={`Se suma a ${leadName}${companyName ? ` · ${companyName}` : ''}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancelar
          </button>
          <button type="submit" form="nuevo-contacto-form" className={primaryButton}>
            Agregar contacto
          </button>
        </>
      }
    >
      <form id="nuevo-contacto-form" noValidate onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="nc-name" className={labelClass}>Nombre completo *</label>
          <input
            id="nc-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={`${inputClass} ${showError && !fullName.trim() ? 'border-rose-500!' : ''}`}
          />
          {showError && !fullName.trim() && (
            <p className="mt-1 text-sm font-medium text-rose-300">Ingresa el nombre de la persona.</p>
          )}
        </div>
        <div>
          <label htmlFor="nc-job" className={labelClass}>Cargo</label>
          <input
            id="nc-job"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            placeholder="Ej. Encargada de Pagos"
            className={inputClass}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="nc-email" className={labelClass}>Email</label>
            <input id="nc-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="nc-phone" className={labelClass}>Teléfono</label>
            <input id="nc-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
          </div>
        </div>
        <p className="text-sm text-slate-400">
          Queda como contacto adicional del lead y disponible en "¿Con quién hablaste?".
        </p>
      </form>
    </Modal>
  );
}
