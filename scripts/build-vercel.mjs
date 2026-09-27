// Arma la app para Vercel con la Build Output API (.vercel/output): el sitio compilado en static/ y
// una sola función de Node para toda la API (/api/*), empaquetada en un archivo JavaScript.
// Ejecutar: npm run build:vercel   (Vercel lo corre solo en cada push; ver vercel.json)
//
// Por qué así y no la carpeta api/ de Vercel: el código del servidor se importa entre sí con
// extensión .ts (lo exige Node para correr las pruebas sin compilar) y aquí se empaqueta todo antes,
// así Vercel recibe JavaScript listo y lo que se prueba en local es lo mismo que se publica.
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { build } from 'vite';

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

// 3. Rutas y encabezados. Lo que existe como archivo se sirve tal cual; /api/* va a la función;
//    cualquier otra ruta abre la app (los enlaces de invitación y de contraseña vuelven a /).
const seguridad = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
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
