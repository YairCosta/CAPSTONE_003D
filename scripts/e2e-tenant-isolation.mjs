// Prueba de punta a punta del aislamiento entre CRMs (tenants).
// Requiere el servidor en marcha (npm run dev) y Google Chrome.
// Ejecutar: npm run test:e2e   (opcional: CHROME_PATH=... APP_URL=...)
import { createRequire } from 'node:module';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';

const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');

const APP_URL = process.env.APP_URL ?? 'http://localhost:5173';
const CHROME_PATH = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const GEO = { manager: 'gerente@geodemo.cl', agent: 'vendedor@geodemo.cl' };
const NORTE = { manager: 'gerente@nortedemo.cl', agent: 'vendedor@nortedemo.cl' };
const ADMIN = 'admin@revelacrm.com';
const DEMO = { manager: 'gerente@demo.revelacrm.com', agent: 'vendedor@demo.revelacrm.com' };
// Usuario que crea el gerente de la cuenta demo durante la prueba
const DEMO_NEW_USER = { name: 'Persona E2E Demo', email: 'persona.e2e@demo.revelacrm.com', password: 'e2e12345' };

// Datos que solo existen en cada CRM (mock + los que crea la prueba)
const GEO_ONLY = ['Antonia Morales Valdés', 'Consultora Andes', 'Vitacura Holdings', 'Holding Vitacura', 'Carlos Mendoza'];
const NORTE_ONLY = ['Rocío Aguilera', 'Minera Atacama Norte', 'Hotel Costanera', 'Elena Paredes', 'Tomás Vidal'];
// 'Etapa Solo A' salió de la lista: la pestaña Estados está oculta por ahora y su aislamiento
// lo cubre stageConfigsForTenant en npm run test:tenant.
const CREATED_A = ['Empresa Aislada A', 'Lead Aislado A', 'Actividad Aislada A', 'Producto Aislado A'];
// Catálogos de productos y servicios de cada CRM
const GEO_CATALOG = ['Terminal POS Retail', 'Kiosko de autoatención', 'Asesoría de layout comercial'];
const NORTE_CATALOG = ['Hormigón premezclado', 'Estudio de suelos'];
const CREATED_B = ['Empresa Aislada B', 'Lead Aislado B'];
// Datos de Perú de GeoDemo (plan Internacional)
const GEO_PERU = ['Lucía Fernández', 'Constructora Pacífico SAC', 'Inversiones Miraflores SAC'];

const results = [];
const warnings = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${!ok && detail ? `\n    ${detail}` : ''}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  defaultViewport: { width: 1600, height: 1000 },
});
const page = await browser.newPage();
page.on('pageerror', (err) => check(`Sin errores de JavaScript en la página`, false, err.message));

// ------------------------------------------------------------------ helpers
const clickText = (selector, text, root = 'body') =>
  page.evaluate(
    (sel, t, r) => {
      const el = [...document.querySelector(r).querySelectorAll(sel)].find((e) => e.textContent.trim().includes(t));
      if (!el) throw new Error(`No se encontró ${sel} con "${t}"`);
      el.click();
    },
    selector,
    text,
    root
  );

// Contraseñas de los usuarios de demostración (src/data/mockGeoData.ts)
const PASSWORDS = {
  [ADMIN]: 'dev-admin-solo-local',
  [GEO.manager]: 'dev-gerente-local',
  [GEO.agent]: 'dev-base-local',
  [NORTE.manager]: 'dev-gerente-local',
  [NORTE.agent]: 'dev-base-local',
  [DEMO.manager]: 'demo1234',
  [DEMO.agent]: 'demo1234',
  [DEMO_NEW_USER.email]: DEMO_NEW_USER.password,
};

// Escribe en un input controlado por React y dispara el evento de cambio
const fillInput = (selector, value) =>
  page.$eval(
    selector,
    (el, v) => {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    },
    value
  );

// Clic directo sobre el elemento: dispara los mismos handlers de React que un clic del usuario
const domClick = (selector) =>
  page.$eval(selector, (el) => {
    el.scrollIntoView({ block: 'center' });
    el.click();
  });

// Inicia sesión con email y contraseña. Devuelve { ok, alert } sin lanzar error.
const login = async (email) => {
  await page.waitForSelector('#login-email', { visible: true, timeout: 10000 });
  await fillInput('#login-email', email);
  await fillInput('#login-password', PASSWORDS[email]);
  await sleep(100);
  const typed = await page.$eval('#login-email', (el) => el.value);
  if (typed !== email) throw new Error(`No se pudo escribir el email en el login (quedó "${typed}")`);
  // Qué elemento está en el centro del botón "Ingresar" (detecta capas encima), sin desplazar la página
  const hitTarget = await page.$eval('button[type=submit]', (button) => {
    const r = button.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (el?.closest('button[type=submit]')) return 'botón Ingresar';
    return `${el?.tagName ?? 'nada'} ${String(el?.className ?? '').slice(0, 120)}`;
  });
  // Registro de los eventos que realmente llegan a la página al enviar (para diagnosticar envíos perdidos)
  await page.evaluate(() => {
    window.__loginEvents = [];
    for (const type of ['keydown', 'keypress', 'click', 'submit', 'pointerdown', 'pointerup', 'mousedown', 'mouseup']) {
      window.addEventListener(
        type,
        (e) => {
          const target = e.target?.id || e.target?.tagName || 'window';
          // Se revisa después de que todos los handlers corrieron
          setTimeout(() => window.__loginEvents.push(`${type}@${target} trusted=${e.isTrusted} prevented=${e.defaultPrevented}`), 0);
        },
        true
      );
    }
  });
  // Se envía con clic directo sobre "Ingresar" (incluye la validación nativa del formulario)
  await domClick('button[type=submit]');
  const ok = await page
    .waitForSelector('button[aria-label="Cerrar sesión"]', { timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  let alert = '';
  if (!ok) {
    // Diagnóstico: ¿el formulario es válido?, ¿se guardó la sesión?, ¿enviarlo por código funciona?
    const diag = await page.evaluate(() => {
      const form = document.querySelector('#login-email')?.closest('form');
      return {
        alert: document.querySelector('[role=alert]')?.textContent ?? '',
        formValid: form ? form.checkValidity() : null,
        invalidFields: [...document.querySelectorAll('input:invalid')].map((i) => `${i.id}: ${i.validationMessage}`),
        passwordLength: document.querySelector('#login-password')?.value.length ?? null,
        sessionSaved: localStorage.getItem('revela-session'),
        activeElement: document.activeElement?.id || document.activeElement?.tagName,
        events: window.__loginEvents ?? [],
      };
    });
    // Chrome headless a veces deja de entregar teclado/mouse simulados tras muchas acciones seguidas
    // (verificado: a mano y en una secuencia aislada el login funciona). Solo si el formulario es válido
    // y no hubo error de credenciales, se envía por código y queda registrado como aviso.
    if (diag.formValid && !diag.alert) {
      await page.evaluate(() => document.querySelector('#login-email')?.closest('form')?.requestSubmit());
      const okAfterRequestSubmit = await page
        .waitForSelector('button[aria-label="Cerrar sesión"]', { timeout: 3000 })
        .then(() => true)
        .catch(() => false);
      if (okAfterRequestSubmit) {
        warnings.push(`Login de ${email}: la entrada simulada no llegó a la página; se envió el formulario por código.`);
        await sleep(800);
        return { ok: true, alert: '' };
      }
    }
    alert = `${diag.alert} [clic recibido por: ${hitTarget}] ${JSON.stringify(diag)}`;
  }
  if (ok) await sleep(800);
  return { ok, alert };
};

// Inicio de sesión que debe funcionar: si falla, la prueba se detiene con el motivo
const mustLogin = async (email) => {
  const result = await login(email);
  if (!result.ok) throw new Error(`No se pudo iniciar sesión como ${email}: ${result.alert || 'sin mensaje'}`);
};

const logout = async () => {
  await domClick('button[aria-label="Cerrar sesión"]');
  await sleep(600);
};

const tab = async (label) => {
  await clickText('nav button', label);
  await sleep(700);
};

const mainText = () => page.evaluate(() => document.querySelector('main')?.innerText ?? '');
const bodyText = () => page.evaluate(() => document.body.innerText);
const leadChip = () =>
  page.evaluate(() => [...document.querySelectorAll('header span')].find((s) => /\d+ leads/.test(s.textContent))?.textContent ?? '');

// Escribe directamente en el campo (la entrada simulada de Chrome headless no es fiable en pruebas largas)
const typeInto = (selector, value) => fillInput(selector, value);

// La captura exige declarar de dónde salió el dato y por qué se puede guardar (Ley 21.719)
const declararBaseDelDato = async (origen = 'form', base = 'inquiry') => {
  await page.select('#cap-origin', origen);
  await page.select('#cap-consent', base);
};


// `partial` busca la opción que CONTENGA el texto: las opciones de lead incluyen
// empresa, persona, etapa y monto, así que basta con nombrar a la persona.
const selectByText = async (selector, text, partial = false) => {
  const value = await page.$eval(
    selector,
    (s, t, p) => [...s.options].find((o) => (p ? o.text.trim().includes(t) : o.text.trim() === t))?.value,
    text,
    partial
  );
  if (value === undefined) throw new Error(`Opción "${text}" no encontrada en ${selector}`);
  await page.select(selector, value);
};

const tagElement = (finder, id) =>
  page.evaluate(
    (src, newId) => {
      // eslint-disable-next-line no-new-func
      const el = new Function(`return (${src})()`)();
      if (!el) throw new Error(`Elemento no encontrado para ${newId}`);
      el.id = newId;
    },
    finder.toString(),
    id
  );

// Recorre todos los módulos visibles para el perfil y devuelve el texto combinado
// skipAudit: la auditoría es el historial completo del CRM y no se filtra por país,
// así que se excluye de las comprobaciones del filtro de países.
const collectTenantText = async ({ manager, skipAudit = false }) => {
  let text = '';
  const tabs = await page.evaluate(() => [...document.querySelectorAll('nav button')].map((b) => b.textContent.trim()));
  for (const label of tabs) {
    if (skipAudit && label === 'Auditoría') continue;
    await tab(label);
    if (label === 'KPI y Mapa') {
      await clickText('main button', 'Productos y servicios');
      await sleep(600);
      text += `\n${await mainText()}`;
      await clickText('main button', 'Zonas y mapa');
      await sleep(400);
    }
    if (label === 'Registro de contacto') {
      await tagElement(() => [...document.querySelectorAll('main select')].find((s) => [...s.options].some((o) => o.text.includes('Bitácora Global'))), 'e2e-lead-select');
      await page.select('#e2e-lead-select', '');
      await sleep(400);
      // La bitácora global muestra el contenido de las actividades: es donde deben aparecer
      // (ya no en la auditoría, que no guarda datos personales)
      await clickText('main button', 'Historial');
      await sleep(400);
    }
    text += `\n${await mainText()}`;
    if (label === 'Gerencia' && manager) {
      for (const section of ['Contactos', 'Catálogo', 'Leads sin', 'Empresas cliente']) {
        await clickText('main button', section);
        await sleep(400);
        text += `\n${await mainText()}`;
      }
    }
  }
  // Evita que "no ve datos de otro CRM" pase en falso con la pantalla vacía
  if (tabs.length === 0 || text.trim().length < 200) {
    throw new Error(`No se obtuvo contenido del CRM (pestañas: ${tabs.length}); ¿la sesión no se inició?`);
  }
  return text;
};

const noneOf = (text, words) => words.filter((w) => text.includes(w));

try {
  // Sin ?pruebas la app es la pública: solo la cuenta de demostración
  await page.goto(APP_URL, { waitUntil: 'networkidle2' });
  await page.evaluate(() => sessionStorage.clear());
  await page.reload({ waitUntil: 'networkidle2' });
  const loginTexto = await page.evaluate(() => document.body.innerText);
  check(
    'El login normal solo ofrece la cuenta de demostración',
    loginTexto.includes('Revela Demo') && noneOf(loginTexto, ['GeoDemo', 'Constructora Norte', 'Logística Sur']).length === 0,
    noneOf(loginTexto, ['GeoDemo', 'Constructora Norte', 'Logística Sur']).join(', ')
  );
  const sinPruebas = await login(GEO.manager);
  check('Los CRMs de prueba no existen en la app normal', !sinPruebas.ok, sinPruebas.alert.slice(0, 120));

  // ?pruebas carga los CRMs de prueba (GeoDemo y Norte), que la app normal no muestra
  await page.goto(`${APP_URL}/?pruebas`, { waitUntil: 'networkidle2' });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('revela-theme', 'light');
  });
  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(500);

  // ================================================================ 1. Lectura aislada inicial
  await mustLogin(GEO.manager);
  check('GeoDemo (gerente) ve 21 leads (14 Chile + 7 Perú)', (await leadChip()) === '21 leads', await leadChip());
  let text = await collectTenantText({ manager: true });
  check('GeoDemo ve sus propios datos', GEO_ONLY.slice(0, 3).every((w) => text.includes(w)));
  check('GeoDemo (plan Internacional) ve sus datos de Perú', GEO_PERU.every((w) => text.includes(w)));
  check('GeoDemo NO ve datos de Constructora Norte', noneOf(text, NORTE_ONLY).length === 0, `Filtrado: ${noneOf(text, NORTE_ONLY)}`);
  check('GeoDemo ve su catálogo de productos y servicios', GEO_CATALOG.every((w) => text.includes(w)));
  check('GeoDemo NO ve el catálogo de Constructora Norte', noneOf(text, NORTE_CATALOG).length === 0, `Filtrado: ${noneOf(text, NORTE_CATALOG)}`);

  // ================================================================ 2. Escrituras en GeoDemo
  await tab('Gerencia');
  await clickText('main button', 'Empresas cliente');
  await clickText('main button', 'Nueva empresa');
  await sleep(300);
  await typeInto('#acc-name', 'Empresa Aislada A');
  await clickText('button', 'Crear empresa');
  await sleep(400);

  // Producto nuevo en el catálogo de GeoDemo
  await clickText('main button', 'Catálogo');
  await sleep(300);
  await clickText('main button', 'Nuevo producto o servicio');
  await sleep(300);
  await typeInto('#cat-name', 'Producto Aislado A');
  await typeInto('#cat-price-CL', '7000');
  await domClick('button[form="catalog-form"]');
  await sleep(400);

  await clickText('header button', 'Capturar Lead');
  await sleep(300);
  await typeInto('#cap-fullName', 'Lead Aislado A');
  await selectByText('#cap-account', 'Empresa Aislada A');
  await typeInto('#cap-rawAddress', 'Av. Providencia 100');
  await page.select('#cap-commune', 't-providencia');
  await declararBaseDelDato();
  await clickText('button', 'Agregar producto o servicio');
  await sleep(200);
  await selectByText('#cap-item-0', 'Producto Aislado A');
  await typeInto('#cap-qty-0', '3');
  await sleep(200);
  const computedValue = await page.$eval('#cap-value', (el) => el.textContent);
  check('La captura calcula el valor desde los productos (3 × $7.000)', computedValue === '$21.000', computedValue);
  await clickText('button', 'Guardar lead');
  await sleep(1200);

  // Qué se vende más y dónde: el producto nuevo aparece en el ranking y en el buscador del mapa
  await tab('KPI y Mapa');
  await clickText('main button', 'Productos y servicios');
  await sleep(600);
  const insights = await mainText();
  check('El ranking de productos incluye el producto vendido', insights.includes('Producto Aislado A'));
  await typeInto('#catalog-map-search', 'Producto Aislado');
  await page.$eval('#catalog-map-search', (el) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  await sleep(600);
  // El lead está en negociación: se busca en "Todos" (ganados + en curso)
  await page.evaluate(() =>
    [...document.querySelectorAll('button[aria-pressed]')].find((b) => b.textContent.trim() === 'Todos' && b.title.includes('Ganados')).click()
  );
  await sleep(600);
  const whereSold = await page.$eval('[role=status]', (el) => el.textContent);
  check('El buscador del mapa ubica el producto en 1 zona', whereSold.includes('1 leads · en 1 '), whereSold);

  // Varias búsquedas a la vez: se suma un producto del catálogo de ejemplo
  await typeInto('#catalog-map-search', 'Terminal POS');
  await page.$eval('#catalog-map-search', (el) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  await sleep(600);
  const chips = await page.$$eval('button[aria-label^="Quitar búsqueda"]', (els) => els.length);
  const whereBoth = await page.$eval('[role=status]', (el) => el.textContent);
  check('El mapa admite varias búsquedas a la vez', chips === 2 && !whereBoth.startsWith('1 leads'), `${chips} búsquedas · ${whereBoth}`);

  // Ficha del lead al hacer clic en un punto del mapa
  await page.evaluate(() => {
    const marker = [...document.querySelectorAll('main path.leaflet-interactive')].find((p) => p.getAttribute('stroke') === '#ffffff');
    marker?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await sleep(500);
  const popup = await page.$eval('.leaflet-popup-content', (el) => el.innerText).catch(() => '');
  check('Al hacer clic en un punto se ve la ficha del lead (tipo, productos y valor)', /tipo de lead/i.test(popup) && /valor/i.test(popup), popup.replace(/\s+/g, ' ').slice(0, 160));
  await clickText('main button', 'Zonas y mapa');
  await sleep(300);

  await tab('Registro de contacto');
  await tagElement(() => [...document.querySelectorAll('main select')].find((s) => [...s.options].some((o) => o.text.includes('Bitácora Global'))), 'e2e-lead-select');
  await selectByText('#e2e-lead-select', 'Lead Aislado A', true);
  await sleep(300);
  await tagElement(() => document.querySelector('main textarea'), 'e2e-summary');
  await typeInto('#e2e-summary', 'Actividad Aislada A');
  await clickText('main button', 'Guardar Interacción');
  await sleep(600);

  check('GeoDemo ahora tiene 22 leads', (await leadChip()) === '22 leads', await leadChip());

  // Auditoría: el gerente ve lo que acaba de pasar, con persona, acción y hora
  await tab('Auditoría');
  const auditText = await mainText();
  // El lead aparece por su empresa: el nombre de la persona no queda en el historial (Ley 21.719)
  const auditExpected = ['Empresa Aislada A', 'Producto Aislado A', 'Andrea Torres'];
  check(
    'La auditoría registra los cambios (creación, edición y etapa) con su autor',
    auditExpected.every((w) => auditText.includes(w)) && /Gerente/.test(auditText),
    `Faltan: ${auditExpected.filter((w) => !auditText.includes(w))}`
  );
  check(
    'La auditoría no guarda el nombre de la persona ni lo conversado',
    !auditText.includes('Lead Aislado A') && !auditText.includes('Actividad Aislada A'),
    auditText.slice(0, 200).replace(/\s+/g, ' ')
  );
  text = await collectTenantText({ manager: true });
  check('Los datos creados en GeoDemo son visibles en GeoDemo', CREATED_A.every((w) => text.includes(w)), `Faltan: ${CREATED_A.filter((w) => !text.includes(w))}`);

  // ================================================================ 3. Constructora Norte no ve nada de GeoDemo
  await logout();
  await mustLogin(NORTE.manager);
  check('Constructora Norte (gerente) ve 3 leads', (await leadChip()) === '3 leads', await leadChip());
  text = await collectTenantText({ manager: true });
  const leakA = noneOf(text, [...GEO_ONLY, ...CREATED_A, ...GEO_PERU, ...GEO_CATALOG, 'TechNova SpA']);
  check('Constructora Norte NO ve datos ni cambios de GeoDemo (incluido su catálogo)', leakA.length === 0, `Filtrado: ${leakA}`);
  check('Constructora Norte ve solo su propio catálogo', NORTE_CATALOG.every((w) => text.includes(w)));
  check(
    'Constructora Norte (plan Nacional) no ve el selector de países',
    (await page.$('section[aria-label="Filtro de países"]')) === null && !text.includes('Distrito')
  );

  // Escrituras en Norte, incluida una empresa cliente con el mismo nombre que una de GeoDemo
  await tab('Gerencia');
  await clickText('main button', 'Empresas cliente');
  await clickText('main button', 'Nueva empresa');
  await sleep(300);
  await typeInto('#acc-name', 'Empresa Aislada A');
  await clickText('button', 'Crear empresa');
  await sleep(400);
  const dupError = await page.evaluate(() => document.body.innerText.includes('Ya existe otra empresa con ese nombre'));
  check('Norte puede tener una empresa cliente con el mismo nombre que otro CRM', !dupError);
  if (dupError) await clickText('button', 'Cancelar');

  await clickText('header button', 'Capturar Lead');
  await sleep(300);
  await typeInto('#cap-fullName', 'Lead Aislado B');
  await page.select('#cap-account', '__new__');
  await sleep(200);
  await typeInto('#cap-newAccount', 'Empresa Aislada B');
  await typeInto('#cap-rawAddress', 'Av. Irarrázaval 500');
  await page.select('#cap-commune', 't-nunoa');
  await declararBaseDelDato();
  await clickText('button', 'Guardar lead');
  await sleep(1200);
  check('Norte ahora tiene 4 leads', (await leadChip()) === '4 leads', await leadChip());

  // ================================================================ 4. GeoDemo no ve lo creado en Norte
  await logout();
  await mustLogin(GEO.manager);
  check('GeoDemo sigue con 22 leads', (await leadChip()) === '22 leads', await leadChip());
  text = await collectTenantText({ manager: true });
  check('GeoDemo NO ve datos de Norte', noneOf(text, [...NORTE_ONLY, ...CREATED_B]).length === 0, `Filtrado: ${noneOf(text, [...NORTE_ONLY, ...CREATED_B])}`);
  await tab('Gerencia');
  await clickText('main button', 'Empresas cliente');
  const accountRowsA = await page.evaluate(
    () => [...document.querySelectorAll('main tbody tr')].filter((tr) => tr.innerText.includes('Empresa Aislada A')).length
  );
  check('GeoDemo ve una sola "Empresa Aislada A" (la de Norte no se mezcla)', accountRowsA === 1, `filas: ${accountRowsA}`);

  // Clave personal de Gemini de un usuario de GeoDemo
  await domClick('button[aria-label="Abrir asistente de prospección"]');
  await page.waitForSelector('section[aria-label="Asistente de prospección"] button[aria-label="Configurar el asistente"]', { visible: true, timeout: 5000 });
  await domClick('button[aria-label="Configurar el asistente"]');
  await page.waitForSelector('#gemini-key', { visible: true, timeout: 5000 });
  await fillInput('#gemini-key', 'AIzaCLAVE-SOLO-GEODEMO');
  await clickText('button', 'Guardar clave');
  await sleep(200);
  await domClick('button[aria-label="Cerrar asistente"]');

  // ================================================================ 5. Usuario base de Norte + asistente IA
  await logout();
  const keysAfterLogout = await page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('revela-gemini-key')));
  check('Al cerrar sesión se borra la clave personal de Gemini', keysAfterLogout.length === 0, `quedan: ${keysAfterLogout}`);

  await mustLogin(NORTE.agent);
  const agentTabs = await page.evaluate(() => [...document.querySelectorAll('nav button')].map((b) => b.textContent.trim()));
  check('El usuario base no ve el módulo de Auditoría', !agentTabs.some((t) => t.includes('Auditoría')), agentTabs.join(', '));

  // El usuario base solo puede avanzar leads en el pipeline
  await tab('Pipeline');
  await clickText('main button', 'Expandir Todas');
  await sleep(500);
  const agentBackButtons = await page.evaluate(
    () => [...document.querySelectorAll('main button')].filter((b) => b.textContent.includes('Retroceder')).length
  );
  check('El usuario base no puede retroceder leads en el pipeline', agentBackButtons === 0, `botones: ${agentBackButtons}`);

  text = await collectTenantText({ manager: false });
  check('Usuario base de Norte NO ve datos de GeoDemo', noneOf(text, [...GEO_ONLY, ...CREATED_A]).length === 0, `Filtrado: ${noneOf(text, [...GEO_ONLY, ...CREATED_A])}`);
  check('Usuario base de Norte ve el lead creado en Norte', text.includes('Lead Aislado B'));

  await domClick('button[aria-label="Abrir asistente de prospección"]');
  await sleep(1000);
  const subtitle = await page.evaluate(() => document.querySelector('section[aria-label="Asistente de prospección"] header p.text-sm')?.textContent ?? '');
  check('Norte no hereda la clave de Gemini de GeoDemo', subtitle.includes('falta API key'), subtitle);

  // Simula a Gemini pidiendo guardar 2 leads en el mismo turno, uno con nombre de una empresa de GeoDemo
  await page.evaluate(() => {
    const realFetch = window.fetch.bind(window);
    let step = 0;
    window.fetch = async (url, opts) => {
      if (!String(url).includes('/api/ai/chat')) return realFetch(url, opts);
      const body = JSON.parse(opts.body);
      step += 1;
      const respond = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (step === 1) {
        return respond({
          type: 'tool_calls',
          contents: [...body.contents, { role: 'model', parts: [{ text: 'guardando' }] }],
          events: [],
          calls: [
            { id: 'c1', name: 'save_lead_to_crm', executedOn: 'client', args: { company_name: 'TechNova SpA', phone: '+56 9 5555 0101', status: 'nuevo' } },
            { id: 'c2', name: 'save_lead_to_crm', executedOn: 'client', args: { company_name: 'Empresa Doble IA', phone: '+56 9 5555 0102', status: 'nuevo' } },
          ],
        });
      }
      window.__e2eToolResults = body.contents[body.contents.length - 1].parts.map((p) => p.functionResponse.response);
      return respond({ type: 'message', text: 'Listo', contents: [...body.contents, { role: 'model', parts: [{ text: 'ok' }] }], events: [] });
    };
  });
  await fillInput('section[aria-label="Asistente de prospección"] textarea', 'Guarda TechNova SpA y Empresa Doble IA');
  await domClick('button[aria-label="Enviar mensaje"]');
  await sleep(1500);
  const toolResults = await page.evaluate(() => window.__e2eToolResults ?? []);
  const ids = toolResults.map((r) => r.lead_id);
  check('El asistente creó 2 leads con IDs distintos en el mismo turno', toolResults.length === 2 && toolResults.every((r) => r.ok) && new Set(ids).size === 2, JSON.stringify(toolResults));
  check('Norte tiene 6 leads tras el asistente', (await leadChip()) === '6 leads', await leadChip());

  // ================================================================ 6. GeoDemo no se ve afectado por el asistente de Norte
  await logout();
  await mustLogin(GEO.manager);
  check('GeoDemo sigue con 22 leads', (await leadChip()) === '22 leads', await leadChip());
  await tab('Gerencia');
  await clickText('main button', 'Empresas cliente');
  const techNovaRow = await page.evaluate(
    () => [...document.querySelectorAll('main tbody tr')].find((tr) => tr.innerText.includes('TechNova SpA'))?.innerText ?? ''
  );
  check('La "TechNova SpA" de GeoDemo mantiene sus 2 leads (no recibió el de Norte)', techNovaRow.includes('2 leads'), techNovaRow.replace(/\s+/g, ' '));
  text = await mainText();
  check('GeoDemo no ve "Empresa Doble IA" creada en Norte', !text.includes('Empresa Doble IA'));

  // ================================================================ 7. Administrador de plataforma
  await logout();
  await mustLogin(ADMIN);
  const adminText = await bodyText();
  const rows = await page.evaluate(() =>
    Object.fromEntries([...document.querySelectorAll('main tbody tr')].map((tr) => [tr.cells[0].innerText.split('\n')[0], tr.cells[5]?.innerText.trim()]))
  );
  check('Admin: GeoDemo tiene 22 leads', rows['Inmobiliaria & Retail GeoDemo'] === '22', JSON.stringify(rows));
  check('Admin: Constructora Norte tiene 6 leads', rows['Constructora Norte Demo'] === '6', JSON.stringify(rows));
  check('Admin no ve el contenido de los leads de ningún CRM', noneOf(adminText, ['Antonia Morales Valdés', 'Rocío Aguilera', 'Lead Aislado A', 'Lead Aislado B']).length === 0);

  // Portabilidad: el administrador descarga el Excel de GeoDemo desde el panel
  const downloadDir = mkdtempSync(join(tmpdir(), 'revela-export-'));
  const cdp = await page.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
  await domClick('button[aria-label="Exportar datos de Inmobiliaria & Retail GeoDemo"]');
  await sleep(300);
  const exportModal = await bodyText();
  check('El modal de exportación resume las filas y advierte datos personales', exportModal.includes('Descargar Excel') && exportModal.includes('datos personales'));
  await clickText('button', 'Descargar Excel');
  let xlsxFile = '';
  for (let i = 0; i < 30 && !xlsxFile; i++) {
    await sleep(300);
    xlsxFile = readdirSync(downloadDir).find((f) => f.endsWith('.xlsx')) ?? '';
  }
  check('Se descarga el Excel del CRM', /^revela-export_retail-geodemo_\d{4}-\d{2}-\d{2}\.xlsx$/.test(xlsxFile), xlsxFile || 'sin archivo');
  if (xlsxFile) {
    const files = unzipSync(new Uint8Array(readFileSync(join(downloadDir, xlsxFile))));
    const xml = Object.entries(files)
      .filter(([path]) => path.endsWith('.xml'))
      .map(([, c]) => strFromU8(c))
      .join(' ');
    const leaked = ['Rocío Aguilera', 'Lead Aislado B', 'Empresa Doble IA', 'Hormigón premezclado', 'dev-gerente-local', 'dev-admin-solo-local'].filter((w) => xml.includes(w));
    check('El Excel trae los datos de GeoDemo (incluidos los creados en la prueba)', ['Antonia Morales Valdés', 'Lead Aislado A', 'Producto Aislado A', 'Lucía Fernández'].every((w) => xml.includes(w)));
    check('El Excel NO trae datos de otros CRMs ni contraseñas', leaked.length === 0, `Filtrado: ${leaked}`);
  }
  await page.keyboard.press('Escape');
  await sleep(300);

  await domClick('button[role=switch][aria-label="Desactivar CRM Constructora Norte Demo"]');
  await sleep(300);
  await logout();
  const blockedLogin = await login(NORTE.manager);
  check(
    'Con el CRM de Norte desactivado, su gerente no puede entrar',
    !blockedLogin.ok && blockedLogin.alert.includes('desactivado'),
    JSON.stringify(blockedLogin)
  );
  await mustLogin(GEO.manager);
  check('Desactivar Norte no afecta a GeoDemo', (await leadChip()) === '22 leads', await leadChip());

  // ================================================================ 8. Plan Internacional (Chile + Perú)
  const countryButton = (name) =>
    page.evaluate((n) => {
      const button = [...document.querySelectorAll('section[aria-label="Filtro de países"] button')].find((b) =>
        b.textContent.includes(n)
      );
      if (!button) throw new Error(`Botón de país "${n}" no encontrado`);
      button.click();
    }, name);

  await tab('KPI y Mapa');
  await countryButton('Chile'); // queda solo Perú
  await sleep(700);
  check('Filtro solo Perú: 7 leads visibles', (await leadChip()) === '7 leads', await leadChip());
  text = await collectTenantText({ manager: true, skipAudit: true });
  check('Filtro solo Perú: no aparecen datos de Chile', noneOf(text, [...GEO_ONLY.slice(0, 3), 'Lead Aislado A']).length === 0, `Visibles: ${noneOf(text, [...GEO_ONLY.slice(0, 3), 'Lead Aislado A'])}`);
  check('Filtro solo Perú: la zona se llama Distrito y los montos conservan su moneda original (S/)', text.includes('Distrito') && text.includes('S/'));

  await clickText('header button', 'Capturar Lead');
  await sleep(300);
  const defaultCountry = await page.$eval('#cap-country', (s) => s.value);
  check('Captura con filtro Perú propone Perú como país', defaultCountry === 'PE', defaultCountry);
  const communeOptions = await page.$eval('#cap-commune', (s) => [...s.options].map((o) => o.value).filter(Boolean));
  check('Captura en Perú solo ofrece distritos de Perú', communeOptions.length === 5 && communeOptions.every((v) => v.startsWith('pe-')), communeOptions.join(','));
  await typeInto('#cap-fullName', 'Lead Lima E2E');
  await typeInto('#cap-rawAddress', 'Av. Pardo 500');
  await page.select('#cap-commune', 'pe-miraflores');
  await declararBaseDelDato();
  await clickText('button', 'Guardar lead');
  await sleep(1200);
  check('Perú ahora tiene 8 leads', (await leadChip()) === '8 leads', await leadChip());

  await tab('KPI y Mapa');
  await clickText('section[aria-label="Filtro de países"] button', 'Ver todos');
  await sleep(700);
  check('Con ambos países GeoDemo suma 23 leads', (await leadChip()) === '23 leads', await leadChip());
  // Todo el CRM se ve en una sola moneda (CLP por defecto en un CRM chileno) y el selector la cambia
  const kpiEnClp = await mainText();
  check(
    'Ganado e ingresos estimados se ven en una sola moneda, con los soles convertidos',
    kpiEnClp.includes('Ganado') && kpiEnClp.includes('Ingresos estimados') && /Incluye .*PEN.* convertido a CLP/.test(kpiEnClp),
    kpiEnClp.slice(0, 200).replace(/\s+/g, ' ')
  );
  await domClick('[aria-label="Moneda para ver el CRM"] button[aria-pressed="false"]');
  await sleep(400);
  // Valor de la tarjeta "Ganado" (la línea siguiente a su título exacto, no el filtro "Ganados")
  const kpiEnUsd = await page.evaluate(() => {
    const t = document.querySelector('main')?.innerText ?? '';
    return t.match(/\nGanado\n([^\n]+)/)?.[1] ?? '';
  });
  check('El selector de moneda cambia todo el CRM a dólares', kpiEnUsd.includes('US$'), kpiEnUsd.replace(/\s+/g, ' '));
  await domClick('[aria-label="Moneda para ver el CRM"] button[aria-pressed="false"]');
  await sleep(300);

  // El administrador desactiva el plan Internacional: Perú deja de verse, pero no se borra
  await logout();
  await mustLogin(ADMIN);
  await domClick('button[role=switch][aria-label="Desactivar plan Internacional de Inmobiliaria & Retail GeoDemo"]');
  await sleep(300);
  await clickText('button', 'Desactivar plan');
  await sleep(300);
  await logout();
  await mustLogin(GEO.manager);
  text = await collectTenantText({ manager: true, skipAudit: true });
  check('Sin plan Internacional GeoDemo ve solo Chile (15 leads)', (await leadChip()) === '15 leads', await leadChip());
  check('Sin plan Internacional no se ven datos de Perú ni el selector de países', noneOf(text, [...GEO_PERU, 'Lead Lima E2E']).length === 0 && (await page.$('section[aria-label="Filtro de países"]')) === null, `Visibles: ${noneOf(text, GEO_PERU)}`);

  await logout();
  await mustLogin(ADMIN);
  await domClick('button[role=switch][aria-label="Activar plan Internacional de Inmobiliaria & Retail GeoDemo"]');
  await sleep(300);
  await logout();
  await mustLogin(GEO.manager);
  check('Al reactivar el plan vuelven los datos de Perú (23 leads)', (await leadChip()) === '23 leads', await leadChip());

  // ================================================================ 8b. El gerente administra los usuarios de SU CRM
  await logout();
  await mustLogin(DEMO.manager);
  await tab('Gerencia');
  await clickText('main button', 'Usuarios');
  await sleep(500);
  const teamText = await mainText();
  check(
    'El gerente ve a los usuarios de su CRM',
    teamText.includes('Marcela Ortiz') && teamText.includes('Diego Fuentes'),
    teamText.slice(0, 200).replace(/\s+/g, ' ')
  );
  check(
    'El gerente NO ve usuarios de otros CRMs ni al administrador de la plataforma',
    noneOf(teamText, ['Andrea Torres', 'Carlos Mendoza', 'Paula Rojas', 'Administrador Revela']).length === 0,
    `Visibles: ${noneOf(teamText, ['Andrea Torres', 'Carlos Mendoza', 'Paula Rojas', 'Administrador Revela'])}`
  );

  await clickText('main button', 'Nuevo usuario');
  await sleep(400);
  await typeInto('#tu-name', DEMO_NEW_USER.name);
  await typeInto('#tu-email', DEMO_NEW_USER.email);
  await typeInto('#tu-password', DEMO_NEW_USER.password);
  await clickText('button', 'Crear usuario');
  await sleep(600);
  check('El gerente crea un usuario de su CRM', (await mainText()).includes(DEMO_NEW_USER.name));

  await tab('Auditoría');
  await sleep(400);
  check('La creación del usuario queda en la auditoría', (await mainText()).includes(DEMO_NEW_USER.name));

  // El usuario nuevo puede entrar...
  await logout();
  const nuevoLogin = await login(DEMO_NEW_USER.email);
  check('El usuario recién creado puede iniciar sesión', nuevoLogin.ok, nuevoLogin.alert);

  // ...y deja de poder hacerlo cuando el gerente lo desactiva
  await logout();
  await mustLogin(DEMO.manager);
  await tab('Gerencia');
  await clickText('main button', 'Usuarios');
  await sleep(500);
  await domClick(`button[role=switch][aria-label="Desactivar a ${DEMO_NEW_USER.name}"]`);
  await sleep(500);
  const selfSwitchDisabled = await page.$eval(
    'button[role=switch][aria-label="No puedes desactivar tu propio usuario"]',
    (el) => el.disabled
  );
  check('El gerente no puede desactivarse a sí mismo', selfSwitchDisabled);

  await logout();
  const bloqueado = await login(DEMO_NEW_USER.email);
  check('Un usuario desactivado ya no puede entrar', !bloqueado.ok, bloqueado.alert.slice(0, 120));

  // ================================================================ 8b-ter. Cada persona cambia su contraseña
  // La plataforma nunca fija ni ve la contraseña de un usuario (Ley 21.719: seguridad y confidencialidad)
  await mustLogin(DEMO.manager);
  await domClick('button[aria-label="Cambiar mi contraseña"]');
  await sleep(300);
  await typeInto('#cc-actual', PASSWORDS[DEMO.manager]);
  await typeInto('#cc-nueva', 'corta1');
  await typeInto('#cc-confirmar', 'corta1');
  await clickText('button', 'Guardar contraseña');
  await sleep(300);
  const errorCorta = await page.evaluate(() => document.querySelector('[role=alert]')?.textContent ?? '');
  check('Rechaza una contraseña nueva demasiado corta', errorCorta.includes('al menos'), errorCorta);

  const NUEVA_CLAVE = 'revela2026seguro';
  await typeInto('#cc-nueva', NUEVA_CLAVE);
  await typeInto('#cc-confirmar', NUEVA_CLAVE);
  await clickText('button', 'Guardar contraseña');
  await sleep(400);
  check(
    'El gerente cambia su propia contraseña',
    (await page.evaluate(() => document.querySelector('[role=status]')?.textContent ?? '')).includes('quedó cambiada')
  );
  await clickText('button', 'Listo');
  await sleep(200);

  await logout();
  const conClaveVieja = await login(DEMO.manager);
  check('La contraseña anterior deja de servir', !conClaveVieja.ok, conClaveVieja.alert.slice(0, 120));
  PASSWORDS[DEMO.manager] = NUEVA_CLAVE;
  await mustLogin(DEMO.manager);
  check('Entra con la contraseña nueva', true);

  // El cambio queda en la auditoría, sin guardar la contraseña
  await tab('Auditoría');
  await sleep(400);
  const auditoriaClave = await mainText();
  check(
    'La auditoría registra el cambio de contraseña sin exponerla',
    auditoriaClave.includes('Cambió su propia contraseña') && !auditoriaClave.includes(NUEVA_CLAVE),
    auditoriaClave.slice(0, 200).replace(/\s+/g, ' ')
  );
  await logout();

  // ================================================================ 8b-bis. Varios contactos en un mismo lead
  await mustLogin(DEMO.manager);
  await tab('Gerencia');
  await clickText('main button', 'Contactos');
  await sleep(500);
  await page.evaluate(() => {
    const fila = [...document.querySelectorAll('main tbody tr')].find((tr) => tr.innerText.includes('Héctor Navarro'));
    if (!fila) throw new Error('No se encontró el lead de Bodegas Central Express');
    // "Editar" es un botón de solo ícono: se ubica por su aria-label
    fila.querySelector('button[aria-label^="Editar"]').click();
  });
  await sleep(500);
  await clickText('button', 'Agregar contacto');
  await sleep(300);
  await typeInto('#lc-c-name-0', 'Paula Vergara');
  await typeInto('#lc-c-job-0', 'Gerenta de Logística');
  await clickText('button', 'Guardar cambios');
  await sleep(700);
  const filaConContacto = await page.evaluate(
    () => [...document.querySelectorAll('main tbody tr')].find((tr) => tr.innerText.includes('Héctor Navarro'))?.innerText ?? ''
  );
  check('Se agrega otro contacto al mismo lead', filaConContacto.includes('contacto más'), filaConContacto.replace(/\s+/g, ' ').slice(0, 120));

  // La agenda junta en un solo lugar los seguimientos agendados de todo el CRM
  await tab('Registro de contacto');
  await sleep(500);
  const agenda = await mainText();
  check(
    'La agenda reúne los seguimientos agendados sin abrir lead por lead',
    agenda.includes('Agenda de seguimientos') && /atrasados/i.test(agenda) && agenda.includes('Banco Andes Sucursales'),
    agenda.replace(/\s+/g, ' ').slice(0, 300)
  );
  await clickText('main button', 'Mes');
  await sleep(400);
  const diasConAgenda = await page.evaluate(
    () => [...document.querySelectorAll('main button[aria-label*="agendados"]')].filter((b) => !b.disabled).length
  );
  check('El calendario del mes marca los días con seguimientos', diasConAgenda > 0, `días marcados: ${diasConAgenda}`);
  await clickText('main button', 'Historial');
  await sleep(400);

  // La bitácora deja registrado con cuál de las personas se habló
  await tagElement(() => document.querySelector('main select'), 'e2e-contact-lead');
  await selectByText('#e2e-contact-lead', 'Héctor Navarro', true);
  await sleep(400);
  const opcionesContacto = await page.evaluate(() =>
    [...(document.querySelector('#contact-person')?.options ?? [])].map((o) => o.text).join(' | ')
  );
  check(
    'El registro de contacto deja elegir con quién se habló',
    opcionesContacto.includes('Héctor Navarro') && opcionesContacto.includes('Paula Vergara'),
    opcionesContacto
  );
  // Alta rápida de otra persona sin salir del módulo, en plena toma de contacto
  await clickText('main button', 'Agregar contacto de esta empresa');
  await sleep(400);
  await typeInto('#nc-name', 'Karla Mora E2E');
  await typeInto('#nc-job', 'Encargada de Pagos');
  // Por el botón del formulario: "Agregar contacto" también aparece en el que abre el modal
  await domClick('button[form="nuevo-contacto-form"]');
  await sleep(700);
  const trasAgregar = await page.evaluate(() => ({
    opciones: [...(document.querySelector('#contact-person')?.options ?? [])].map((o) => o.text).join(' | '),
    elegido: document.querySelector('#contact-person')?.value ?? '',
  }));
  check(
    'Se agrega un contacto desde la toma de contacto y queda elegido',
    trasAgregar.opciones.includes('Karla Mora E2E') && trasAgregar.elegido === 'Karla Mora E2E',
    JSON.stringify(trasAgregar)
  );

  await page.select('#contact-person', 'Paula Vergara');
  await sleep(200);
  await tagElement(() => document.querySelector('main textarea'), 'e2e-contact-summary');
  await typeInto('#e2e-contact-summary', 'Contacto E2E con la segunda persona del lead');
  await clickText('main button', 'Guardar Interacción');
  await sleep(700);
  check(
    'La bitácora guarda con quién se habló',
    (await mainText()).includes('Con Paula Vergara'),
    (await mainText()).slice(0, 200).replace(/\s+/g, ' ')
  );

  // ============================================ 8b-quater. Derechos del titular (Ley 21.719)
  // El titular pide que borren sus datos: el lead se bloquea, el gerente resuelve y los datos
  // personales desaparecen sin romper las métricas del CRM.
  await tab('Registro de contacto');
  await sleep(500);
  const agendaAntes = await mainText();
  check(
    'Antes de la solicitud, el lead aparece en la agenda',
    agendaAntes.includes('Naviera Costa Verde'),
    agendaAntes.slice(0, 200).replace(/\s+/g, ' ')
  );

  await tab('Gerencia');
  await clickText('main button', 'Contactos');
  await sleep(500);
  await page.evaluate(() => {
    const fila = [...document.querySelectorAll('main tbody tr')].find((tr) => tr.innerText.includes('Álvaro Mendoza'));
    if (!fila) throw new Error('No se encontró el lead de Naviera Costa Verde');
    fila.querySelector('button[aria-label^="Registrar solicitud"]').click();
  });
  await sleep(400);
  await typeInto('#sp-detail', 'Pidió por correo que borráramos sus datos');
  await clickText('button', 'Registrar solicitud');
  await sleep(700);

  const filaBloqueada = await page.evaluate(
    () => [...document.querySelectorAll('main tbody tr')].find((tr) => tr.innerText.includes('Álvaro Mendoza'))?.innerText ?? ''
  );
  check(
    'La solicitud del titular bloquea el lead',
    /bloqueado/i.test(filaBloqueada),
    filaBloqueada.replace(/\s+/g, ' ').slice(0, 160)
  );
  const edicionBloqueada = await page.evaluate(
    () =>
      [...document.querySelectorAll('main tbody tr')]
        .find((tr) => tr.innerText.includes('Álvaro Mendoza'))
        ?.querySelector('button[aria-label^="Editar"]')?.disabled ?? false
  );
  check('Un lead bloqueado no se puede editar', edicionBloqueada);

  await tab('Registro de contacto');
  await sleep(500);
  check(
    'Un lead bloqueado sale de la agenda',
    !(await mainText()).includes('Naviera Costa Verde'),
    (await mainText()).slice(0, 200).replace(/\s+/g, ' ')
  );

  // El gerente resuelve: aprobar borra los datos personales y conserva la operación
  await tab('Gerencia');
  await clickText('main button', 'Contactos');
  await sleep(500);
  await page.evaluate(() => {
    const fila = [...document.querySelectorAll('main tbody tr')].find((tr) => tr.innerText.includes('Álvaro Mendoza'));
    fila.querySelector('button[aria-label^="Resolver la solicitud"]').click();
  });
  await sleep(400);
  check('La resolución advierte que el borrado no se puede deshacer', (await bodyText()).includes('No se puede deshacer'));
  await typeInto('#sp-note', 'Identidad verificada por correo');
  await clickText('button', 'Aprobar y eliminar');
  await sleep(800);

  const trasBorrar = await page.evaluate(() => ({
    quedaLaPersona: document.querySelector('main').innerText.includes('Álvaro Mendoza'),
    quedaElCorreo: document.querySelector('main').innerText.includes('amendoza@navieracostaverde.pe'),
    filaAnonima:
      [...document.querySelectorAll('main tbody tr')].find((tr) => tr.innerText.includes('Titular eliminado'))?.innerText ?? '',
  }));
  check(
    'Aprobar la solicitud borra los datos personales del titular',
    !trasBorrar.quedaLaPersona && !trasBorrar.quedaElCorreo && trasBorrar.filaAnonima.includes('Datos eliminados'),
    JSON.stringify(trasBorrar).slice(0, 220)
  );
  check(
    'La operación comercial se conserva tras el borrado',
    trasBorrar.filaAnonima.includes('Naviera Costa Verde'),
    trasBorrar.filaAnonima.replace(/\s+/g, ' ').slice(0, 160)
  );

  await tab('Auditoría');
  await sleep(500);
  const auditoriaPrivacidad = await mainText();
  // Opción A: el historial registra que un dato personal cambió, nunca su valor
  const detalleAuditoria = await page.evaluate(async () => {
    for (const b of [...document.querySelectorAll('main button')].filter((x) => /^Ver \d+ cambio/.test(x.textContent.trim()))) {
      b.click();
    }
    await new Promise((r) => setTimeout(r, 300));
    return document.querySelector('main').innerText;
  });
  check(
    'La auditoría muestra que un dato personal cambió, sin guardar su valor',
    detalleAuditoria.includes('dato personal, el valor no se guarda') &&
      !detalleAuditoria.includes('Paula Vergara') &&
      !detalleAuditoria.includes('Karla Mora E2E'),
    detalleAuditoria.slice(0, 260).replace(/\s+/g, ' ')
  );
  check(
    'El borrado queda en la auditoría sin exponer los datos borrados',
    auditoriaPrivacidad.includes('Solicitud aprobada') && !auditoriaPrivacidad.includes('amendoza@navieracostaverde.pe'),
    auditoriaPrivacidad.slice(0, 200).replace(/\s+/g, ' ')
  );

  // Prospecto: en el primer contacto el vendedor tiene que registrar qué respondió la persona
  await tab('Registro de contacto');
  await sleep(500);
  await tagElement(() => document.querySelector('main select'), 'e2e-prospecto');
  await selectByText('#e2e-prospecto', 'Rosa Anticona', true);
  await sleep(400);
  check(
    'El prospecto avisa que aún no sabe que tenemos sus datos y cuántos días quedan',
    /Prospecto: aún no sabe que tenemos sus datos/.test(await mainText()),
    (await mainText()).slice(0, 200).replace(/\s+/g, ' ')
  );
  await tagElement(() => document.querySelector('main textarea'), 'e2e-prospecto-resumen');
  await typeInto('#e2e-prospecto-resumen', 'Primera llamada: se le explicó que guardamos sus datos');
  await clickText('main button', 'Guardar Interacción');
  await sleep(400);
  check(
    'No deja registrar el primer contacto sin la respuesta del prospecto',
    (await page.evaluate(() => document.querySelector('#first-contact-error')?.textContent ?? '')).includes('respondió')
  );
  await page.select('#first-contact-answer', 'granted');
  await clickText('main button', 'Guardar Interacción');
  await sleep(700);
  const trasPrimerContacto = await page.evaluate(() => ({
    sigueProspecto: document.querySelector('main').innerText.includes('Prospecto: aún no sabe que tenemos sus datos'),
    lead: document.querySelector('#e2e-prospecto')?.selectedOptions[0]?.text ?? '',
  }));
  check(
    'Con la respuesta registrada, deja de ser prospecto y el contacto avanza la etapa',
    !trasPrimerContacto.sigueProspecto && /CONTACTED/.test(trasPrimerContacto.lead),
    JSON.stringify(trasPrimerContacto)
  );

  // La captura exige elegir de dónde salió el dato y por qué se puede guardar
  await clickText('header button', 'Capturar Lead');
  await sleep(600);
  const capturaPrivacidad = await page.evaluate(() => ({
    origen: [...(document.querySelector('#cap-origin')?.options ?? [])].map((o) => o.text).join(' | '),
    base: [...(document.querySelector('#cap-consent')?.options ?? [])].map((o) => o.text).join(' | '),
    origenVacio: document.querySelector('#cap-origin')?.value === '',
    baseVacia: document.querySelector('#cap-consent')?.value === '',
  }));
  check(
    'La captura pide el origen y la base del dato, sin respuesta marcada',
    capturaPrivacidad.origen.includes('Formulario web') &&
      capturaPrivacidad.base.includes('pidió cotización') &&
      capturaPrivacidad.base.includes('Prospecto') &&
      capturaPrivacidad.origenVacio &&
      capturaPrivacidad.baseVacia,
    JSON.stringify(capturaPrivacidad).slice(0, 240)
  );
  await typeInto('#cap-fullName', 'Lead sin base E2E');
  await typeInto('#cap-rawAddress', 'Av. Providencia 200');
  await page.select('#cap-commune', 't-providencia');
  await clickText('button', 'Guardar lead');
  await sleep(500);
  const erroresBase = await page.evaluate(() => ({
    origen: document.querySelector('#err-origin')?.textContent ?? '',
    base: document.querySelector('#err-consent')?.textContent ?? '',
  }));
  check(
    'Sin elegir origen y base, el lead no se guarda',
    erroresBase.origen.includes('salió') && erroresBase.base.includes('guardar'),
    JSON.stringify(erroresBase)
  );
  await clickText('button', 'Cancelar');
  await sleep(300);

  // ======================= 8b-quinquies. El usuario base pide, la gerencia resuelve
  // Separación de funciones: quien atiende al titular registra la solicitud, pero no puede
  // borrar por su cuenta. Un empleado solo no puede vaciar la base.
  await logout();
  await mustLogin(DEMO.agent);
  const pestanasAgente = await page.evaluate(() =>
    [...document.querySelectorAll('nav button')].map((b) => b.textContent.trim()).join(' | ')
  );
  check(
    'El usuario base no entra a Gerencia ni a la auditoría',
    !pestanasAgente.includes('Gerencia') && !pestanasAgente.includes('Auditoría'),
    pestanasAgente
  );

  await tab('Registro de contacto');
  await sleep(500);
  await tagElement(() => document.querySelector('main select'), 'e2e-priv-lead');
  await selectByText('#e2e-priv-lead', 'Rosa Anticona', true);
  await sleep(400);
  await clickText('main button', 'El titular pide algo sobre sus datos');
  await sleep(400);
  await typeInto('#sp-detail', 'Llamó pidiendo que no guardemos sus datos');
  await clickText('button', 'Registrar solicitud');
  await sleep(700);
  const trasPedirAgente = await mainText();
  check(
    'El usuario base registra la solicitud del titular',
    /solicitud del titular pendiente|bloqueado/i.test(trasPedirAgente),
    trasPedirAgente.slice(0, 220).replace(/\s+/g, ' ')
  );
  await tab('Pipeline');
  await sleep(500);
  const tarjetaBloqueada = await page.evaluate(() => {
    const h = [...document.querySelectorAll('h4')].find((e) => e.textContent.includes('Corporación Salud Lima') &&
      e.parentElement?.innerText.includes('Rosa Anticona'));
    const card = h?.closest('div.rounded-xl');
    return {
      texto: card?.innerText ?? '',
      avanzar: [...(card?.querySelectorAll('button') ?? [])].some((b) => b.textContent.includes('Avanzar')),
      arrastrable: card?.getAttribute('draggable'),
    };
  });
  check(
    'En el Pipeline, el lead bloqueado se ve bloqueado y no se puede avanzar ni arrastrar',
    /Bloqueado/.test(tarjetaBloqueada.texto) && !tarjetaBloqueada.avanzar && tarjetaBloqueada.arrastrable === 'false',
    JSON.stringify(tarjetaBloqueada).slice(0, 220)
  );
  await tab('Registro de contacto');
  await sleep(400);
  await tagElement(() => document.querySelector('main select'), 'e2e-priv-lead');
  const opcionesTrasBloqueo = await page.evaluate(
    () => [...(document.querySelector('#e2e-priv-lead')?.options ?? [])].map((o) => o.text).join(' | ')
  );
  check(
    'El lead bloqueado sale del selector de contacto del usuario base',
    !opcionesTrasBloqueo.includes('Rosa Anticona'),
    opcionesTrasBloqueo.slice(0, 200)
  );

  await logout();
  await mustLogin(DEMO.manager);
  await tab('Gerencia');
  await clickText('main button', 'Contactos');
  await sleep(500);
  const gerenteVeSolicitud = await page.evaluate(
    () =>
      [...document.querySelectorAll('main tbody tr')]
        .find((tr) => tr.innerText.includes('Rosa Anticona'))
        ?.querySelector('button[aria-label^="Resolver la solicitud"]') !== null
  );
  check('Solo la gerencia ve el botón para resolver la solicitud', gerenteVeSolicitud);
  await logout();

  // ======================= 8b-sexies. Portal fiscalizador en el panel de administración
  await mustLogin(ADMIN);
  await clickText('main button', 'Portal fiscalizador');
  await sleep(700);
  const portal = await mainText();
  check(
    'El portal fiscalizador muestra la matriz completa y su advertencia',
    portal.includes('No acredita cumplimiento') &&
      portal.includes('Disposiciones evaluadas') &&
      /Sin evaluar\s*\n?\s*0/.test(portal),
    portal.slice(0, 240).replace(/\s+/g, ' ')
  );
  check(
    'El portal fiscalizador no expone datos personales de ningún CRM',
    !/@demo\.revelacrm|@piloto|Rosa Anticona|Carolina Peña|\+56 9|\+51 9/.test(portal),
    portal.slice(0, 200).replace(/\s+/g, ' ')
  );
  check(
    'El portal fiscalizador publica el manifiesto con hashes',
    portal.includes('Manifiesto del expediente') && /[0-9a-f]{16}…/.test(portal),
    portal.slice(-400).replace(/\s+/g, ' ')
  );
  await logout();
  await mustLogin(DEMO.manager);

  // ================================================================ 8c. Los KPI siguen al pipeline
  await tab('KPI y Mapa');
  const kpiAntes = await mainText();
  const ganadoAntes = kpiAntes.match(/Ganado\s+([^\n]+)/)?.[1] ?? '';
  const zonasAntes = await page.evaluate(() =>
    [...document.querySelectorAll('.zone-label')].map((e) => e.textContent).join(' / ')
  );

  // Se descarta un lead YA GANADO: el dinero ganado y el color de su zona tienen que bajar
  await tab('Pipeline');
  await page.evaluate(() => {
    const h = [...document.querySelectorAll('h4')].find((e) => e.textContent.includes('Centro Comercial Plaza Oriente'));
    if (!h) throw new Error('No se encontró el lead ganado de Centro Comercial Plaza Oriente');
    h.click();
  });
  await sleep(400);
  await page.evaluate(() => {
    const h = [...document.querySelectorAll('h4')].find((e) => e.textContent.includes('Centro Comercial Plaza Oriente'));
    const card = h.closest('div.rounded-xl');
    [...card.querySelectorAll('button')].find((b) => b.textContent.includes('Descartar')).click();
  });
  await sleep(700);

  await tab('KPI y Mapa');
  const kpiDespues = await mainText();
  const ganadoDespues = kpiDespues.match(/Ganado\s+([^\n]+)/)?.[1] ?? '';
  check(
    'Descartar un lead ganado baja el KPI de Ganado',
    ganadoAntes !== '' && ganadoAntes !== ganadoDespues,
    `${ganadoAntes} → ${ganadoDespues}`
  );
  check(
    'El total de leads muestra el desglose por estado del pipeline',
    /en curso · \d+ ganad\w+ · \d+ descartad\w+/.test(kpiDespues),
    kpiDespues.slice(0, 160).replace(/\s+/g, ' ')
  );
  const zonasDespues = await page.evaluate(() =>
    [...document.querySelectorAll('.zone-label')].map((e) => e.textContent).join(' / ')
  );
  check('El mapa repinta la zona que dejó de tener cierres', zonasAntes !== zonasDespues, `${zonasAntes}\n    → ${zonasDespues}`);

  // El ranking de zonas líderes sigue a los botones "Colorear por" del mapa
  const tituloRanking = () =>
    page.evaluate(() => [...document.querySelectorAll('main h2')].map((h) => h.textContent).find((t) => t.includes('líderes')) ?? '');
  const porDinero = await tituloRanking();
  await clickText('main button', 'Leads cerrados');
  await sleep(400);
  const porCierres = await tituloRanking();
  check(
    'El ranking de zonas cambia con «Colorear por» ($ ganado / leads cerrados)',
    porDinero.includes('dinero') && porCierres.includes('leads cerrados'),
    `${porDinero} → ${porCierres}`
  );
  // Tras redibujar las zonas (cambió "Colorear por"), ninguna zona ni la leyenda tapan un punto.
  // Se mira con el mapa en Chile: en la vista de dos países los puntos de una ciudad se superponen entre sí.
  // Foco del mapa (no el filtro de países de arriba, que también dice "Chile" y lo desactivaría)
  const enfocarMapa = (pais) =>
    page.evaluate((p) => {
      const boton = [...document.querySelectorAll('main button')].find(
        (b) => b.textContent.trim() === p && !b.closest('section[aria-label="Filtro de países"]')
      );
      if (!boton) throw new Error(`No se encontró el foco de mapa "${p}"`);
      boton.click();
    }, pais);
  await enfocarMapa('Chile');
  await sleep(1500);
  await clickText('main button', '$ ganado');
  await sleep(500);
  const puntosTapados = await page.evaluate(() => {
    document.querySelector('.leaflet-container')?.scrollIntoView({ block: 'center' });
    const puntos = [...document.querySelectorAll('.leaflet-pane path')].filter((p) => p.getAttribute('fill-opacity') === '1');
    const tapados = [];
    for (const p of puntos) {
      const r = p.getBoundingClientRect();
      if (r.width === 0) continue; // fuera del área visible
      const encima = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (encima === p || encima?.getAttribute?.('fill-opacity') === '1') continue; // el punto u otro punto
      tapados.push(encima?.tagName === 'path' ? 'una zona' : 'la leyenda u otro elemento');
    }
    return tapados;
  });
  check('Los puntos del mapa quedan sobre las zonas y la leyenda (se pueden clickear)', puntosTapados.length === 0, puntosTapados.join(', '));
  await enfocarMapa('Todos');

  // Las tablas de Gerencia caben sin barra horizontal en un notebook (1024 px, zoom de Windows incluido)
  await page.setViewport({ width: 1024, height: 800 });
  await tab('Gerencia');
  const desbordes = [];
  for (const seccion of ['Empresas cliente', 'Contactos', 'Catálogo', 'Usuarios']) {
    await clickText('main button', seccion);
    await sleep(350);
    const medida = await page.evaluate(() => {
      const caja = document.querySelector('main .overflow-x-auto');
      return caja ? { total: caja.scrollWidth, visible: caja.clientWidth } : null;
    });
    if (medida && medida.total > medida.visible + 1) desbordes.push(`${seccion} (${medida.total}/${medida.visible})`);
  }
  check('Las tablas de Gerencia no necesitan barra horizontal a 1024 px', desbordes.length === 0, desbordes.join(', '));
  await page.setViewport({ width: 1600, height: 1000 });

  await logout().catch(() => {});
  await mustLogin(GEO.manager);

  // ================================================================ 9. Auditoría: volver atrás un cambio
  await tab('Gerencia');
  await clickText('main button', 'Empresas cliente');
  await sleep(400);
  await domClick('main tbody tr button[aria-label^="Editar"]');
  await sleep(400);
  await typeInto('#acc-industry', 'Rubro Temporal E2E');
  await clickText('button', 'Guardar cambios');
  await sleep(600);
  const industryAfterEdit = await mainText();
  check('El cambio se aplicó antes de revertir', industryAfterEdit.includes('Rubro Temporal E2E'));

  await tab('Auditoría');
  await sleep(400);
  const auditRows = await page.evaluate(() => document.querySelectorAll('main tbody tr').length);
  // El cambio recién hecho es el primero del historial (el detalle muestra el campo, no el valor)
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('main tbody tr')].find(
      (tr) => tr.innerText.includes('Volver atrás') && tr.innerText.includes('Empresa cliente')
    );
    if (!row) throw new Error('No hay ningún cambio reversible de empresa cliente en el historial');
    [...row.querySelectorAll('button')].find((b) => b.textContent.includes('Volver atrás')).click();
  });
  await sleep(400);
  await clickText('button', 'Restaurar como estaba');
  await sleep(600);
  const revertStatus = await page.evaluate(() => document.querySelector('[role=status]')?.textContent ?? '');
  check('Volver atrás restaura el valor anterior', revertStatus.includes('Se restauró'), revertStatus);

  await tab('Gerencia');
  await clickText('main button', 'Empresas cliente');
  await sleep(500);
  check('El dato revertido ya no aparece en Gerencia', !(await mainText()).includes('Rubro Temporal E2E'));

  await tab('Auditoría');
  await sleep(400);
  const afterRevert = await mainText();
  check(
    'La reversión queda registrada y el cambio original se marca como revertido',
    afterRevert.includes('Revirtió') && afterRevert.includes('Revertido por'),
    afterRevert.slice(0, 200).replace(/\s+/g, ' ')
  );
  const auditRowsAfter = await page.evaluate(() => document.querySelectorAll('main tbody tr').length);
  check('El historial nunca se borra: solo se agregan registros', auditRowsAfter > auditRows, `${auditRows} → ${auditRowsAfter}`);
} catch (error) {
  const shot = `e2e-fallo-${Date.now()}.png`;
  await page.screenshot({ path: shot }).catch(() => {});
  check('La prueba se ejecutó completa', false, `${error.stack ?? String(error)}\n    Captura: ${shot}`);
} finally {
  await page.evaluate(() => {
    localStorage.removeItem('revela-session');
    sessionStorage.clear();
  }).catch(() => {});
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
for (const warning of warnings) console.log(`⚠ ${warning}`);
console.log(`\n${results.length - failed.length}/${results.length} verificaciones de aislamiento OK`);
process.exit(failed.length ? 1 : 0);
