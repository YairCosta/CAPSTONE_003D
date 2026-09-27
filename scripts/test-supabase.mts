// Pruebas de la conexión con Supabase sin tocar la base real: traducción de filas, reglas de quién
// invita a quién, mensajes de error y el endpoint de invitaciones con un Supabase simulado.
// Ejecutar: npm run test:supabase
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  companyCountryRows,
  companyFromRow,
  companyToRow,
  profileUpdateRow,
  userFromRow,
  auditEntryFromRow,
  auditEntryToRow,
  isAuditEntityConnected,
  revertKindFor,
  type CompanyRow,
} from '../src/lib/db/mappers.ts';
import {
  accountToRow,
  assembleTenantData,
  catalogToRow,
  leadFromRow,
  leadToRow,
  mergeStageConfigs,
  privacyRequestFor,
  stageFromRow,
  stageToRow,
  tenantRowsFromSnapshot,
  territoryFromRow,
} from '../src/lib/db/crmMappers.ts';
import { acceptLeads, diffTenantData, type TenantSnapshot } from '../src/lib/db/sync.ts';
import { locateInCommune } from '../src/lib/geocoding.ts';
import type { ClientAccount, Lead } from '../src/types/crm.ts';
import { buildAuditEntry } from '../src/lib/audit.ts';
import { authorizeInvite, type InviteCaller } from '../src/lib/userAdmin.ts';
import { authErrorMessage, dbErrorMessage } from '../src/lib/db/errors.ts';
import { validateNewPassword, validatePasswordChange } from '../src/lib/passwords.ts';
import { createAdminMiddleware } from '../server/adminUsers.ts';

const tests: { name: string; fn: () => void | Promise<void> }[] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push({ name, fn });

const CRM_A = '11111111-1111-1111-1111-111111111111';
const CRM_B = '22222222-2222-2222-2222-222222222222';

const filaCrm = (over: Partial<CompanyRow> = {}): CompanyRow => ({
  id: CRM_A,
  name: 'Empresa Piloto',
  slug: 'piloto',
  tax_id: null,
  is_active: true,
  plan: 'international',
  home_country: 'PE',
  default_lat: null,
  default_lng: null,
  default_zoom: null,
  created_at: '2026-09-25T12:00:00Z',
  ...over,
});

// ------------------------------------------------------------------ traducción de filas
test('CRM: el país base va primero y los países de otro CRM no se cuelan', () => {
  const crm = companyFromRow(filaCrm(), [
    { company_id: CRM_A, country_code: 'CL' },
    { company_id: CRM_A, country_code: 'PE' },
    { company_id: CRM_B, country_code: 'CL' },
  ]);
  assert.deepEqual(crm.enabledCountries, ['PE', 'CL']);
  assert.equal(crm.homeCountry, 'PE');
});

test('CRM: en plan Nacional solo cuenta el país base aunque queden filas guardadas', () => {
  const crm = companyFromRow(filaCrm({ plan: 'national' }), [
    { company_id: CRM_A, country_code: 'CL' },
    { company_id: CRM_A, country_code: 'PE' },
  ]);
  assert.deepEqual(crm.enabledCountries, ['PE']);
});

test('CRM: sin coordenadas propias, el mapa parte en las del país base', () => {
  const crm = companyFromRow(filaCrm({ home_country: 'CL', plan: 'national' }), []);
  assert.equal(crm.homeCountry, 'CL');
  assert.equal(typeof crm.defaultLat, 'number');
  assert.equal(crm.taxId, undefined);
});

test('CRM: al guardar, los países incluyen siempre el base y el plan Nacional no agrega otros', () => {
  const internacional = companyCountryRows(CRM_A, { homeCountry: 'CL', enabledCountries: ['PE'], plan: 'international' });
  assert.deepEqual(internacional.map((r) => r.country_code).sort(), ['CL', 'PE']);
  const nacional = companyCountryRows(CRM_A, { homeCountry: 'CL', enabledCountries: ['CL', 'PE'], plan: 'national' });
  assert.deepEqual(nacional.map((r) => r.country_code), ['CL']);
  const fila = companyToRow({ ...companyFromRow(filaCrm(), []), taxId: '  ', name: ' Piloto ' });
  assert.equal(fila.tax_id, null);
  assert.equal(fila.name, 'Piloto');
});

test('Usuarios: la contraseña nunca viene de la base y un rol desconocido no da más permisos', () => {
  const usuario = userFromRow({
    id: 'u1',
    company_id: CRM_A,
    full_name: 'Sebastián',
    email: 'sebastian@piloto.demo',
    role: 'root',
    is_active: true,
    created_at: '2026-09-25T12:00:00Z',
  });
  assert.equal(usuario.password, '');
  assert.equal(usuario.role, 'agent');
  // Un administrador de plataforma no pertenece a ningún CRM
  assert.equal(profileUpdateRow({ ...usuario, role: 'superadmin' }).company_id, null);
  assert.equal(profileUpdateRow(usuario).company_id, CRM_A);
});

// ------------------------------------------------------------------ auditoría
test('Auditoría: la fila no trae fecha ni marca de revertido; la base las fija al guardar', () => {
  const actor = userFromRow({ id: 'u1', company_id: CRM_A, full_name: 'Sebastián', email: 's@piloto.demo', role: 'manager', is_active: true, created_at: '2026-09-25T12:00:00Z' });
  const entrada = buildAuditEntry(
    { companyId: CRM_A, action: 'deactivate', entity: 'user', entityId: 'u2', entityLabel: 'Vendedor', summary: 'Activo', changes: [{ field: 'isActive', label: 'Activo', before: 'Sí', after: 'No' }] },
    actor,
    '33333333-3333-3333-3333-333333333333'
  );
  const fila = auditEntryToRow(entrada);
  assert.equal(fila.id, '33333333-3333-3333-3333-333333333333');
  assert.equal(fila.actor_role, 'manager');
  assert.deepEqual(fila.changes, entrada.changes);
  assert.ok(!('created_at' in fila) && !('reverted_at' in fila));
  // Sin estado anterior: el cambio no se puede deshacer
  assert.equal(fila.revert_snapshot, null);
});

test('Auditoría: lo que viene de la base se lee igual que lo de memoria', () => {
  const entrada = auditEntryFromRow({
    id: 'a1',
    company_id: CRM_A,
    actor_id: null,
    actor_name: 'Revela (tarea automática)',
    actor_role: 'manager',
    action: 'update',
    entity: 'lead',
    entity_id: 'l1',
    entity_label: 'Minera Sur',
    summary: 'Datos personales eliminados automáticamente',
    changes: null,
    revert_snapshot: null,
    reverted_at: null,
    reverted_by: null,
    created_at: '2026-09-26T03:15:00Z',
  });
  assert.equal(entrada.actorId, 'sistema');
  assert.deepEqual(entrada.changes, []);
  assert.equal(entrada.revertedAt, undefined);
  assert.equal(entrada.revert, undefined);
});

test('Auditoría: "Volver atrás" funciona con lo guardado en la base', () => {
  const fila = {
    id: 'a2', company_id: CRM_A, actor_id: 'u1', actor_name: 'Sebastián', actor_role: 'manager', entity_id: 'x', entity_label: 'X',
    summary: 's', changes: [], reverted_at: '2026-09-26T10:00:00Z', reverted_by: 'u1', created_at: '2026-09-26T09:00:00Z',
  };
  const eliminada = auditEntryFromRow({ ...fila, action: 'delete', entity: 'account', revert_snapshot: { id: 'acc-1', name: 'Minera' } }, (id) => (id === 'u1' ? 'Sebastián' : undefined));
  assert.equal(eliminada.revert?.kind, 'account-deleted');
  assert.equal(eliminada.revertedBy, 'Sebastián');
  assert.equal(auditEntryFromRow({ ...fila, action: 'update', entity: 'catalog', revert_snapshot: { id: 'i1' } }).revert?.kind, 'catalog');
  assert.equal(auditEntryFromRow({ ...fila, action: 'export', entity: 'export', revert_snapshot: { id: 'e' } }).revert, undefined);
  assert.equal(revertKindFor('lead', 'stage'), 'lead');
});

test('Auditoría: todo el historial va a la base (CRMs, usuarios, leads, empresas, catálogo, contactos, etapas y exportaciones)', () => {
  for (const conectada of ['company', 'user', 'lead', 'account', 'catalog', 'activity', 'stage', 'export'] as const) {
    assert.ok(isAuditEntityConnected(conectada), conectada);
  }
});

// ------------------------------------------------------------------ etapa 3: leads y sincronización
const cuenta = (over: Partial<ClientAccount> = {}): ClientAccount => ({
  id: 'acc-1', companyId: CRM_A, countryCode: 'CL', name: 'Minera Sur', isActive: true, createdAt: '2026-09-26T12:00:00Z', ...over,
});
const lead = (over: Partial<Lead> = {}): Lead => ({
  id: 'lead-1', companyId: CRM_A, countryCode: 'CL', fullName: 'Ana Pérez', commercialStatus: 'new', estimatedDealValue: 1000,
  rawAddress: 'Av. Siempre Viva 123', geocodingStatus: 'success', createdAt: '2026-09-26T12:00:00Z', clientAccountId: 'acc-1',
  companyName: 'Minera Sur', contacts: [], items: [], valueSource: 'manual', dataOrigin: 'form', consentStatus: 'inquiry', ...over,
});
const vacio: TenantSnapshot = { leads: [], accounts: [], activities: [], catalog: [] };

test('Lead: textos en blanco van como NULL y la moneda por defecto es la del país', () => {
  const fila = leadToRow(lead({ jobTitle: '  ', notes: '', email: ' ' }));
  assert.equal(fila.job_title, null);
  assert.equal(fila.notes, null);
  assert.equal(fila.email, null);
  assert.equal(fila.currency_code, 'CLP');
  assert.equal(fila.value_source, 'manual');
  // La anonimización solo la escribe la base
  assert.ok(!('anonymized_at' in fila) && !('anonymized_reason' in fila) && !('created_at' in fila));
});

test('Lead: al leerlo, la moneda del país queda implícita y los montos son números', () => {
  const base = {
    ...leadToRow(lead()), created_by: null, estimated_deal_value: '150000.00', anonymized_at: null, anonymized_reason: null, created_at: '2026-09-26T12:00:00+00:00',
  };
  const leido = leadFromRow(base, { accountName: 'Minera Sur', contacts: [], items: [] });
  assert.equal(leido.currency, undefined);
  assert.equal(leido.estimatedDealValue, 150000);
  assert.equal(leido.companyName, 'Minera Sur');
  assert.equal(leadFromRow({ ...base, currency_code: 'USD' }, { contacts: [], items: [] }).currency, 'USD');
  // Ida y vuelta sin diferencias: cargar desde la base no genera escrituras
  assert.deepEqual(diffTenantData({ ...vacio, leads: [leido] }, { ...vacio, leads: [leido] }), []);
});

test('Sincronización: una empresa nueva va antes que su lead, y el lead antes que su bitácora', () => {
  const nuevo = lead({ contacts: [{ id: 'c1', fullName: 'Juan Firma' }], items: [{ itemId: 'i1', quantity: 2, unitPrice: 500 }] });
  const actividad = { id: 'act-1', leadId: 'lead-1', companyId: CRM_A, channel: 'call' as const, outcome: 'interested' as const, summary: 'Llamada', agentName: 'Vendedor', createdAt: '2026-09-26T12:05:00Z' };
  const ops = diffTenantData(vacio, { ...vacio, accounts: [cuenta()], leads: [nuevo], activities: [actividad] });
  assert.deepEqual(ops.map((o) => o.kind), ['account-insert', 'lead-insert', 'lead-contacts', 'lead-items', 'activity-insert']);
});

test('Sincronización: mover de etapa envía solo esa columna (no pisa lo que otro editó)', () => {
  const antes = { ...vacio, accounts: [cuenta()], leads: [lead()] };
  const ops = diffTenantData(antes, { ...antes, leads: [lead({ commercialStatus: 'contacted' })] });
  assert.equal(ops.length, 1);
  assert.deepEqual(ops[0], { kind: 'lead-update', id: 'lead-1', patch: { commercial_status: 'contacted' } });
});

test('Sincronización: cambiar productos agrega los nuevos y quita los que salieron', () => {
  const antes = { ...vacio, leads: [lead({ items: [{ itemId: 'i1', quantity: 1, unitPrice: 500 }] })] };
  const ops = diffTenantData(antes, { ...vacio, leads: [lead({ items: [{ itemId: 'i2', quantity: 3, unitPrice: 100 }] })] });
  const items = ops.find((o) => o.kind === 'lead-items');
  assert.ok(items && items.kind === 'lead-items');
  assert.deepEqual(items.upserts.map((u) => u.catalog_item_id), ['i2']);
  assert.deepEqual(items.deleteItemIds, ['i1']);
});

test('Sincronización: las bajas van al final y la bitácora nunca se edita', () => {
  const producto = { id: 'i9', companyId: CRM_A, type: 'product' as const, name: 'Notebook', prices: { CL: 500000 }, isActive: true, createdAt: '2026-09-26T12:00:00Z' };
  const actividad = { id: 'act-1', leadId: 'lead-1', companyId: CRM_A, channel: 'call' as const, outcome: 'interested' as const, summary: 'Llamada', agentName: 'Vendedor', createdAt: '2026-09-26T12:05:00Z' };
  const antes = { ...vacio, accounts: [cuenta(), cuenta({ id: 'acc-2', name: 'Sin leads' })], leads: [lead()], catalog: [producto], activities: [actividad] };
  const despues = { ...antes, accounts: [cuenta()], catalog: [], leads: [lead({ notes: 'Nota nueva' })], activities: [{ ...actividad, summary: 'editado' }] };
  const tipos = diffTenantData(antes, despues).map((o) => o.kind);
  assert.deepEqual(tipos, ['lead-update', 'catalog-delete', 'account-delete']);
});

test('Sincronización: precios por país del catálogo, incluido quitar uno', () => {
  const producto = { id: 'i1', companyId: CRM_A, type: 'service' as const, name: 'Soporte', billing: 'monthly' as const, prices: { CL: 50000, PE: 180 }, isActive: true, createdAt: '2026-09-26T12:00:00Z' };
  const ops = diffTenantData({ ...vacio, catalog: [producto] }, { ...vacio, catalog: [{ ...producto, prices: { CL: 55000 } }] });
  assert.equal(ops.length, 1);
  const op = ops[0];
  assert.ok(op.kind === 'catalog-upsert');
  assert.deepEqual(op.prices, [{ catalog_item_id: 'i1', country_code: 'CL', price: 55000 }]);
  assert.deepEqual(op.removedCountries, ['PE']);
  // Un producto nunca lleva periodicidad (la base lo rechazaría)
  assert.equal(catalogToRow({ ...producto, type: 'product' }).billing_type, null);
});

test('Sincronización: lo que anonimiza la base no vuelve a la base como una edición', () => {
  const original = lead();
  const anonimizado = lead({ fullName: 'Titular eliminado', rawAddress: 'Dirección eliminada', noContact: true, consentStatus: 'withdrawn', anonymizedAt: '2026-09-26T13:00:00Z', anonymizedReason: 'request' });
  const antes = { ...vacio, leads: [original] };
  assert.ok(diffTenantData(antes, { ...vacio, leads: [anonimizado] }).length > 0);
  assert.deepEqual(diffTenantData(acceptLeads(antes, [anonimizado]), { ...vacio, leads: [anonimizado] }), []);
});

test('Privacidad: el lead muestra la solicitud pendiente aunque haya otras resueltas', () => {
  const filas = [
    { id: 'r1', lead_id: 'lead-1', reason: 'wrong_data', detail: null, requested_by_name: 'Ana', requested_at: '2026-09-20T10:00:00Z', status: 'rejected', decided_by_name: 'Sebastián', decided_at: '2026-09-21T10:00:00Z', decision_note: null },
    { id: 'r2', lead_id: 'lead-1', reason: 'erasure', detail: 'Por correo', requested_by_name: 'Ana', requested_at: '2026-09-25T10:00:00Z', status: 'pending', decided_by_name: null, decided_at: null, decision_note: null },
    { id: 'r3', lead_id: 'otro', reason: 'other', detail: null, requested_by_name: 'Ana', requested_at: '2026-09-26T10:00:00Z', status: 'pending', decided_by_name: null, decided_at: null, decision_note: null },
  ];
  const solicitud = privacyRequestFor('lead-1', filas);
  assert.equal(solicitud?.status, 'pending');
  assert.equal(solicitud?.reason, 'erasure');
  assert.equal(privacyRequestFor('sin-solicitudes', filas), undefined);
});

test('Zonas: el polígono de la base ubica al lead dentro de su zona', () => {
  const zona = territoryFromRow({
    id: 'z1', company_id: CRM_A, country_code: 'CL', name: 'Providencia', code: 'PROV-01', color_hex: '#3B82F6',
    polygon: { type: 'MultiPolygon', coordinates: [[[[-70.63, -33.42], [-70.585, -33.415], [-70.59, -33.445], [-70.635, -33.44], [-70.63, -33.42]]]] },
  });
  const ubicado = locateInCommune(zona, 'Av. Providencia 1234');
  assert.equal(ubicado.assignedTerritoryId, 'z1');
  assert.equal(ubicado.geocodingStatus, 'success');
  assert.ok(ubicado.latitude! < -33.4 && ubicado.latitude! > -33.46);
  assert.equal(locateInCommune(undefined, 'x').geocodingStatus, 'manual_review');
});

test('Errores: los mensajes de las reglas de Revela se muestran; los técnicos no', () => {
  assert.equal(
    dbErrorMessage({ code: '42501', message: 'Lead bloqueado: hay una solicitud del titular pendiente de resolver.' }, 'x'),
    'Lead bloqueado: hay una solicitud del titular pendiente de resolver.'
  );
  assert.match(dbErrorMessage({ code: '42501', message: 'new row violates row-level security policy for table "leads"' }, 'x'), /permiso/);
  assert.equal(dbErrorMessage({ code: '23514', message: 'La zona asignada pertenece a otro país' }, 'x'), 'La zona asignada pertenece a otro país');
  assert.match(dbErrorMessage({ code: '23514', message: 'new row for relation "leads" violates check constraint "leads_email_check"' }, 'x'), /reglas/);
});

// ------------------------------------------------------------------ etapas 4 y 5: pipeline y exportación
const etapaPorDefecto = { id: 'qualified' as const, label: 'Calificado', shortCode: 'CALIF', color: '#6366F1', description: 'Necesidad confirmada', winProbability: 40, slaDays: 3, orderIndex: 2 };

test('Etapas: lo guardado reemplaza a lo por defecto y la base recibe valores válidos', () => {
  const guardada = stageFromRow({ stage: 'qualified', label: 'Calificado Piloto', short_code: 'CAL', color_hex: '#22C55E', description: null, win_probability: 55, sla_days: 5, order_index: 2 });
  const nueva = { ...etapaPorDefecto, id: 'won' as const, label: 'Ganado' };
  const mezcla = mergeStageConfigs([etapaPorDefecto, nueva], [guardada]);
  assert.deepEqual(mezcla.map((e) => e.label), ['Calificado Piloto', 'Ganado']);
  const fila = stageToRow(CRM_A, { ...etapaPorDefecto, winProbability: 140.6, slaDays: -2, description: '  ' });
  assert.deepEqual([fila.win_probability, fila.sla_days, fila.description, fila.stage], [100, 0, null, 'qualified']);
});

test('Sincronización: editar una etapa la guarda primero; sin cambios no se escribe nada', () => {
  const antes = { ...vacio, companyId: CRM_A, stages: [etapaPorDefecto] };
  assert.deepEqual(diffTenantData(antes, antes), []);
  const ops = diffTenantData(antes, { ...antes, accounts: [cuenta()], stages: [{ ...etapaPorDefecto, winProbability: 60 }] });
  assert.deepEqual(ops.map((o) => o.kind), ['stage-upsert', 'account-insert']);
  const op = ops[0];
  assert.ok(op.kind === 'stage-upsert' && op.row.company_id === CRM_A && op.row.win_probability === 60);
});

test('Exportación: el JSON de la base arma los mismos datos que la carga normal', () => {
  const filaLead = { ...leadToRow(lead()), estimated_deal_value: '1000.00', anonymized_at: null, anonymized_reason: null, created_at: '2026-09-26T12:00:00+00:00', created_by: 'u1', updated_at: 'x', location: 'no-debe-usarse' };
  const datos = assembleTenantData(
    tenantRowsFromSnapshot({
      format_version: 'v2',
      client_accounts: [{ ...accountToRow(cuenta()), created_at: '2026-09-26T12:00:00+00:00' }],
      leads: [filaLead],
      lead_contacts: [
        { id: 'p1', lead_id: 'lead-1', full_name: 'Ana Pérez', job_title: null, email: null, phone: null, is_primary: true },
        { id: 'c1', lead_id: 'lead-1', full_name: 'Juan Firma', job_title: 'Gerente', email: null, phone: null, is_primary: false },
      ],
      catalog_items: [{ id: 'i1', company_id: CRM_A, item_type: 'service', name: 'Soporte', sku: null, category: null, description: null, billing_type: 'monthly', is_active: true, created_at: 'x', prices: { CL: 50000, PE: '180.00' } }],
      pipeline_stage_configs: [{ stage: 'won', label: 'Cerrado', short_code: 'WIN', color_hex: '#22C55E', description: null, win_probability: 100, sla_days: 0, order_index: 5 }],
      territories: [{ id: 'z1', company_id: CRM_A, country_code: 'CL', name: 'Providencia', code: 'PROV-01', color_hex: '#3B82F6', geojson: { type: 'MultiPolygon', coordinates: [] } }],
    })
  );
  assert.equal(datos.leads[0].companyName, 'Minera Sur');
  // El contacto principal ya está en el lead: solo se agregan los adicionales
  assert.deepEqual(datos.leads[0].contacts?.map((c) => c.fullName), ['Juan Firma']);
  assert.deepEqual(datos.catalog[0].prices, { CL: 50000, PE: 180 });
  assert.equal(datos.stages[0].label, 'Cerrado');
  assert.equal(datos.territories[0].geojsonPolygon.type, 'MultiPolygon');
});

// ------------------------------------------------------------------ quién invita a quién
const superadmin: InviteCaller = { role: 'superadmin', companyId: null, isActive: true };
const gerenteA: InviteCaller = { role: 'manager', companyId: CRM_A, isActive: true };
const cuerpo = (over: Record<string, unknown> = {}) => ({
  email: ' Nuevo@piloto.demo ',
  fullName: 'Persona Nueva',
  role: 'agent',
  companyId: CRM_A,
  ...over,
});

test('Invitar: el administrador invita a cualquier CRM y normaliza el email', () => {
  const r = authorizeInvite(superadmin, cuerpo({ companyId: CRM_B, role: 'manager' }));
  assert.ok(r.ok);
  assert.equal(r.invite.email, 'nuevo@piloto.demo');
  assert.equal(r.invite.companyId, CRM_B);
  const admin = authorizeInvite(superadmin, cuerpo({ role: 'superadmin' }));
  assert.ok(admin.ok);
  assert.equal(admin.invite.companyId, null);
});

test('Invitar: el gerente solo invita a su propio CRM y nunca crea administradores', () => {
  assert.ok(authorizeInvite(gerenteA, cuerpo()).ok);
  const otro = authorizeInvite(gerenteA, cuerpo({ companyId: CRM_B }));
  assert.ok(!otro.ok && otro.status === 403);
  const admin = authorizeInvite(gerenteA, cuerpo({ role: 'superadmin', companyId: null }));
  assert.ok(!admin.ok && admin.status === 403);
});

test('Invitar: usuario base, desactivado o sin perfil no invita', () => {
  for (const caller of [
    { role: 'agent', companyId: CRM_A, isActive: true } as InviteCaller,
    { ...gerenteA, isActive: false },
    null,
  ]) {
    const r = authorizeInvite(caller, cuerpo());
    assert.ok(!r.ok && r.status === 403);
  }
});

test('Invitar: datos incompletos se rechazan con 400', () => {
  for (const malo of [cuerpo({ email: 'sin-arroba' }), cuerpo({ fullName: '  ' }), cuerpo({ role: 'root' }), cuerpo({ companyId: '' })]) {
    const r = authorizeInvite(superadmin, malo);
    assert.ok(!r.ok && r.status === 400, JSON.stringify(malo));
  }
  assert.ok(!authorizeInvite(superadmin, 'texto').ok);
});

// ------------------------------------------------------------------ mensajes
test('Errores: nunca se muestra el texto crudo de la base, salvo los mensajes propios de Revela', () => {
  assert.match(dbErrorMessage({ code: '23505', message: 'duplicate key value violates unique constraint "companies_slug_key"' }, 'x'), /Ya existe/);
  assert.match(dbErrorMessage({ code: '42501', message: 'new row violates row-level security policy for table "profiles"' }, 'x'), /permiso/);
  assert.equal(dbErrorMessage({ code: '99999', message: 'relation "public.secret" does not exist' }, 'Falló.'), 'Falló.');
  assert.equal(dbErrorMessage({ code: 'P0001', message: 'El lead está bloqueado por una solicitud del titular.' }, 'x'), 'El lead está bloqueado por una solicitud del titular.');
});

test('Login: el mismo mensaje para email inexistente y contraseña equivocada', () => {
  assert.equal(authErrorMessage({ code: 'invalid_credentials', status: 400 }), 'Email o contraseña incorrectos.');
  assert.match(authErrorMessage({ code: 'email_not_confirmed' }), /invitación/);
  assert.match(authErrorMessage({ status: 429 }), /Espera/);
});

test('Contraseñas: la nueva se valida igual en la demo, la invitación y la recuperación', () => {
  assert.equal(validateNewPassword('clave2026', 'clave2026'), null);
  assert.match(validateNewPassword('corta1', 'corta1')!, /al menos/);
  assert.match(validateNewPassword('solamenteletras', 'solamenteletras')!, /letras y números/);
  assert.match(validateNewPassword('clave2026', 'clave2027')!, /no coinciden/);
  assert.match(validateNewPassword('clave2026', 'clave2026', 'clave2026')!, /distinta/);
  assert.match(validatePasswordChange('actual123', { current: 'otra', next: 'nueva2026', confirm: 'nueva2026' })!, /actual no es correcta/);
});

// ------------------------------------------------------------------ endpoint de invitaciones (Supabase simulado)
interface FakeState {
  tokens: Record<string, string>; // token → id de usuario de Auth
  profiles: Record<string, unknown>[];
  companies: Record<string, unknown>[];
  invited: { email: string; options: { data?: { full_name?: string }; redirectTo?: string } }[];
  deleted: string[];
  failProfileInsert?: boolean;
  failInvite?: { status: number; message: string; code?: string };
}

const fakeSupabase = (state: FakeState) => {
  const tabla = (nombre: 'profiles' | 'companies') => {
    const filtros: [string, unknown][] = [];
    let insertada: Record<string, unknown> | null = null;
    const coincide = () => state[nombre].filter((r) => filtros.every(([c, v]) => r[c] === v));
    const q = {
      select: () => q,
      eq: (col: string, val: unknown) => {
        filtros.push([col, val]);
        return q;
      },
      insert: (fila: Record<string, unknown>) => {
        insertada = fila;
        return q;
      },
      maybeSingle: async () => ({ data: coincide()[0] ?? null, error: null }),
      single: async () => {
        if (insertada) {
          if (state.failProfileInsert) return { data: null, error: { code: '23503', message: 'fk' } };
          const fila = { ...insertada, created_at: '2026-09-25T12:00:00Z' };
          state[nombre].push(fila);
          return { data: fila, error: null };
        }
        const filas = coincide();
        return filas.length === 1 ? { data: filas[0], error: null } : { data: null, error: { code: 'PGRST116' } };
      },
    };
    return q;
  };
  return {
    auth: {
      getUser: async (token: string) =>
        state.tokens[token]
          ? { data: { user: { id: state.tokens[token] } }, error: null }
          : { data: { user: null }, error: { status: 401, message: 'invalid JWT' } },
      admin: {
        inviteUserByEmail: async (email: string, options: FakeState['invited'][number]['options']) => {
          if (state.failInvite) return { data: { user: null }, error: state.failInvite };
          state.invited.push({ email, options });
          return { data: { user: { id: `auth-${state.invited.length}` } }, error: null };
        },
        deleteUser: async (id: string) => {
          state.deleted.push(id);
          return { data: {}, error: null };
        },
      },
    },
    from: tabla,
  } as unknown as SupabaseClient;
};

const estadoBase = (over: Partial<FakeState> = {}): FakeState => ({
  tokens: { 'tok-admin': 'u-admin', 'tok-gerente': 'u-gerente', 'tok-base': 'u-base' },
  profiles: [
    { id: 'u-admin', role: 'superadmin', company_id: null, is_active: true, email: 'admin@revela.cl' },
    { id: 'u-gerente', role: 'manager', company_id: CRM_A, is_active: true, email: 'sebastian@piloto.demo' },
    { id: 'u-base', role: 'agent', company_id: CRM_A, is_active: true, email: 'base@piloto.demo' },
  ],
  companies: [
    { id: CRM_A, is_active: true },
    { id: CRM_B, is_active: false },
  ],
  invited: [],
  deleted: [],
  ...over,
});

const middlewareCon = (state: FakeState, conClave = true) =>
  createAdminMiddleware({
    supabaseUrl: 'https://proyecto.supabase.co',
    serviceKey: conClave ? 'clave-de-prueba' : undefined,
    appUrl: 'http://localhost:5173',
    createAdminClient: () => fakeSupabase(state),
  });

const invitar = (mw: ReturnType<typeof createAdminMiddleware>, token: string | null, body: object, method = 'POST') =>
  new Promise<{ status: number; json: Record<string, unknown> }>((resolve) => {
    const req = Readable.from([Buffer.from(JSON.stringify(body))]) as unknown as IncomingMessage;
    Object.assign(req, { method, url: '/invite', headers: token ? { authorization: `Bearer ${token}` } : {} });
    let status = 200;
    const res = {
      set statusCode(v: number) {
        status = v;
      },
      setHeader() {},
      end(texto: string) {
        resolve({ status, json: JSON.parse(texto) });
      },
    } as unknown as ServerResponse;
    void mw(req, res, () => resolve({ status: 404, json: {} }));
  });

test('Endpoint: sin la clave secreta responde 503 y explica qué falta', async () => {
  const r = await invitar(middlewareCon(estadoBase(), false), 'tok-admin', cuerpo());
  assert.equal(r.status, 503);
  assert.match(String(r.json.error), /SUPABASE_SERVICE_ROLE_KEY/);
});

test('Endpoint: sin sesión o con un token falso no invita a nadie', async () => {
  const state = estadoBase();
  assert.equal((await invitar(middlewareCon(state), null, cuerpo())).status, 401);
  assert.equal((await invitar(middlewareCon(state), 'tok-inventado', cuerpo())).status, 401);
  assert.equal(state.invited.length, 0);
});

test('Endpoint: el rol y el CRM salen de la base, no de lo que diga la solicitud', async () => {
  const state = estadoBase();
  // El usuario base dice ser administrador en el cuerpo: igual se rechaza
  const r = await invitar(middlewareCon(state), 'tok-base', { ...cuerpo(), callerRole: 'superadmin' });
  assert.equal(r.status, 403);
  const otroCrm = await invitar(middlewareCon(state), 'tok-gerente', cuerpo({ companyId: CRM_B }));
  assert.equal(otroCrm.status, 403);
  assert.equal(state.invited.length, 0);
});

test('Endpoint: invitación correcta crea el perfil con su CRM y rol, sin contraseña', async () => {
  const state = estadoBase();
  const r = await invitar(middlewareCon(state), 'tok-gerente', { ...cuerpo(), password: 'no-debe-usarse' });
  assert.equal(r.status, 200);
  assert.equal(state.invited.length, 1);
  assert.equal(state.invited[0].email, 'nuevo@piloto.demo');
  assert.equal(state.invited[0].options.redirectTo, 'http://localhost:5173');
  assert.equal(state.invited[0].options.data?.full_name, 'Persona Nueva');
  const perfil = state.profiles.find((p) => p.email === 'nuevo@piloto.demo')!;
  assert.deepEqual([perfil.company_id, perfil.role, perfil.is_active], [CRM_A, 'agent', true]);
  assert.ok(!JSON.stringify(state.invited).includes('no-debe-usarse'));
  assert.ok(!JSON.stringify(r.json).includes('no-debe-usarse'));
});

test('Endpoint: email repetido o CRM desactivado no envían correo', async () => {
  const state = estadoBase();
  const repetido = await invitar(middlewareCon(state), 'tok-admin', cuerpo({ email: 'BASE@piloto.demo' }));
  assert.equal(repetido.status, 409);
  const inactivo = await invitar(middlewareCon(state), 'tok-admin', cuerpo({ companyId: CRM_B }));
  assert.equal(inactivo.status, 409);
  assert.equal(state.invited.length, 0);
});

test('Endpoint: si el perfil falla se borra la cuenta de Auth (no quedan cuentas a medias)', async () => {
  const state = estadoBase({ failProfileInsert: true });
  const r = await invitar(middlewareCon(state), 'tok-admin', cuerpo());
  assert.equal(r.status, 500);
  assert.deepEqual(state.deleted, ['auth-1']);
});

test('Endpoint: el límite de correos de Supabase se explica y los registros no llevan emails', async () => {
  const registros: string[] = [];
  const warn = console.warn;
  const error = console.error;
  console.warn = (...args: unknown[]) => registros.push(args.map(String).join(' '));
  console.error = console.warn;
  try {
    const state = estadoBase({ failInvite: { status: 429, message: 'email rate limit exceeded' } });
    const r = await invitar(middlewareCon(state), 'tok-admin', cuerpo());
    assert.equal(r.status, 429);
    assert.match(String(r.json.error), /SMTP/);
    const fallaPerfil = estadoBase({ failProfileInsert: true });
    await invitar(middlewareCon(fallaPerfil), 'tok-admin', cuerpo());
  } finally {
    console.warn = warn;
    console.error = error;
  }
  assert.ok(registros.length > 0);
  assert.ok(registros.every((linea) => !linea.includes('@') && !linea.includes('Persona Nueva')), registros.join('\n'));
});

test('Endpoint: sin SMTP propio, explica qué configurar en Supabase', async () => {
  const state = estadoBase({ failInvite: { status: 400, message: 'Email address not authorized', code: 'email_address_not_authorized' } });
  const r = await invitar(middlewareCon(state), 'tok-gerente', cuerpo());
  assert.equal(r.status, 422);
  assert.match(String(r.json.error), /SMTP/);
  assert.equal(state.profiles.filter((p) => p.email === 'nuevo@piloto.demo').length, 0);
});

test('Endpoint: invitar solo acepta POST y rechaza cuerpos gigantes con 400', async () => {
  const state = estadoBase();
  const mw = middlewareCon(state);
  assert.equal((await invitar(mw, 'tok-admin', cuerpo(), 'GET')).status, 405);
  const gigante = await invitar(mw, 'tok-admin', { ...cuerpo(), relleno: 'x'.repeat(20_000) });
  assert.equal(gigante.status, 400);
  assert.equal(state.invited.length, 0);
});

// ------------------------------------------------------------------ resultado
const results: { name: string; ok: boolean; error?: string }[] = [];
for (const t of tests) {
  try {
    await t.fn();
    results.push({ name: t.name, ok: true });
  } catch (e) {
    results.push({ name: t.name, ok: false, error: (e as Error).message });
  }
}
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.error ? `\n    ${r.error}` : ''}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} pruebas de la conexión con Supabase OK`);
process.exit(failed ? 1 : 0);
