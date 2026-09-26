// Genera la evidencia de avance para la presentación: capturas de código comentadas,
// salida real de las pruebas y capturas de los módulos de la aplicación.
// Requiere el servidor en marcha (npm run dev). Ejecutar: npm run evidencia
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const CHROME_PATH = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const APP_URL = process.env.APP_URL ?? 'http://localhost:5173';
const OUT = 'docs/evidencia';
mkdirSync(OUT, { recursive: true });

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ------------------------------------------------------------------ capturas de código
// Cada bloque: archivo, rango de líneas y la nota que explica POR QUÉ es evidencia
const BLOQUES = [
  {
    salida: 'codigo-01-migracion-calidad.png',
    archivo: 'supabase/migrations/20260925000007_data_quality_conventions.sql',
    desde: 1,
    hasta: 64,
    lenguaje: 'sql',
    titulo: 'Migración 0007 · Calidad de datos y convenciones',
    nota: 'Se corrige antes del despliegue el problema clásico de dividir el nombre en dos columnas, y queda escrito en el propio archivo que, con datos en producción, este cambio debe partirse en dos migraciones (expandir → copiar → convivir → contraer).',
  },
  {
    salida: 'codigo-02-columna-con-datos.png',
    archivo: 'supabase/migrations/20260922000004_international_plan.sql',
    desde: 100,
    hasta: 124,
    lenguaje: 'sql',
    titulo: 'Migración 0004 · Agregar una columna sin perder datos',
    nota: 'Al sumar países, los leads ya existentes quedan automáticamente en Chile gracias al DEFAULT: ningún dato queda sin país ni se pierde. Es el patrón seguro para columnas obligatorias nuevas.',
  },
  {
    salida: 'codigo-03-reglas-negocio.png',
    archivo: 'src/lib/tenantGuards.ts',
    desde: 41,
    hasta: 78,
    lenguaje: 'typescript',
    titulo: 'Reglas de negocio · aislamiento entre CRMs y avance del pipeline',
    nota: 'Funciones puras, sin interfaz: por eso se pueden probar automáticamente. canChangeStage() impide que un usuario base retroceda un lead, y la regla se aplica al guardar, no solo en la pantalla.',
  },
  {
    salida: 'codigo-04-auditoria-inmutable.png',
    archivo: 'supabase/migrations/20260926000008_audit_log.sql',
    desde: 40,
    hasta: 80,
    lenguaje: 'sql',
    titulo: 'Migración 0008 · Historial de auditoría inmutable',
    nota: 'La tabla del historial no tiene políticas de UPDATE ni DELETE: nadie puede alterar ni borrar el registro de lo que pasó. Marcar una entrada como revertida pasa por una función que valida rol y CRM.',
  },
  {
    salida: 'codigo-05-usuarios-gerencia.png',
    archivo: 'src/lib/tenantGuards.ts',
    desde: 190,
    hasta: 231,
    lenguaje: 'typescript',
    titulo: 'Administración de usuarios por gerencia · límites del permiso',
    nota: 'El gerente administra a su equipo sin depender del administrador de la plataforma, pero el permiso viene acotado desde el código: no puede tocar otro CRM, no puede crear administradores, no puede cambiar emails y no puede desactivarse a sí mismo, así un CRM nunca queda sin gerencia.',
  },
];

const paginaCodigo = ({ archivo, desde, hasta, lenguaje, titulo, nota }) => {
  const lineas = readFileSync(archivo, 'utf8').split('\n').slice(desde - 1, hasta);
  const codigo = lineas
    .map((linea, i) => `<tr><td class="ln">${desde + i}</td><td class="code"><code class="language-${lenguaje}">${esc(linea) || ' '}</code></td></tr>`)
    .join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-light.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 28px; background: #F8FAFC; font-family: 'Segoe UI', system-ui, sans-serif; width: 1400px; }
  .marco { background: #fff; border: 1px solid #CBD5E1; border-radius: 14px; overflow: hidden; box-shadow: 0 6px 20px rgb(15 23 42 / 0.08); }
  .barra { display: flex; align-items: center; gap: 10px; padding: 14px 18px; background: #EEF2FF; border-bottom: 1px solid #C7D2FE; }
  .barra h1 { margin: 0; font-size: 17px; color: #1E1B4B; }
  .ruta { margin-left: auto; font-family: Consolas, monospace; font-size: 13px; color: #4338CA; background: #fff; border: 1px solid #C7D2FE; border-radius: 6px; padding: 3px 9px; }
  table { border-collapse: collapse; width: 100%; }
  td { vertical-align: top; padding: 0; }
  .ln { width: 54px; text-align: right; padding: 1px 12px 1px 0; color: #94A3B8; font-family: Consolas, monospace; font-size: 13px; user-select: none; background: #F8FAFC; border-right: 1px solid #E2E8F0; }
  .code { padding: 1px 0 1px 14px; }
  code { font-family: Consolas, 'Cascadia Mono', monospace; font-size: 13.5px; line-height: 1.55; white-space: pre; background: none !important; padding: 0 !important; }
  .nota { display: flex; gap: 12px; margin-top: 14px; padding: 14px 18px; background: #FEF3C7; border: 1px solid #FCD34D; border-radius: 12px; font-size: 14.5px; color: #78350F; line-height: 1.5; }
  .nota b { color: #92400E; }
</style></head><body>
<div class="marco">
  <div class="barra"><h1>${esc(titulo)}</h1><span class="ruta">${esc(archivo)}  ·  líneas ${desde}–${hasta}</span></div>
  <table>${codigo}</table>
</div>
<div class="nota"><b>Por qué importa:</b> <span>${esc(nota)}</span></div>
<script>document.querySelectorAll('code').forEach((b) => { try { hljs.highlightElement(b); } catch (e) {} });</script>
</body></html>`;
};

// ------------------------------------------------------------------ salida real de las pruebas
const PRUEBAS = [
  ['npm run test:tenant', 'Reglas de negocio y aislamiento entre CRMs'],
  ['npm run test:export', 'Exportación de datos (portabilidad)'],
  ['npm run test:sql', 'Migraciones: sintaxis y convenciones'],
  ['npm run test:e2e', 'Punta a punta sobre la aplicación real'],
];

const correr = (comando) => {
  try {
    return execSync(comando, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 10 * 1024 * 1024 });
  } catch (error) {
    return `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }
};

const paginaTerminal = (bloques) => {
  const cuerpo = bloques
    .map(
      ({ comando, descripcion, salida }) => `
    <div class="bloque">
      <div class="cmd"><span class="prompt">PS&gt;</span> ${esc(comando)}<span class="desc">${esc(descripcion)}</span></div>
      <pre>${esc(salida.trim())}</pre>
    </div>`
    )
    .join('');
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
  body { margin: 0; padding: 28px; background: #0F172A; font-family: Consolas, 'Cascadia Mono', monospace; width: 1400px; color: #E2E8F0; }
  h1 { font-family: 'Segoe UI', system-ui, sans-serif; font-size: 20px; margin: 0 0 6px; color: #fff; }
  .sub { font-family: 'Segoe UI', system-ui, sans-serif; font-size: 14px; color: #94A3B8; margin-bottom: 20px; }
  .bloque { background: #020617; border: 1px solid #334155; border-radius: 12px; margin-bottom: 16px; overflow: hidden; }
  .cmd { padding: 10px 16px; background: #1E293B; font-size: 14px; color: #E2E8F0; display: flex; align-items: center; gap: 10px; }
  .prompt { color: #34D399; font-weight: bold; }
  .desc { margin-left: auto; font-family: 'Segoe UI', system-ui, sans-serif; font-size: 13px; color: #94A3B8; }
  pre { margin: 0; padding: 14px 16px; font-size: 13px; line-height: 1.5; white-space: pre-wrap; color: #CBD5E1; }
</style></head><body>
  <h1>Pruebas automáticas de Revela</h1>
  <div class="sub">Salida real de los comandos, ejecutados el ${new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
  ${cuerpo}
</body></html>`;
};

// ------------------------------------------------------------------ generación
const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true, defaultViewport: { width: 1400, height: 900, deviceScaleFactor: 2 } });
const page = await browser.newPage();

// Si el CDN del resaltado de sintaxis no responde, la captura igual se genera (sin colores)
const pintar = async (html) => {
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 1200));
};

for (const bloque of BLOQUES) {
  await pintar(paginaCodigo(bloque));
  await page.screenshot({ path: `${OUT}/${bloque.salida}`, fullPage: true });
  console.log(`✓ ${OUT}/${bloque.salida}`);
}

console.log('Ejecutando las pruebas (el e2e tarda ~2 min)...');
const resultados = PRUEBAS.map(([comando, descripcion]) => {
  const salida = correr(comando)
    .split('\n')
    .filter((l) => !l.startsWith('>') && l.trim() !== '')
    .join('\n');
  console.log(`  · ${comando}`);
  return { comando, descripcion, salida };
});
await pintar(paginaTerminal(resultados));
await page.screenshot({ path: `${OUT}/pruebas-automaticas.png`, fullPage: true });
console.log(`✓ ${OUT}/pruebas-automaticas.png`);
writeFileSync(`${OUT}/pruebas-automaticas.txt`, resultados.map((r) => `$ ${r.comando}\n${r.salida}`).join('\n\n'), 'utf8');

// ------------------------------------------------------------------ capturas de la aplicación
const MODULOS = [
  ['user-gerente-demo', 'KPI y Mapa', 'app-01-kpi-mapa.png', null],
  ['user-gerente-demo', 'Pipeline', 'app-02-pipeline.png', null],
  ['user-gerente-demo', 'Gerencia', 'app-03-gerencia-catalogo.png', 'Catálogo'],
  ['user-gerente-demo', 'Auditoría', 'app-04-auditoria.png', null],
  ['user-admin', 'Administración', 'app-05-administracion.png', null],
  // CRM de la empresa con la que se pilotea: usuarios administrados por su propio gerente
  ['user-gerente-demo', 'Gerencia', 'app-06-gerencia-usuarios.png', 'Usuarios'],
];

await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
for (const [usuario, pestana, salida, seccion] of MODULOS) {
  await page.goto(`${APP_URL}/?demo`, { waitUntil: 'networkidle2' });
  await page.evaluate((u) => {
    localStorage.setItem('revela-session', u);
    localStorage.setItem('revela-theme', 'light');
  }, usuario);
  await page.reload({ waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 1500));
  await page.evaluate((t) => {
    const b = [...document.querySelectorAll('nav button')].find((x) => x.textContent.includes(t));
    b?.click();
  }, pestana);
  await new Promise((r) => setTimeout(r, 1800));
  if (seccion) {
    await page.evaluate((t) => {
      const b = [...document.querySelectorAll('main button')].find((x) => x.textContent.includes(t));
      b?.click();
    }, seccion);
    await new Promise((r) => setTimeout(r, 900));
  }
  await page.screenshot({ path: `${OUT}/${salida}` });
  console.log(`✓ ${OUT}/${salida}`);
}

await browser.close();
