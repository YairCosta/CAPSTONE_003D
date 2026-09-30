// Prueba la app tal como se publicaría en Vercel, sin publicarla: arma .vercel/output
// (npm run build:vercel), levanta un servidor local que aplica las mismas rutas de config.json y
// llama a la función empaquetada (JavaScript puro, sin TypeScript ni Vite).
// Ejecutar: npm run test:vercel
// La función corre sin claves (este proceso no lee .env.local): se revisa que responda, no la IA.
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { createServer } from 'node:http';
import { dirname, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const SALIDA = '.vercel/output';
execSync('npm run build:vercel', { stdio: 'ignore' });

let ok = 0;
let total = 0;
const check = (name, pass, detail = '') => {
  total += 1;
  if (pass) ok += 1;
  console.log(`${pass ? '✓' : '✗'} ${name}${!pass && detail ? `\n    ${detail}` : ''}`);
};

// ------------------------------------------------------------------ archivos
const vc = JSON.parse(readFileSync(`${SALIDA}/functions/api.func/.vc-config.json`, 'utf8'));
check('La función de la API es JavaScript listo para Node en Vercel', vc.runtime.startsWith('nodejs') && vc.launcherType === 'Nodejs' && existsSync(`${SALIDA}/functions/api.func/${vc.handler}`), JSON.stringify(vc));
const config = JSON.parse(readFileSync(`${SALIDA}/config.json`, 'utf8'));
const csp = config.routes.find((r) => r.headers?.['Content-Security-Policy'])?.headers['Content-Security-Policy'] ?? '';
check('Las rutas usan la versión 3 de la Build Output API', config.version === 3 && config.routes.some((r) => r.handle === 'filesystem'));
// Solo los import reales (al inicio de línea o dinámicos), no los ejemplos en comentarios de las librerías
const DIR_FUNCION = `${SALIDA}/functions/api.func`;
const sinComentarios = (codigo) => codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const importsDe = (fuente, codigo = sinComentarios(fuente)) => [
  ...[...codigo.matchAll(/^import\s[^;]*?from\s*["']([^"']+)["']/gm)].map((m) => m[1]),
  ...[...codigo.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]),
];
const archivosFuncion = [vc.handler, ...(existsSync(`${DIR_FUNCION}/assets`) ? readdirSync(`${DIR_FUNCION}/assets`).map((f) => `assets/${f}`) : [])];
const sueltos = archivosFuncion.flatMap((f) =>
  importsDe(readFileSync(`${DIR_FUNCION}/${f}`, 'utf8')).filter(
    (spec) => !(spec.startsWith('node:') || builtinModules.includes(spec.split('/')[0]) || (spec.startsWith('.') && existsSync(join(DIR_FUNCION, dirname(f), spec))))
  )
);
check('La función trae todo empaquetado: solo importa módulos de Node y sus propios archivos', sueltos.length === 0, sueltos.join(', '));

// Las claves llegan a la función desde las variables del proyecto en Vercel, nunca dentro del código.
// Se revisa todo lo que se publicaría (sitio y función) contra los valores de .env.local, sin imprimirlos.
const todo = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? todo(join(dir, e.name)) : [join(dir, e.name)]));
const publicado = todo(SALIDA).filter((f) => /\.(m?js|html|css|json)$/.test(f)).map((f) => readFileSync(f, 'utf8')).join('\n');
const secretos = existsSync('.env.local')
  ? readFileSync('.env.local', 'utf8')
      .split(/\r?\n/)
      .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
      .filter((m) => m && !m[1].startsWith('VITE_'))
      .map((m) => ({ nombre: m[1], valor: m[2].replace(/^["']|["']$/g, '') }))
      .filter((s) => s.valor.length >= 12)
  : [];
const filtrados = secretos.filter((s) => publicado.includes(s.valor)).map((s) => s.nombre);
check(`Ninguna clave secreta de .env.local queda en lo que se sube a Vercel (${secretos.length} revisadas)`, filtrados.length === 0, `aparecen: ${filtrados.join(', ')}`);

// ------------------------------------------------------------------ servidor que imita a Vercel
const handler = (await import(pathToFileURL(join(process.cwd(), SALIDA, 'functions/api.func', vc.handler)).href)).default;
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const archivo = (ruta) => {
  const f = join(SALIDA, 'static', decodeURIComponent(ruta));
  return existsSync(f) && statSync(f).isFile() ? f : null;
};
const servirArchivo = (res, f) => {
  res.setHeader('Content-Type', TIPOS[extname(f)] ?? 'application/octet-stream');
  res.end(readFileSync(f));
};
// Sin reescritura: la función recibe la ruta original (la otra forma en que puede llegar)
let formaOriginal = false;

const servidor = createServer((req, res) => {
  const url = new URL(req.url, 'http://local');
  for (const ruta of config.routes) {
    if (ruta.handle === 'filesystem') {
      const f = url.pathname === '/' ? null : archivo(url.pathname);
      if (f) return servirArchivo(res, f);
      continue;
    }
    const m = url.pathname.match(new RegExp(ruta.src));
    if (!m) continue;
    for (const [k, v] of Object.entries(ruta.headers ?? {})) res.setHeader(k, v);
    if (ruta.continue) continue;
    const destino = ruta.dest.replace(/\$(\d)/g, (_, i) => m[Number(i)] ?? '');
    const d = new URL(destino, 'http://local');
    if (d.pathname === '/api') {
      if (!formaOriginal) req.url = `${d.pathname}${d.search}`;
      return handler(req, res);
    }
    const f = archivo(d.pathname);
    return f ? servirArchivo(res, f) : ((res.statusCode = 404), res.end());
  }
  res.statusCode = 404;
  res.end();
});
await new Promise((r) => servidor.listen(0, r));
const base = `http://localhost:${servidor.address().port}`;
const pedir = (ruta, init) => fetch(base + ruta, { ...init, signal: AbortSignal.timeout(20000) });

try {
  const inicio = await pedir('/');
  check('La página principal abre la app', inicio.status === 200 && (await inicio.text()).includes('<div id="root">'));
  check('Lleva los encabezados de seguridad', inicio.headers.get('x-content-type-options') === 'nosniff' && inicio.headers.get('x-frame-options') === 'DENY');

  const enlace = await pedir('/invitacion/aceptar');
  check('Cualquier otra ruta también abre la app (enlaces de invitación y contraseña)', enlace.status === 200 && (await enlace.text()).includes('<div id="root">'));

  const html = readFileSync(`${SALIDA}/static/index.html`, 'utf8');
  const script = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
  const asset = await pedir(script);
  check('Los archivos de la app se sirven con caché larga', asset.status === 200 && /immutable/.test(asset.headers.get('cache-control') ?? ''), script);

  const ia = await pedir('/api/ai/status');
  const iaJson = await ia.json().catch(() => ({}));
  check('La API del asistente responde (sin clave configurada en esta prueba)', ia.status === 200 && 'provider' in iaJson && iaJson.serverKeyConfigured === false, JSON.stringify(iaJson));
  check('Publicada, las claves del asistente exigen sesión en un CRM', iaJson.requiresSession === true, JSON.stringify(iaJson));
  const chat = await pedir('/api/ai/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'hola' }] }] }) });
  check('El asistente rechaza a quien no inició sesión', chat.status === 401, String(chat.status));

  const presupuesto = await pedir('/api/ai/budget');
  const presupuestoJson = await presupuesto.json().catch(() => ({}));
  check('El asistente usa GPT por defecto (Gemini apagado) y el presupuesto de IA se aplica', iaJson.provider === 'openai' && iaJson.budgetEnforced === true, JSON.stringify(iaJson));
  check('El presupuesto de IA exige sesión en un CRM', presupuesto.status === 401, `${presupuesto.status} ${JSON.stringify(presupuestoJson)}`);
  const claveIa = await pedir('/api/ai/key');
  check('La clave de OpenAI del CRM exige sesión, y cada CRM trae la suya (keyPerCrm)', claveIa.status === 401 && iaJson.keyPerCrm === true, `${claveIa.status} ${JSON.stringify(iaJson)}`);
  const cargarClave = await pedir('/api/ai/key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: 'sk-proj-SinSesion00000000000000000000000000' }) });
  check('Cargar una clave de OpenAI sin iniciar sesión se rechaza', cargarClave.status === 401, String(cargarClave.status));

  const admin = await pedir('/api/admin/status');
  check('La API de invitaciones responde', admin.status === 200, String(admin.status));

  const invitar = await pedir('/api/admin/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  check('Invitar sin sesión se rechaza', invitar.status >= 400 && invitar.status < 500 || invitar.status === 503, String(invitar.status));

  const tasas = await pedir('/api/rates');
  const tasasJson = await tasas.json().catch(() => ({}));
  check('La API de tipos de cambio responde con tasas', tasas.status === 200 && typeof tasasJson === 'object' && JSON.stringify(tasasJson).includes('USD'), String(tasas.status));

  const nada = await pedir('/api/no-existe');
  check('Una ruta de la API que no existe da 404', nada.status === 404, String(nada.status));

  formaOriginal = true;
  const original = await pedir('/api/ai/status');
  check('La función acepta también la ruta original, sin reescribir', original.status === 200, String(original.status));
  formaOriginal = false;

  // Política de contenido (CSP) en un navegador real: la app carga sin violaciones, puede hablar con
  // Supabase y NO puede hablar con otros sitios (así un script ajeno no se llevaría la sesión)
  check('La página lleva una política de contenido (CSP)', /default-src 'self'/.test(inicio.headers.get('content-security-policy') ?? ''));
  const require = createRequire(import.meta.url);
  const puppeteer = require('puppeteer-core');
  const navegador = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
  });
  try {
    const page = await navegador.newPage();
    const violaciones = [];
    await page.exposeFunction('reportarViolacion', (v) => violaciones.push(v));
    await page.evaluateOnNewDocument(() => {
      document.addEventListener('securitypolicyviolation', (e) => window.reportarViolacion(`${e.violatedDirective} ${e.blockedURI}`));
    });
    await page.goto(base + '/', { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 800));
    const login = await page.evaluate(() => document.body.innerText.includes('Iniciar sesión'));
    check('Con la CSP la app abre sin violaciones (la pantalla de ingreso se ve)', login && violaciones.length === 0, violaciones.join(' | ') || 'sin pantalla de ingreso');
    const supabaseUrl = csp.match(/connect-src 'self' (https:\/\/\S+)/)?.[1];
    const conectar = (url) =>
      page.evaluate(async (u) => {
        try {
          await fetch(u, { mode: 'no-cors' });
          return 'permitido';
        } catch {
          return 'bloqueado';
        }
      }, url);
    if (supabaseUrl) check('La CSP deja hablar con Supabase', (await conectar(`${supabaseUrl}/auth/v1/health`)) === 'permitido');
    check('La CSP no deja mandar datos a otros sitios', (await conectar('https://example.com/robar')) === 'bloqueado');
  } finally {
    await navegador.close();
  }
} finally {
  servidor.close();
}

console.log(`\n${ok}/${total} revisiones de la app para Vercel OK`);
process.exit(ok === total ? 0 : 1);
