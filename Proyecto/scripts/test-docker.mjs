// Prueba la imagen de Docker ya levantada (docker compose up -d): la app, la demo y la API.
// Ejecutar: npm run test:docker   (opcional: APP_URL=..., CHROME_PATH=..., y una ruta para guardar una captura)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const BASE = process.env.APP_URL ?? 'http://localhost:8080';
const CHROME_PATH = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const resultados = [];
const check = (nombre, ok, detalle = '') => {
  resultados.push(ok);
  console.log(`${ok ? '✓' : '✗'} ${nombre}${detalle ? ` · ${detalle}` : ''}`);
};

const r1 = await fetch(`${BASE}/`);
const html = await r1.text();
check('La página principal responde', r1.ok && html.includes('<div id="root">'), `HTTP ${r1.status}`);
const r2 = await fetch(`${BASE}/api/rates`);
const tasas = await r2.json().catch(() => null);
check('La API de tipos de cambio responde', r2.ok && tasas?.rates?.CLP > 0, tasas ? `1 USD = ${tasas.rates.CLP} CLP` : `HTTP ${r2.status}`);
const r3 = await fetch(`${BASE}/api/ai/status`);
check('La API del asistente responde (sin claves en la imagen)', r3.ok, `HTTP ${r3.status}`);
const r4 = await fetch(`${BASE}/api/no-existe`);
check('Una ruta de la API que no existe da 404', r4.status === 404, `HTTP ${r4.status}`);

const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true });
const page = await browser.newPage();
const errores = [];
page.on('pageerror', (e) => errores.push(e.message));
await page.setViewport({ width: 1280, height: 760 });
await page.goto(`${BASE}/?demo`, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
const pestañas = await page.evaluate(() => [...document.querySelectorAll('nav button')].map((b) => b.textContent.trim()));
check('La demo abre sin contraseña y muestra el CRM', pestañas.some((t) => t.includes('Pipeline')), pestañas.join(', '));
check('Sin errores de JavaScript en la página', errores.length === 0, errores.join(' | '));
if (process.argv[2]) await page.screenshot({ path: process.argv[2] });
await browser.close();
const ok = resultados.filter(Boolean).length;
console.log(`\n${ok}/${resultados.length} comprobaciones de la imagen de Docker OK`);
process.exit(ok === resultados.length ? 0 : 1);
