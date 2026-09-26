import React, { useMemo, useState } from 'react';
import type { AppUser, CatalogItem, ClientAccount, Lead, LeadContact, NewAppUser, NewCatalogItem, PrivacyRequestReason, TerritoryMetric } from '../types/crm';
import { TeamUsersSection } from './TeamUsersSection';
import { LeadContactsEditor } from './LeadContactsEditor';
import { CatalogManager } from './CatalogManager';
import { LeadItemsEditor } from './LeadItemsEditor';
import { fromDraftItems, itemsSubtotal, toDraftItems, type DraftLeadItem } from '../lib/catalog';
import { extraContactsCount, leadTitle } from '../lib/contacts';
import { blockedReason, isAnonymized, isBlocked, isPendingProspect, prospectDaysLeft } from '../lib/privacy';
import { PrivacyDecisionModal, PrivacyRequestModal } from './PrivacyRequestModal';
import { convert, leadCurrenciesFor, leadCurrency, roundForCurrency } from '../lib/currency';
import { useMoney } from '../lib/money';
import {
  Building2,
  Users,
  MapPinOff,
  Search,
  Pencil,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  Boxes,
  Users2,
  FileDown,
  ShieldAlert,
} from 'lucide-react';
import { locateInCommune } from '../lib/geocoding';
import { COUNTRIES, zoneLabelFor, zoneWithArticle, type CountryCode, type CurrencyCode } from '../data/countries';
import { formatMoney } from '../lib/currency';
import { CountryFlag } from './CountryFlag';
import {
  cardClass,
  formatDate,
  inputClass,
  labelClass,
  primaryButton,
  secondaryButton,
  tableCell,
  tableHeadRow,
} from '../lib/styles';
import { ActiveSwitch, EmptyState, Modal, Pill, SectionTabs } from './ui';

export type NewClientAccount = Omit<ClientAccount, 'id' | 'companyId' | 'createdAt'>;

type Section = 'accounts' | 'contacts' | 'catalog' | 'team' | 'queue';

const errorInput = 'border-rose-500! ring-2! ring-rose-500/30!';

const isOpenLead = (lead: Lead) => lead.commercialStatus !== 'won' && lead.commercialStatus !== 'lost';
const hasCommune = (lead: Lead) => lead.geocodingStatus === 'success' && !!lead.assignedTerritoryId;
const zoneOf = (code: CountryCode) => COUNTRIES[code].zoneLabel.singular.toLowerCase();

interface ManagerModuleProps {
  leads: Lead[];
  accounts: ClientAccount[];
  territories: TerritoryMetric[];
  countries: CountryCode[]; // países visibles (filtro global del plan Internacional)
  enabledCountries: CountryCode[]; // países habilitados para el CRM
  catalog: CatalogItem[];
  usedItemIds: Set<string>;
  onCreateCatalogItem: (item: NewCatalogItem) => void;
  onUpdateCatalogItem: (item: CatalogItem) => void;
  onDeleteCatalogItem: (itemId: string) => void;
  // Usuarios del propio CRM, administrados por gerencia
  teamUsers: AppUser[];
  currentUserId: string;
  onCreateTeamUser: (user: NewAppUser) => string | null | Promise<string | null>;
  onUpdateTeamUser: (user: AppUser) => string | null | Promise<string | null>;
  /** Con Supabase el equipo se invita por correo: nadie escribe la contraseña de otra persona */
  teamInvitations?: boolean;
  onCreateAccount: (account: NewClientAccount) => void;
  onUpdateAccount: (account: ClientAccount) => void;
  onDeleteAccount: (accountId: string) => void;
  onUpdateLead: (lead: Lead) => void;
  // Derechos del titular sobre sus datos (Ley 21.719)
  canResolvePrivacy: boolean;
  onRequestPrivacy: (leadId: string, reason: PrivacyRequestReason, detail: string) => string | null;
  onResolvePrivacy: (leadId: string, approve: boolean, note: string) => void;
  onDownloadSubjectReport: (leadId: string) => void;
}

export const ManagerModule: React.FC<ManagerModuleProps> = ({
  leads,
  accounts,
  territories,
  countries,
  enabledCountries,
  catalog,
  usedItemIds,
  onCreateCatalogItem,
  onUpdateCatalogItem,
  onDeleteCatalogItem,
  teamUsers,
  currentUserId,
  onCreateTeamUser,
  onUpdateTeamUser,
  teamInvitations,
  onCreateAccount,
  onUpdateAccount,
  onDeleteAccount,
  onUpdateLead,
  canResolvePrivacy,
  onRequestPrivacy,
  onResolvePrivacy,
  onDownloadSubjectReport,
}) => {
  const [section, setSection] = useState<Section>('accounts');
  const queueCount = leads.filter((l) => !hasCommune(l)).length;
  const zoneLabel = zoneLabelFor(countries).toLowerCase();
  const showCountry = countries.length > 1;

  return (
    <div className="space-y-6">

      <SectionTabs
        active={section}
        onChange={setSection}
        tabs={[
          { id: 'accounts', label: 'Empresas cliente', icon: Building2, count: accounts.length },
          { id: 'contacts', label: 'Contactos', icon: Users, count: leads.length },
          { id: 'catalog', label: 'Catálogo', icon: Boxes, count: catalog.length },
          { id: 'team', label: 'Usuarios', icon: Users2, count: teamUsers.length },
          { id: 'queue', label: `Leads sin ${zoneLabel}`, icon: MapPinOff, count: queueCount, highlight: queueCount > 0 },
        ]}
      />

      {section === 'accounts' && (
        <AccountsSection
          leads={leads}
          accounts={accounts}
          showCountry={showCountry}
          formCountries={enabledCountries}
          defaultCountry={countries[0]}
          onCreateAccount={onCreateAccount}
          onUpdateAccount={onUpdateAccount}
          onDeleteAccount={onDeleteAccount}
        />
      )}
      {section === 'contacts' && (
        <ContactsSection
          leads={leads}
          accounts={accounts}
          territories={territories}
          countries={countries}
          currencies={leadCurrenciesFor(enabledCountries)}
          catalog={catalog}
          onUpdateLead={onUpdateLead}
          canResolvePrivacy={canResolvePrivacy}
          onRequestPrivacy={onRequestPrivacy}
          onResolvePrivacy={onResolvePrivacy}
          onDownloadSubjectReport={onDownloadSubjectReport}
        />
      )}
      {section === 'catalog' && (
        <CatalogManager
          catalog={catalog}
          leads={leads}
          usedItemIds={usedItemIds}
          countries={enabledCountries}
          onCreate={onCreateCatalogItem}
          onUpdate={onUpdateCatalogItem}
          onDelete={onDeleteCatalogItem}
        />
      )}
      {section === 'team' && (
        <TeamUsersSection
          users={teamUsers}
          currentUserId={currentUserId}
          onCreateUser={onCreateTeamUser}
          onUpdateUser={onUpdateTeamUser}
          invitations={teamInvitations}
        />
      )}
      {section === 'queue' && (
        <QueueSection leads={leads} territories={territories} countries={countries} onUpdateLead={onUpdateLead} />
      )}
    </div>
  );
};

const sortCommunes = (territories: TerritoryMetric[]) =>
  [...territories].sort((a, b) => a.territoryName.localeCompare(b.territoryName, 'es'));

/* ======================= MANTENEDOR DE EMPRESAS CLIENTE ======================= */

function AccountsSection({
  leads,
  accounts,
  showCountry,
  formCountries,
  defaultCountry,
  onCreateAccount,
  onUpdateAccount,
  onDeleteAccount,
}: {
  leads: Lead[];
  accounts: ClientAccount[];
  showCountry: boolean;
  formCountries: CountryCode[];
  defaultCountry: CountryCode;
  onCreateAccount: (account: NewClientAccount) => void;
  onUpdateAccount: (account: ClientAccount) => void;
  onDeleteAccount: (accountId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [editing, setEditing] = useState<ClientAccount | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ClientAccount | null>(null);
  const money = useMoney();

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts
      .map((account) => {
        const accountLeads = leads.filter((l) => l.clientAccountId === account.id);
        const openLeads = accountLeads.filter(isOpenLead);
        const lastActivity = accountLeads
          .map((l) => l.lastContactedAt ?? l.createdAt)
          .sort()
          .pop();
        return {
          account,
          total: accountLeads.length,
          open: openLeads.length,
          won: accountLeads.filter((l) => l.commercialStatus === 'won').length,
          // Una misma empresa puede tener leads en monedas distintas: se suman ya convertidos a la vista
          pipeline: money.sumLeads(openLeads),
          wonValue: money.sumLeads(accountLeads.filter((l) => l.commercialStatus === 'won')),
          lastActivity,
        };
      })
      .filter(({ account }) => {
        if (statusFilter === 'active' && !account.isActive) return false;
        if (statusFilter === 'inactive' && account.isActive) return false;
        if (!q) return true;
        return [account.name, account.taxId, account.industry, account.contactName, account.email, COUNTRIES[account.countryCode].name]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q);
      })
      .sort(
        (a, b) =>
          Number(b.account.isActive) - Number(a.account.isActive) ||
          a.account.name.localeCompare(b.account.name, 'es')
      );
  }, [accounts, leads, query, statusFilter, money]);

  const activeCount = accounts.filter((a) => a.isActive).length;

  return (
    <div className={cardClass}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 p-5">
        <div>
          <h3 className="text-lg font-bold text-slate-100">Mantenedor de empresas cliente</h3>
          <p className="text-sm text-slate-400">
            {activeCount} activas · {accounts.length - activeCount} desactivadas. Una empresa desactivada no recibe
            nuevos leads, pero conserva su historial.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={showCountry ? 'Buscar empresa, RUT/RUC, rubro...' : `Buscar empresa, ${COUNTRIES[defaultCountry].taxIdLabel}, rubro...`}
              aria-label="Buscar empresa"
              className={`${inputClass} w-60! pl-10`}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            aria-label="Filtrar por estado"
            className={`${inputClass} w-40!`}
          >
            <option value="all">Todas</option>
            <option value="active">Activas</option>
            <option value="inactive">Desactivadas</option>
          </select>
          <button type="button" onClick={() => setEditing('new')} className={primaryButton}>
            <Plus className="h-5 w-5" />
            Nueva empresa
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="p-5">
          <EmptyState icon={Building2} title="Sin resultados" description="Ninguna empresa coincide con la búsqueda." />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[15px]">
            <thead>
              <tr className={tableHeadRow}>
                <th className={tableCell}>Empresa</th>
                <th className={tableCell}>Contacto principal</th>
                <th className={tableCell}>Leads</th>
                <th className={`${tableCell} text-right`}>Ganado · abierto</th>
                <th className={tableCell}>Última actividad</th>
                <th className={tableCell}>Estado</th>
                <th className={`${tableCell} text-right`}>Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/70">
              {rows.map(({ account, total, open, won, pipeline, wonValue, lastActivity }) => (
                <tr key={account.id} className={account.isActive ? '' : 'bg-slate-950/40'}>
                  <td className={tableCell}>
                    <div
                      className={`flex items-center gap-2 font-semibold ${account.isActive ? 'text-slate-100' : 'text-slate-400'}`}
                    >
                      {showCountry && <CountryFlag code={account.countryCode} title={COUNTRIES[account.countryCode].name} />}
                      {account.name}
                    </div>
                    <div className="text-sm text-slate-400">
                      {[account.industry, account.taxId].filter(Boolean).join(' · ') ||
                        `Sin rubro ni ${COUNTRIES[account.countryCode].taxIdLabel}`}
                    </div>
                  </td>
                  <td className={tableCell}>
                    <div className="text-slate-200">{account.contactName || '—'}</div>
                    <div className="max-w-[11rem] truncate text-sm text-slate-400" title={account.email || account.phone}>
                      {account.email || account.phone || 'Sin datos'}
                    </div>
                  </td>
                  <td className={tableCell}>
                    {total === 0 ? (
                      <span className="text-slate-400">Sin leads</span>
                    ) : (
                      <>
                        <div className="text-slate-200">
                          {total} {total === 1 ? 'lead' : 'leads'}
                        </div>
                        <div className="whitespace-nowrap text-sm text-slate-400">
                          {open} {open === 1 ? 'abierto' : 'abiertos'}
                        </div>
                        <div className="whitespace-nowrap text-sm text-slate-400">
                          {won} {won === 1 ? 'ganado' : 'ganados'}
                        </div>
                      </>
                    )}
                  </td>
                  {/* Ganado arriba (lo que ya dejó la empresa), abierto abajo (lo que sigue en juego) */}
                  <td className={`${tableCell} whitespace-nowrap text-right tabular-nums`}>
                    <div className="font-bold text-emerald-300">
                      {formatMoney(wonValue, money.display)}
                    </div>
                    <div className="text-sm text-slate-400">abierto {formatMoney(pipeline, money.display)}</div>
                  </td>
                  <td className={`${tableCell} text-slate-300`}>{formatDate(lastActivity)}</td>
                  <td className={tableCell}>
                    <div className="flex items-center gap-2.5">
                      {/* Solo el interruptor: la fila inactiva ya se ve atenuada y el nombre en gris */}
                      <ActiveSwitch
                        checked={account.isActive}
                        onChange={(isActive) => onUpdateAccount({ ...account, isActive })}
                        label={account.isActive ? `Desactivar ${account.name}` : `Activar ${account.name}`}
                      />
                    </div>
                  </td>
                  <td className={`${tableCell} text-right`}>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditing(account)}
                        aria-label={`Editar ${account.name}`}
                        title="Editar"
                        className={`${secondaryButton} px-2.5 py-2 text-sm`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleting(account)}
                        disabled={total > 0}
                        title={total > 0 ? 'Tiene leads asociados: desactívala en vez de eliminarla' : `Eliminar ${account.name}`}
                        aria-label={`Eliminar ${account.name}`}
                        className={`${secondaryButton} px-3 py-2 text-sm text-rose-300`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <AccountFormModal
          account={editing === 'new' ? null : editing}
          otherAccounts={accounts.filter((a) => editing === 'new' || a.id !== editing.id)}
          countries={formCountries}
          defaultCountry={defaultCountry}
          countryLocked={editing !== 'new' && leads.some((l) => l.clientAccountId === editing.id)}
          onClose={() => setEditing(null)}
          onSave={(data) => {
            if (editing === 'new') onCreateAccount(data);
            else onUpdateAccount({ ...editing, ...data });
            setEditing(null);
          }}
        />
      )}

      {deleting && (
        <Modal
          title="Eliminar empresa"
          subtitle={deleting.name}
          onClose={() => setDeleting(null)}
          footer={
            <>
              <button type="button" onClick={() => setDeleting(null)} className={secondaryButton}>
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteAccount(deleting.id);
                  setDeleting(null);
                }}
                className={`${primaryButton} bg-rose-600! hover:bg-rose-500!`}
              >
                <Trash2 className="h-4 w-4" />
                Eliminar
              </button>
            </>
          }
        >
          <p className="text-[15px] text-slate-300">
            Esta empresa no tiene leads asociados. Se eliminará definitivamente del mantenedor. ¿Continuar?
          </p>
        </Modal>
      )}
    </div>
  );
}

function AccountFormModal({
  account,
  otherAccounts,
  countries,
  defaultCountry,
  countryLocked,
  onClose,
  onSave,
}: {
  account: ClientAccount | null;
  otherAccounts: ClientAccount[];
  countries: CountryCode[];
  defaultCountry: CountryCode;
  countryLocked: boolean;
  onClose: () => void;
  onSave: (data: NewClientAccount) => void;
}) {
  const [form, setForm] = useState<NewClientAccount>(
    account
      ? {
          countryCode: account.countryCode,
          name: account.name,
          taxId: account.taxId,
          industry: account.industry,
          contactName: account.contactName,
          email: account.email,
          phone: account.phone,
          address: account.address,
          notes: account.notes,
          isActive: account.isActive,
        }
      : { countryCode: defaultCountry, name: '', isActive: true }
  );
  const country = COUNTRIES[form.countryCode];
  // El nombre es único dentro de cada país (la misma marca puede operar en otro país)
  const existingNames = otherAccounts.filter((a) => a.countryCode === form.countryCode).map((a) => a.name.toLowerCase());
  const [showErrors, setShowErrors] = useState(false);
  const set = <K extends keyof NewClientAccount>(key: K, value: NewClientAccount[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const trimmedName = form.name.trim();
  const nameError = !trimmedName
    ? 'El nombre es obligatorio.'
    : existingNames.includes(trimmedName.toLowerCase())
      ? `Ya existe otra empresa con ese nombre en ${country.name}.`
      : null;
  const emailError = form.email?.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim()) ? 'El email no es válido.' : null;

  const clean = (value?: string) => value?.trim() || undefined;

  return (
    <Modal
      title={account ? 'Editar empresa cliente' : 'Nueva empresa cliente'}
      subtitle={account ? 'Los cambios de nombre se reflejan en todos sus leads.' : 'Quedará disponible al capturar leads.'}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancelar
          </button>
          <button type="submit" form="account-form" className={primaryButton}>
            {account ? 'Guardar cambios' : 'Crear empresa'}
          </button>
        </>
      }
    >
      <form
        id="account-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setShowErrors(true);
          if (nameError || emailError) return;
          onSave({
            ...form,
            name: trimmedName,
            taxId: clean(form.taxId),
            industry: clean(form.industry),
            contactName: clean(form.contactName),
            email: clean(form.email),
            phone: clean(form.phone),
            address: clean(form.address),
            notes: clean(form.notes),
          });
        }}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        {countries.length > 1 && (
          <div className="sm:col-span-2">
            <label htmlFor="acc-country" className={labelClass}>País *</label>
            <select
              id="acc-country"
              value={form.countryCode}
              disabled={countryLocked}
              onChange={(e) => set('countryCode', e.target.value as CountryCode)}
              className={inputClass}
            >
              {countries.map((code) => (
                <option key={code} value={code}>
                  {COUNTRIES[code].name}
                </option>
              ))}
            </select>
            {countryLocked && (
              <p className="mt-1 text-sm text-slate-400">Tiene leads asociados: su país no se puede cambiar.</p>
            )}
          </div>
        )}
        <div className="sm:col-span-2">
          <label htmlFor="acc-name" className={labelClass}>Nombre *</label>
          <input
            id="acc-name"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            aria-invalid={showErrors && !!nameError}
            className={`${inputClass} ${showErrors && nameError ? errorInput : ''}`}
          />
          {showErrors && nameError && <p className="mt-1 text-sm font-medium text-rose-300">{nameError}</p>}
        </div>
        <div>
          <label htmlFor="acc-tax" className={labelClass}>{country.taxIdLabel}</label>
          <input id="acc-tax" value={form.taxId ?? ''} onChange={(e) => set('taxId', e.target.value)} placeholder={country.taxIdExample} className={inputClass} />
        </div>
        <div>
          <label htmlFor="acc-industry" className={labelClass}>Rubro</label>
          <input id="acc-industry" value={form.industry ?? ''} onChange={(e) => set('industry', e.target.value)} className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="acc-contact" className={labelClass}>Contacto principal</label>
          <input id="acc-contact" value={form.contactName ?? ''} onChange={(e) => set('contactName', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="acc-email" className={labelClass}>Email</label>
          <input
            id="acc-email"
            type="email"
            value={form.email ?? ''}
            onChange={(e) => set('email', e.target.value)}
            aria-invalid={showErrors && !!emailError}
            className={`${inputClass} ${showErrors && emailError ? errorInput : ''}`}
          />
          {showErrors && emailError && <p className="mt-1 text-sm font-medium text-rose-300">{emailError}</p>}
        </div>
        <div>
          <label htmlFor="acc-phone" className={labelClass}>Teléfono</label>
          <input id="acc-phone" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} placeholder={country.phonePrefix} className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="acc-address" className={labelClass}>Dirección</label>
          <input id="acc-address" value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="acc-notes" className={labelClass}>Notas</label>
          <textarea id="acc-notes" rows={3} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} className={inputClass} />
        </div>
        <div className="flex items-center gap-3 sm:col-span-2">
          <ActiveSwitch checked={form.isActive} onChange={(v) => set('isActive', v)} label="Empresa activa" />
          <span className="text-[15px] text-slate-300">Empresa activa (puede recibir nuevos leads)</span>
        </div>
      </form>
    </Modal>
  );
}

/* ================================ CONTACTOS ================================ */

function ContactsSection({
  leads,
  accounts,
  territories,
  countries,
  currencies,
  catalog,
  onUpdateLead,
  canResolvePrivacy,
  onRequestPrivacy,
  onResolvePrivacy,
  onDownloadSubjectReport,
}: {
  leads: Lead[];
  accounts: ClientAccount[];
  territories: TerritoryMetric[];
  countries: CountryCode[];
  currencies: CurrencyCode[];
  catalog: CatalogItem[];
  onUpdateLead: (lead: Lead) => void;
  // Derechos del titular sobre sus datos (Ley 21.719)
  canResolvePrivacy: boolean;
  onRequestPrivacy: (leadId: string, reason: PrivacyRequestReason, detail: string) => string | null;
  onResolvePrivacy: (leadId: string, approve: boolean, note: string) => void;
  onDownloadSubjectReport: (leadId: string) => void;
}) {
  const showCountry = countries.length > 1;
  const zoneLabel = zoneLabelFor(countries);
  // Solicitudes del titular: registrar una (cualquier perfil) y resolverla (solo gerencia)
  const [requesting, setRequesting] = useState<Lead | null>(null);
  const [deciding, setDeciding] = useState<Lead | null>(null);
  const [query, setQuery] = useState('');
  const [accountFilter, setAccountFilter] = useState('all');
  const [editing, setEditing] = useState<Lead | null>(null);

  const accountName = (id?: string) => accounts.find((a) => a.id === id)?.name;
  const communeName = (id?: string) => territories.find((t) => t.territoryId === id)?.territoryName;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads
      .filter((lead) => accountFilter === 'all' || lead.clientAccountId === accountFilter)
      .filter((lead) =>
        !q
          ? true
          : [lead.fullName, lead.companyName, lead.email, lead.phone, lead.rawAddress, ...(lead.contacts ?? []).map((c) => c.fullName)]
              .filter(Boolean)
              .join(' ')
              .toLowerCase()
              .includes(q)
      )
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'));
  }, [leads, query, accountFilter]);

  return (
    <div className={cardClass}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 p-5">
        <div>
          <h3 className="text-lg font-bold text-slate-100">Contactos de leads</h3>
          <p className="text-sm text-slate-400">
            Corrige nombre, empresa, email, teléfono, dirección o {zoneLabel.toLowerCase()}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nombre, email, teléfono..."
              aria-label="Buscar contacto"
              className={`${inputClass} w-64! pl-10`}
            />
          </div>
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            aria-label="Filtrar por empresa"
            className={`${inputClass} w-56!`}
          >
            <option value="all">Todas las empresas</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {showCountry ? ` · ${COUNTRIES[a.countryCode].name}` : ''}
                {a.isActive ? '' : ' (inactiva)'}
              </option>
            ))}
          </select>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="p-5">
          <EmptyState icon={Users} title="Sin resultados" description="Ningún contacto coincide con la búsqueda." />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[15px]">
            <thead>
              <tr className={tableHeadRow}>
                <th className={tableCell}>Contacto</th>
                <th className={tableCell}>Empresa</th>
                <th className={tableCell}>Email / Teléfono</th>
                <th className={tableCell}>Dirección y {zoneLabel.toLowerCase()}</th>
                <th className={`${tableCell} text-right`}>Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/70">
              {rows.map((lead) => {
                const commune = hasCommune(lead) ? communeName(lead.assignedTerritoryId) : undefined;
                return (
                  <tr key={lead.id}>
                    <td className={tableCell}>
                      <div className="flex items-center gap-2 font-semibold text-slate-100">
                        {showCountry && <CountryFlag code={lead.countryCode} title={COUNTRIES[lead.countryCode].name} />}
                        {lead.fullName}
                      </div>
                      {lead.jobTitle && <div className="text-sm text-slate-400">{lead.jobTitle}</div>}
                      {extraContactsCount(lead) > 0 && (
                        <div className="mt-1 text-sm font-semibold text-indigo-300">
                          +{extraContactsCount(lead)} {extraContactsCount(lead) === 1 ? 'contacto más' : 'contactos más'}
                        </div>
                      )}
                      {isPendingProspect(lead) && (
                        <div className="mt-1" title="Aún no se le pregunta si autoriza; si nadie la contacta, sus datos se eliminan solos">
                          <Pill tone="indigo">Prospecto · {Math.max(prospectDaysLeft(lead) ?? 0, 0)} días</Pill>
                        </div>
                      )}
                      {blockedReason(lead) && (
                        <div className="mt-1">
                          <Pill tone={isAnonymized(lead) ? 'slate' : isBlocked(lead) ? 'amber' : 'red'}>
                            {isAnonymized(lead) ? 'Datos eliminados' : isBlocked(lead) ? 'Bloqueado' : 'No contactar'}
                          </Pill>
                        </div>
                      )}
                    </td>
                    <td className={`${tableCell} text-slate-300`}>
                      {accountName(lead.clientAccountId) ?? lead.companyName ?? (
                        <span className="text-slate-400">Persona natural</span>
                      )}
                    </td>
                    <td className={tableCell}>
                      <div className="max-w-[13rem] truncate text-slate-200" title={lead.email || undefined}>
                        {lead.email || '—'}
                      </div>
                      <div className="text-sm text-slate-400">{lead.phone || 'Sin teléfono'}</div>
                    </td>
                    <td className={tableCell}>
                      <div className="max-w-[11rem] truncate text-slate-300" title={lead.rawAddress}>
                        {lead.rawAddress}
                      </div>
                      <div className="mt-0.5">
                        {commune ? (
                          <span className="text-sm text-slate-400">{commune}</span>
                        ) : (
                          <Pill tone="amber">Sin {zoneOf(lead.countryCode)}</Pill>
                        )}
                      </div>
                    </td>
                    <td className={`${tableCell} text-right`}>
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => onDownloadSubjectReport(lead.id)}
                          aria-label={`Descargar los datos de ${lead.fullName}`}
                          title="Descargar sus datos (derecho de acceso y portabilidad)"
                          className={`${secondaryButton} px-2 py-2 text-sm`}
                        >
                          <FileDown className="h-4 w-4" />
                        </button>
                        {isBlocked(lead) ? (
                          canResolvePrivacy && (
                            <button
                              type="button"
                              onClick={() => setDeciding(lead)}
                              aria-label={`Resolver la solicitud de ${lead.fullName}`}
                              title="Resolver la solicitud del titular"
                              className="cursor-pointer rounded-xl border border-amber-500/40 bg-amber-500/10 px-2 py-2 text-sm font-semibold text-amber-300 transition hover:bg-amber-500/20"
                            >
                              <ShieldAlert className="h-4 w-4" />
                            </button>
                          )
                        ) : (
                          !isAnonymized(lead) && (
                            <button
                              type="button"
                              onClick={() => setRequesting(lead)}
                              aria-label={`Registrar solicitud del titular de ${lead.fullName}`}
                              title="El titular pide algo sobre sus datos"
                              className={`${secondaryButton} px-2 py-2 text-sm`}
                            >
                              <ShieldAlert className="h-4 w-4" />
                            </button>
                          )
                        )}
                        <button
                          type="button"
                          onClick={() => setEditing(lead)}
                          aria-label={`Editar a ${lead.fullName}`}
                          title="Editar"
                          className={`${secondaryButton} px-2 py-2 text-sm`}
                          disabled={isBlocked(lead)}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {requesting && (
        <PrivacyRequestModal
          lead={requesting}
          onClose={() => setRequesting(null)}
          onSubmit={(reason, detail) => onRequestPrivacy(requesting.id, reason, detail)}
        />
      )}

      {deciding && (
        <PrivacyDecisionModal
          lead={deciding}
          onClose={() => setDeciding(null)}
          onDecide={(approve, note) => {
            onResolvePrivacy(deciding.id, approve, note);
            setDeciding(null);
          }}
        />
      )}

      {editing && (
        <LeadContactModal
          lead={editing}
          accounts={accounts}
          territories={territories}
          countries={countries}
          currencies={currencies}
          catalog={catalog}
          onClose={() => setEditing(null)}
          onSave={(updated) => {
            onUpdateLead(updated);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function LeadContactModal({
  lead,
  accounts,
  territories,
  countries,
  currencies,
  catalog,
  onClose,
  onSave,
}: {
  lead: Lead;
  accounts: ClientAccount[];
  territories: TerritoryMetric[];
  countries: CountryCode[];
  currencies: CurrencyCode[];
  catalog: CatalogItem[];
  onClose: () => void;
  onSave: (lead: Lead) => void;
}) {
  const [form, setForm] = useState<Lead>(lead);
  const [contacts, setContacts] = useState<LeadContact[]>(lead.contacts ?? []);
  const { rates } = useMoney();
  const [currency, setCurrency] = useState<CurrencyCode>(leadCurrency(lead));
  const [items, setItems] = useState<DraftLeadItem[]>(toDraftItems(lead.items));
  const [dealValue, setDealValue] = useState(String(lead.estimatedDealValue ?? 0));
  const [manualValue, setManualValue] = useState((lead.items?.length ?? 0) > 0 && lead.valueSource === 'manual');
  const [communeId, setCommuneId] = useState(hasCommune(lead) ? (lead.assignedTerritoryId ?? '') : '');
  const [showErrors, setShowErrors] = useState(false);
  const set = <K extends keyof Lead>(key: K, value: Lead[K]) => setForm((f) => ({ ...f, [key]: value }));

  // La empresa y la zona dependen del país del lead
  const country = COUNTRIES[form.countryCode];
  const countryAccounts = accounts.filter((a) => a.countryCode === form.countryCode);
  const countryZones = territories.filter((t) => t.countryCode === form.countryCode);
  const changeCountry = (code: CountryCode) => {
    setForm((f) => ({ ...f, countryCode: code, clientAccountId: undefined }));
    setCommuneId('');
    // Los precios de los ítems están en la moneda del país anterior
    setItems([]);
    setManualValue(false);
  };

  // Cambiar la moneda de un lead convierte su monto y sus precios con la tasa del día.
  // Queda en la auditoría como "Moneda del lead", y se puede revertir.
  const changeCurrency = (next: CurrencyCode) => {
    const conv = (value: string) =>
      value.trim() === '' ? value : String(roundForCurrency(convert(Number(value) || 0, currency, next, rates), next));
    setItems((prev) => prev.map((row) => ({ ...row, unitPrice: conv(row.unitPrice) })));
    setDealValue((prev) => conv(prev));
    setCurrency(next);
  };

  const errors = {
    fullName: form.fullName.trim() ? null : 'Ingresa el nombre.',
    rawAddress: form.rawAddress.trim() ? null : 'Ingresa la dirección.',
    commune: countryZones.some((t) => t.territoryId === communeId)
      ? null
      : `Selecciona ${zoneWithArticle([form.countryCode])}.`,
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const handleSave = () => {
    setShowErrors(true);
    if (hasErrors) return;
    const account = accounts.find((a) => a.id === form.clientAccountId);
    const rawAddress = form.rawAddress.trim();
    const locationChanged =
      communeId !== lead.assignedTerritoryId ||
      rawAddress !== lead.rawAddress ||
      form.countryCode !== lead.countryCode ||
      !hasCommune(lead);

    const leadItems = fromDraftItems(items);
    const manual = leadItems.length === 0 || manualValue;
    let updated: Lead = {
      ...form,
      fullName: form.fullName.trim(),
      jobTitle: form.jobTitle?.trim() || undefined,
      contacts,
      currency,
      rawAddress,
      companyName: account?.name,
      items: leadItems,
      valueSource: manual ? 'manual' : 'items',
      estimatedDealValue: manual ? Math.max(0, Number(dealValue) || 0) : itemsSubtotal(leadItems),
    };
    if (locationChanged) updated = { ...updated, ...locateInCommune(territories.find((t) => t.territoryId === communeId), rawAddress) };
    onSave(updated);
  };

  return (
    <Modal
      title="Editar lead"
      subtitle={lead.companyName ?? 'Persona natural'}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancelar
          </button>
          <button type="submit" form="lead-contact-form" className={primaryButton}>
            Guardar cambios
          </button>
        </>
      }
    >
      <form
        id="lead-contact-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        {showErrors && hasErrors && (
          <div role="alert" className="flex gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-[15px] text-rose-300 sm:col-span-2">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <span><strong>Error:</strong> revisa los campos marcados en rojo.</span>
          </div>
        )}
        {countries.length > 1 && (
          <div className="sm:col-span-2">
            <label htmlFor="lc-country" className={labelClass}>País *</label>
            <select
              id="lc-country"
              value={form.countryCode}
              onChange={(e) => changeCountry(e.target.value as CountryCode)}
              className={inputClass}
            >
              {countries.map((code) => (
                <option key={code} value={code}>
                  {COUNTRIES[code].name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="sm:col-span-2">
          <label htmlFor="lc-name" className={labelClass}>Nombre completo *</label>
          <input
            id="lc-name"
            value={form.fullName}
            onChange={(e) => set('fullName', e.target.value)}
            className={`${inputClass} ${showErrors && errors.fullName ? errorInput : ''}`}
          />
          {showErrors && errors.fullName && <p className="mt-1 text-sm font-medium text-rose-300">{errors.fullName}</p>}
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="lc-jobTitle" className={labelClass}>Cargo del contacto</label>
          <input
            id="lc-jobTitle"
            value={form.jobTitle ?? ''}
            onChange={(e) => set('jobTitle', e.target.value)}
            placeholder="Ej. Gerente de Operaciones"
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="lc-account" className={labelClass}>¿A qué empresa pertenece?</label>
          <select
            id="lc-account"
            value={form.clientAccountId ?? ''}
            onChange={(e) => set('clientAccountId', e.target.value || undefined)}
            className={inputClass}
          >
            <option value="">Sin empresa (persona natural)</option>
            {countryAccounts.map((a) => (
              <option key={a.id} value={a.id} disabled={!a.isActive && a.id !== lead.clientAccountId}>
                {a.name}
                {a.isActive ? '' : ' (inactiva)'}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="lc-email" className={labelClass}>Email</label>
          <input id="lc-email" type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="lc-phone" className={labelClass}>Teléfono</label>
          <input id="lc-phone" value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="lc-address" className={labelClass}>Dirección *</label>
          <input
            id="lc-address"
            value={form.rawAddress}
            onChange={(e) => set('rawAddress', e.target.value)}
            className={`${inputClass} ${showErrors && errors.rawAddress ? errorInput : ''}`}
          />
          {showErrors && errors.rawAddress && <p className="mt-1 text-sm font-medium text-rose-300">{errors.rawAddress}</p>}
        </div>
        <div>
          <label htmlFor="lc-commune" className={labelClass}>{country.zoneLabel.singular} *</label>
          <select
            id="lc-commune"
            value={communeId}
            onChange={(e) => setCommuneId(e.target.value)}
            className={`${inputClass} ${showErrors && errors.commune ? errorInput : ''}`}
          >
            <option value="">Selecciona…</option>
            {sortCommunes(countryZones).map((t) => (
              <option key={t.territoryId} value={t.territoryId}>
                {t.territoryName}
              </option>
            ))}
          </select>
          {showErrors && errors.commune && <p className="mt-1 text-sm font-medium text-rose-300">{errors.commune}</p>}
        </div>
        <div className="sm:col-span-2">
          <LeadContactsEditor idPrefix="lc" primaryName={form.fullName} contacts={contacts} onChange={setContacts} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="lc-notes" className={labelClass}>Notas</label>
          <textarea id="lc-notes" rows={3} value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <LeadItemsEditor
            idPrefix="lc"
            catalog={catalog}
            countryCode={form.countryCode}
            items={items}
            onItemsChange={setItems}
            value={dealValue}
            onValueChange={setDealValue}
            isManual={manualValue}
            onManualChange={setManualValue}
            currency={currency}
            currencies={currencies}
            onCurrencyChange={changeCurrency}
          />
        </div>
      </form>
    </Modal>
  );
}

/* ============================ LEADS SIN ZONA ============================ */

function QueueSection({
  leads,
  territories,
  countries,
  onUpdateLead,
}: {
  leads: Lead[];
  territories: TerritoryMetric[];
  countries: CountryCode[];
  onUpdateLead: (lead: Lead) => void;
}) {
  const showCountry = countries.length > 1;
  const zoneLabel = zoneLabelFor(countries).toLowerCase();
  const queue = leads.filter((l) => !hasCommune(l));
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [communes, setCommunes] = useState<Record<string, string>>({});
  const [missing, setMissing] = useState<Record<string, boolean>>({});
  const [resolved, setResolved] = useState<string[]>([]);

  const communeName = (id: string) => territories.find((t) => t.territoryId === id)?.territoryName ?? zoneWithArticle(countries);

  const assign = (lead: Lead) => {
    const territoryId = communes[lead.id];
    if (!territoryId) {
      setMissing((prev) => ({ ...prev, [lead.id]: true }));
      document.getElementById(`commune-${lead.id}`)?.focus();
      return;
    }
    const address = (drafts[lead.id] ?? lead.rawAddress).trim() || lead.rawAddress;
    onUpdateLead({ ...lead, rawAddress: address, ...locateInCommune(territories.find((t) => t.territoryId === territoryId), address) });
    setResolved((prev) => [`${lead.fullName} quedó ubicado en ${communeName(territoryId)}`, ...prev].slice(0, 4));
  };

  return (
    <div className="space-y-4">
      {resolved.length > 0 && (
        <div role="status" className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-3">
          {resolved.map((message) => (
            <p key={message} className="flex items-center gap-2 text-[15px] text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {message}
            </p>
          ))}
        </div>
      )}

      <div className={`${cardClass} p-5`}>
        <h3 className="text-lg font-bold text-slate-100">Leads sin {zoneLabel}</h3>
        <p className="text-sm text-slate-400">
          Estos leads no aparecen en el mapa ni en el ranking por zona hasta que se les asigne{' '}
          {zoneWithArticle(countries, 'indefinite')}.
        </p>
      </div>

      {queue.length === 0 ? (
        <EmptyState icon={CheckCircle2} title={`Todos los leads tienen ${zoneLabel}`} description="No hay leads pendientes de ubicar." />
      ) : (
        queue.map((lead) => {
          const address = drafts[lead.id] ?? lead.rawAddress;
          const isMissing = !!missing[lead.id];
          const leadZone = COUNTRIES[lead.countryCode].zoneLabel.singular;
          return (
            <div key={lead.id} className={`${cardClass} p-5`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-[17px] font-bold text-slate-100">
                    {showCountry && <CountryFlag code={lead.countryCode} title={COUNTRIES[lead.countryCode].name} />}
                    {leadTitle(lead)}
                  </p>
                  <p className="text-sm text-slate-400">
                    {lead.companyName ? lead.fullName : 'Persona natural'} · ingresado el {formatDate(lead.createdAt)}
                  </p>
                </div>
                <Pill tone="amber">Sin {leadZone.toLowerCase()}</Pill>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_240px_auto]">
                <div>
                  <label htmlFor={`addr-${lead.id}`} className={labelClass}>Dirección</label>
                  <div className="relative">
                    <MapPin className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id={`addr-${lead.id}`}
                      value={address}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [lead.id]: e.target.value }))}
                      className={`${inputClass} pl-10`}
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor={`commune-${lead.id}`} className={labelClass}>{leadZone} *</label>
                  <select
                    id={`commune-${lead.id}`}
                    value={communes[lead.id] ?? ''}
                    aria-invalid={isMissing}
                    aria-describedby={isMissing ? `commune-error-${lead.id}` : undefined}
                    onChange={(e) => {
                      setCommunes((prev) => ({ ...prev, [lead.id]: e.target.value }));
                      setMissing((prev) => ({ ...prev, [lead.id]: false }));
                    }}
                    className={`${inputClass} ${isMissing ? errorInput : ''}`}
                  >
                    <option value="">Selecciona…</option>
                    {sortCommunes(territories.filter((t) => t.countryCode === lead.countryCode)).map((t) => (
                      <option key={t.territoryId} value={t.territoryId}>
                        {t.territoryName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <button type="button" onClick={() => assign(lead)} className={`${primaryButton} w-full`}>
                    <MapPin className="h-4 w-4" />
                    Asignar {leadZone.toLowerCase()}
                  </button>
                </div>
              </div>

              {isMissing && (
                <div
                  id={`commune-error-${lead.id}`}
                  role="alert"
                  className="mt-3 flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-[15px] text-rose-300"
                >
                  <AlertTriangle className="h-5 w-5 shrink-0" />
                  <span>
                    <strong>Error:</strong> selecciona {zoneWithArticle([lead.countryCode], 'indefinite')} antes de asignar.
                  </span>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
