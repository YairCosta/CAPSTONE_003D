import { useState, useMemo, useEffect, useRef } from 'react';
import { BugReportModal } from './components/BugReportModal';
import { SurveyPrompt } from './components/SurveyPrompt';
import { createDbUsageApi, loadMyLastSurveyAt, recordLogin, submitBugReport, submitSurvey } from './lib/db/usage';
import { createMemoryUsageApi, shouldAskSurvey, type LoginRecord } from './lib/usage';
import { Navbar } from './components/Navbar';
import { RankingSidebar } from './components/RankingSidebar';
import { LeadsTable } from './components/LeadsTable';
import type { NewLeadInput } from './components/LeadCaptureModal';
import type { NewClientAccount } from './components/ManagerModule';
import {
  AdminModule,
  AiChatWidget,
  AuditModule,
  CatalogInsights,
  ContactModule,
  GeoStrategicMap,
  KanbanBoard,
  LeadCaptureModal,
  ManagerModule,
  StageAdminModule,
  precargarModulos,
} from './lib/modulos';
import { Seccion } from './components/Seccion';
import { LoginScreen } from './components/LoginScreen';
import { SetPasswordScreen } from './components/SetPasswordScreen';
import { publicDemo, usingSupabase } from './lib/dataSource';
import { DemoBanner } from './components/DemoBanner';
import { supabase, initialAuthLinkError, initialAuthLinkType } from './lib/supabaseClient';
import { changeOwnPassword, loadSessionProfile, requestPasswordReset, setPasswordFromLink, signIn, signOut } from './lib/db/auth';
import {
  insertCompany,
  inviteUser,
  loadPlatform,
  setCompanyCountry,
  setCompanyViewCurrency,
  updateCompany as saveCompanyInDb,
  updateProfile,
} from './lib/db/platform';
import { loadAuditLog, saveAuditEntry } from './lib/db/audit';
import { isAuditEntityConnected } from './lib/db/mappers';
import {
  applySyncOps,
  insertPrivacyRequest,
  loadCompanyExportData,
  loadTenantData,
  loadZonePolygons,
  markAuditReverted,
  recordDataExport,
  resolvePrivacyRequest,
  type TenantData,
} from './lib/db/crm';
import { mergeStageConfigs } from './lib/db/crmMappers';
import { acceptLeads, diffTenantData, snapshotFor, type TenantSnapshot } from './lib/db/sync';
import { locateInCommune } from './lib/geocoding';
import { newId, newUuid } from './lib/ids';
import { findZonesByName, regionsOf } from './lib/zones';
import { CountryBar } from './components/CountryBar';
import { CountryFlag } from './components/CountryFlag';
import { COUNTRIES, type CountryCode } from './data/countries';
import {
  FALLBACK_RATES,
  isAllowedLeadCurrency,
  leadCurrency,
  ratesNote,
  viewCurrenciesFor,
  type Rates,
} from './lib/currency';
import { MoneyContext, buildMoneyApi, fetchRates, type RatesInfo } from './lib/money';
import { formatUsd } from './lib/aiBudget';
import type { CurrencyCode } from './data/countries';
import {
  canChangeStage,
  canRegisterActivity,
  enabledCountriesOf,
  sanitizeCatalogItemUpdate,
  sanitizeLeadItems,
  isManager,
  normalizeCompanyCountries,
  isSuperadmin,
  sanitizeAccountUpdate,
  sanitizeCompanyUpdate,
  setCountryByManager,
  setViewCurrencyByManager,
  sanitizeLeadUpdate,
  sanitizeTeamUserUpdate,
  sanitizeUserUpdate,
  scopeActivities,
  stageConfigsForTenant,
  validateNewTeamUser,
  validateNewUser,
  canResolvePrivacyRequest,
  requestLeadPrivacy,
  resolveLeadPrivacy,
  recordFirstContactAnswer,
  anonymizeLeadOfTenant,
  canMoveLeadStage,
} from './lib/tenantGuards';
import { CONFIDENT_MATCH, findDuplicateCandidates, findLeadMatches } from './lib/aiLeadMatch';
import { AI_WRITE_LIMIT_ERROR, MAX_AI_WRITES_PER_SESSION, safeForModel } from './lib/aiSafety';
import type { ZoneMetric } from './lib/metrics';
import { KpiSearchBar, applyKpiFilters, emptyKpiFilters, type KpiFilters } from './components/KpiSearchBar';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { validatePasswordChange } from './lib/passwords';
import {
  PROSPECT_RETENTION_DAYS,
  REQUEST_REASON_LABEL,
  accountWithoutPersonalData,
  anonymizeActivitiesOf,
  auditLeadLabel,
  blockedReason,
  canContact,
  expiredProspects,
  isBlocked,
  leadWithoutPersonalData,
  restoreAccountKeepingPersonalData,
  restoreLeadKeepingPersonalData,
  type FirstContactAnswer,
} from './lib/privacy';
import { buildSubjectExport } from './lib/subjectExport';
import { CHANNEL_LABEL } from './lib/agenda';
import {
  mockTerritories,
  defaultStageConfigs,
  DEMO_AGENT_ID,
  DEMO_MANAGER_ID,
  platformAdminAccount,
  platformAdminUser,
  demoDataFor,
  type DemoData,
} from './data/mockGeoData';
import { allMockData, conClaveDeDemo, cuentasDemoDesarrollo } from './data/testTenants';
import type {
  AppUser,
  AuditEntry,
  BugReport,
  SurveyResponse,
  CatalogItem,
  ClientAccount,
  CommercialStatus,
  Company,
  Lead,
  LeadActivity,
  NewAppUser,
  NewCatalogItem,
  NewCompany,
  PrivacyRequestReason,
  StageConfig,
  TerritoryMetric,
} from './types/crm';
import { ROLE_LABEL, ROLE_TABS, authenticate, canCaptureLeads, canMoveLeadBackwards, canRevertChanges, type ActiveTab } from './lib/permissions';
import { Users, Target, CheckCircle2, DollarSign, Trophy, Map as MapIcon, Boxes, Database, Loader2 } from 'lucide-react';
import { computeTerritoryMetrics } from './lib/metrics';
import {
  accountFields,
  buildAuditEntry,
  catalogFields,
  companyFields,
  diffFields,
  leadFields,
  leadSummary,
  scopeAuditLog,
  stageFields,
  userFields,
  type AuditContext,
  type NewAuditEntry,
} from './lib/audit';
import { buildTenantExport, type TenantExport } from './lib/tenantExport';
import { downloadTenantExport } from './lib/xlsxDownload';
import { applyLeadValue } from './lib/catalog';
import { SectionTabs } from './components/ui';

const SESSION_KEY = 'revela-session';
const SURVEY_SNOOZE_KEY = 'revela-encuesta';
// En desarrollo, ?encuesta muestra la encuesta al entrar (para las pruebas); publicada solo sale con Supabase
const forzarEncuesta = import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('encuesta');
const THEME_KEY = 'revela-theme';
// Los CRMs de prueba (GeoDemo, Norte, Sur) solo se cargan para npm run test:e2e, que abre la app con
// ?pruebas en el servidor de desarrollo. Igual que el administrador de plataforma, solo existen en
// desarrollo: al construir, estas ramas se eliminan y sus datos y cuentas no quedan en los archivos
// publicados (lo revisa npm run test:bundle). En producción todo vive en Supabase.
// Con Supabase (VITE_DATA_SOURCE=supabase) no se carga nada de ejemplo: los datos llegan de la base
// después de iniciar sesión, filtrados por RLS.
// La demo pública (?demo) carga solo la cuenta demo, sin contraseñas ni administrador, igual que publicada.
const initialData: DemoData = usingSupabase
  ? { companies: [], users: [], accounts: [], leads: [], activities: [], catalog: [] }
  : import.meta.env.DEV && !publicDemo
    ? conClaveDeDemo(
        demoDataFor({
          replaceWith: new URLSearchParams(window.location.search).has('pruebas') ? allMockData() : undefined,
          extraUsers: [platformAdminUser],
        })
      )
    : demoDataFor();
const db = usingSupabase ? supabase : null;


const DISPLAY_CURRENCY_KEY = 'revela-display-currency';

const readStorage = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorage = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // almacenamiento no disponible: el valor solo dura esta sesión
  }
};


const countByCountry = (items: { countryCode: CountryCode }[]) =>
  items.reduce<Partial<Record<CountryCode, number>>>((acc, item) => {
    acc[item.countryCode] = (acc[item.countryCode] ?? 0) + 1;
    return acc;
  }, {});

export function App() {
  // Tema visual: claro por defecto, preferencia guardada en localStorage
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (readStorage(THEME_KEY) === 'dark' ? 'dark' : 'light'));

  // Tipos de cambio: se parte con la tasa de respaldo y se reemplaza por la del día en cuanto responde /api/rates
  const [exchange, setExchange] = useState<{ rates: Rates; info: RatesInfo }>({
    rates: FALLBACK_RATES,
    info: { live: false, sources: ['tasa de respaldo'], updatedAt: null },
  });
  useEffect(() => {
    let vigente = true;
    fetchRates().then((result) => {
      if (vigente) setExchange(result);
    });
    return () => {
      vigente = false;
    };
  }, []);
  const [displayPref, setDisplayPref] = useState<string | null>(() => readStorage(DISPLAY_CURRENCY_KEY));

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    writeStorage(THEME_KEY, theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  // Datos de la plataforma (simulados en memoria)
  const [companies, setCompanies] = useState<Company[]>(initialData.companies);
  const [users, setUsers] = useState<AppUser[]>(initialData.users);
  const [accounts, setAccounts] = useState<ClientAccount[]>(initialData.accounts);
  const [allLeads, setAllLeads] = useState<Lead[]>(initialData.leads);
  const [allActivities, setAllActivities] = useState<LeadActivity[]>(initialData.activities);
  const [catalog, setCatalog] = useState<CatalogItem[]>(initialData.catalog);
  // Zonas: en la demo, las de ejemplo; con Supabase, las del CRM en la base (con su polígono)
  const [territories, setTerritories] = useState<TerritoryMetric[]>(db ? [] : mockTerritories);
  // Historial de auditoría: se agrega, nunca se edita ni se borra
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  // Configuración del pipeline por CRM: la edición de un tenant no afecta a otro
  const [stageConfigsByTenant, setStageConfigsByTenant] = useState<Record<string, StageConfig[]>>({});

  // Sesión y navegación
  // En la demo la sesión se recuerda en localStorage; con Supabase la guarda Supabase Auth
  // La demo pública entra directo como gerente y no recuerda la sesión: cada visita parte de cero
  const [sessionUserId, setSessionUserId] = useState<string | null>(() =>
    publicDemo ? DEMO_MANAGER_ID : db ? null : readStorage(SESSION_KEY)
  );
  // Con Supabase no se muestra el login hasta saber si ya había una sesión abierta
  const [authReady, setAuthReady] = useState(!db);
  // Enlace de invitación o recuperación: la persona elige su contraseña antes de entrar
  const [passwordLink, setPasswordLink] = useState<'invite' | 'recovery' | null>(db ? initialAuthLinkType : null);
  const [authNotice, setAuthNotice] = useState<string | null>(db ? initialAuthLinkError : null);
  // Con Supabase: un cambio guardado cuya entrada de auditoría no llegó a la base
  const [auditWarning, setAuditWarning] = useState<string | null>(null);
  // Con Supabase: un cambio que la base rechazó (la app vuelve a cargar lo que de verdad quedó)
  const [syncError, setSyncError] = useState<string | null>(null);
  // Lo último que quedó guardado en la base: cada cambio del estado se compara con esto
  const synced = useRef<TenantSnapshot | null>(null);
  // Llamadas que no son una diferencia de datos (derechos del titular, marcar una reversión)
  const pendingCalls = useRef<((client: NonNullable<typeof db>) => Promise<string | null>)[]>([]);
  const [syncTick, setSyncTick] = useState(0);
  // Una escritura a la vez y en orden: una empresa antes que su lead, un lead antes que su bitácora
  const writeChain = useRef<Promise<void>>(Promise.resolve());
  const [activeTab, setActiveTab] = useState<ActiveTab>('kpi');
  const [selectedTerritoryId, setSelectedTerritoryId] = useState<string | null>(null);
  const [selectedLeadIdForContact, setSelectedLeadIdForContact] = useState<string | null>(null);
  const [isCaptureModalOpen, setIsCaptureModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  // Uso de la plataforma: en memoria solo cuando no hay Supabase (demo y pruebas); con Supabase lo guarda la base
  const [loginLog, setLoginLog] = useState<LoginRecord[]>([]);
  const [surveys, setSurveys] = useState<SurveyResponse[]>([]);
  const [bugReports, setBugReports] = useState<BugReport[]>([]);
  const [isBugModalOpen, setIsBugModalOpen] = useState(false);
  const [isSurveyOpen, setIsSurveyOpen] = useState(false);
  // Portal fiscalizador: quién vio o descargó el expediente. En producción es una tabla que solo se agrega.
  const [complianceAccessLog, setComplianceAccessLog] = useState<{ at: string; who: string; what: string }[]>([]);
  const [kpiFilters, setKpiFilters] = useState<KpiFilters>(emptyKpiFilters);
  const [kpiView, setKpiView] = useState<'zones' | 'catalog'>('zones');
  // Plan Internacional: países elegidos en la barra de países (null = todos los habilitados)
  const [countrySelection, setCountrySelection] = useState<CountryCode[] | null>(null);

  const currentUser = users.find((u) => u.id === sessionUserId) ?? null;
  const currentCompany = companies.find((c) => c.id === currentUser?.companyId) ?? null;
  const isSessionValid =
    currentUser !== null &&
    currentUser.isActive &&
    (currentUser.role === 'superadmin' || currentCompany?.isActive === true);

  // Aislamiento por tenant: base y gerente solo ven los datos de su propia empresa
  const tenantId = isSessionValid && currentUser?.role !== 'superadmin' ? (currentUser?.companyId ?? null) : null;

  // Países: el CRM solo opera en sus países habilitados; la barra de países reduce la vista a los seleccionados
  const enabledCountries = useMemo(
    () => (tenantId ? enabledCountriesOf(currentCompany) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tenantId, currentCompany?.plan, currentCompany?.homeCountry, currentCompany?.enabledCountries.join(',')]
  );
  const selectedCountries = useMemo(() => {
    const valid = (countrySelection ?? []).filter((c) => enabledCountries.includes(c));
    return valid.length > 0 ? valid : enabledCountries;
  }, [countrySelection, enabledCountries]);
  const isMultiCountry = selectedCountries.length > 1;
  const tenantTerritories = useMemo(
    () => territories.filter((t) => enabledCountries.includes(t.countryCode)),
    [territories, enabledCountries]
  );
  const visibleTerritories = useMemo(
    () => tenantTerritories.filter((t) => selectedCountries.includes(t.countryCode)),
    [tenantTerritories, selectedCountries]
  );

  // Datos del tenant en sus países habilitados (base de las reglas de escritura)
  const tenantLeads = useMemo(
    () => allLeads.filter((l) => l.companyId === tenantId && enabledCountries.includes(l.countryCode)),
    [allLeads, tenantId, enabledCountries]
  );
  const tenantAccounts = useMemo(
    () => accounts.filter((a) => a.companyId === tenantId && enabledCountries.includes(a.countryCode)),
    [accounts, tenantId, enabledCountries]
  );
  // Datos visibles: solo los países seleccionados
  const leads = useMemo(() => tenantLeads.filter((l) => selectedCountries.includes(l.countryCode)), [tenantLeads, selectedCountries]);
  const visibleAccounts = useMemo(
    () => tenantAccounts.filter((a) => selectedCountries.includes(a.countryCode)),
    [tenantAccounts, selectedCountries]
  );
  const activities = useMemo(() => scopeActivities(allActivities, leads, tenantId), [allActivities, leads, tenantId]);
  const tenantCatalog = useMemo(() => catalog.filter((item) => item.companyId === tenantId), [catalog, tenantId]);
  // Ítems en uso en cualquier lead del CRM (todos los países): no se pueden eliminar del catálogo
  const usedItemIds = useMemo(
    () => new Set(allLeads.filter((l) => l.companyId === tenantId).flatMap((l) => (l.items ?? []).map((i) => i.itemId))),
    [allLeads, tenantId]
  );
  const stageConfigs = stageConfigsForTenant(stageConfigsByTenant, tenantId, defaultStageConfigs);
  const canManage = isManager(currentUser) && tenantId !== null;
  const auditEntries = useMemo(() => scopeAuditLog(auditLog, tenantId), [auditLog, tenantId]);

  // ---------- Auditoría: quién hizo qué y cuándo ----------
  const auditContext: AuditContext = {
    zoneName: (territoryId) => territories.find((t) => t.territoryId === territoryId)?.territoryName ?? 'Sin zona',
    itemName: (itemId) => catalog.find((i) => i.id === itemId)?.name ?? 'Ítem',
    stageLabel: (stage) => stageConfigs.find((s) => s.id === stage)?.label ?? stage,
  };

  const record = (data: NewAuditEntry) => {
    if (!currentUser) return;
    // Con Supabase, lo que ya vive en la base deja también su historial en la base
    const persist = db !== null && isAuditEntityConnected(data.entity);
    const entry = buildAuditEntry(data, currentUser, persist ? newUuid() : newId('audit'));
    setAuditLog((prev) => [entry, ...prev]);
    if (db && persist) {
      void saveAuditEntry(db, entry).then((error) => {
        if (error) setAuditWarning(`El cambio se guardó, pero no quedó registrado en la auditoría: ${error}`);
      });
    }
  };
  // Ids: con Supabase, UUID (el tipo de las columnas id); en la demo, legibles con prefijo
  const recordId = (prefix: string) => (db ? newUuid() : newId(prefix));

  // ---------- Sincronización con la base (Supabase) ----------
  // Todo lo del CRM, tal como está en la base
  const applyTenantData = (companyId: string, data: TenantData) => {
    const stages = mergeStageConfigs(defaultStageConfigs, data.stages);
    synced.current = snapshotFor(companyId, { ...data, stages });
    setStageConfigsByTenant((prev) => ({ ...prev, [companyId]: stages }));
    setAccounts(data.accounts);
    setAllLeads(data.leads);
    setAllActivities(data.activities);
    setCatalog(data.catalog);
    setTerritories(data.territories);
  };

  const loadTenant = async (companyId: string): Promise<string | null> => {
    if (!db) return null;
    const datos = await loadTenantData(db, companyId);
    if (!datos.ok) return datos.error;
    applyTenantData(companyId, datos.data);
    return null;
  };

  // Con Supabase, el contorno de una zona se descarga recién cuando se usa: al entrar, el de las zonas
  // con leads; después, el de la que recibe su primer lead (captura, edición o asistente) o se elige.
  const zonasSinContorno = useMemo(() => {
    if (!db) return '';
    const enUso = new Set(allLeads.filter((l) => l.companyId === tenantId).map((l) => l.assignedTerritoryId));
    if (selectedTerritoryId) enUso.add(selectedTerritoryId);
    return territories
      .filter((t) => enUso.has(t.territoryId) && t.geojsonPolygon.coordinates.length === 0)
      .map((t) => t.territoryId)
      .sort()
      .join(',');
  }, [allLeads, tenantId, selectedTerritoryId, territories]);
  useEffect(() => {
    if (!db || !zonasSinContorno) return;
    let vigente = true;
    loadZonePolygons(db, zonasSinContorno.split(',')).then((resultado) => {
      if (!vigente || !resultado.ok) return;
      setTerritories((prev) =>
        prev.map((t) => {
          const poligono = resultado.data.get(t.territoryId);
          return poligono ? { ...t, geojsonPolygon: poligono as TerritoryMetric['geojsonPolygon'] } : t;
        })
      );
    });
    return () => {
      vigente = false;
    };
  }, [zonasSinContorno]);

  const enqueueCall = (call: (client: NonNullable<typeof db>) => Promise<string | null>) => {
    pendingCalls.current.push(call);
    setSyncTick((t) => t + 1);
  };

  // Cada cambio del CRM (desde cualquier módulo o desde el asistente) se compara con lo guardado y
  // solo la diferencia va a la base. Si la base rechaza algo, se avisa y se recarga lo real.
  useEffect(() => {
    if (!db || !tenantId || !currentUser || !synced.current) return;
    const next = snapshotFor(tenantId, {
      leads: allLeads,
      accounts,
      activities: allActivities,
      catalog,
      stages: stageConfigsForTenant(stageConfigsByTenant, tenantId, defaultStageConfigs),
    });
    const ops = diffTenantData(synced.current, next);
    synced.current = next;
    const calls = pendingCalls.current.splice(0);
    if (ops.length === 0 && calls.length === 0) return;
    const userId = currentUser.id;
    const companyId = tenantId;
    writeChain.current = writeChain.current.then(async () => {
      let error = ops.length > 0 ? await applySyncOps(db, ops, { userId }) : null;
      for (const call of calls) {
        if (error) break;
        error = await call(db);
      }
      if (!error) return;
      const recarga = await loadTenant(companyId);
      setSyncError(recarga ? `${error} Tampoco se pudieron recargar los datos: ${recarga}` : error);
    });
    // Se compara solo cuando cambian los datos del CRM o hay llamadas pendientes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLeads, accounts, allActivities, catalog, stageConfigsByTenant, syncTick]);

  const canAdminister = isSuperadmin(currentUser) && isSessionValid;

  const allowedTabs = currentUser ? ROLE_TABS[currentUser.role] : [];
  const currentTab = allowedTabs.includes(activeTab) ? activeTab : allowedTabs[0];

  // ---------- KPI ----------
  // Moneda de la vista: la elegida por el usuario, o CLP para un CRM con base en Chile y US$ para el resto
  // Las que ofrece el selector: la del país base y el dólar siempre, más las que sumó la gerencia
  const defaultDisplay: CurrencyCode = currentCompany?.homeCountry === 'CL' ? 'CLP' : 'USD';
  const viewCurrencies = useMemo(
    () =>
      currentCompany
        ? viewCurrenciesFor(currentCompany.homeCountry, enabledCountriesOf(currentCompany), currentCompany.viewCurrencies)
        : (['CLP', 'USD'] as CurrencyCode[]),
    [currentCompany]
  );
  const displayCurrency: CurrencyCode = viewCurrencies.includes(displayPref as CurrencyCode)
    ? (displayPref as CurrencyCode)
    : defaultDisplay;
  const money = useMemo(
    () => buildMoneyApi(displayCurrency, exchange.rates, exchange.info),
    [displayCurrency, exchange]
  );
  const changeDisplayCurrency = (currency: CurrencyCode) => {
    setDisplayPref(currency);
    writeStorage(DISPLAY_CURRENCY_KEY, currency);
  };

  const kpiLeads = useMemo(() => applyKpiFilters(leads, kpiFilters), [leads, kpiFilters]);
  // "Colorear por" del mapa: el ranking de zonas líderes usa el mismo criterio
  const [zoneMetric, setZoneMetric] = useState<ZoneMetric>('money');
  const territoriesMetrics = useMemo(() => computeTerritoryMetrics(leads, visibleTerritories), [leads, visibleTerritories]);
  const lostLeads = useMemo(() => kpiLeads.filter((l) => l.commercialStatus === 'lost'), [kpiLeads]);
  // Un lead descartado deja de ser demanda accionable: sale de las métricas de zona,
  // pero sigue contado en el total capturado y en el historial de auditoría.
  const activeKpiLeads = useMemo(() => kpiLeads.filter((l) => l.commercialStatus !== 'lost'), [kpiLeads]);
  const kpiTerritoriesMetrics = useMemo(
    () => computeTerritoryMetrics(activeKpiLeads, visibleTerritories),
    [activeKpiLeads, visibleTerritories]
  );

  const companyOptions = useMemo(
    () =>
      Array.from(new Set(leads.map((l) => l.companyName).filter((c): c is string => !!c))).sort((a, b) =>
        a.localeCompare(b, 'es')
      ),
    [leads]
  );

  // Dinero: se separa lo ya ganado de lo que sigue abierto; un solo total mezclaba ambas cosas.
  // Moneda local con un país; consolidado aproximado en USD con varios.
  const wonLeads = useMemo(() => kpiLeads.filter((l) => l.commercialStatus === 'won'), [kpiLeads]);
  const openLeads = useMemo(
    () => kpiLeads.filter((l) => l.commercialStatus !== 'won' && l.commercialStatus !== 'lost'),
    [kpiLeads]
  );


  const locatedRatio = (source: Lead[]) => {
    const located = source.filter((l) => l.geocodingStatus === 'success' && l.assignedTerritoryId).length;
    return source.length > 0 ? Math.round((located / source.length) * 100) : 0;
  };
  const geocodedRatio = useMemo(() => locatedRatio(kpiLeads), [kpiLeads]);
  const leadCountsByCountry = useMemo(() => countByCountry(tenantLeads), [tenantLeads]);

  // ---------- Sesión ----------
  const openSession = (user: AppUser) => {
    setSessionUserId(user.id);
    setActiveTab(ROLE_TABS[user.role][0]);
    setKpiFilters(emptyKpiFilters);
    setCountrySelection(null);
    setSelectedTerritoryId(null);
    setSelectedLeadIdForContact(null);
  };

  // Panel de uso del administrador: con Supabase, conteos de la base; sin ella, los mismos cálculos en memoria
  const usageSource = useRef({ companies, users, leads: allLeads, activities: allActivities, logins: loginLog, surveys, bugs: bugReports });
  usageSource.current = { companies, users, leads: allLeads, activities: allActivities, logins: loginLog, surveys, bugs: bugReports };
  const usageApi = useMemo(
    () =>
      db
        ? createDbUsageApi(db)
        : createMemoryUsageApi(
            () => usageSource.current,
            (id, status) =>
              setBugReports((prev) =>
                prev.map((b) => (b.id === id ? { ...b, status, resolvedAt: status === 'resolved' ? new Date().toISOString() : undefined } : b))
              )
          ),
    []
  );

  // Encuesta de satisfacción: después de la primera semana y cada 30 días; "Ahora no" espera 7
  const personaEnSesion = currentUser?.id;
  const sesionDeCrm = Boolean(currentUser && isSessionValid && currentUser.role !== 'superadmin');
  useEffect(() => {
    setIsSurveyOpen(false);
    if (!sesionDeCrm || !currentUser || publicDemo || (!db && !forzarEncuesta)) return;
    let vigente = true;
    const espera = window.setTimeout(
      async () => {
        const ultima = db
          ? await loadMyLastSurveyAt(db, currentUser.id)
          : (surveys.filter((s) => s.userId === currentUser.id).map((s) => s.createdAt).sort().pop() ?? null);
        const pospuesta = readStorage(`${SURVEY_SNOOZE_KEY}-${currentUser.id}`);
        if (vigente && shouldAskSurvey({ now: new Date(), userCreatedAt: currentUser.createdAt, lastAnsweredAt: ultima, snoozedAt: pospuesta })) {
          setIsSurveyOpen(true);
        }
      },
      forzarEncuesta ? 300 : 8000
    );
    return () => {
      vigente = false;
      window.clearTimeout(espera);
    };
    // Solo al entrar una persona: lo demás se lee en ese momento
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personaEnSesion, sesionDeCrm]);

  // Después de entrar, los módulos del perfil se bajan en segundo plano (src/lib/modulos.ts)
  const rolEnSesion = currentUser?.role;
  useEffect(() => {
    if (!rolEnSesion) return;
    // Safari no tiene requestIdleCallback: ahí se espera un momento después de dibujar
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(() => precargarModulos(rolEnSesion), { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const t = setTimeout(() => precargarModulos(rolEnSesion), 1200);
    return () => clearTimeout(t);
  }, [rolEnSesion]);

  // Con Supabase: perfil de quien entra y todo lo que RLS le deja ver. Si el usuario o su CRM están
  // desactivados, la sesión de Auth se cierra de inmediato.
  const enterWithSupabase = async (userId: string): Promise<string | null> => {
    if (!db) return 'Supabase no está configurado.';
    const perfil = await loadSessionProfile(db, userId);
    if (!perfil.ok) {
      await signOut(db);
      return perfil.error;
    }
    const { user, company } = perfil.data;
    if (!user.isActive || (user.role !== 'superadmin' && !company?.isActive)) {
      await signOut(db);
      return 'Tu usuario o tu CRM está desactivado. Habla con el administrador.';
    }
    const plataforma = await loadPlatform(db);
    if (!plataforma.ok) {
      await signOut(db);
      return plataforma.error;
    }
    const visibles = plataforma.data.users.some((u) => u.id === user.id)
      ? plataforma.data.users
      : [user, ...plataforma.data.users];
    // El trabajo diario del CRM: sin él no se puede operar, así que un error impide entrar
    if (user.role !== 'superadmin' && company) {
      const cargado = await loadTenant(company.id);
      if (cargado) {
        await signOut(db);
        return cargado;
      }
    }
    // El historial es de la gerencia del CRM (RLS no se lo muestra a nadie más)
    const nombreDe = (id: string) => visibles.find((u) => u.id === id)?.fullName;
    const historial = user.role === 'manager' && company ? await loadAuditLog(db, company.id, nombreDe) : null;
    setCompanies(plataforma.data.companies);
    setUsers(visibles);
    setAuditLog(historial?.ok ? historial.data : []);
    setAuditWarning(historial && !historial.ok ? historial.error : null);
    openSession(user);
    // Cuenta la visita para el panel del administrador; si falla, no molesta
    if (user.role !== 'superadmin') void recordLogin(db);
    return null;
  };

  const handleLogin = async (email: string, password: string): Promise<string | null> => {
    if (db) {
      setAuthNotice(null);
      const sesion = await signIn(db, email, password);
      if (!sesion.ok) return sesion.error;
      return enterWithSupabase(sesion.data);
    }

    const result = authenticate(email, password, users, companies);
    if (!result.ok) return result.error;
    writeStorage(SESSION_KEY, result.user.id);
    openSession(result.user);
    if (result.user.role !== 'superadmin') {
      // Una visita cuenta una vez: igual que en la base, no más de un ingreso cada 30 minutos
      const ahora = Date.now();
      const persona = result.user.id;
      setLoginLog((prev) =>
        prev.some((l) => l.userId === persona && ahora - new Date(l.at).getTime() < 30 * 60 * 1000)
          ? prev
          : [...prev, { userId: persona, at: new Date(ahora).toISOString() }]
      );
    }
    return null;
  };

  // Encuesta y reporte de errores: con Supabase van a la base; sin ella, a la memoria del panel del administrador
  const handleSubmitSurvey = async (score: number, comment: string): Promise<string | null> => {
    if (!currentUser?.companyId) return 'La encuesta es para las personas de un CRM.';
    if (db) {
      const enviado = await submitSurvey(db, currentUser, score, comment);
      return enviado.ok ? null : enviado.error;
    }
    setSurveys((prev) => [
      { id: newUuid(), companyId: currentUser.companyId!, userId: currentUser.id, score, comment: comment.trim() || undefined, createdAt: new Date().toISOString() },
      ...prev,
    ]);
    return null;
  };

  const dismissSurvey = () => {
    if (currentUser) writeStorage(`${SURVEY_SNOOZE_KEY}-${currentUser.id}`, new Date().toISOString());
    setIsSurveyOpen(false);
  };

  const handleSubmitBug = async (description: string): Promise<string | null> => {
    if (!currentUser?.companyId) return 'El reporte es para las personas de un CRM.';
    const reporte = { description, page: currentTab, userAgent: navigator.userAgent };
    if (db) {
      const enviado = await submitBugReport(db, currentUser, reporte);
      return enviado.ok ? null : enviado.error;
    }
    setBugReports((prev) => [
      {
        id: newUuid(),
        companyId: currentUser.companyId!,
        userId: currentUser.id,
        description: description.trim(),
        page: reporte.page,
        userAgent: reporte.userAgent.slice(0, 300),
        status: 'new',
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    return null;
  };

  // Al abrir la app con Supabase: se retoma la sesión guardada o la que trae un enlace de invitación
  useEffect(() => {
    if (!db) return;
    let vigente = true;
    if (initialAuthLinkError) window.history.replaceState(null, '', window.location.pathname + window.location.search);
    void db.auth.getSession().then(async ({ data }) => {
      if (data.session && vigente) {
        const error = await enterWithSupabase(data.session.user.id);
        if (error && vigente) setAuthNotice(error);
      }
      if (vigente) setAuthReady(true);
    });
    const { data: suscripcion } = db.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setPasswordLink('recovery');
      if (event === 'SIGNED_OUT') setSessionUserId(null);
    });
    return () => {
      vigente = false;
      suscripcion.subscription.unsubscribe();
    };
    // Solo al montar: enterWithSupabase usa los setters, que son estables
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = () => {
    // Salir de la demo pública lleva al login real; lo que se hizo en la demo se pierde
    if (publicDemo) {
      window.location.assign('/');
      return;
    }
    if (db) {
      void signOut(db);
      // Lo cargado de la base no queda en memoria para la siguiente persona de este navegador
      setCompanies([]);
      setUsers([]);
      setAccounts([]);
      setAllLeads([]);
      setAllActivities([]);
      setCatalog([]);
      setAuditLog([]);
      setComplianceAccessLog([]);
      setAuditWarning(null);
      setTerritories([]);
      setStageConfigsByTenant({});
      setSyncError(null);
      synced.current = null;
      pendingCalls.current = [];
    }
    setPasswordLink(null);
    setSessionUserId(null);
    writeStorage(SESSION_KEY, null);
    setIsCaptureModalOpen(false);
    // Las claves personales de Gemini no pasan al siguiente usuario de este navegador
    try {
      Object.keys(sessionStorage)
        .filter((key) => key.startsWith('revela-gemini-key'))
        .forEach((key) => sessionStorage.removeItem(key));
    } catch {
      // sin almacenamiento de sesión
    }
  };

  // ---------- Operación (usuario base) ----------
  const handleUpdateLeadStatus = (leadId: string, newStatus: CommercialStatus) => {
    const lead = tenantLeads.find((l) => l.id === leadId);
    // El usuario base solo avanza leads: retroceder es de gerencia
    if (!lead || !currentUser || !canChangeStage(currentUser.role, lead.commercialStatus, newStatus)) return;
    if (!canMoveLeadStage(lead)) return;

    setAllLeads((prev) =>
      prev.map((l) => (l.id === leadId && l.companyId === tenantId ? { ...l, commercialStatus: newStatus } : l))
    );
    record({
      companyId: lead.companyId,
      action: 'stage',
      entity: 'lead',
      entityId: lead.id,
      entityLabel: auditLeadLabel(lead),
      summary: `${auditContext.stageLabel(lead.commercialStatus)} → ${auditContext.stageLabel(newStatus)}`,
      changes: [
        {
          field: 'commercialStatus',
          label: 'Etapa',
          before: auditContext.stageLabel(lead.commercialStatus),
          after: auditContext.stageLabel(newStatus),
        },
      ],
      revert: { kind: 'lead', snapshot: leadWithoutPersonalData(lead) },
    });
  };

  // Agregar una persona al lead desde la toma de contacto: en plena llamada aparece
  // el nombre de alguien más y hay que poder anotarlo sin salir del módulo.
  const handleAddLeadContact = (
    leadId: string,
    data: { fullName: string; jobTitle?: string; email?: string; phone?: string }
  ) => {
    const lead = tenantLeads.find((l) => l.id === leadId);
    if (!lead || !data.fullName.trim()) return;
    handleUpdateLead({
      ...lead,
      contacts: [...(lead.contacts ?? []), { ...data, id: recordId('contact') }],
    });
  };

  const handleAddActivity = (
    activityData: Omit<LeadActivity, 'id' | 'createdAt'>,
    advanceStageTo?: CommercialStatus
  ) => {
    if (!tenantId || !canRegisterActivity(activityData.leadId, tenantLeads, tenantId)) return;
    const now = new Date().toISOString();
    const lead = tenantLeads.find((l) => l.id === activityData.leadId);
    // Avanzar la etapa al registrar un contacto sigue la misma regla que el pipeline
    const nextStage =
      advanceStageTo && lead && currentUser && canChangeStage(currentUser.role, lead.commercialStatus, advanceStageTo)
        ? advanceStageTo
        : undefined;

    setAllActivities((prev) => [{ ...activityData, companyId: tenantId, id: recordId('act'), createdAt: now }, ...prev]);
    setAllLeads((prev) =>
      prev.map((l) =>
        l.id === activityData.leadId && l.companyId === tenantId
          ? { ...l, lastContactedAt: now, commercialStatus: nextStage || l.commercialStatus }
          : l
      )
    );
    if (lead) {
      record({
        companyId: tenantId,
        action: 'contact',
        entity: 'activity',
        entityId: activityData.leadId,
        entityLabel: auditLeadLabel(lead),
        summary: `Contacto por ${CHANNEL_LABEL[activityData.channel] ?? activityData.channel}${
          nextStage ? ` · pasa a ${auditContext.stageLabel(nextStage)}` : ''
        }`,
      });
    }
  };

  const handleOpenContactForLead = (lead: Lead) => {
    setSelectedLeadIdForContact(lead.id);
    setActiveTab('contact');
  };

  const handleAddLead = (input: NewLeadInput): string | null => {
    if (!tenantId) return null;
    // El país debe estar habilitado para el CRM y la zona debe pertenecer a ese país
    if (!enabledCountries.includes(input.countryCode)) return null;
    const territoryOk =
      !input.assignedTerritoryId ||
      tenantTerritories.some((t) => t.territoryId === input.assignedTerritoryId && t.countryCode === input.countryCode);
    const location = territoryOk
      ? {}
      : { assignedTerritoryId: undefined, geocodingStatus: 'manual_review' as const };
    const now = new Date().toISOString();
    const name = input.companyName?.trim();

    // Vincula con una empresa cliente existente del mismo país o la crea
    let account = name
      ? tenantAccounts.find((a) => a.countryCode === input.countryCode && a.name.toLowerCase() === name.toLowerCase())
      : undefined;
    if (name && !account) {
      account = { id: recordId('acc'), companyId: tenantId, countryCode: input.countryCode, name, isActive: true, createdAt: now };
      const created = account;
      setAccounts((prev) => [...prev, created]);
    }

    // Productos y servicios: solo del catálogo del CRM; con ítems el valor se calcula salvo que sea manual
    const newLead: Lead = applyLeadValue({
      ...input,
      ...location,
      // Moneda negociada: solo una permitida para el CRM; si no, la del país del lead
      currency: isAllowedLeadCurrency(input.currency, enabledCountries) ? input.currency : undefined,
      items: sanitizeLeadItems(input.items, tenantCatalog, tenantId),
      id: recordId('lead'),
      companyId: tenantId,
      clientAccountId: account?.id,
      companyName: account?.name,
      createdAt: now,
    });
    setAllLeads((prev) => [newLead, ...prev]);
    record({
      companyId: tenantId,
      action: 'create',
      entity: 'lead',
      entityId: newLead.id,
      entityLabel: auditLeadLabel(newLead),
      summary: leadSummary(newLead),
    });
    return newLead.id;
  };

  // ---------- Asistente IA: ejecución de save_lead_to_crm sobre el CRM del tenant ----------
  const AI_STATUS: Record<string, CommercialStatus> = {
    nuevo: 'new',
    contactado: 'contacted',
    calificado: 'qualified',
    propuesta: 'proposal',
    pago_pendiente: 'pending_payment',
    ganado: 'won',
    perdido: 'lost',
  };

  const normalize = (value: string) =>
    value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

  // Ficha mínima de un lead para que el asistente pueda identificarlo. Todo lo que va aquí sale
  // del CRM hacia el proveedor de IA, así que NO incluye email, teléfono ni monto: para reconocer
  // un lead y moverlo de etapa basta con el nombre, la empresa y dónde está.
  const aiLeadSummary = (lead: Lead) => ({
    lead_id: lead.id,
    contact_name: safeForModel(lead.fullName),
    company_name: safeForModel(lead.companyName) || 'Persona natural',
    status: stageConfigs.find((s) => s.id === lead.commercialStatus)?.label ?? lead.commercialStatus,
    country: COUNTRIES[lead.countryCode].name,
    zone: safeForModel(visibleTerritories.find((t) => t.territoryId === lead.assignedTerritoryId)?.territoryName) || null,
  });

  // Techo de escrituras del asistente por sesión: acota el daño si el modelo se descontrola
  const aiWrites = useRef(0);
  const allowAiWrite = (): string | null =>
    aiWrites.current >= MAX_AI_WRITES_PER_SESSION ? AI_WRITE_LIMIT_ERROR : null;

  // Buscar leads que YA están en el CRM. Sin esto el asistente solo sabía crear, y "mueve a X"
  // terminaba duplicando el lead en vez de moverlo.
  const handleAiFindLeads = (args: Record<string, unknown>): Record<string, unknown> => {
    if (!tenantId) return { ok: false, error: 'No hay un CRM de empresa activo en la sesión.' };
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    if (!query) return { ok: false, error: 'Falta el texto a buscar.' };

    const countryArg = normalize(typeof args.country === 'string' ? args.country : '');
    const countryCode = countryArg
      ? enabledCountries.find((c) => normalize(c) === countryArg || normalize(COUNTRIES[c].name) === countryArg)
      : undefined;
    if (countryArg && !countryCode) {
      return { ok: false, error: `El país "${String(args.country)}" no está habilitado para este CRM.` };
    }

    // Los leads bloqueados, anonimizados o con oposición del titular no se le muestran al asistente
    const matches = findLeadMatches(tenantLeads.filter(canContact), { query, countryCode });
    if (matches.length === 0) {
      return { ok: true, matches: [], message: `No hay ningún lead en el CRM que coincida con "${query}".` };
    }
    return {
      ok: true,
      matches: matches.map((m) => ({ ...aiLeadSummary(m.lead), confident: m.score >= CONFIDENT_MATCH })),
      message:
        matches.length === 1
          ? 'Una sola coincidencia.'
          : 'Varias coincidencias: pregunta al usuario a cuál se refiere antes de modificar nada.',
    };
  };

  // Mover de etapa un lead existente, con la misma regla de rol que el pipeline
  const handleAiUpdateLeadStage = (args: Record<string, unknown>): Record<string, unknown> => {
    if (!tenantId || !currentUser) return { ok: false, error: 'No hay un CRM de empresa activo en la sesión.' };
    const limite = allowAiWrite();
    if (limite) return { ok: false, error: limite };
    const leadId = typeof args.lead_id === 'string' ? args.lead_id.trim() : '';
    const lead = tenantLeads.find((l) => l.id === leadId);
    if (!lead) {
      return { ok: false, error: 'No existe un lead con ese ID en este CRM. Usa find_leads_in_crm para obtener el ID correcto.' };
    }
    if (!canContact(lead)) {
      return { ok: false, error: `No se puede trabajar este lead: ${blockedReason(lead) ?? 'el titular ejerció sus derechos sobre sus datos'}.` };
    }

    const status = AI_STATUS[normalize(typeof args.status === 'string' ? args.status : '')];
    if (!status) return { ok: false, error: 'Etapa no reconocida.' };
    const etiqueta = (s: CommercialStatus) => stageConfigs.find((c) => c.id === s)?.label ?? s;
    if (status === lead.commercialStatus) {
      return { ok: true, action: 'unchanged', ...aiLeadSummary(lead), message: `El lead ya estaba en ${etiqueta(status)}.` };
    }
    if (!canChangeStage(currentUser.role, lead.commercialStatus, status)) {
      return {
        ok: false,
        error: `Tu perfil no puede mover un lead de ${etiqueta(lead.commercialStatus)} a ${etiqueta(status)}. Retroceder leads es de gerencia.`,
      };
    }

    handleUpdateLeadStatus(lead.id, status);
    aiWrites.current += 1;
    return {
      ok: true,
      action: 'stage_changed',
      ...aiLeadSummary(lead),
      status: etiqueta(status),
      previous_status: etiqueta(lead.commercialStatus),
    };
  };

  const handleAiSaveLead = (args: Record<string, unknown>): Record<string, unknown> => {
    if (!tenantId) return { ok: false, error: 'No hay un CRM de empresa activo en la sesión.' };
    const limiteEscrituras = allowAiWrite();
    if (limiteEscrituras) return { ok: false, error: limiteEscrituras };
    const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

    const companyName = text(args.company_name);
    if (!companyName) return { ok: false, error: 'Falta el nombre de la empresa.' };

    const status = AI_STATUS[normalize(text(args.status))] ?? 'new';
    const statusLabel = stageConfigs.find((s) => s.id === status)?.label ?? status;

    // El asistente registra empresas, no personas: aunque el modelo envíe un nombre o un correo, se
    // descartan. A la persona la agrega el vendedor en el primer contacto real (Ley 21.719: los datos
    // de una persona no se recolectan de fuentes públicas sin base ni aviso).
    const contactName = '';
    const phone = text(args.phone) || undefined;
    const email = undefined;
    const notes = text(args.notes) || undefined;
    // País: el indicado por la IA (código o nombre), el de la zona indicada o el primero visible
    const countryArg = normalize(text(args.country));
    const requestedCountry = countryArg
      ? enabledCountries.find((c) => normalize(c) === countryArg || normalize(COUNTRIES[c].name) === countryArg)
      : undefined;
    if (countryArg && !requestedCountry) {
      return { ok: false, error: `El país "${text(args.country)}" no está habilitado para este CRM.` };
    }
    // La zona se busca por su nombre oficial (sin tildes ni mayúsculas) y, si la hay, su región.
    // Si hay varias con ese nombre (en Perú hay 10 "Santa Rosa"), no se adivina: queda sin zona.
    const zoneMatches = text(args.commune)
      ? findZonesByName(
          tenantTerritories.filter((t) => !requestedCountry || t.countryCode === requestedCountry),
          text(args.commune),
          text(args.region) || undefined
        )
      : [];
    const commune = zoneMatches.length === 1 ? zoneMatches[0] : undefined;
    const countryCode: CountryCode = requestedCountry ?? commune?.countryCode ?? selectedCountries[0];
    const account = tenantAccounts.find(
      (a) => a.countryCode === countryCode && normalize(a.name) === normalize(companyName)
    );
    if (account && !account.isActive) {
      return { ok: false, error: `La empresa "${account.name}" está desactivada por gerencia y no puede recibir leads.` };
    }
    const now = new Date().toISOString();

    // Si ya existe el lead (misma empresa y mismo teléfono o contacto) se actualiza en vez de duplicarlo
    const existing = tenantLeads.find(
      (l) =>
        l.countryCode === countryCode &&
        normalize(l.companyName ?? '') === normalize(companyName) &&
        ((phone && l.phone === phone) || normalize(l.fullName) === normalize(contactName || companyName))
    );

    // Sin coincidencia exacta puede haber una parecida: el usuario rara vez escribe el nombre
    // completo de la empresa. Antes de crear un duplicado, se pregunta.
    if (!existing) {
      const parecidos = findDuplicateCandidates(tenantLeads, { companyName, contactName, phone, countryCode }).filter(
        (m) => m.score >= CONFIDENT_MATCH
      );
      if (parecidos.length > 0) {
        return {
          ok: false,
          needs_confirmation: true,
          error: 'Ya hay leads parecidos en el CRM. Pregunta al usuario si se refiere a uno de estos antes de crear otro.',
          candidates: parecidos.map((m) => aiLeadSummary(m.lead)),
        };
      }
    }

    if (existing) {
      handleUpdateLead({
        ...existing,
        commercialStatus: status,
        phone: phone ?? existing.phone,
        email: email ?? existing.email,
        notes: notes ? [existing.notes, notes].filter(Boolean).join('\n') : existing.notes,
        lastContactedAt: now,
      });
      aiWrites.current += 1;
      return { ok: true, action: 'updated', lead_id: existing.id, company_name: safeForModel(companyName), status: statusLabel };
    }

    const rawAddress = text(args.address) || 'Dirección por confirmar';
    const location = commune
      ? locateInCommune(commune, rawAddress)
      : { geocodingStatus: 'manual_review' as const };
    const estimated = Number(args.estimated_value);

    const leadId = handleAddLead({
      countryCode,
      fullName: 'Contacto por identificar',
      companyName,
      phone,
      email,
      notes,
      commercialStatus: status,
      estimatedDealValue: Number.isFinite(estimated) && estimated > 0 ? estimated : 0,
      rawAddress,
      // El asistente busca en fuentes públicas: queda declarado y sin consentimiento del titular
      dataOrigin: 'ai',
      consentStatus: 'not_requested',
      consentAt: now,
      ...location,
    });
    if (!leadId) return { ok: false, error: 'No se pudo crear el lead.' };
    aiWrites.current += 1;

    return {
      ok: true,
      action: 'created',
      lead_id: leadId,
      company_name: safeForModel(companyName),
      status: statusLabel,
      country: COUNTRIES[countryCode].name,
      commune: commune?.territoryName ?? null,
      region: commune?.regionName ?? null,
      ...(commune
        ? {}
        : {
            note:
              zoneMatches.length > 1
                ? `Hay ${zoneMatches.length} ${COUNTRIES[countryCode].zoneLabel.plural.toLowerCase()} con ese nombre (${zoneMatches
                    .map((z) => z.regionName ?? z.provinceName)
                    .filter(Boolean)
                    .join(', ')}): quedó en Gerencia → Leads sin zona. Indica la región para ubicarlo.`
                : `Sin ${COUNTRIES[countryCode].zoneLabel.singular.toLowerCase()}: quedó en Gerencia → Leads sin zona.`,
          }),
    };
  };

  // ---------- Gerencia ----------
  const handleUpdateStageConfig = (updated: StageConfig) => {
    if (!canManage || !tenantId) return;
    const before = stageConfigs.find((s) => s.id === updated.id);
    setStageConfigsByTenant((prev) => ({
      ...prev,
      [tenantId]: (prev[tenantId] ?? defaultStageConfigs).map((s) => (s.id === updated.id ? { ...updated } : s)),
    }));
    if (before) {
      const changes = diffFields(before, updated, stageFields);
      if (changes.length > 0) {
        record({
          companyId: tenantId,
          action: 'update',
          entity: 'stage',
          entityId: updated.id,
          entityLabel: updated.label,
          summary: `Configuración de la etapa ${before.label}`,
          changes,
          revert: { kind: 'stage', snapshot: before },
        });
      }
    }
  };

  const handleUpdateLead = (updated: Lead, options: { action?: 'update' | 'locate' | 'revert' } = {}) => {
    const before = tenantLeads.find((l) => l.id === updated.id);
    const safe = sanitizeLeadUpdate(
      before,
      updated,
      tenantId,
      tenantAccounts,
      enabledCountries,
      tenantTerritories,
      tenantCatalog,
      currentUser?.role ?? null
    );
    if (!safe || !before || !tenantId) return;
    setAllLeads((prev) => prev.map((l) => (l.id === safe.id && l.companyId === tenantId ? safe : l)));

    const changes = diffFields(before, safe, leadFields(auditContext));
    if (changes.length === 0) return;
    const action = options.action ?? 'update';
    record({
      companyId: tenantId,
      action: action === 'revert' ? 'revert' : action,
      entity: 'lead',
      entityId: safe.id,
      entityLabel: auditLeadLabel(safe),
      summary:
        action === 'locate'
          ? `Ubicado en ${auditContext.zoneName(safe.assignedTerritoryId)}`
          : action === 'revert'
            ? `Se restauró el estado anterior de ${auditLeadLabel(safe)}`
            : changes.map((c) => c.label).join(', '),
      changes,
      revert: action === 'revert' ? undefined : { kind: 'lead', snapshot: leadWithoutPersonalData(before) },
    });
  };

  // ---------- Catálogo de productos y servicios ----------
  const handleCreateCatalogItem = (data: NewCatalogItem) => {
    if (!canManage || !tenantId) return;
    const draft: CatalogItem = { ...data, id: recordId('item'), companyId: tenantId, createdAt: new Date().toISOString() };
    const safe = sanitizeCatalogItemUpdate(draft, draft, tenantId);
    if (!safe) return;
    setCatalog((prev) => [...prev, safe]);
    record({
      companyId: tenantId,
      action: 'create',
      entity: 'catalog',
      entityId: safe.id,
      entityLabel: safe.name,
      summary: safe.type === 'product' ? 'Nuevo producto en el catálogo' : 'Nuevo servicio en el catálogo',
    });
  };

  const handleUpdateCatalogItem = (updated: CatalogItem, isRevert = false) => {
    if (!canManage || !tenantId) return;
    const before = tenantCatalog.find((i) => i.id === updated.id);
    const safe = sanitizeCatalogItemUpdate(before, updated, tenantId);
    if (!safe || !before) return;
    setCatalog((prev) => prev.map((i) => (i.id === safe.id && i.companyId === tenantId ? safe : i)));

    const changes = diffFields(before, safe, catalogFields);
    if (changes.length === 0) return;
    const onlyActivation = changes.length === 1 && changes[0].field === 'isActive';
    record({
      companyId: tenantId,
      action: isRevert ? 'revert' : onlyActivation ? (safe.isActive ? 'activate' : 'deactivate') : 'update',
      entity: 'catalog',
      entityId: safe.id,
      entityLabel: safe.name,
      summary: isRevert ? `Se restauró ${safe.name}` : changes.map((c) => c.label).join(', '),
      changes,
      revert: isRevert ? undefined : { kind: 'catalog', snapshot: before },
    });
  };

  // Solo se eliminan ítems que no están en ningún lead; los usados se desactivan
  const handleDeleteCatalogItem = (itemId: string) => {
    const item = tenantCatalog.find((i) => i.id === itemId);
    if (!canManage || !tenantId || !item || usedItemIds.has(itemId)) return;
    setCatalog((prev) => prev.filter((i) => !(i.id === itemId && i.companyId === tenantId)));
    record({
      companyId: tenantId,
      action: 'delete',
      entity: 'catalog',
      entityId: item.id,
      entityLabel: item.name,
      summary: 'Eliminado del catálogo',
      revert: { kind: 'catalog-deleted', snapshot: item },
    });
  };

  const handleCreateAccount = (data: NewClientAccount) => {
    if (!canManage || !tenantId || !enabledCountries.includes(data.countryCode)) return;
    const account: ClientAccount = { ...data, id: recordId('acc'), companyId: tenantId, createdAt: new Date().toISOString() };
    setAccounts((prev) => [...prev, account]);
    record({
      companyId: tenantId,
      action: 'create',
      entity: 'account',
      entityId: account.id,
      entityLabel: account.name,
      summary: `Nueva empresa cliente en ${COUNTRIES[account.countryCode].name}`,
    });
  };

  // Solo se eliminan empresas sin leads; las que tienen historial se desactivan
  const handleDeleteAccount = (accountId: string) => {
    const account = tenantAccounts.find((a) => a.id === accountId);
    if (!canManage || !tenantId || !account) return;
    if (allLeads.some((l) => l.clientAccountId === accountId)) return;
    setAccounts((prev) => prev.filter((a) => !(a.id === accountId && a.companyId === tenantId)));
    record({
      companyId: tenantId,
      action: 'delete',
      entity: 'account',
      entityId: account.id,
      entityLabel: account.name,
      summary: 'Empresa cliente eliminada (no tenía leads)',
      revert: { kind: 'account-deleted', snapshot: accountWithoutPersonalData(account) },
    });
  };

  const handleUpdateAccount = (updated: ClientAccount, isRevert = false) => {
    if (!canManage || !tenantId) return;
    const existing = tenantAccounts.find((a) => a.id === updated.id);
    const safe = sanitizeAccountUpdate(existing, updated, tenantId, enabledCountries);
    if (!safe || !existing) return;
    // Una empresa con leads no cambia de país (sus leads quedarían en otro país)
    if (existing.countryCode !== safe.countryCode && allLeads.some((l) => l.clientAccountId === safe.id)) return;
    setAccounts((prev) => prev.map((a) => (a.id === safe.id && a.companyId === tenantId ? safe : a)));
    setAllLeads((prev) =>
      prev.map((l) => (l.companyId === tenantId && l.clientAccountId === safe.id ? { ...l, companyName: safe.name } : l))
    );

    const changes = diffFields(existing, safe, accountFields);
    if (changes.length === 0) return;
    const onlyActivation = changes.length === 1 && changes[0].field === 'isActive';
    record({
      companyId: tenantId,
      action: isRevert ? 'revert' : onlyActivation ? (safe.isActive ? 'activate' : 'deactivate') : 'update',
      entity: 'account',
      entityId: safe.id,
      entityLabel: safe.name,
      summary: isRevert ? `Se restauró ${safe.name}` : changes.map((c) => c.label).join(', '),
      changes,
      revert: isRevert ? undefined : { kind: 'account', snapshot: accountWithoutPersonalData(existing) },
    });
  };

  // ---------- Volver atrás un cambio del historial (solo gerencia) ----------
  const handleRevertAudit = (entryId: string): string | null => {
    const entry = auditEntries.find((e) => e.id === entryId);
    if (!currentUser || !canRevertChanges(currentUser.role) || !tenantId) return 'Solo gerencia puede revertir cambios.';
    if (!entry || entry.companyId !== tenantId) return 'El cambio no pertenece a este CRM.';
    if (!entry.revert || entry.revertedAt) return 'Este cambio ya no se puede revertir.';

    switch (entry.revert.kind) {
      case 'lead': {
        const actual = tenantLeads.find((l) => l.id === entry.revert!.snapshot.id);
        if (!actual) return 'El lead ya no existe.';
        if (isBlocked(actual)) return 'El lead está bloqueado por una solicitud del titular.';
        handleUpdateLead(restoreLeadKeepingPersonalData(actual, entry.revert.snapshot as Lead), { action: 'revert' });
        break;
      }
      case 'account': {
        const actual = tenantAccounts.find((a) => a.id === entry.revert!.snapshot.id);
        if (!actual) return 'La empresa cliente ya no existe.';
        handleUpdateAccount(restoreAccountKeepingPersonalData(actual, entry.revert.snapshot as ClientAccount), true);
        break;
      }
      case 'catalog': {
        handleUpdateCatalogItem(entry.revert.snapshot as CatalogItem, true);
        break;
      }
      case 'stage': {
        const snapshot = entry.revert.snapshot as StageConfig;
        setStageConfigsByTenant((prev) => ({
          ...prev,
          [tenantId]: (prev[tenantId] ?? defaultStageConfigs).map((s) => (s.id === snapshot.id ? { ...snapshot } : s)),
        }));
        record({
          companyId: tenantId,
          action: 'revert',
          entity: 'stage',
          entityId: snapshot.id,
          entityLabel: snapshot.label,
          summary: `Se restauró la configuración de ${snapshot.label}`,
        });
        break;
      }
      case 'account-deleted': {
        const snapshot = entry.revert.snapshot as ClientAccount;
        if (tenantAccounts.some((a) => a.id === snapshot.id)) return 'La empresa cliente ya existe.';
        setAccounts((prev) => [...prev, snapshot]);
        record({
          companyId: tenantId,
          action: 'revert',
          entity: 'account',
          entityId: snapshot.id,
          entityLabel: snapshot.name,
          summary: `Se restauró la empresa cliente ${snapshot.name}`,
        });
        break;
      }
      case 'catalog-deleted': {
        const snapshot = entry.revert.snapshot as CatalogItem;
        if (tenantCatalog.some((i) => i.id === snapshot.id)) return 'El producto o servicio ya existe.';
        setCatalog((prev) => [...prev, snapshot]);
        record({
          companyId: tenantId,
          action: 'revert',
          entity: 'catalog',
          entityId: snapshot.id,
          entityLabel: snapshot.name,
          summary: `Se restauró ${snapshot.name} en el catálogo`,
        });
        break;
      }
    }

    // La entrada original queda marcada como revertida (el historial nunca se borra)
    const now = new Date().toISOString();
    setAuditLog((prev) =>
      prev.map((e) => (e.id === entryId ? { ...e, revertedAt: now, revertedBy: currentUser.fullName } : e))
    );
    if (db && isAuditEntityConnected(entry.entity)) enqueueCall((client) => markAuditReverted(client, entryId));
    return null;
  };

  // ---------- Administración de plataforma ----------
  const handleCreateCompany = async (data: NewCompany): Promise<string | null> => {
    if (!canAdminister) return 'Solo el administrador de la plataforma puede crear CRMs.';
    const draft = normalizeCompanyCountries({ ...data, id: newId('tenant'), createdAt: new Date().toISOString() });
    let company = draft;
    if (db) {
      const creado = await insertCompany(db, draft);
      if (!creado.ok) return creado.error;
      company = creado.data;
    }
    setCompanies((prev) => [...prev, company]);
    record({
      companyId: company.id,
      action: 'create',
      entity: 'company',
      entityId: company.id,
      entityLabel: company.name,
      summary: `CRM creado por el administrador de la plataforma`,
    });
    return null;
  };

  // ---------- Portabilidad: exportación de los datos de un CRM (solo administrador) ----------
  // Con Supabase el administrador no lee las tablas de un CRM: los datos llegan de
  // export_tenant_snapshot() y se arma el mismo Excel que en la demo
  const buildCompanyExport = (companyId: string): TenantExport | null | Promise<TenantExport> => {
    const company = companies.find((c) => c.id === companyId);
    if (!canAdminister || !currentUser || !company) return null;
    const exportedBy = `${currentUser.fullName} (${currentUser.email})`;
    if (db) {
      return loadCompanyExportData(db, companyId).then((datos) => {
        if (!datos.ok) throw new Error(datos.error);
        return buildTenantExport({
          company,
          users,
          accounts: datos.data.accounts,
          leads: datos.data.leads,
          activities: datos.data.activities,
          catalog: datos.data.catalog,
          stageConfigs: mergeStageConfigs(defaultStageConfigs, datos.data.stages),
          territories: datos.data.territories,
          exportedBy,
        });
      });
    }
    return buildTenantExport({
      company,
      users,
      accounts,
      leads: allLeads,
      activities: allActivities,
      catalog,
      stageConfigs: stageConfigsForTenant(stageConfigsByTenant, company.id, defaultStageConfigs),
      territories,
      exportedBy,
    });
  };

  // prepared: el archivo que ya se armó para la vista previa (con Supabase evita pedirlo dos veces)
  const handleExportCompany = async (companyId: string, prepared?: TenantExport) => {
    const result = prepared ?? (await buildCompanyExport(companyId));
    if (!result || !currentUser) throw new Error('Exportación no permitida');
    await downloadTenantExport(result);
    if (db) {
      const error = await recordDataExport(db, {
        companyId,
        userId: currentUser.id,
        rowCounts: Object.fromEntries(result.counts.map((c) => [c.label, c.count])),
      });
      if (error) setAuditWarning(`El archivo se descargó, pero no quedó registrada la exportación: ${error}`);
    }
    record({
      companyId,
      action: 'export',
      entity: 'export',
      entityId: result.fileName,
      entityLabel: result.fileName,
      summary: `Exportación de datos del CRM (${result.counts.map((c) => `${c.count} ${c.label.toLowerCase()}`).join(', ')})`,
    });
    // Última exportación del CRM (con Supabase queda además en data_exports)
    setCompanies((prev) =>
      prev.map((c) => (c.id === companyId ? { ...c, lastExportedAt: result.exportedAt, lastExportedBy: currentUser.fullName } : c))
    );
  };

  const handleUpdateCompany = async (updated: Company): Promise<string | null> => {
    if (!canAdminister) return 'Solo el administrador de la plataforma puede modificar CRMs.';
    const before = companies.find((c) => c.id === updated.id);
    const sanitized = sanitizeCompanyUpdate(before, updated, currentUser);
    if (!sanitized || !before) return 'No se pudo guardar el CRM.';
    let safe = sanitized;
    if (db) {
      const guardado = await saveCompanyInDb(db, sanitized);
      if (!guardado.ok) return guardado.error;
      safe = { ...guardado.data, lastExportedAt: before.lastExportedAt, lastExportedBy: before.lastExportedBy };
    }
    const saved = safe;
    setCompanies((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));

    const changes = diffFields(before, safe, companyFields);
    if (changes.length === 0) return null;
    const onlyActivation = changes.length === 1 && changes[0].field === 'isActive';
    record({
      companyId: safe.id,
      action: onlyActivation ? (safe.isActive ? 'activate' : 'deactivate') : 'update',
      entity: 'company',
      entityId: safe.id,
      entityLabel: safe.name,
      summary: changes.map((c) => c.label).join(', '),
      changes,
    });
    return null;
  };

  // Gerencia → Países y divisas: la gerencia activa o desactiva países de su CRM (plan Internacional). Con
  // Supabase, al activar uno la base copia sus zonas al CRM; se recarga el CRM para traerlas (y, al
  // desactivarlo, para dejar de mostrar sus datos).
  const handleSetCountry = async (code: CountryCode, enabled: boolean): Promise<string | null> => {
    const before = currentCompany;
    const cambio = setCountryByManager(before, code, enabled, currentUser);
    if (!cambio.ok || !before) return cambio.ok ? 'No hay un CRM en la sesión.' : cambio.error;
    if (db) {
      const guardado = await setCompanyCountry(db, before.id, code, enabled);
      if (!guardado.ok) return guardado.error;
    }
    const after = cambio.company;
    setCompanies((prev) => prev.map((c) => (c.id === after.id ? after : c)));
    record({
      companyId: after.id,
      action: 'update',
      entity: 'company',
      entityId: after.id,
      entityLabel: after.name,
      summary: `${enabled ? 'Activó' : 'Desactivó'} ${COUNTRIES[code].name}`,
      changes: diffFields(before, after, companyFields),
    });
    return db ? loadTenant(after.id) : null;
  };

  // Divisas para ver el CRM: solo cambian cómo se muestran los montos, que siguen guardados en su moneda
  const handleSetViewCurrency = async (currency: CurrencyCode, enabled: boolean): Promise<string | null> => {
    const before = currentCompany;
    const cambio = setViewCurrencyByManager(before, currency, enabled, currentUser);
    if (!cambio.ok || !before) return cambio.ok ? 'No hay un CRM en la sesión.' : cambio.error;
    if (db) {
      const guardado = await setCompanyViewCurrency(db, before.id, currency, enabled);
      if (!guardado.ok) return guardado.error;
    }
    const after = cambio.company;
    setCompanies((prev) => prev.map((c) => (c.id === after.id ? after : c)));
    record({
      companyId: after.id,
      action: 'update',
      entity: 'company',
      entityId: after.id,
      entityLabel: after.name,
      summary: enabled ? `Sumó ${currency} a las divisas para ver el CRM` : `Quitó ${currency} de las divisas para ver el CRM`,
      changes: diffFields(before, after, companyFields),
    });
    return null;
  };

  // Con Supabase el usuario no se crea con una contraseña: se le envía una invitación y la elige él
  const handleCreateUser = async (data: NewAppUser): Promise<string | null> => {
    if (!canAdminister) return 'Solo el administrador de la plataforma puede crear usuarios.';
    const invalid = validateNewUser(data, companies, currentUser);
    if (invalid) return invalid;
    const email = data.email.trim().toLowerCase();
    if (users.some((u) => u.email.toLowerCase() === email)) return 'Ya existe un usuario con ese email.';
    let user: AppUser = { ...data, email, id: newId('user'), createdAt: new Date().toISOString() };
    if (db) {
      const invitado = await inviteUser(db, { ...data, email });
      if (!invitado.ok) return invitado.error;
      user = invitado.data;
    }
    const created = user;
    setUsers((prev) => [...prev, created]);
    if (user.companyId) {
      record({
        companyId: user.companyId,
        action: 'create',
        entity: 'user',
        entityId: user.id,
        entityLabel: user.fullName,
        summary: db ? `Invitación enviada con perfil ${ROLE_LABEL[user.role]}` : `Usuario creado con perfil ${ROLE_LABEL[user.role]}`,
      });
    }
    return null;
  };

  const handleUpdateUser = async (updated: AppUser): Promise<string | null> => {
    if (!canAdminister) return 'Solo el administrador de la plataforma puede modificar usuarios.';
    const before = users.find((u) => u.id === updated.id);
    const sanitized = sanitizeUserUpdate(before, updated, currentUser);
    if (!sanitized || !before) return 'No se pudo guardar el usuario.';
    let safe = sanitized;
    if (db) {
      const guardado = await updateProfile(db, sanitized);
      if (!guardado.ok) return guardado.error;
      safe = guardado.data;
    }
    const saved = safe;
    setUsers((prev) => prev.map((u) => (u.id === saved.id ? saved : u)));

    const changes = diffFields(before, safe, userFields);
    if (changes.length === 0 || !safe.companyId) return null;
    const onlyActivation = changes.length === 1 && changes[0].field === 'isActive';
    record({
      companyId: safe.companyId,
      action: onlyActivation ? (safe.isActive ? 'activate' : 'deactivate') : 'update',
      entity: 'user',
      entityId: safe.id,
      entityLabel: safe.fullName,
      summary: changes.map((c) => c.label).join(', '),
      changes,
    });
    return null;
  };

  // ---------- Usuarios del propio CRM (gerencia) ----------
  // El gerente solo ve y administra a los usuarios de su CRM; los administradores de plataforma no aparecen.
  const teamUsers = useMemo(
    () => (tenantId ? users.filter((u) => u.companyId === tenantId && u.role !== 'superadmin') : []),
    [users, tenantId]
  );

  // Con Supabase, el gerente invita por correo (el servidor revisa que sea a su propio CRM)
  const handleCreateTeamUser = async (data: NewAppUser): Promise<string | null> => {
    const payload: NewAppUser = { ...data, companyId: tenantId };
    const invalid = validateNewTeamUser(payload, users, currentUser, tenantId, { invitation: Boolean(db) });
    if (invalid) return invalid;
    let user: AppUser = {
      ...payload,
      email: payload.email.trim().toLowerCase(),
      fullName: payload.fullName.trim(),
      id: newId('user'),
      createdAt: new Date().toISOString(),
    };
    if (db) {
      const invitado = await inviteUser(db, user);
      if (!invitado.ok) return invitado.error;
      user = invitado.data;
    }
    const created = user;
    setUsers((prev) => [...prev, created]);
    record({
      companyId: created.companyId!,
      action: 'create',
      entity: 'user',
      entityId: created.id,
      entityLabel: created.fullName,
      summary: db ? `Invitación enviada con perfil ${ROLE_LABEL[created.role]}` : `Usuario creado con perfil ${ROLE_LABEL[created.role]}`,
    });
    return null;
  };

  const handleUpdateTeamUser = async (updated: AppUser): Promise<string | null> => {
    const before = users.find((u) => u.id === updated.id);
    const sanitized = sanitizeTeamUserUpdate(before, updated, currentUser, tenantId);
    if (!sanitized || !before) return 'No se pudo guardar el usuario: revisa que sea de tu CRM y que no sea tu propio acceso.';
    let safe = sanitized;
    if (db) {
      const guardado = await updateProfile(db, sanitized);
      if (!guardado.ok) return guardado.error;
      safe = guardado.data;
    }
    const saved = safe;
    setUsers((prev) => prev.map((u) => (u.id === saved.id ? saved : u)));

    const changes = diffFields(before, safe, userFields);
    if (changes.length === 0 || !safe.companyId) return null;
    const onlyActivation = changes.length === 1 && changes[0].field === 'isActive';
    record({
      companyId: safe.companyId,
      action: onlyActivation ? (safe.isActive ? 'activate' : 'deactivate') : 'update',
      entity: 'user',
      entityId: safe.id,
      entityLabel: safe.fullName,
      summary: changes.map((c) => c.label).join(', '),
      changes,
    });
    return null;
  };

  const recordComplianceAccess = (what: string) =>
    setComplianceAccessLog((prev) => [
      { at: new Date().toISOString(), who: currentUser?.fullName ?? 'Sin identificar', what },
      ...prev,
    ]);

  // ---------- Derechos del titular sobre sus datos (Ley 21.719) ----------
  // Cualquier perfil registra la solicitud; desde ahí el lead queda bloqueado. Solo el gerente la
  // resuelve, y aprobarla borra los datos personales sin deshacer la operación comercial.
  const handleRequestPrivacy = (leadId: string, reason: PrivacyRequestReason, detail: string): string | null => {
    const lead = allLeads.find((l) => l.id === leadId);
    const safe = requestLeadPrivacy(lead, tenantId, {
      reason,
      detail,
      requestedBy: currentUser?.fullName ?? 'Sin identificar',
      at: new Date().toISOString(),
    });
    if (!safe) return 'No se pudo registrar la solicitud: ya hay una pendiente o el lead no admite cambios.';
    setAllLeads((prev) => prev.map((l) => (l.id === safe.id ? safe : l)));
    if (db && currentUser && tenantId) {
      const data = { companyId: tenantId, leadId, reason, detail, userId: currentUser.id, userName: currentUser.fullName };
      enqueueCall((client) => insertPrivacyRequest(client, data));
    }
    record({
      companyId: safe.companyId,
      action: 'update',
      entity: 'lead',
      entityId: safe.id,
      entityLabel: auditLeadLabel(safe),
      summary: `Solicitud del titular registrada: ${REQUEST_REASON_LABEL[reason]}. El lead queda bloqueado.`,
    });
    return null;
  };

  const handleResolvePrivacy = (leadId: string, approve: boolean, note: string) => {
    const lead = allLeads.find((l) => l.id === leadId);
    const safe = resolveLeadPrivacy(lead, tenantId, currentUser?.role ?? null, {
      approve,
      decidedBy: currentUser?.fullName ?? 'Sin identificar',
      note,
      at: new Date().toISOString(),
    });
    if (!safe) return;
    setAllLeads((prev) => prev.map((l) => (l.id === safe.id ? safe : l)));
    if (approve) setAllActivities((prev) => anonymizeActivitiesOf(prev, safe.id));
    if (db && tenantId) {
      // La base anonimiza por su cuenta (resolve_lead_privacy_request): lo local no se envía como
      // una edición, y al terminar se recarga lo que de verdad quedó
      if (approve && synced.current) synced.current = acceptLeads(synced.current, [safe]);
      const companyId = tenantId;
      enqueueCall(async (client) => {
        const error = await resolvePrivacyRequest(client, leadId, approve, note);
        if (!error) await loadTenant(companyId);
        return error;
      });
    }
    record({
      companyId: safe.companyId,
      action: 'update',
      entity: 'lead',
      entityId: safe.id,
      entityLabel: auditLeadLabel(safe),
      summary: approve
        ? 'Solicitud aprobada: se eliminaron los datos personales del titular y se conservó la operación'
        : 'Solicitud rechazada: el lead vuelve a quedar disponible',
    });
  };

  // Prospecto: en el primer contacto real se registra qué respondió sobre guardar sus datos
  const handleRecordFirstContact = (leadId: string, answer: FirstContactAnswer) => {
    const lead = allLeads.find((l) => l.id === leadId);
    const at = new Date().toISOString();
    const safe = recordFirstContactAnswer(lead, tenantId, answer, at);
    if (!safe) return;
    // Se aplica sobre el estado más reciente: el registro de contacto recién guardado también
    // actualiza este lead (fecha de contacto y etapa) y no debe perderse
    setAllLeads((prev) =>
      prev.map((l) => (l.id === leadId ? recordFirstContactAnswer(l, tenantId, answer, at) ?? l : l))
    );
    record({
      companyId: safe.companyId,
      action: 'update',
      entity: 'lead',
      entityId: safe.id,
      entityLabel: auditLeadLabel(safe),
      summary:
        answer === 'granted'
          ? 'Primer contacto: el titular autorizó que guardemos sus datos'
          : 'Primer contacto: el titular no autoriza; queda marcado como no contactar',
    });
  };

  // Prospectos sin contactar dentro del plazo: se anonimizan solos. En la demo corre al abrir el CRM;
  // con Supabase lo hace la tarea diaria de la base (pg_cron, ver docs/LEY_21719.md).
  useEffect(() => {
    if (db || !tenantId || !currentUser) return;
    const ahora = new Date();
    const vencidos = expiredProspects(allLeads.filter((l) => l.companyId === tenantId), ahora);
    if (vencidos.length === 0) return;
    const at = ahora.toISOString();
    const anonimizados = vencidos
      .map((l) => anonymizeLeadOfTenant(l, tenantId, at))
      .filter((l): l is Lead => l !== null);
    if (anonimizados.length === 0) return;
    const porId = new Map(anonimizados.map((l) => [l.id, l]));
    setAllLeads((prev) => prev.map((l) => porId.get(l.id) ?? l));
    setAllActivities((prev) => anonimizados.reduce((acc, l) => anonymizeActivitiesOf(acc, l.id), prev));
    for (const lead of anonimizados) {
      record({
        companyId: lead.companyId,
        action: 'update',
        entity: 'lead',
        entityId: lead.id,
        entityLabel: auditLeadLabel(lead),
        summary: `Datos personales eliminados automáticamente: prospecto sin contactar en ${PROSPECT_RETENTION_DAYS} días`,
      });
    }
    // record es estable en la práctica; solo importa reaccionar a los leads y al CRM activo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allLeads, tenantId, currentUser?.id]);

  // Informe con todo lo que el CRM guarda de una persona (derechos de acceso y portabilidad)
  const handleDownloadSubjectReport = async (leadId: string) => {
    const lead = allLeads.find((l) => l.id === leadId);
    if (!lead || !currentCompany || !currentUser) return;
    const informe = buildSubjectExport({
      company: currentCompany,
      lead,
      activities: allActivities.filter((a) => a.leadId === lead.id),
      stageConfigs,
      territories,
      requestedBy: currentUser.fullName,
    });
    await downloadTenantExport(informe);
    record({
      companyId: lead.companyId,
      action: 'export',
      entity: 'lead',
      entityId: lead.id,
      entityLabel: auditLeadLabel(lead),
      summary: 'Se descargó el informe de datos del titular',
    });
  };

  // ---------- Contraseña propia ----------
  // Cada persona cambia la suya: ni el gerente ni la plataforma pueden verla ni fijarla por ella.
  const handleChangeOwnPassword = async (current: string, next: string, confirm: string): Promise<string | null> => {
    const stored = users.find((u) => u.id === currentUser?.id);
    if (!stored) return 'No se encontró tu usuario.';
    if (db) {
      // Supabase Auth comprueba la actual y guarda la nueva con hash; la app nunca la conserva
      const error = await changeOwnPassword(db, stored.email, { current, next, confirm });
      if (error) return error;
    } else {
      // La demo pública no tiene contraseñas: no hay nada que cambiar
      if (!stored.password) return 'Esta cuenta de demostración no tiene contraseña.';
      const invalid = validatePasswordChange(stored.password, { current, next, confirm });
      if (invalid) return invalid;
      setUsers((prev) => prev.map((u) => (u.id === stored.id ? { ...u, password: next } : u)));
    }
    // La auditoría deja constancia del hecho, nunca de la contraseña
    if (stored.companyId) {
      record({
        companyId: stored.companyId,
        action: 'update',
        entity: 'user',
        entityId: stored.id,
        entityLabel: stored.fullName,
        summary: 'Cambió su propia contraseña',
      });
    }
    return null;
  };

  // ---------- Login ----------
  if (!authReady) {
    return (
      <div role="status" className="flex min-h-screen items-center justify-center gap-3 bg-slate-950 text-[15px] text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
        Abriendo Revela…
      </div>
    );
  }

  if (!currentUser || !isSessionValid) {
    return (
      <LoginScreen
        onLogin={handleLogin}
        onForgotPassword={db ? (email) => requestPasswordReset(db, email) : undefined}
        demoAccounts={db ? [] : import.meta.env.DEV ? [...cuentasDemoDesarrollo, platformAdminAccount] : []}
        demoHref="/?demo"
        notice={authNotice ?? (sessionUserId ? 'Tu sesión se cerró porque el usuario o su CRM fue desactivado.' : null)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />
    );
  }

  if (db && passwordLink) {
    return (
      <SetPasswordScreen
        mode={passwordLink}
        email={currentUser.email}
        onSubmit={async (next, confirm) => {
          const error = await setPasswordFromLink(db, next, confirm);
          if (!error) setPasswordLink(null);
          return error;
        }}
        onCancel={handleLogout}
      />
    );
  }

  const topZone = kpiTerritoriesMetrics[0]?.leadCount ? kpiTerritoriesMetrics[0] : undefined;

  // Desglose por país para las tarjetas KPI del plan Internacional
  const countryBreakdown = (render: (code: CountryCode, countryLeads: Lead[]) => string) =>
    isMultiCountry ? (
      <span className="flex flex-wrap gap-x-3 gap-y-1">
        {selectedCountries.map((code) => (
          <span key={code} className="inline-flex items-center gap-1.5">
            <CountryFlag code={code} title={COUNTRIES[code].name} />
            {render(code, kpiLeads.filter((l) => l.countryCode === code))}
          </span>
        ))}
      </span>
    ) : null;

  const zoneLabels = Array.from(new Set(selectedCountries.map((c) => COUNTRIES[c].zoneLabel.singular)));

  // Si hay montos negociados en otra moneda, se avisa que el total los incluye convertidos
  const moneyHint = (source: Lead[], text: string) => {
    const otras = Array.from(new Set(source.map(leadCurrency))).filter((c) => c !== displayCurrency);
    return otras.length === 0 ? (
      text
    ) : (
      <span title={`${ratesNote(exchange.rates, [displayCurrency, ...otras])} · ${exchange.info.sources.join(' + ')}`}>
        {text}
        <span className="block text-[13px]">
          Incluye {otras.join(' y ')} convertido a {displayCurrency}
        </span>
      </span>
    );
  };

  const kpiCards = [
    {
      label: 'Total Leads',
      value: String(kpiLeads.length),
      hint: (
        <>
          {countryBreakdown((_, countryLeads) => `${countryLeads.length} leads`)}
          <span className="block">
            {openLeads.length} en curso · {wonLeads.length} {wonLeads.length === 1 ? 'ganado' : 'ganados'} ·{' '}
            {lostLeads.length} {lostLeads.length === 1 ? 'descartado' : 'descartados'}
          </span>
        </>
      ),
      icon: Users,
      accent: 'text-white',
      iconBox: 'bg-indigo-500/15 text-indigo-300',
    },
    {
      label: 'Zona con Mayor Demanda',
      value: topZone ? `${topZone.territoryName} (${topZone.percentage}%)` : 'Sin datos',
      hint: topZone
        ? `${topZone.leadCount} leads vigentes${isMultiCountry ? ` · ${COUNTRIES[topZone.countryCode].name}` : ''}`
        : 'Ajusta los filtros',
      icon: Target,
      accent: 'text-rose-300',
      iconBox: 'bg-rose-500/15 text-rose-300',
    },
    {
      label: 'Leads ubicados',
      value: `${geocodedRatio}%`,
      hint:
        countryBreakdown((code, countryLeads) => `${locatedRatio(countryLeads)}% con ${COUNTRIES[code].zoneLabel.singular.toLowerCase()}`) ??
        `Con ${zoneLabels.join(' / ').toLowerCase()}: aparecen en el mapa y en el ranking`,
      icon: CheckCircle2,
      accent: 'text-emerald-300',
      iconBox: 'bg-emerald-500/15 text-emerald-300',
    },
    {
      label: 'Ganado',
      value: money.fmtLeads(wonLeads),
      hint: moneyHint(wonLeads, `${wonLeads.length} ${wonLeads.length === 1 ? 'negocio cerrado' : 'negocios cerrados'}`),
      icon: Trophy,
      accent: 'text-emerald-300',
      iconBox: 'bg-emerald-500/15 text-emerald-300',
    },
    {
      label: 'Ingresos estimados',
      value: money.fmtLeads(openLeads),
      hint: moneyHint(
        openLeads,
        `${openLeads.length} ${openLeads.length === 1 ? 'lead en curso' : 'leads en curso'}: lo que se espera ganar si cierran`
      ),
      icon: DollarSign,
      accent: 'text-amber-300',
      iconBox: 'bg-amber-500/15 text-amber-300',
    },
  ];

  const canCapture = canCaptureLeads(currentUser.role);

  return (
    <MoneyContext.Provider value={money}>
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-600 selection:text-[#fff]">
      {publicDemo && (
        <DemoBanner
          role={currentUser.role === 'agent' ? 'agent' : 'manager'}
          onViewAs={(rol) => {
            const usuario = users.find((u) => u.id === (rol === 'manager' ? DEMO_MANAGER_ID : DEMO_AGENT_ID));
            if (usuario) openSession(usuario);
          }}
          onExit={handleLogout}
        />
      )}
      <Navbar
        user={currentUser}
        company={currentCompany}
        tabs={allowedTabs}
        activeTab={currentTab}
        onTabChange={setActiveTab}
        onOpenCapture={canCapture ? () => setIsCaptureModalOpen(true) : undefined}
        totalLeadsCount={currentUser.role === 'superadmin' ? undefined : leads.length}
        theme={theme}
        onToggleTheme={toggleTheme}
        onLogout={handleLogout}
        onChangePassword={publicDemo ? undefined : () => setIsPasswordModalOpen(true)}
        onReportBug={publicDemo || currentUser.role === 'superadmin' ? undefined : () => setIsBugModalOpen(true)}
        displayCurrency={currentUser.role === 'superadmin' ? undefined : displayCurrency}
        onDisplayCurrencyChange={changeDisplayCurrency}
        viewCurrencies={viewCurrencies}
        currencyEditor={
          currentUser.role === 'manager' && currentCompany
            ? { homeCountry: currentCompany.homeCountry, countries: enabledCountries, onSetViewCurrency: handleSetViewCurrency }
            : undefined
        }
        rates={exchange.rates}
        ratesInfo={exchange.info}
      />

      <main className={`mx-auto flex-1 w-full px-6 py-6 ${currentTab === 'kanban' ? 'max-w-none' : 'max-w-7xl'}`}>
        {auditWarning && (
          <div role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[15px] text-rose-300">
            <span>{auditWarning}</span>
            <button type="button" onClick={() => setAuditWarning(null)} className="cursor-pointer text-sm font-semibold text-rose-200 hover:underline">
              Cerrar
            </button>
          </div>
        )}

        {/* Con Supabase: un cambio que la base rechazó. La app ya recargó lo que de verdad quedó guardado */}
        {syncError && (
          <div role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-[15px] text-rose-300">
            <span className="flex gap-2">
              <Database className="mt-0.5 h-5 w-5 shrink-0" />
              <span>
                {syncError} Se volvió a cargar lo que quedó guardado en la base.
              </span>
            </span>
            <button type="button" onClick={() => setSyncError(null)} className="cursor-pointer text-sm font-semibold text-rose-200 hover:underline">
              Cerrar
            </button>
          </div>
        )}

        {/* PLAN INTERNACIONAL: países visibles en los módulos de datos.
            La auditoría no se filtra por país: es el historial completo del CRM. */}
        {tenantId && currentTab !== 'audit' && (
          <CountryBar
            enabledCountries={enabledCountries}
            selectedCountries={selectedCountries}
            onChange={(next) => {
              setCountrySelection(next);
              setSelectedTerritoryId(null);
              setKpiFilters((prev) => ({ ...prev, territoryId: 'all' }));
            }}
            counts={leadCountsByCountry}
          />
        )}

        {/* GERENTE: KPI y mapa geoestratégico */}
        {currentTab === 'kpi' && (
          <div className="space-y-6">
            <KpiSearchBar
              filters={kpiFilters}
              onChange={setKpiFilters}
              companies={companyOptions}
              territories={territoriesMetrics}
              countries={selectedCountries}
              resultCount={kpiLeads.length}
              totalCount={leads.length}
            />

            <SectionTabs
              active={kpiView}
              onChange={setKpiView}
              tabs={[
                { id: 'zones', label: 'Zonas y mapa', icon: MapIcon },
                { id: 'catalog', label: 'Productos y servicios', icon: Boxes, count: tenantCatalog.length },
              ]}
            />

            {kpiView === 'catalog' ? (
              <Seccion nombre="los productos y servicios">
                <CatalogInsights
                  leads={kpiLeads}
                  catalog={tenantCatalog}
                  territories={visibleTerritories}
                  countries={selectedCountries}
                  theme={theme}
                />
              </Seccion>
            ) : (
            <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
              {kpiCards.map((card) => {
                const Icon = card.icon;
                return (
                  <div key={card.label} className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5 backdrop-blur-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[15px] font-semibold text-slate-300">{card.label}</span>
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.iconBox}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                    </div>
                    <div className={`mt-3 text-3xl font-black leading-tight ${card.accent}`}>{card.value}</div>
                    <div className="mt-1.5 text-sm text-slate-400">{card.hint}</div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 lg:grid-rows-[680px] gap-6">
              <div className="lg:col-span-8 h-[520px] lg:h-full min-h-0">
                <Seccion nombre="el mapa" alto="h-full">
                  <GeoStrategicMap
                    leads={kpiLeads}
                    territories={kpiTerritoriesMetrics}
                    zoneMetric={zoneMetric}
                    onZoneMetricChange={setZoneMetric}
                    selectedTerritoryId={selectedTerritoryId}
                    onSelectTerritory={setSelectedTerritoryId}
                    theme={theme}
                    countries={selectedCountries}
                    catalog={tenantCatalog}
                  />
                </Seccion>
              </div>

              <div className="lg:col-span-4 h-[680px] lg:h-full min-h-0">
                <RankingSidebar
                  territories={kpiTerritoriesMetrics}
                  leads={kpiLeads}
                  zoneMetric={zoneMetric}
                  countries={selectedCountries}
                  selectedTerritoryId={selectedTerritoryId}
                  onSelectTerritory={setSelectedTerritoryId}
                  totalLeads={activeKpiLeads.length}
                />
              </div>
            </div>

            <LeadsTable leads={kpiLeads} showCountry={isMultiCountry} catalog={tenantCatalog} />
            </>
            )}
          </div>
        )}

        <Seccion>
        {/* GERENTE: empresas cliente, contactos y leads en cola */}
        {currentTab === 'manager' && (
          <ManagerModule
            leads={leads}
            accounts={visibleAccounts}
            territories={visibleTerritories}
            countries={selectedCountries}
            enabledCountries={enabledCountries}
            catalog={tenantCatalog}
            usedItemIds={usedItemIds}
            onCreateCatalogItem={handleCreateCatalogItem}
            onUpdateCatalogItem={handleUpdateCatalogItem}
            onDeleteCatalogItem={handleDeleteCatalogItem}
            teamUsers={teamUsers}
            currentUserId={currentUser.id}
            onCreateTeamUser={handleCreateTeamUser}
            onUpdateTeamUser={handleUpdateTeamUser}
            teamInvitations={Boolean(db)}
            onCreateAccount={handleCreateAccount}
            onUpdateAccount={handleUpdateAccount}
            onDeleteAccount={handleDeleteAccount}
            onUpdateLead={handleUpdateLead}
            canResolvePrivacy={canResolvePrivacyRequest(currentUser.role)}
            onRequestPrivacy={handleRequestPrivacy}
            onResolvePrivacy={handleResolvePrivacy}
            onDownloadSubjectReport={handleDownloadSubjectReport}
            plan={currentCompany?.plan ?? 'national'}
            homeCountry={currentCompany?.homeCountry ?? 'CL'}
            leadCountsByCountry={leadCountsByCountry}
            onSetCountry={handleSetCountry}
            viewCurrencies={viewCurrencies}
            onSetViewCurrency={handleSetViewCurrency}
          />
        )}

        {/* GERENTE: historial de cambios del CRM */}
        {currentTab === 'audit' && (
          <AuditModule
            entries={auditEntries}
            canRevert={canRevertChanges(currentUser.role)}
            onRevert={handleRevertAudit}
          />
        )}

        {/* GERENTE: configuración de estados del pipeline */}
        {currentTab === 'stages' && (
          <StageAdminModule
            stageConfigs={stageConfigs}
            leads={leads}
            countries={selectedCountries}
            onUpdateStageConfig={handleUpdateStageConfig}
          />
        )}

        {/* USUARIO BASE: pipeline kanban */}
        {currentTab === 'kanban' && (
          <KanbanBoard
            leads={leads}
            stageConfigs={stageConfigs}
            territories={territoriesMetrics}
            countries={selectedCountries}
            catalog={tenantCatalog}
            canMoveBackwards={canMoveLeadBackwards(currentUser.role)}
            onUpdateLeadStatus={handleUpdateLeadStatus}
            onOpenContactModal={handleOpenContactForLead}
            onOpenCreateLead={() => setIsCaptureModalOpen(true)}
          />
        )}

        {/* USUARIO BASE: registro de toma de contacto */}
        {currentTab === 'contact' && (
          <ContactModule
            leads={leads}
            activities={activities}
            selectedLeadId={selectedLeadIdForContact}
            onAddActivity={handleAddActivity}
            onAddContact={handleAddLeadContact}
            onSelectLead={setSelectedLeadIdForContact}
            onRequestPrivacy={handleRequestPrivacy}
            onRecordFirstContact={handleRecordFirstContact}
            agentName={currentUser.fullName}
            showCountry={isMultiCountry}
          />
        )}

        {/* ADMINISTRADOR: CRMs por empresa y usuarios */}
        {currentTab === 'admin' && (
          <AdminModule
            companies={companies}
            users={users}
            leads={allLeads}
            currentUserId={currentUser.id}
            onCreateCompany={handleCreateCompany}
            onUpdateCompany={handleUpdateCompany}
            getExportPreview={buildCompanyExport}
            onExportCompany={handleExportCompany}
            currentUserName={currentUser.fullName}
            complianceAccessLog={complianceAccessLog}
            onComplianceAccess={recordComplianceAccess}
            onCreateUser={handleCreateUser}
            onUpdateUser={handleUpdateUser}
            invitations={Boolean(db)}
            usageApi={usageApi}
          />
        )}
        </Seccion>
      </main>

      {canCapture && (
        <Seccion silenciosa>
        <LeadCaptureModal
          key={`${tenantId}-${selectedCountries[0]}`}
          isOpen={isCaptureModalOpen}
          onClose={() => setIsCaptureModalOpen(false)}
          onAddLead={handleAddLead}
          accounts={tenantAccounts}
          catalog={tenantCatalog}
          countries={enabledCountries}
          defaultCountry={selectedCountries[0]}
          zones={tenantTerritories}
        />
        </Seccion>
      )}

      {/* En la demo pública no hay asistente: es lo único que enviaría texto fuera del navegador */}
      {canCapture && !publicDemo && (
        <Seccion silenciosa>
        <AiChatWidget
          key={currentUser.id}
          userId={currentUser.id}
          userName={currentUser.fullName}
          tenantName={currentCompany?.name ?? ''}
          countries={enabledCountries.map((code) => ({
            code,
            name: COUNTRIES[code].name,
            zoneLabel: COUNTRIES[code].zoneLabel.singular,
            currency: COUNTRIES[code].currency,
            regionLabel: COUNTRIES[code].regionLabel.singular,
            regions: regionsOf(tenantTerritories.filter((t) => t.countryCode === code)).map((r) => r.name),
          }))}
          onSaveLead={handleAiSaveLead}
          onFindLeads={handleAiFindLeads}
          onUpdateLeadStage={handleAiUpdateLeadStage}
          getAccessToken={db ? async () => (await db.auth.getSession()).data.session?.access_token ?? null : undefined}
          onKeyChange={(action) => {
            if (!currentCompany) return;
            // Se registra que la clave cambió, nunca la clave
            record({
              companyId: currentCompany.id,
              action: 'update',
              entity: 'company',
              entityId: currentCompany.id,
              entityLabel: currentCompany.name,
              summary: `${action === 'clear' ? 'Quitó' : action === 'set' ? 'Cargó' : 'Cambió'} la clave de OpenAI del asistente de IA`,
              changes: [
                {
                  field: 'aiOpenAiKey',
                  label: 'Clave de OpenAI del asistente',
                  before: action === 'set' ? 'Sin clave' : 'Cargada',
                  after: action === 'clear' ? 'Sin clave' : 'Cargada',
                },
              ],
            });
          }}
          onBudgetChange={({ before, after }) => {
            if (!currentCompany) return;
            record({
              companyId: currentCompany.id,
              action: 'update',
              entity: 'company',
              entityId: currentCompany.id,
              entityLabel: currentCompany.name,
              summary: `Ajustó el presupuesto mensual del asistente de IA a ${formatUsd(after)}`,
              changes: [{ field: 'aiMonthlyBudgetUsd', label: 'Presupuesto mensual de IA', before: formatUsd(before), after: formatUsd(after) }],
            });
          }}
        />
        </Seccion>
      )}

      {isBugModalOpen && (
        <BugReportModal
          pageLabel={{ kpi: 'KPI y mapa', kanban: 'Pipeline', contact: 'Registro de contacto', manager: 'Gerencia', audit: 'Auditoría', stages: 'Estados', admin: 'Administración' }[currentTab] ?? currentTab}
          onSubmit={handleSubmitBug}
          onClose={() => setIsBugModalOpen(false)}
        />
      )}

      {isSurveyOpen && !isBugModalOpen && <SurveyPrompt onSubmit={handleSubmitSurvey} onDismiss={dismissSurvey} />}

      {isPasswordModalOpen && (
        <ChangePasswordModal
          userName={currentUser.fullName}
          onClose={() => setIsPasswordModalOpen(false)}
          onSubmit={handleChangeOwnPassword}
        />
      )}
    </div>
    </MoneyContext.Provider>
  );
}

export default App;
