import React, { useState } from 'react';
import type { CatalogItem, ClientAccount, CommercialStatus, ConsentStatus, Lead, LeadDataOrigin } from '../types/crm';
import { LeadItemsEditor } from './LeadItemsEditor';
import { fromDraftItems, itemsSubtotal, type DraftLeadItem } from '../lib/catalog';
import { X, UserPlus, MapPin, Loader2, Save, AlertTriangle } from 'lucide-react';
import { locateInCommune } from '../lib/geocoding';
import { inputClass, labelClass, primaryButton, secondaryButton } from '../lib/styles';
import { ORIGIN_LABEL, PROSPECT_RETENTION_DAYS } from '../lib/privacy';
import { COUNTRIES, zoneWithArticle, type CountryCode, type CurrencyCode } from '../data/countries';
import { convert, leadCurrenciesFor, roundForCurrency } from '../lib/currency';
import { useMoney } from '../lib/money';

export type NewLeadInput = Omit<Lead, 'id' | 'createdAt' | 'companyId' | 'clientAccountId'>;

interface LeadCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddLead: (lead: NewLeadInput) => void;
  accounts: ClientAccount[];
  catalog: CatalogItem[];
  // Países habilitados para el CRM y zonas de cada uno (comunas, distritos…)
  countries: CountryCode[];
  defaultCountry: CountryCode;
  zones: { id: string; name: string; countryCode: CountryCode }[];
}

type FieldErrors = Partial<Record<'fullName' | 'newAccount' | 'email' | 'rawAddress' | 'commune' | 'origin' | 'consent', string>>;

const NEW_ACCOUNT = '__new__';

// Sugerencias de cargo: la lista es abierta, se puede escribir cualquiera
const CARGOS_FRECUENTES = [
  'Gerente General',
  'Gerente de Operaciones',
  'Gerente Comercial',
  'Jefe de Compras',
  'Jefe de Administración y Finanzas',
  'Jefe de Recursos Humanos',
  'Encargado de Local',
  'Dueño / Socio',
  'Asistente Administrativo',
];
const errorInput = 'border-rose-500! ring-2! ring-rose-500/30!';

const FieldError: React.FC<{ id: string; message?: string }> = ({ id, message }) =>
  message ? (
    <p id={id} className="mt-1 flex items-center gap-1.5 text-sm font-medium text-rose-300">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      {message}
    </p>
  ) : null;

export const LeadCaptureModal: React.FC<LeadCaptureModalProps> = ({
  isOpen,
  onClose,
  onAddLead,
  accounts,
  catalog,
  countries,
  defaultCountry,
  zones,
}) => {
  const [countryCode, setCountryCode] = useState<CountryCode>(defaultCountry);
  const [fullName, setFullName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [accountChoice, setAccountChoice] = useState('');
  const [newAccountName, setNewAccountName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState(COUNTRIES[defaultCountry].phonePrefix);
  const [rawAddress, setRawAddress] = useState('');
  const [communeId, setCommuneId] = useState('');
  const [commercialStatus, setCommercialStatus] = useState<CommercialStatus>('new');
  const [dealValue, setDealValue] = useState('');
  const [items, setItems] = useState<DraftLeadItem[]>([]);
  const [isManualValue, setIsManualValue] = useState(false);
  // Moneda en que se negocia: parte con la del país y puede cambiarse a otra del CRM o a dólar
  const [currency, setCurrency] = useState<CurrencyCode>(COUNTRIES[defaultCountry].currency);
  // Ley 21.719: hay que poder decir de dónde salió el dato y qué respondió la persona
  const [dataOrigin, setDataOrigin] = useState<LeadDataOrigin | ''>('');
  const [consentStatus, setConsentStatus] = useState<ConsentStatus | ''>('');
  const { rates } = useMoney();
  const currencies = leadCurrenciesFor(countries);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  // Si el país elegido dejó de estar habilitado, se vuelve al país por defecto
  const country = COUNTRIES[countries.includes(countryCode) ? countryCode : defaultCountry];
  const zoneLabel = country.zoneLabel.singular;
  const countryAccounts = accounts.filter((a) => a.countryCode === country.code);
  const activeAccounts = countryAccounts
    .filter((a) => a.isActive)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const sortedCommunes = zones
    .filter((z) => z.countryCode === country.code)
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));

  const handleCountryChange = (code: CountryCode) => {
    // La empresa, la zona y el prefijo telefónico dependen del país
    if (!phone.trim() || phone.trim() === country.phonePrefix.trim()) setPhone(COUNTRIES[code].phonePrefix);
    setCountryCode(code);
    setCurrency(COUNTRIES[code].currency);
    // Los precios dependen de la moneda del país: los ítems se vuelven a elegir
    setItems([]);
    setIsManualValue(false);
    setAccountChoice('');
    setCommuneId('');
    setErrors({});
  };

  // Cambiar la moneda convierte lo ya ingresado con la tasa del día, para no tener que reescribirlo
  const handleCurrencyChange = (next: CurrencyCode) => {
    const conv = (value: string) =>
      value.trim() === '' ? value : String(roundForCurrency(convert(Number(value) || 0, currency, next, rates), next));
    setItems((prev) => prev.map((row) => ({ ...row, unitPrice: conv(row.unitPrice) })));
    setDealValue((prev) => conv(prev));
    setCurrency(next);
  };

  const clearError = (field: keyof FieldErrors) =>
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (!fullName.trim()) next.fullName = 'Ingresa el nombre del lead.';

    if (accountChoice === NEW_ACCOUNT) {
      const name = newAccountName.trim();
      const existing = countryAccounts.find((a) => a.name.toLowerCase() === name.toLowerCase());
      if (!name) next.newAccount = 'Escribe el nombre de la nueva empresa.';
      else if (existing && !existing.isActive) next.newAccount = 'Esa empresa existe pero está desactivada por gerencia.';
      else if (existing) next.newAccount = 'Esa empresa ya existe: selecciónala en la lista.';
    }

    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) next.email = 'El email no es válido.';
    if (!rawAddress.trim()) next.rawAddress = 'Ingresa la dirección.';
    if (!communeId || !sortedCommunes.some((z) => z.id === communeId)) next.commune = `Selecciona ${zoneWithArticle([country.code])}.`;
    if (!dataOrigin) next.origin = 'Indica de dónde salió este contacto.';
    if (!consentStatus) next.consent = 'Indica por qué podemos guardar sus datos.';
    return next;
  };

  const resetForm = () => {
    setDataOrigin('');
    setConsentStatus('');
    setFullName('');
    setJobTitle('');
    setAccountChoice('');
    setNewAccountName('');
    setEmail('');
    setCountryCode(defaultCountry);
    setCurrency(COUNTRIES[defaultCountry].currency);
    setPhone(COUNTRIES[defaultCountry].phonePrefix);
    setRawAddress('');
    setCommuneId('');
    setCommercialStatus('new');
    setDealValue('');
    setItems([]);
    setIsManualValue(false);
    setErrors({});
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  // Con ítems el valor se calcula; si se editó a mano (o no hay ítems) queda como manual
  const leadValue = () => {
    const leadItems = fromDraftItems(items);
    const manual = leadItems.length === 0 || isManualValue;
    return {
      items: leadItems,
      valueSource: manual ? ('manual' as const) : ('items' as const),
      estimatedDealValue: manual ? Math.max(0, Number(dealValue) || 0) : itemsSubtotal(leadItems),
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const found = validate();
    setErrors(found);

    const firstInvalid = (['fullName', 'newAccount', 'email', 'rawAddress', 'commune', 'origin', 'consent'] as const).find((f) => found[f]);
    if (firstInvalid) {
      document.getElementById(`cap-${firstInvalid}`)?.focus();
      return;
    }

    const companyName =
      accountChoice === NEW_ACCOUNT
        ? newAccountName.trim()
        : accounts.find((a) => a.id === accountChoice)?.name;

    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 400));

    onAddLead({
      fullName: fullName.trim(),
      companyName,
      email: email.trim() || undefined,
      countryCode: country.code,
      currency,
      jobTitle: jobTitle.trim() || undefined,
      phone: phone.trim() && phone.trim() !== country.phonePrefix.trim() ? phone.trim() : undefined,
      commercialStatus,
      ...leadValue(),
      rawAddress: rawAddress.trim(),
      dataOrigin: dataOrigin || undefined,
      consentStatus: consentStatus || undefined,
      consentAt: new Date().toISOString(),
      noContact: consentStatus === 'refused',
      ...locateInCommune(communeId, rawAddress),
    });

    setIsSaving(false);
    handleClose();
  };

  const errorCount = Object.keys(errors).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <button
          onClick={handleClose}
          disabled={isSaving}
          aria-label="Cerrar"
          className="absolute right-4 top-4 cursor-pointer rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-600/20 text-indigo-400">
            <UserPlus className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Capturar Nuevo Lead</h3>
            <p className="text-sm text-slate-400">Los campos con * son obligatorios.</p>
          </div>
        </div>

        {isSaving ? (
          <div className="flex flex-col items-center justify-center space-y-4 py-10 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
            <p className="text-[15px] font-semibold text-slate-200">Guardando lead y ubicándolo en el mapa...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {errorCount > 0 && (
              <div role="alert" className="flex gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-[15px] text-rose-300">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <span>
                  <strong>Error:</strong> revisa {errorCount === 1 ? 'el campo marcado' : `los ${errorCount} campos marcados`} en rojo.
                </span>
              </div>
            )}

            {/* País (solo plan Internacional) */}
            {countries.length > 1 && (
              <div>
                <label htmlFor="cap-country" className={labelClass}>País *</label>
                <select
                  id="cap-country"
                  value={country.code}
                  onChange={(e) => handleCountryChange(e.target.value as CountryCode)}
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

            {/* Persona */}
            <div>
              <label htmlFor="cap-fullName" className={labelClass}>Nombre completo *</label>
              <input
                id="cap-fullName"
                type="text"
                value={fullName}
                onChange={(e) => {
                  setFullName(e.target.value);
                  clearError('fullName');
                }}
                aria-invalid={!!errors.fullName}
                aria-describedby="err-fullName"
                placeholder="Ej. Valentina Gómez"
                className={`${inputClass} ${errors.fullName ? errorInput : ''}`}
              />
              <FieldError id="err-fullName" message={errors.fullName} />
            </div>

            {/* Empresa asociada */}
            <div className="rounded-xl border border-slate-700 bg-slate-950/40 p-4">
              <label htmlFor="cap-account" className={labelClass}>¿A qué empresa pertenece?</label>
              <select
                id="cap-account"
                value={accountChoice}
                onChange={(e) => {
                  setAccountChoice(e.target.value);
                  clearError('newAccount');
                }}
                className={inputClass}
              >
                <option value="">Sin empresa (persona natural)</option>
                {activeAccounts.length > 0 && (
                  <optgroup label="Empresas registradas">
                    {activeAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                <option value={NEW_ACCOUNT}>+ Registrar nueva empresa…</option>
              </select>

              {accountChoice === NEW_ACCOUNT && (
                <div className="mt-3">
                  <label htmlFor="cap-newAccount" className={labelClass}>Nombre de la nueva empresa *</label>
                  <input
                    id="cap-newAccount"
                    type="text"
                    value={newAccountName}
                    onChange={(e) => {
                      setNewAccountName(e.target.value);
                      clearError('newAccount');
                    }}
                    aria-invalid={!!errors.newAccount}
                    aria-describedby="err-newAccount"
                    placeholder="Ej. Comercial Andes SpA"
                    className={`${inputClass} ${errors.newAccount ? errorInput : ''}`}
                  />
                  <FieldError id="err-newAccount" message={errors.newAccount} />
                  {!errors.newAccount && (
                    <p className="mt-1 text-sm text-slate-400">
                      Quedará disponible en Gerencia → Empresas cliente para completar sus datos.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Contacto */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="cap-jobTitle" className={labelClass}>Cargo del contacto</label>
                <input
                  id="cap-jobTitle"
                  type="text"
                  list="cargos-frecuentes"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  placeholder="Ej. Gerente de Operaciones"
                  className={inputClass}
                />
                <datalist id="cargos-frecuentes">
                  {CARGOS_FRECUENTES.map((cargo) => (
                    <option key={cargo} value={cargo} />
                  ))}
                </datalist>
                <p className="mt-1 text-sm text-slate-400">Sirve para saber si estás hablando con quien decide la compra.</p>
              </div>
              <div>
                <label htmlFor="cap-email" className={labelClass}>Email</label>
                <input
                  id="cap-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearError('email');
                  }}
                  aria-invalid={!!errors.email}
                  aria-describedby="err-email"
                  placeholder="cliente@ejemplo.com"
                  className={`${inputClass} ${errors.email ? errorInput : ''}`}
                />
                <FieldError id="err-email" message={errors.email} />
              </div>
              <div>
                <label htmlFor="cap-phone" className={labelClass}>Teléfono</label>
                <input id="cap-phone" type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
              </div>
            </div>

            {/* Ubicación */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_200px]">
              <div>
                <label htmlFor="cap-rawAddress" className={labelClass}>Dirección *</label>
                <div className="relative">
                  <MapPin className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    id="cap-rawAddress"
                    type="text"
                    value={rawAddress}
                    onChange={(e) => {
                      setRawAddress(e.target.value);
                      clearError('rawAddress');
                    }}
                    aria-invalid={!!errors.rawAddress}
                    aria-describedby="err-rawAddress"
                    placeholder={`Ej. ${country.addressExample}`}
                    className={`${inputClass} pl-10 ${errors.rawAddress ? errorInput : ''}`}
                  />
                </div>
                <FieldError id="err-rawAddress" message={errors.rawAddress} />
              </div>
              <div>
                <label htmlFor="cap-commune" className={labelClass}>{zoneLabel} *</label>
                <select
                  id="cap-commune"
                  value={communeId}
                  onChange={(e) => {
                    setCommuneId(e.target.value);
                    clearError('commune');
                  }}
                  aria-invalid={!!errors.commune}
                  aria-describedby="err-commune"
                  className={`${inputClass} ${errors.commune ? errorInput : ''}`}
                >
                  <option value="">Selecciona…</option>
                  {sortedCommunes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <FieldError id="err-commune" message={errors.commune} />
              </div>
            </div>

            {/* Negocio */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="cap-status" className={labelClass}>Estado comercial</label>
                <select
                  id="cap-status"
                  value={commercialStatus}
                  onChange={(e) => setCommercialStatus(e.target.value as CommercialStatus)}
                  className={inputClass}
                >
                  <option value="new">Nuevo</option>
                  <option value="contacted">Contactado</option>
                  <option value="qualified">Calificado</option>
                  <option value="proposal">Propuesta</option>
                </select>
              </div>
            </div>

            {/* Origen del dato y por qué se pueden guardar (Ley 21.719, arts. 12, 13 y 14 ter).
                Obligatorio y sin respuesta marcada: el vendedor tiene que elegir. */}
            <fieldset className="rounded-xl border border-slate-700 bg-slate-950/40 p-3">
              <legend className="px-1 text-sm font-bold uppercase tracking-wide text-slate-400">
                Datos personales
              </legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="cap-origin" className={labelClass}>¿De dónde salió este contacto? *</label>
                  <select
                    id="cap-origin"
                    value={dataOrigin}
                    onChange={(e) => {
                      setDataOrigin(e.target.value as LeadDataOrigin);
                      clearError('origin');
                    }}
                    aria-invalid={!!errors.origin}
                    aria-describedby={errors.origin ? 'err-origin' : undefined}
                    className={`${inputClass} ${errors.origin ? errorInput : ''}`}
                  >
                    <option value="" disabled>Elige una opción</option>
                    {(Object.keys(ORIGIN_LABEL) as LeadDataOrigin[])
                      .filter((key) => key !== 'ai')
                      .map((key) => (
                        <option key={key} value={key}>{ORIGIN_LABEL[key]}</option>
                      ))}
                  </select>
                  <FieldError id="err-origin" message={errors.origin} />
                </div>
                <div>
                  <label htmlFor="cap-consent" className={labelClass}>¿Por qué podemos guardar sus datos? *</label>
                  <select
                    id="cap-consent"
                    value={consentStatus}
                    onChange={(e) => {
                      setConsentStatus(e.target.value as ConsentStatus);
                      clearError('consent');
                    }}
                    aria-invalid={!!errors.consent}
                    aria-describedby={`cap-consent-ayuda${errors.consent ? ' err-consent' : ''}`}
                    className={`${inputClass} ${errors.consent ? errorInput : ''}`}
                  >
                    <option value="" disabled>Elige una opción</option>
                    <option value="inquiry">Nos contactó o pidió cotización</option>
                    <option value="granted">Autorizó que guardemos sus datos</option>
                    <option value="not_requested">Prospecto: se le preguntará en el primer contacto</option>
                    <option value="refused">No autoriza</option>
                  </select>
                  <FieldError id="err-consent" message={errors.consent} />
                </div>
              </div>
              <p id="cap-consent-ayuda" className="mt-2 text-sm text-slate-400">
                {consentStatus === 'not_requested' ? (
                  <>
                    Al hablar con la persona, infórmale que guardamos sus datos y pregúntale si autoriza. Si nadie
                    la contacta en <strong>{PROSPECT_RETENTION_DAYS} días</strong>, sus datos se eliminan solos.
                  </>
                ) : consentStatus === 'refused' ? (
                  <>
                    El lead se guarda marcado como <strong>no contactar</strong> para poder acreditar su decisión, y
                    no aparecerá en la agenda ni para el asistente.
                  </>
                ) : (
                  'Si la persona pidió la cotización o nos escribió, no hace falta preguntarle nada más.'
                )}
              </p>
            </fieldset>

            <LeadItemsEditor
              idPrefix="cap"
              catalog={catalog}
              countryCode={country.code}
              items={items}
              onItemsChange={setItems}
              value={dealValue}
              onValueChange={setDealValue}
              isManual={isManualValue}
              onManualChange={setIsManualValue}
              currency={currency}
              currencies={currencies}
              onCurrencyChange={handleCurrencyChange}
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <button type="button" onClick={handleClose} className={secondaryButton}>
                Cancelar
              </button>
              <button type="submit" className={primaryButton}>
                <Save className="h-4 w-4" />
                Guardar lead
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
