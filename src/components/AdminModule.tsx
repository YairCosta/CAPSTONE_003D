import React, { useEffect, useMemo, useState } from 'react';
import type { AppUser, Company, Lead, NewAppUser, NewCompany, UserRole } from '../types/crm';
import { ShieldCheck, Building2, Users, Plus, Pencil, Search, Globe2, Download, FileSpreadsheet, AlertTriangle, Loader2, CheckCircle2, Scale, Send } from 'lucide-react';
import type { TenantExport } from '../lib/tenantExport';
import { ROLE_LABEL } from '../lib/permissions';
import { COUNTRIES, COUNTRY_CODES, type CountryCode } from '../data/countries';
import { enabledCountriesOf } from '../lib/tenantGuards';
import { CountryFlag } from './CountryFlag';
import { ComplianceModule } from './ComplianceModule';
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
import { ActiveSwitch, Modal, PageHeader, Pill, SectionTabs, type PillTone } from './ui';

type Section = 'tenants' | 'users' | 'compliance';

/** Mensaje de error, o null si se guardó. Con Supabase la respuesta llega después (promesa). */
type SaveResult = string | null;
type SaveHandler<T> = (value: T) => SaveResult | Promise<SaveResult>;

const ROLE_TONE: Record<UserRole, PillTone> = { agent: 'slate', manager: 'indigo', superadmin: 'amber' };

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

interface AdminModuleProps {
  companies: Company[];
  users: AppUser[];
  leads: Lead[];
  currentUserId: string;
  onCreateCompany: SaveHandler<NewCompany>;
  onUpdateCompany: SaveHandler<Company>;
  onCreateUser: SaveHandler<NewAppUser>;
  onUpdateUser: SaveHandler<AppUser>;
  /** Con Supabase los usuarios se invitan por correo y eligen su contraseña; nadie la escribe por ellos */
  invitations?: boolean;
  // Portabilidad: resumen previo y descarga del Excel con los datos de un CRM. Con Supabase el
  // resumen llega después (los datos se piden a la base) y la descarga reutiliza lo ya armado.
  getExportPreview: (companyId: string) => TenantExport | null | Promise<TenantExport>;
  onExportCompany: (companyId: string, prepared?: TenantExport) => Promise<void>;
  // Portal fiscalizador: expediente de cumplimiento en solo lectura, con registro de accesos
  currentUserName: string;
  complianceAccessLog: { at: string; who: string; what: string }[];
  onComplianceAccess: (what: string) => void;
}

export const AdminModule: React.FC<AdminModuleProps> = (props) => {
  const [section, setSection] = useState<Section>('tenants');
  const { companies, users, leads } = props;

  const stats = [
    { label: 'CRMs activos', value: `${companies.filter((c) => c.isActive).length} / ${companies.length}` },
    { label: 'Usuarios activos', value: `${users.filter((u) => u.isActive).length} / ${users.length}` },
    { label: 'Leads en la plataforma', value: String(leads.length) },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ShieldCheck}
        eyebrow="Administración de plataforma"
        title="CRMs y usuarios"
        description="Crea el CRM de cada empresa (tenant), activa o desactiva su acceso y gestiona los usuarios base, gerentes y administradores."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className={`${cardClass} p-5`}>
            <p className="text-[15px] font-semibold text-slate-300">{s.label}</p>
            <p className="mt-2 text-3xl font-black text-slate-100">{s.value}</p>
          </div>
        ))}
      </div>

      <SectionTabs
        active={section}
        onChange={setSection}
        tabs={[
          { id: 'tenants', label: 'CRMs por empresa', icon: Building2, count: companies.length },
          { id: 'users', label: 'Usuarios', icon: Users, count: users.length },
          { id: 'compliance', label: 'Portal fiscalizador', icon: Scale },
        ]}
      />

      {section === 'tenants' && <TenantsSection {...props} />}
      {section === 'users' && <UsersSection {...props} />}
      {section === 'compliance' && (
        <ComplianceModule
          viewerName={props.currentUserName}
          accessLog={props.complianceAccessLog}
          onRecordAccess={props.onComplianceAccess}
        />
      )}
    </div>
  );
};

/* ================================ TENANTS ================================ */

function TenantsSection({
  companies,
  users,
  leads,
  onCreateCompany,
  onUpdateCompany,
  getExportPreview,
  onExportCompany,
}: AdminModuleProps) {
  const [editing, setEditing] = useState<Company | 'new' | null>(null);
  const [exporting, setExporting] = useState<Company | null>(null);
  const [disablingPlan, setDisablingPlan] = useState<Company | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const quickUpdate = async (company: Company) => setRowError(await onUpdateCompany(company));

  // Plan Internacional: la gerencia activa los países que necesite desde Gerencia → Países y divisas. Al
  // desactivarlo cuenta solo el país base, pero la lista se conserva: al reactivarlo vuelven los países
  // que el CRM ya usaba, con sus datos (nada se borra).
  const setInternational = (company: Company, international: boolean) =>
    quickUpdate({ ...company, plan: international ? 'international' : 'national' });

  const foreignLeads = (company: Company) =>
    leads.filter((l) => l.companyId === company.id && l.countryCode !== company.homeCountry).length;

  return (
    <div className={cardClass}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 p-5">
        <div>
          <h3 className="text-lg font-bold text-slate-100">CRMs por empresa</h3>
          <p className="text-sm text-slate-400">
            Al desactivar un CRM, ninguno de sus usuarios puede iniciar sesión. Sus datos se conservan.
          </p>
        </div>
        <button type="button" onClick={() => setEditing('new')} className={primaryButton}>
          <Plus className="h-5 w-5" />
          Nuevo CRM
        </button>
      </div>

      {rowError && <ErrorBanner message={rowError} onDismiss={() => setRowError(null)} />}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1080px] text-[15px]">
          <thead>
            <tr className={tableHeadRow}>
              <th className={tableCell}>Empresa</th>
              <th className={tableCell}>RUT</th>
              <th className={tableCell}>Plan Internacional</th>
              <th className={tableCell}>Creado</th>
              <th className={tableCell}>Usuarios</th>
              <th className={tableCell}>Leads</th>
              <th className={tableCell}>Estado</th>
              <th className={`${tableCell} text-right`}>Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/70">
            {companies.map((company) => {
              const companyUsers = users.filter((u) => u.companyId === company.id);
              const countries = enabledCountriesOf(company);
              const isInternational = company.plan === 'international';
              return (
                <tr key={company.id} className={company.isActive ? '' : 'bg-slate-950/40'}>
                  <td className={tableCell}>
                    <div className={`font-semibold ${company.isActive ? 'text-slate-100' : 'text-slate-400'}`}>{company.name}</div>
                    <div className="text-sm text-slate-400">/{company.slug}</div>
                  </td>
                  <td className={`${tableCell} whitespace-nowrap text-slate-300`}>{company.taxId || '—'}</td>
                  <td className={tableCell}>
                    <div className="flex items-center gap-2.5">
                      <ActiveSwitch
                        checked={isInternational}
                        onChange={(on) => {
                          if (!on && foreignLeads(company) > 0) setDisablingPlan(company);
                          else void setInternational(company, on);
                        }}
                        label={
                          isInternational
                            ? `Desactivar plan Internacional de ${company.name}`
                            : `Activar plan Internacional de ${company.name}`
                        }
                      />
                      <span className="flex items-center gap-1.5" aria-label={`Países: ${countries.map((c) => COUNTRIES[c].name).join(', ')}`}>
                        {countries.map((code) => (
                          <CountryFlag key={code} code={code} title={COUNTRIES[code].name} />
                        ))}
                        <span className={`text-sm font-semibold ${isInternational ? 'text-indigo-300' : 'text-slate-400'}`}>
                          {isInternational ? `${countries.length} países` : 'Nacional'}
                        </span>
                      </span>
                    </div>
                  </td>
                  <td className={`${tableCell} text-slate-300`}>{formatDate(company.createdAt)}</td>
                  <td className={`${tableCell} text-slate-300`}>
                    {companyUsers.filter((u) => u.isActive).length} activos / {companyUsers.length}
                  </td>
                  <td className={`${tableCell} tabular-nums text-slate-300`}>
                    {leads.filter((l) => l.companyId === company.id).length}
                  </td>
                  <td className={tableCell}>
                    <div className="flex items-center gap-2.5">
                      <ActiveSwitch
                        checked={company.isActive}
                        onChange={(isActive) => void quickUpdate({ ...company, isActive })}
                        label={company.isActive ? `Desactivar CRM ${company.name}` : `Activar CRM ${company.name}`}
                      />
                      <span className={`text-sm font-semibold ${company.isActive ? 'text-emerald-300' : 'text-slate-400'}`}>
                        {company.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                  </td>
                  <td className={`${tableCell} text-right`}>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setExporting(company)}
                        aria-label={`Exportar datos de ${company.name}`}
                        title="Descargar un Excel con todos los datos de este CRM"
                        className={`${secondaryButton} px-3 py-2 text-sm`}
                      >
                        <Download className="h-4 w-4" />
                        Exportar
                      </button>
                      <button type="button" onClick={() => setEditing(company)} className={`${secondaryButton} px-3 py-2 text-sm`}>
                        <Pencil className="h-4 w-4" />
                        Editar
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing && (
        <CompanyModal
          company={editing === 'new' ? null : editing}
          existingSlugs={companies.filter((c) => editing === 'new' || c.id !== editing.id).map((c) => c.slug)}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            const error = editing === 'new' ? await onCreateCompany(data) : await onUpdateCompany({ ...editing, ...data });
            if (!error) setEditing(null);
            return error;
          }}
        />
      )}

      {exporting && (
        <ExportModal
          company={companies.find((c) => c.id === exporting.id) ?? exporting}
          loadPreview={() => getExportPreview(exporting.id)}
          onExport={(prepared) => onExportCompany(exporting.id, prepared)}
          onClose={() => setExporting(null)}
        />
      )}

      {disablingPlan && (
        <Modal
          title="Desactivar plan Internacional"
          subtitle={disablingPlan.name}
          onClose={() => setDisablingPlan(null)}
          footer={
            <>
              <button type="button" onClick={() => setDisablingPlan(null)} className={secondaryButton}>
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  void setInternational(disablingPlan, false);
                  setDisablingPlan(null);
                }}
                className={primaryButton}
              >
                Desactivar plan
              </button>
            </>
          }
        >
          <p className="text-[15px] text-slate-300">
            El CRM tiene {foreignLeads(disablingPlan)} leads fuera de {COUNTRIES[disablingPlan.homeCountry].name}. Dejarán de
            verse, pero no se eliminan: vuelven a aparecer si se reactiva el plan. ¿Continuar?
          </p>
        </Modal>
      )}
    </div>
  );
}

// Portabilidad de datos: resumen de lo que se descargará y advertencia de datos personales
function ExportModal({
  company,
  loadPreview,
  onExport,
  onClose,
}: {
  company: Company;
  loadPreview: () => TenantExport | null | Promise<TenantExport>;
  onExport: (prepared: TenantExport) => Promise<void>;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [preview, setPreview] = useState<TenantExport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    Promise.resolve()
      .then(loadPreview)
      .then((resultado) => {
        if (!vigente) return;
        setPreview(resultado);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (!vigente) return;
        setLoadError(error instanceof Error ? error.message : 'No se pudo preparar la exportación de este CRM.');
        setLoading(false);
      });
    return () => {
      vigente = false;
    };
    // Una sola vez al abrir: el resumen es una foto de ese momento
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const download = async () => {
    if (!preview) return;
    setStatus('working');
    try {
      await onExport(preview);
      setStatus('done');
    } catch {
      setStatus('error');
    }
  };

  return (
    <Modal
      title="Exportar datos del CRM"
      subtitle={company.name}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButton}>
            {status === 'done' ? 'Cerrar' : 'Cancelar'}
          </button>
          <button type="button" onClick={download} disabled={!preview || status === 'working'} className={primaryButton}>
            {status === 'working' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {status === 'done' ? 'Descargar de nuevo' : 'Descargar Excel'}
          </button>
        </>
      }
    >
      {loading ? (
        <p role="status" className="flex items-center gap-2 text-[15px] text-slate-300">
          <Loader2 className="h-5 w-5 animate-spin" />
          Preparando la exportación con los datos actuales del CRM…
        </p>
      ) : !preview ? (
        <p role="alert" className="text-[15px] text-rose-300">{loadError ?? 'No se pudo preparar la exportación de este CRM.'}</p>
      ) : (
        <div className="space-y-4">
          <p className="text-[15px] text-slate-300">
            Genera un archivo Excel con los datos actuales de este CRM para que la empresa pueda llevarlos a otro sistema.
            Incluye una hoja <strong>Léeme</strong> con instrucciones y un <strong>Diccionario</strong> de columnas, listo para
            importarlo a mano o con una IA.
          </p>

          <div className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-950/40 px-4 py-3">
            <FileSpreadsheet className="h-8 w-8 shrink-0 text-emerald-400" />
            <div className="min-w-0">
              <p className="truncate font-mono text-sm text-slate-200">{preview.fileName}</p>
              <p className="text-sm text-slate-400">{preview.sheets.length} hojas · solo datos de {company.name}</p>
            </div>
          </div>

          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {preview.counts.map((c) => (
              <li key={c.label} className="rounded-xl border border-slate-700 px-3 py-2">
                <span className="block text-xl font-black tabular-nums text-slate-100">{c.count}</span>
                <span className="text-sm text-slate-400">{c.label}</span>
              </li>
            ))}
          </ul>

          <div className="flex gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>
              Contiene <strong>datos personales</strong> (nombres, emails y teléfonos). Entrégalo solo a la empresa dueña de los datos
              por un canal seguro. No incluye contraseñas ni claves de API.
            </span>
          </div>

          {company.lastExportedAt && (
            <p className="text-sm text-slate-400">
              Última exportación: {formatDate(company.lastExportedAt)}
              {company.lastExportedBy ? ` por ${company.lastExportedBy}` : ''}
            </p>
          )}

          {status === 'done' && (
            <p role="status" className="flex items-center gap-2 text-[15px] font-semibold text-emerald-300">
              <CheckCircle2 className="h-5 w-5" />
              Archivo descargado.
            </p>
          )}
          {status === 'error' && (
            <p role="alert" className="text-[15px] font-semibold text-rose-300">
              No se pudo generar el archivo. Inténtalo de nuevo.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

function CompanyModal({
  company,
  existingSlugs,
  onClose,
  onSave,
}: {
  company: Company | null;
  existingSlugs: string[];
  onClose: () => void;
  onSave: (data: NewCompany) => Promise<SaveResult>;
}) {
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [name, setName] = useState(company?.name ?? '');
  const [slug, setSlug] = useState(company?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(Boolean(company));
  const [taxId, setTaxId] = useState(company?.taxId ?? '');
  const [isActive, setIsActive] = useState(company?.isActive ?? true);
  const [homeCountry, setHomeCountry] = useState<CountryCode>(company?.homeCountry ?? 'CL');
  const [isInternational, setIsInternational] = useState(company?.plan === 'international');
  // Los países guardados, aunque el plan esté apagado: al activarlo aquí vuelven los que ya usaba
  const [extraCountries, setExtraCountries] = useState<CountryCode[]>(
    company ? company.enabledCountries.filter((c) => c !== company.homeCountry) : []
  );
  const availableExtras = COUNTRY_CODES.filter((c) => c !== homeCountry);
  const selectedExtras = extraCountries.filter((c) => c !== homeCountry);
  const toggleExtra = (code: CountryCode) =>
    setExtraCountries((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));

  const effectiveSlug = slugTouched ? slugify(slug) : slugify(name);
  const error = !name.trim()
    ? 'El nombre es obligatorio.'
    : !effectiveSlug
      ? 'El identificador no puede quedar vacío.'
      : existingSlugs.includes(effectiveSlug)
        ? 'Ya existe un CRM con ese identificador.'
        : null;

  return (
    <Modal
      title={company ? 'Editar CRM' : 'Nuevo CRM'}
      subtitle={company ? company.name : 'Se crea un tenant aislado para la empresa.'}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancelar
          </button>
          <button type="submit" form="company-form" disabled={!!error || busy} className={primaryButton}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {company ? 'Guardar cambios' : 'Crear CRM'}
          </button>
        </>
      }
    >
      <form
        id="company-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (error || busy) return;
          const view = COUNTRIES[homeCountry].mapView;
          setBusy(true);
          const result = await onSave({
            name: name.trim(),
            slug: effectiveSlug,
            taxId: taxId.trim() || undefined,
            isActive,
            plan: isInternational ? 'international' : 'national',
            homeCountry,
            enabledCountries: [homeCountry, ...selectedExtras],
            defaultLat: company && company.homeCountry === homeCountry ? company.defaultLat : view.lat,
            defaultLng: company && company.homeCountry === homeCountry ? company.defaultLng : view.lng,
            defaultZoom: company && company.homeCountry === homeCountry ? company.defaultZoom : view.zoom,
          });
          setBusy(false);
          setServerError(result);
        }}
        className="space-y-4"
      >
        <div>
          <label htmlFor="co-name" className={labelClass}>Nombre de la empresa *</label>
          <input id="co-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="co-slug" className={labelClass}>Identificador (slug)</label>
          <input
            id="co-slug"
            value={slugTouched ? slug : effectiveSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            className={inputClass}
          />
          <p className="mt-1 text-sm text-slate-400">Se usa como identificador único del tenant: /{effectiveSlug || '…'}</p>
        </div>
        <div>
          <label htmlFor="co-tax" className={labelClass}>{COUNTRIES[homeCountry].taxIdLabel}</label>
          <input id="co-tax" value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder={COUNTRIES[homeCountry].taxIdExample} className={inputClass} />
        </div>
        <div>
          <label htmlFor="co-country" className={labelClass}>País base *</label>
          <select
            id="co-country"
            value={homeCountry}
            onChange={(e) => setHomeCountry(e.target.value as CountryCode)}
            className={inputClass}
          >
            {COUNTRY_CODES.map((code) => (
              <option key={code} value={code}>
                {COUNTRIES[code].name}
              </option>
            ))}
          </select>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-4">
          <div className="flex items-center gap-3">
            <ActiveSwitch
              checked={isInternational}
              onChange={setIsInternational}
              label="Plan Internacional"
            />
            <span className="flex items-center gap-2 text-[15px] font-semibold text-slate-200">
              <Globe2 className="h-4 w-4 text-indigo-400" />
              Plan Internacional (varios países en el mismo CRM)
            </span>
          </div>
          {isInternational && (
            <fieldset className="mt-3">
              <legend className="mb-2 text-sm text-slate-400">
                Países adicionales habilitados (la gerencia del CRM también los elige, en Gerencia → Países y divisas):
              </legend>
              <div className="flex flex-wrap gap-2">
                {availableExtras.map((code) => (
                  <label
                    key={code}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-600 px-3 py-2 text-[15px] text-slate-200"
                  >
                    <input
                      type="checkbox"
                      checked={selectedExtras.includes(code)}
                      onChange={() => toggleExtra(code)}
                      className="h-4 w-4 accent-indigo-600"
                    />
                    <CountryFlag code={code} />
                    {COUNTRIES[code].name}
                    <span className="text-sm text-slate-400">({COUNTRIES[code].zoneLabel.plural})</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </div>
        <div className="flex items-center gap-3">
          <ActiveSwitch checked={isActive} onChange={setIsActive} label="CRM activo" />
          <span className="text-[15px] text-slate-300">CRM activo (sus usuarios pueden iniciar sesión)</span>
        </div>
        {(serverError || error) && (
          <p role={serverError ? 'alert' : undefined} className="text-sm text-rose-300">
            {serverError ?? error}
          </p>
        )}
      </form>
    </Modal>
  );
}

/* ================================ USUARIOS ================================ */

function UsersSection({ companies, users, currentUserId, onCreateUser, onUpdateUser, invitations }: AdminModuleProps) {
  const [query, setQuery] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [isCreating, setIsCreating] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const [invited, setInvited] = useState<string | null>(null);

  const quickUpdate = async (user: AppUser) => setRowError(await onUpdateUser(user));

  const companyName = (id: string | null) =>
    id ? companies.find((c) => c.id === id)?.name ?? 'CRM eliminado' : 'Plataforma';

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users
      .filter((u) => companyFilter === 'all' || (companyFilter === 'platform' ? u.companyId === null : u.companyId === companyFilter))
      .filter((u) => roleFilter === 'all' || u.role === roleFilter)
      .filter((u) => !q || `${u.fullName} ${u.email}`.toLowerCase().includes(q))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'));
  }, [users, query, companyFilter, roleFilter]);

  return (
    <div className={cardClass}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 p-5">
        <div className="flex flex-wrap gap-2">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nombre o email..."
              aria-label="Buscar usuario"
              className={`${inputClass} w-60! pl-10`}
            />
          </div>
          <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)} aria-label="Filtrar por CRM" className={`${inputClass} w-60!`}>
            <option value="all">Todos los CRMs</option>
            <option value="platform">Plataforma (administradores)</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as UserRole | 'all')} aria-label="Filtrar por perfil" className={`${inputClass} w-44!`}>
            <option value="all">Todos los perfiles</option>
            <option value="agent">Usuario base</option>
            <option value="manager">Gerente</option>
            <option value="superadmin">Administrador</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => {
            setInvited(null);
            setIsCreating(true);
          }}
          className={primaryButton}
        >
          {invitations ? <Send className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
          {invitations ? 'Invitar usuario' : 'Nuevo usuario'}
        </button>
      </div>

      {rowError && <ErrorBanner message={rowError} onDismiss={() => setRowError(null)} />}
      {invited && (
        <p role="status" className="flex gap-2 border-b border-slate-700 bg-emerald-500/10 px-5 py-3 text-[15px] text-emerald-300">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <span>Invitación enviada a {invited}. La persona elige su contraseña al abrir el correo; nadie más la conoce.</span>
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-[15px]">
          <thead>
            <tr className={tableHeadRow}>
              <th className={tableCell}>Usuario</th>
              <th className={tableCell}>CRM</th>
              <th className={tableCell}>Perfil</th>
              <th className={tableCell}>Creado</th>
              <th className={tableCell}>Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/70">
            {rows.map((user) => {
              const isSelf = user.id === currentUserId;
              const company = companies.find((c) => c.id === user.companyId);
              return (
                <tr key={user.id} className={user.isActive ? '' : 'bg-slate-950/40'}>
                  <td className={tableCell}>
                    <div className={`font-semibold ${user.isActive ? 'text-slate-100' : 'text-slate-400'}`}>
                      {user.fullName} {isSelf && <span className="text-sm font-normal text-slate-400">(tú)</span>}
                    </div>
                    <div className="text-sm text-slate-400">{user.email}</div>
                  </td>
                  <td className={tableCell}>
                    <div className="text-slate-300">{companyName(user.companyId)}</div>
                    {company && !company.isActive && <Pill tone="red">CRM inactivo</Pill>}
                  </td>
                  <td className={tableCell}>
                    {user.role === 'superadmin' ? (
                      <Pill tone={ROLE_TONE.superadmin}>{ROLE_LABEL.superadmin}</Pill>
                    ) : (
                      <select
                        value={user.role}
                        onChange={(e) => void quickUpdate({ ...user, role: e.target.value as UserRole })}
                        aria-label={`Perfil de ${user.fullName}`}
                        className={`${inputClass} w-40! py-1.5!`}
                      >
                        <option value="agent">{ROLE_LABEL.agent}</option>
                        <option value="manager">{ROLE_LABEL.manager}</option>
                      </select>
                    )}
                  </td>
                  <td className={`${tableCell} text-slate-300`}>{formatDate(user.createdAt)}</td>
                  <td className={tableCell}>
                    <div className="flex items-center gap-2.5">
                      <ActiveSwitch
                        checked={user.isActive}
                        disabled={isSelf}
                        onChange={(isActive) => void quickUpdate({ ...user, isActive })}
                        label={isSelf ? 'No puedes desactivar tu propio usuario' : user.isActive ? `Desactivar a ${user.fullName}` : `Activar a ${user.fullName}`}
                      />
                      <span className={`text-sm font-semibold ${user.isActive ? 'text-emerald-300' : 'text-slate-400'}`}>
                        {user.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isCreating && (
        <UserModal
          companies={companies}
          invitation={Boolean(invitations)}
          onClose={() => setIsCreating(false)}
          onSave={async (data) => {
            const error = await onCreateUser(data);
            if (!error) {
              setIsCreating(false);
              if (invitations) setInvited(data.email);
            }
            return error;
          }}
        />
      )}
    </div>
  );
}

function UserModal({
  companies,
  invitation,
  onClose,
  onSave,
}: {
  companies: Company[];
  /** true: se envía una invitación y la persona elige su contraseña (Supabase) */
  invitation: boolean;
  onClose: () => void;
  onSave: (data: NewAppUser) => Promise<SaveResult>;
}) {
  const [busy, setBusy] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('agent');
  const [companyId, setCompanyId] = useState(companies.find((c) => c.isActive)?.id ?? '');
  const [serverError, setServerError] = useState<string | null>(null);

  const error = !fullName.trim()
    ? 'Ingresa el nombre.'
    : !/^\S+@\S+\.\S+$/.test(email.trim())
      ? 'Ingresa un email válido.'
      : !invitation && password.length < 6
        ? 'La contraseña temporal debe tener al menos 6 caracteres.'
        : role !== 'superadmin' && !companyId
          ? 'Selecciona el CRM al que pertenece.'
          : null;

  return (
    <Modal
      title={invitation ? 'Invitar usuario' : 'Nuevo usuario'}
      subtitle={
        invitation
          ? 'Le llegará un correo para elegir su contraseña. Solo verá los datos de su CRM (excepto administradores).'
          : 'El usuario solo verá los datos de su CRM (excepto administradores).'
      }
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancelar
          </button>
          <button type="submit" form="user-form" disabled={!!error || busy} className={primaryButton}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {invitation ? 'Enviar invitación' : 'Crear usuario'}
          </button>
        </>
      }
    >
      <form
        id="user-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (error || busy) return;
          setBusy(true);
          const result = await onSave({
            fullName: fullName.trim(),
            email: email.trim(),
            password: invitation ? '' : password,
            role,
            companyId: role === 'superadmin' ? null : companyId,
            isActive: true,
          });
          setBusy(false);
          setServerError(result);
        }}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <div className="sm:col-span-2">
          <label htmlFor="us-name" className={labelClass}>Nombre completo *</label>
          <input id="us-name" value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="us-email" className={labelClass}>Email *</label>
          <input id="us-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </div>
        {!invitation && (
          <div>
            <label htmlFor="us-pass" className={labelClass}>Contraseña temporal *</label>
            <input id="us-pass" type="text" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          </div>
        )}
        <div>
          <label htmlFor="us-role" className={labelClass}>Perfil *</label>
          <select id="us-role" value={role} onChange={(e) => setRole(e.target.value as UserRole)} className={inputClass}>
            <option value="agent">{ROLE_LABEL.agent}</option>
            <option value="manager">{ROLE_LABEL.manager}</option>
            <option value="superadmin">{ROLE_LABEL.superadmin}</option>
          </select>
        </div>
        <div>
          <label htmlFor="us-company" className={labelClass}>CRM {role === 'superadmin' ? '' : '*'}</label>
          <select
            id="us-company"
            value={role === 'superadmin' ? '' : companyId}
            disabled={role === 'superadmin'}
            onChange={(e) => setCompanyId(e.target.value)}
            className={inputClass}
          >
            {role === 'superadmin' && <option value="">Plataforma</option>}
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.isActive ? '' : ' (inactivo)'}
              </option>
            ))}
          </select>
        </div>
        {(serverError || error) && (
          <p role={serverError ? 'alert' : undefined} className={`text-sm sm:col-span-2 ${serverError ? 'text-rose-300' : 'text-slate-400'}`}>
            {serverError ?? error}
          </p>
        )}
      </form>
    </Modal>
  );
}

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div role="alert" className="flex items-start justify-between gap-3 border-b border-slate-700 bg-rose-500/10 px-5 py-3 text-[15px] text-rose-300">
      <span className="flex gap-2">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        {message}
      </span>
      <button type="button" onClick={onDismiss} className="cursor-pointer text-sm font-semibold text-rose-200 hover:underline">
        Cerrar
      </button>
    </div>
  );
}
