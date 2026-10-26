// Prueba de rendimiento: cuánto tarda en cargar la app (demo pública) y cuánto responde la API.
// Uso:  APP_URL=http://localhost:8080 npm run test:rendimiento   (con el contenedor o con `npm run preview` en marcha)
//
// Mide en Chrome, con la caché vacía en cada repetición:
//   · LCP (Largest Contentful Paint): cuándo se ve el contenido principal. Google considera "bueno" hasta 2,5 s.
//   · carga de la página (evento load) y bytes de JavaScript que baja la primera pantalla.
// y la latencia de la API (GET /api/ai/status, sin base de datos): mediana y percentil 95.
//
// Los umbrales son generosos a propósito: es una prueba de regresión ("no empeoró"), no un benchmark. En local el
// servidor no comprime; publicada, Vercel entrega los mismos archivos comprimidos (gzip/brotli), bastante más livianos.
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');

const APP_URL = process.env.APP_URL ?? 'http://localhost:8080';
const CHROME_PATH = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const REPETICIONES = 5;
const PETICIONES_API = 50;

// Línea base medida el 30-09-2026 (local, sin comprimir: 961 KB de JavaScript en 17 archivos; comprimido, 278 KB) más
// un margen de ~15%: la prueba avisa si una versión nueva empeora la carga, no fija cuánto "debería" pesar una app.
const UMBRALES = {
  lcpMs: 2500, // "bueno" según Core Web Vitals
  cargaMs: 4000,
  jsPrimeraPantallaKB: 1100, // sin comprimir; incluye el mapa, que es lo primero que se ve
  jsComprimidoKB: 350, // lo que realmente baja una persona cuando el servidor comprime (Vercel lo hace)
  apiMedianaMs: 100,
  apiP95Ms: 300,
};

const mediana = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const percentil = (xs, p) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil((p / 100) * xs.length) - 1)];
const redondear = (n) => Math.round(n * 10) / 10;

const navegador = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true });
const carga = [];
try {
  for (let i = 0; i < REPETICIONES; i++) {
    // Contexto nuevo en cada repetición: sin caché ni almacenamiento de la vez anterior
    const contexto = await navegador.createBrowserContext();
    const page = await contexto.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluateOnNewDocument(() => {
      window.__lcp = 0;
      new PerformanceObserver((lista) => {
        for (const e of lista.getEntries()) window.__lcp = e.startTime;
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    });
    await page.goto(`${APP_URL}/?demo`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForSelector('nav', { timeout: 30000 });
    const m = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const scripts = performance.getEntriesByType('resource').filter((r) => r.initiatorType === 'script' || r.name.endsWith('.js'));
      return {
        lcpMs: window.__lcp,
        cargaMs: nav.loadEventEnd,
        jsBytes: scripts.reduce((suma, r) => suma + (r.encodedBodySize || r.transferSize || 0), 0),
        archivosJs: scripts.length,
        urls: scripts.map((r) => r.name),
      };
    });
    carga.push(m);
    await contexto.close();
  }
} finally {
  await navegador.close();
}

// Tamaño comprimido de esos mismos archivos (gzip, como los entrega Vercel)
let jsComprimidoBytes = 0;
for (const url of carga[carga.length - 1].urls) {
  jsComprimidoBytes += gzipSync(Buffer.from(await (await fetch(url)).arrayBuffer())).length;
}

// Latencia de la API, en serie (una persona usando la app, no una prueba de carga masiva)
const latencias = [];
for (let i = 0; i < PETICIONES_API; i++) {
  const t0 = performance.now();
  const r = await fetch(`${APP_URL}/api/ai/status`);
  await r.arrayBuffer();
  if (!r.ok) throw new Error(`La API respondió ${r.status}`);
  latencias.push(performance.now() - t0);
}

const resultado = {
  lcpMs: redondear(mediana(carga.map((c) => c.lcpMs))),
  cargaMs: redondear(mediana(carga.map((c) => c.cargaMs))),
  jsPrimeraPantallaKB: redondear(mediana(carga.map((c) => c.jsBytes)) / 1024),
  archivosJs: mediana(carga.map((c) => c.archivosJs)),
  jsComprimidoKB: redondear(jsComprimidoBytes / 1024),
  apiMedianaMs: redondear(mediana(latencias)),
  apiP95Ms: redondear(percentil(latencias, 95)),
};

const filas = [
  ['LCP (mediana de ' + REPETICIONES + ')', `${resultado.lcpMs} ms`, `≤ ${UMBRALES.lcpMs} ms`, resultado.lcpMs <= UMBRALES.lcpMs],
  ['Carga de la página (load)', `${resultado.cargaMs} ms`, `≤ ${UMBRALES.cargaMs} ms`, resultado.cargaMs <= UMBRALES.cargaMs],
  ['JavaScript de la primera pantalla', `${resultado.jsPrimeraPantallaKB} KB en ${resultado.archivosJs} archivos`, `≤ ${UMBRALES.jsPrimeraPantallaKB} KB`, resultado.jsPrimeraPantallaKB <= UMBRALES.jsPrimeraPantallaKB],
  ['JavaScript comprimido (gzip)', `${resultado.jsComprimidoKB} KB`, `≤ ${UMBRALES.jsComprimidoKB} KB`, resultado.jsComprimidoKB <= UMBRALES.jsComprimidoKB],
  ['API · mediana de ' + PETICIONES_API + ' peticiones', `${resultado.apiMedianaMs} ms`, `≤ ${UMBRALES.apiMedianaMs} ms`, resultado.apiMedianaMs <= UMBRALES.apiMedianaMs],
  ['API · percentil 95', `${resultado.apiP95Ms} ms`, `≤ ${UMBRALES.apiP95Ms} ms`, resultado.apiP95Ms <= UMBRALES.apiP95Ms],
];
console.log(`Rendimiento de ${APP_URL}/?demo\n`);
for (const [nombre, medido, umbral, ok] of filas) console.log(`${ok ? '✓' : '✗'} ${nombre}: ${medido} (umbral ${umbral})`);
const falladas = filas.filter((f) => !f[3]).length;
console.log(`\n${filas.length - falladas}/${filas.length} mediciones dentro del umbral`);
process.exit(falladas ? 1 : 0);
