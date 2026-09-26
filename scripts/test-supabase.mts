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
  type CompanyRow,
} from '../src/lib/db/mappers.ts';
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
  failInvite?: { status: number; message: string };
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
