// Arma la app para Vercel con la Build Output API (.vercel/output): el sitio compilado en static/ y
// una sola función de Node para toda la API (/api/*), empaquetada en un archivo JavaScript.
// Ejecutar: npm run build:vercel   (Vercel lo corre solo en cada push; ver vercel.json)
//
// Por qué así y no la carpeta api/ de Vercel: el código del servidor se importa entre sí con
// extensión .ts (lo exige Node para correr las pruebas sin compilar) y aquí se empaqueta todo antes,
// así Vercel recibe JavaScript listo y lo que se prueba en local es lo mismo que se publica.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { build, loadEnv } from 'vite';

const SALIDA = '.vercel/output';
const FUNCION = `${SALIDA}/functions/api.func`;

if (!existsSync('dist/index.html')) {
  console.error('Falta dist/: corre primero vite build (npm run build:vercel lo hace).');
  process.exit(1);
}

rmSync(SALIDA, { recursive: true, force: true });
mkdirSync(`${SALIDA}/functions`, { recursive: true });

// 1. El sitio: tal cual lo dejó vite build
cpSync('dist', `${SALIDA}/static`, { recursive: true });

// 2. La API: todo en un solo index.mjs (dependencias incluidas), sin la configuración de la app
await build({
  configFile: false,
  logLevel: 'warn',
  // public/ es del sitio (favicon, íconos): la función no lo necesita
  publicDir: false,
  build: {
    ssr: 'server/vercel.ts',
    outDir: FUNCION,
    emptyOutDir: true,
    target: 'node22',
    minify: false,
    rolldownOptions: { output: { format: 'esm', entryFileNames: 'index.mjs' } },
  },
  ssr: { noExternal: true, target: 'node' },
});

writeFileSync(
  `${FUNCION}/.vc-config.json`,
  JSON.stringify(
    {
      runtime: 'nodejs22.x',
      handler: 'index.mjs',
      launcherType: 'Nodejs',
      // El asistente puede encadenar varias llamadas a la IA y a la búsqueda de empresas
      maxDuration: 60,
      shouldAddHelpers: false,
    },
    null,
    2
  )
);

// 3. Política de contenido (CSP): de dónde puede cargar cosas la página. Si alguna vez se colara un
//    script ajeno (XSS), no podría cargar código de otro sitio ni mandar la sesión a otro servidor.
//    Orígenes: la propia app, Supabase (datos y login), los mapas de Esri y las fuentes de Google.
//    El único script en línea de index.html (tema oscuro) se permite por su huella exacta.
const env = { ...loadEnv('production', process.cwd(), 'VITE_'), ...process.env };
const supabase = env.VITE_SUPABASE_URL ? new URL(env.VITE_SUPABASE_URL).origin : '';
const html = readFileSync('dist/index.html', 'utf8');
const huellas = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
  ([, codigo]) => `'sha256-${createHash('sha256').update(codigo).digest('base64')}'`
);
const csp = [
  "default-src 'self'",
  `script-src 'self' ${huellas.join(' ')}`.trim(),
  // Leaflet y React ponen estilos en línea en los elementos del mapa y de la interfaz
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://server.arcgisonline.com",
  `connect-src 'self'${supabase ? ` ${supabase} ${supabase.replace(/^https:/, 'wss:')}` : ''}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

// 4. Rutas y encabezados. Lo que existe como archivo se sirve tal cual; /api/* va a la función;
//    cualquier otra ruta abre la app (los enlaces de invitación y de contraseña vuelven a /).
const seguridad = {
  'Content-Security-Policy': csp,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'Cross-Origin-Opener-Policy': 'same-origin',
};
writeFileSync(
  `${SALIDA}/config.json`,
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: '^/(.*)$', headers: seguridad, continue: true },
        // Los archivos de assets llevan un hash en el nombre: se pueden guardar para siempre
        { src: '^/assets/(.*)$', headers: { 'Cache-Control': 'public, max-age=31536000, immutable' }, continue: true },
        { handle: 'filesystem' },
        { src: '^/api(?:/(.*))?$', dest: '/api?__ruta=$1' },
        { src: '^/(.*)$', dest: '/index.html' },
      ],
    },
    null,
    2
  )
);

console.log(`Listo para Vercel: ${SALIDA} (sitio en static/, API en functions/api.func)`);
