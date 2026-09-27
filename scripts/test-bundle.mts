// Revisa la app compilada (dist/) antes de publicarla: no debe traer los CRMs de prueba, las cuentas
// que solo existen en desarrollo ni ninguna clave secreta de .env.local.
// Ejecutar: npm run test:bundle   (compila con vite build y revisa lo que se publicaría)
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { platformAdminUser } from '../src/data/mockGeoData.ts';
import { testTenantsData } from '../src/data/testTenants.ts';

execSync('npx vite build', { stdio: 'ignore' });

const publicados = [
  'dist/index.html',
  ...readdirSync('dist/assets')
    .filter((f) => /\.(js|css|html|json)$/.test(f))
    .map((f) => join('dist/assets', f)),
];
const bundle = publicados.map((f) => readFileSync(f, 'utf8')).join('\n');

let ok = 0;
let total = 0;
const check = (name: string, pass: boolean, detail = '') => {
  total += 1;
  if (pass) ok += 1;
  console.log(`${pass ? '✓' : '✗'} ${name}${!pass && detail ? `\n    ${detail}` : ''}`);
};
// Un dato cuenta si aparece como texto completo ("Valentina Gómez"), no dentro de otro (el ejemplo
// "Ej. Valentina Gómez" del formulario). Los valores no se imprimen: algunos son contraseñas.
const presentes = (valores: string[]) =>
  valores.filter((v) => v && ['"', "'", '`'].some((comilla) => bundle.includes(`${comilla}${v}${comilla}`)));

const { geodemo, otros } = testTenantsData();
const prueba = [geodemo, otros];
const crms = prueba.flatMap((d) => d.companies);
check(
  'Los CRMs de prueba (GeoDemo, Norte, Sur) no están en la app publicada',
  presentes(crms.flatMap((c) => [c.id, c.name, c.slug])).length === 0,
  `aparecen: ${presentes(crms.flatMap((c) => [c.name, c.slug])).join(', ')}`
);
const usuarios = prueba.flatMap((d) => d.users);
check(
  'Tampoco sus usuarios ni sus contraseñas de prueba',
  presentes(usuarios.flatMap((u) => [u.email, u.password ?? ''])).length === 0,
  `${presentes(usuarios.flatMap((u) => [u.email, u.password ?? ''])).length} valores encontrados`
);
check(
  'Ni sus empresas cliente, leads o catálogo',
  presentes([
    ...prueba.flatMap((d) => d.accounts.map((a) => a.name)),
    ...prueba.flatMap((d) => d.leads.map((l) => l.fullName)),
    ...prueba.flatMap((d) => d.catalog.map((i) => i.name)),
  ]).length === 0
);
check(
  'El administrador de plataforma de desarrollo no está en la app publicada',
  presentes([platformAdminUser.email, platformAdminUser.password ?? '']).length === 0
);

// Claves del servidor: todo lo de .env.local que no empiece con VITE_ (VITE_ es público a propósito)
const secretos = existsSync('.env.local')
  ? readFileSync('.env.local', 'utf8')
      .split(/\r?\n/)
      .map((linea) => linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
      .filter((m): m is RegExpMatchArray => !!m && !m[1].startsWith('VITE_'))
      .map((m) => ({ nombre: m[1], valor: m[2].replace(/^["']|["']$/g, '') }))
      .filter((s) => s.valor.length >= 12)
  : [];
const filtrados = secretos.filter((s) => bundle.includes(s.valor)).map((s) => s.nombre);
check(
  `Ninguna clave secreta de .env.local queda en la app publicada (${secretos.length} revisadas)`,
  filtrados.length === 0,
  `aparecen: ${filtrados.join(', ')}`
);

// La demo pública sí debe estar: es la que se abre desde la landing
check('La cuenta demo sí está (es pública)', bundle.includes('Revela Demo') && bundle.includes('gerente@demo.revelacrm.com'));

console.log(`\n${ok}/${total} revisiones de la app publicada OK`);
if (ok !== total) process.exit(1);
