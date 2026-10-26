// Genera los diagramas del software (arquitectura, componentes y estados) en SVG y PNG.
// Ejecutar: npm run diagramas    →    docs/diagramas/*.svg y *.png
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const OUT = 'docs/diagramas';
mkdirSync(OUT, { recursive: true });

// ------------------------------------------------------------------ utilidades de dibujo
const COLORS = {
  bg: '#F8FAFC',
  band: '#EEF2FF',
  bandBorder: '#C7D2FE',
  box: '#FFFFFF',
  boxBorder: '#94A3B8',
  primary: '#4F46E5',
  primarySoft: '#E0E7FF',
  text: '#0F172A',
  muted: '#475569',
  green: '#059669',
  greenSoft: '#D1FAE5',
  amber: '#B45309',
  amberSoft: '#FEF3C7',
  red: '#DC2626',
  redSoft: '#FEE2E2',
  slate: '#64748B',
  slateSoft: '#E2E8F0',
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Parte un texto en líneas que quepan en el ancho dado (aproximación por ancho de carácter)
const wrap = (text, maxChars) => {
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > maxChars && line) {
      lines.push(line.trim());
      line = word;
    } else {
      line = `${line} ${word}`;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
};

const text = (x, y, content, { size = 15, weight = 400, fill = COLORS.text, anchor = 'middle', family } = {}) =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" font-family="${
    family ?? "'Segoe UI', system-ui, sans-serif"
  }">${esc(content)}</text>`;

const box = ({ x, y, w, h, title, subtitle, fill = COLORS.box, border = COLORS.boxBorder, titleSize = 15, radius = 10 }) => {
  const parts = [`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${border}" stroke-width="1.5"/>`];
  const titleLines = wrap(title, Math.floor(w / (titleSize * 0.52)));
  const hasSub = Boolean(subtitle);
  const blockHeight = titleLines.length * (titleSize + 3) + (hasSub ? 16 : 0);
  let cursor = y + h / 2 - blockHeight / 2 + titleSize;
  for (const line of titleLines) {
    parts.push(text(x + w / 2, cursor, line, { size: titleSize, weight: 600 }));
    cursor += titleSize + 3;
  }
  if (hasSub) {
    for (const line of wrap(subtitle, Math.floor(w / 6.2)).slice(0, 2)) {
      parts.push(text(x + w / 2, cursor + 2, line, { size: 12, fill: COLORS.muted }));
      cursor += 14;
    }
  }
  return parts.join('\n');
};

const band = ({ x, y, w, h, label, note }) =>
  [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${COLORS.band}" stroke="${COLORS.bandBorder}" stroke-width="1.5"/>`,
    text(x + 16, y + 24, label, { size: 14, weight: 700, fill: COLORS.primary, anchor: 'start' }),
    note ? text(x + w - 16, y + 24, note, { size: 12, fill: COLORS.muted, anchor: 'end' }) : '',
  ].join('\n');

const arrow = (x1, y1, x2, y2, { dashed = false, color = COLORS.slate, label, labelDy = -6, curve = 0 } = {}) => {
  const path = curve
    ? `M ${x1} ${y1} Q ${(x1 + x2) / 2} ${(y1 + y2) / 2 + curve} ${x2} ${y2}`
    : `M ${x1} ${y1} L ${x2} ${y2}`;
  const parts = [
    `<path d="${path}" fill="none" stroke="${color}" stroke-width="1.8" ${
      dashed ? 'stroke-dasharray="6 5"' : ''
    } marker-end="url(#punta-${color.replace('#', '')})"/>`,
  ];
  if (label) {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2 + curve / 2 + labelDy;
    const width = label.length * 6.4 + 12;
    parts.push(`<rect x="${mx - width / 2}" y="${my - 12}" width="${width}" height="17" rx="5" fill="${COLORS.bg}" opacity="0.95"/>`);
    parts.push(text(mx, my, label, { size: 11.5, fill: COLORS.muted }));
  }
  return parts.join('\n');
};

// Flecha en L: se rutea por los márgenes para no cruzar otras cajas
const elbow = (points, { color = COLORS.slate, dashed = false, label, labelAt, marker = true } = {}) => {
  const d = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
  const parts = [
    `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.8" ${
      dashed ? 'stroke-dasharray="6 5"' : ''
    } ${marker ? `marker-end="url(#punta-${color.replace('#', '')})"` : ''}/>`,
  ];
  if (label && labelAt) {
    const width = label.length * 6.4 + 14;
    parts.push(`<rect x="${labelAt[0] - width / 2}" y="${labelAt[1] - 12}" width="${width}" height="18" rx="5" fill="${COLORS.bg}" opacity="0.97"/>`);
    parts.push(text(labelAt[0], labelAt[1] + 1, label, { size: 11.5, fill: COLORS.muted }));
  }
  return parts.join('\n');
};

const markers = () =>
  [COLORS.slate, COLORS.primary, COLORS.green, COLORS.red, COLORS.amber]
    .map(
      (c) =>
        `<marker id="punta-${c.replace('#', '')}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
           <path d="M 0 0 L 10 5 L 0 10 z" fill="${c}"/>
         </marker>`
    )
    .join('\n');

const svgDoc = (width, height, title, subtitle, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs>${markers()}</defs>
<rect width="${width}" height="${height}" fill="${COLORS.bg}"/>
${text(width / 2, 38, title, { size: 25, weight: 700 })}
${text(width / 2, 62, subtitle, { size: 14, fill: COLORS.muted })}
${body}
</svg>`;

// ------------------------------------------------------------------ 0. Arquitectura desacoplada
// Tarjeta con título y texto de varias líneas (para las notas al pie de los diagramas)
const card = ({ x, y, w, h, title, lines, accent = COLORS.primary }) => {
  const parts = [
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#FFFFFF" stroke="${COLORS.boxBorder}" stroke-width="1.5"/>`,
    text(x + 18, y + 30, title, { size: 15, weight: 700, anchor: 'start', fill: accent }),
  ];
  let cursor = y + 56;
  for (const line of lines.flatMap((l) => wrap(l, Math.floor((w - 36) / 6.9)))) {
    parts.push(text(x + 18, cursor, line, { size: 13, anchor: 'start', fill: COLORS.muted }));
    cursor += 19;
  }
  return parts.join('\n');
};

function diagramaArquitectura() {
  const W = 1680;
  const H = 870;
  const p = [];

  // Usuarios
  p.push(band({ x: 40, y: 90, w: 250, h: 520, label: 'USUARIOS', note: 'navegador' }));
  [
    ['Administrador', 'crea CRMs y exporta'],
    ['Gerente', 'KPI, gerencia, auditoría'],
    ['Usuario base', 'captura y pipeline'],
  ].forEach(([t, s], i) => p.push(box({ x: 64, y: 150 + i * 140, w: 202, h: 96, title: t, subtitle: s, titleSize: 15 })));

  // Frontend en hosting
  p.push(band({ x: 330, y: 90, w: 470, h: 520, label: 'FRONTEND · hosting web', note: 'archivos estáticos' }));
  p.push(box({ x: 356, y: 134, w: 418, h: 112, title: 'Aplicación web (SPA)', subtitle: 'React 19 + TypeScript + Tailwind · módulos por perfil', titleSize: 17, fill: COLORS.primarySoft, border: COLORS.primary }));
  p.push(box({ x: 356, y: 270, w: 200, h: 96, title: 'Leaflet', subtitle: 'mapa, puntos y zonas', titleSize: 15 }));
  p.push(box({ x: 574, y: 270, w: 200, h: 96, title: 'supabase-js', subtitle: 'cliente de datos y login', titleSize: 15 }));
  p.push(box({ x: 356, y: 390, w: 418, h: 96, title: 'Build de Vite', subtitle: 'HTML, JS y CSS listos para subir a cualquier hosting', titleSize: 15 }));
  p.push(text(565, 520, 'Se descarga una vez y corre en el navegador del usuario', { size: 12.5, fill: COLORS.muted }));
  p.push(text(565, 544, 'Ej.: cPanel o Vercel', { size: 12.5, fill: COLORS.muted }));

  // Backend Supabase
  p.push(band({ x: 840, y: 90, w: 470, h: 520, label: 'BACKEND · Supabase (nube)', note: 'plan gratuito en el piloto' }));
  p.push(text(1075, 544, '11 migraciones escritas y validadas, aún sin conectar', { size: 12.5, fill: COLORS.muted }));
  p.push(box({ x: 866, y: 134, w: 200, h: 96, title: 'Supabase Auth', subtitle: 'login y sesiones', titleSize: 15, fill: COLORS.greenSoft, border: COLORS.green }));
  p.push(box({ x: 1084, y: 134, w: 200, h: 96, title: 'API REST + RLS', subtitle: 'cada CRM ve solo sus datos', titleSize: 15, fill: COLORS.greenSoft, border: COLORS.green }));
  p.push(box({ x: 866, y: 254, w: 418, h: 112, title: 'PostgreSQL + PostGIS', subtitle: 'leads, empresas, contactos y auditoría · zonas como polígonos', titleSize: 17, fill: COLORS.greenSoft, border: COLORS.green }));
  p.push(box({ x: 866, y: 390, w: 418, h: 112, title: 'Edge Functions', subtitle: 'asistente IA · tipo de cambio · búsqueda de empresas', titleSize: 17, fill: COLORS.greenSoft, border: COLORS.green }));
  p.push(arrow(1184, 230, 1184, 252, { color: COLORS.green }));

  // Servicios externos
  p.push(band({ x: 1350, y: 90, w: 290, h: 520, label: 'SERVICIOS EXTERNOS', note: '' }));
  const externos = [
    ['OpenAI (GPT)', 'asistente de prospección'],
    ['Google Places', 'empresas reales'],
    ['Banco Central de Chile', 'dólar observado'],
    ['ExchangeRate-API', 'otras monedas'],
    ['Esri', 'mapa base'],
  ];
  externos.forEach(([t, s], i) =>
    p.push(box({ x: 1372, y: 128 + i * 94, w: 246, h: 76, title: t, subtitle: s, titleSize: 14, fill: COLORS.amberSoft, border: COLORS.amber }))
  );

  // Flujos
  p.push(arrow(292, 350, 328, 350, { color: COLORS.slate, label: 'HTTPS', labelDy: -10 }));
  p.push(arrow(802, 182, 838, 182, { color: COLORS.primary, label: 'login', labelDy: -10 }));
  p.push(arrow(838, 318, 802, 318, { color: COLORS.primary }));
  p.push(arrow(802, 306, 838, 306, { color: COLORS.primary, label: 'datos', labelDy: -8 }));
  // Edge Functions → proveedores con API key (entran por el borde izquierdo de cada caja)
  p.push(elbow([[1286, 420], [1330, 420], [1330, 166], [1370, 166]], { color: COLORS.amber }));
  p.push(elbow([[1330, 260], [1370, 260]], { color: COLORS.amber }));
  p.push(elbow([[1286, 448], [1370, 448]], { color: COLORS.amber }));
  p.push(elbow([[1346, 448], [1346, 354], [1370, 354]], { color: COLORS.amber }));
  // Leaflet → Esri: sale por el margen izquierdo de la banda y pasa por debajo de todas
  p.push(elbow([[356, 318], [344, 318], [344, 638], [1495, 638], [1495, 582]], { color: COLORS.amber, label: 'mapa base (teselas)', labelAt: [900, 638] }));

  // Por qué desacoplado
  const cards = [
    ['Costo', ['El frontend son archivos estáticos: hosting barato o gratis.', 'Supabase tiene plan gratuito para el piloto.'], COLORS.green],
    ['Seguridad', ['Las API keys viven en el backend, nunca en el navegador.', 'RLS aísla cada CRM dentro de la misma base.'], COLORS.primary],
    ['Mantención', ['Cada parte se cambia por separado: otro hosting no toca la base, y viceversa.'], COLORS.primary],
    ['Estado hoy', ['Corre en local con datos de ejemplo. El asistente y el tipo de cambio corren dentro de Vite y pasan a Edge Functions al desplegar.'], COLORS.amber],
  ];
  p.push(text(40, 690, '¿Por qué desacoplado?', { size: 17, weight: 700, anchor: 'start' }));
  cards.forEach(([t, lines, accent], i) => p.push(card({ x: 40 + i * 405, y: 708, w: 385, h: 132, title: t, lines, accent })));

  return svgDoc(W, H, 'Revela · Arquitectura', 'Frontend en un hosting web y backend en Supabase: desacoplados para bajar costos', p.join('\n'));
}

// ------------------------------------------------------------------ 1. Diagrama de componentes
function diagramaComponentes() {
  const W = 1680;
  const H = 1150;
  const p = [];
  const col = (i) => 60 + i * 226; // 7 columnas de 206 px

  // Banda 1: navegador
  p.push(band({ x: 40, y: 84, w: 1600, h: 600, label: 'NAVEGADOR (React 19 + TypeScript + Vite)', note: 'src/' }));
  p.push(box({ x: 660, y: 112, w: 360, h: 58, title: 'App.tsx — orquestador', subtitle: 'sesión, CRM, países, moneda y estado', fill: COLORS.primarySoft, border: COLORS.primary }));

  // Módulos (pestañas). "Estados" está construido pero su pestaña está oculta durante el piloto.
  const modulos = [
    ['KPI y Mapa', 'GeoStrategicMap · RankingSidebar'],
    ['Pipeline', 'KanbanBoard'],
    ['Registro de contacto', 'ContactModule · AgendaPanel'],
    ['Gerencia', 'Empresas · Catálogo · Usuarios'],
    ['Auditoría', 'AuditModule'],
    ['Administración', 'AdminModule · exportación'],
    ['Estados (oculto)', 'StageAdminModule'],
  ];
  modulos.forEach(([titulo, sub], i) => {
    const oculto = i === modulos.length - 1;
    p.push(box({ x: col(i), y: 202, w: 206, h: 70, title: titulo, subtitle: sub, titleSize: 14, fill: oculto ? COLORS.slateSoft : COLORS.box }));
    p.push(arrow(840, 170, col(i) + 103, 200, { color: oculto ? COLORS.slate : COLORS.primary, dashed: oculto, curve: i < 3 ? 18 : i > 3 ? -18 : 0 }));
  });

  const compartidos = [
    ['Navbar', 'pestañas · moneda de la vista'],
    ['CountryBar', 'filtro de países'],
    ['LeadCaptureModal', 'captura · moneda del lead'],
    ['LeadItemsEditor', 'productos y precios'],
    ['LeadContactsEditor', 'otros contactos del lead'],
    ['CatalogInsights', '¿dónde se vende?'],
    ['AiChatWidget', 'asistente IA'],
  ];
  p.push(text(60, 306, 'Componentes compartidos', { size: 13, weight: 700, fill: COLORS.muted, anchor: 'start' }));
  compartidos.forEach(([titulo, sub], i) => {
    p.push(box({ x: col(i), y: 316, w: 206, h: 62, title: titulo, subtitle: sub, titleSize: 13.5, fill: '#FFFFFF' }));
  });

  const libs1 = [
    ['tenantGuards.ts', 'aislamiento y reglas'],
    ['audit.ts', 'historial de cambios'],
    ['catalog.ts', 'productos y ventas'],
    ['currency.ts', 'moneda de cada lead'],
    ['metrics.ts', 'resultados por zona'],
    ['agenda.ts', 'seguimientos'],
    ['contacts.ts', 'contactos del lead'],
  ];
  const libs2 = [
    ['geocoding.ts', 'ubicar en zona'],
    ['aiLeadMatch.ts', 'la IA encuentra leads'],
    ['aiSafety.ts', 'límites de la IA'],
    ['tenantExport.ts', 'Excel del CRM'],
    ['data/countries.ts', 'países, zonas y monedas'],
    ['money.ts', 'vista en una moneda'],
    ['permissions.ts', 'roles y pestañas'],
  ];
  p.push(text(60, 412, 'Lógica de negocio — src/lib y src/data (funciones puras, con pruebas)', { size: 13, weight: 700, fill: COLORS.muted, anchor: 'start' }));
  libs1.forEach(([titulo, sub], i) => p.push(box({ x: col(i), y: 422, w: 206, h: 62, title: titulo, subtitle: sub, titleSize: 13.5, fill: COLORS.slateSoft })));
  libs2.forEach(([titulo, sub], i) => p.push(box({ x: col(i), y: 500, w: 206, h: 62, title: titulo, subtitle: sub, titleSize: 13.5, fill: COLORS.slateSoft })));
  p.push(arrow(840, 378, 840, 420, { color: COLORS.primary }));

  p.push(box({ x: 60, y: 596, w: 884, h: 62, title: 'src/data/mockGeoData.ts', subtitle: 'cuenta demo en memoria · CRMs de prueba en testTenants.ts, solo en desarrollo', titleSize: 13.5, fill: COLORS.slateSoft }));
  p.push(arrow(500, 564, 500, 594, { color: COLORS.primary }));

  // Banda 2: base de datos (bajo los datos en memoria que va a reemplazar)
  p.push(band({ x: 40, y: 712, w: 800, h: 150, label: 'BASE DE DATOS — Supabase (preparada, sin conectar)', note: '11 migraciones' }));
  p.push(box({ x: 70, y: 746, w: 240, h: 92, title: 'PostgreSQL + PostGIS', subtitle: '16 tablas · zonas como polígonos', titleSize: 13.5, fill: COLORS.greenSoft, border: COLORS.green }));
  p.push(box({ x: 326, y: 746, w: 240, h: 92, title: 'RLS + triggers', subtitle: 'aislamiento entre CRMs, países y monedas', titleSize: 13.5, fill: COLORS.greenSoft, border: COLORS.green }));
  p.push(box({ x: 582, y: 746, w: 228, h: 92, title: 'Supabase Auth', subtitle: 'usuarios y contraseñas', titleSize: 13.5, fill: COLORS.greenSoft, border: COLORS.green }));

  // Banda 3: servidor (Node dentro de Vite; al desplegar pasa a Edge Functions)
  p.push(band({ x: 860, y: 712, w: 780, h: 150, label: 'SERVIDOR (Node dentro de Vite)', note: 'server/' }));
  p.push(box({ x: 880, y: 746, w: 240, h: 92, title: 'leadSearch.ts', subtitle: 'empresas por rubro y zona', titleSize: 14 }));
  p.push(box({ x: 1140, y: 746, w: 240, h: 92, title: 'exchangeRates.ts', subtitle: '/api/rates · tipo de cambio del día', titleSize: 14 }));
  p.push(box({ x: 1400, y: 746, w: 220, h: 92, title: 'aiChat.ts', subtitle: '/api/ai · la API key no llega al navegador', titleSize: 14 }));

  // Banda 4: servicios externos
  p.push(band({ x: 40, y: 890, w: 1600, h: 150, label: 'SERVICIOS EXTERNOS', note: 'HTTPS' }));
  const externos = [
    ['Esri Canvas', 'mapa base · GeoStrategicMap'],
    ['write-excel-file', 'genera el .xlsx'],
    ['Google Places', 'empresas reales'],
    ['Banco Central de Chile', 'dólar observado (mindicador.cl)'],
    ['ExchangeRate-API', 'resto de monedas'],
    ['OpenAI (GPT)', 'modelo del asistente'],
  ];
  const ex = (i) => 64 + i * 262;
  externos.forEach(([titulo, sub], i) => {
    p.push(box({ x: ex(i), y: 924, w: 240, h: 92, title: titulo, subtitle: sub, titleSize: 14, fill: COLORS.amberSoft, border: COLORS.amber }));
  });

  // Conexiones reales entre bandas
  // Asistente IA → proxy del servidor, por el margen derecho
  p.push(elbow([[1622, 347], [1662, 347], [1662, 792], [1622, 792]], { color: COLORS.primary, label: 'consulta del asistente', labelAt: [1662, 698] }));
  // La vista en una moneda pide las tasas al servidor (money.ts está justo sobre exchangeRates.ts)
  p.push(arrow(1260, 562, 1260, 744, { color: COLORS.primary, label: 'pide las tasas', labelDy: 30 }));
  // Datos en memoria → base de datos (pendiente)
  p.push(arrow(500, 658, 500, 744, { dashed: true, color: COLORS.green, label: 'pendiente: reemplazar los datos en memoria', labelDy: -4 }));
  // Servidor → servicios externos
  // Cada línea tiene su propio carril horizontal para que no se crucen
  p.push(elbow([[1000, 838], [1000, 866], [ex(2) + 120, 866], [ex(2) + 120, 922]], { color: COLORS.amber }));
  p.push(elbow([[1180, 838], [1180, 880], [ex(3) + 120, 880], [ex(3) + 120, 922]], { color: COLORS.amber }));
  p.push(elbow([[1340, 838], [1340, 874], [ex(4) + 120, 874], [ex(4) + 120, 922]], { color: COLORS.amber }));
  p.push(elbow([[1510, 838], [1510, 876], [ex(5) + 120, 876], [ex(5) + 120, 922]], { color: COLORS.amber }));

  // Leyenda
  p.push(
    [
      `<rect x="40" y="1064" width="1600" height="62" rx="12" fill="#FFFFFF" stroke="${COLORS.boxBorder}"/>`,
      text(60, 1088, 'Leyenda:', { size: 13, weight: 700, anchor: 'start' }),
      `<line x1="140" y1="1083" x2="190" y2="1083" stroke="${COLORS.primary}" stroke-width="2"/>`,
      text(200, 1088, 'flujo implementado', { size: 13, fill: COLORS.muted, anchor: 'start' }),
      `<line x1="360" y1="1083" x2="410" y2="1083" stroke="${COLORS.green}" stroke-width="2" stroke-dasharray="6 5"/>`,
      text(420, 1088, 'preparado, aún no conectado', { size: 13, fill: COLORS.muted, anchor: 'start' }),
      `<line x1="640" y1="1083" x2="690" y2="1083" stroke="${COLORS.amber}" stroke-width="2"/>`,
      text(700, 1088, 'llamada a un servicio externo', { size: 13, fill: COLORS.muted, anchor: 'start' }),
      text(60, 1112, 'Estado: interfaz y reglas de negocio completas y probadas (167 verificaciones) · base de datos escrita en migraciones · persistencia real pendiente', {
        size: 13,
        fill: COLORS.muted,
        anchor: 'start',
      }),
    ].join('\n')
  );

  return svgDoc(W, H, 'Revela · Diagrama de componentes', 'Qué partes forman el sistema y cómo se comunican', p.join('\n'));
}

// ------------------------------------------------------------------ 2. Diagrama de estados del lead
function diagramaEstadosLead() {
  const W = 1780;
  const H = 880;
  const p = [];

  const etapas = [
    ['Nuevo Lead', '10% · SLA 1 día'],
    ['Toma de Contacto', '25% · SLA 2 días'],
    ['Calificado', '45% · SLA 4 días'],
    ['Propuesta', '70% · SLA 5 días'],
    ['Pago Pendiente', '90% · SLA 3 días'],
    ['Cerrado (Ganado)', '100% · estado final'],
  ];
  const transiciones = ['primer contacto', 'interés y presupuesto', 'cotización enviada', 'acuerdo cerrado', 'pago acreditado'];

  const bw = 216;
  const bh = 86;
  const y = 250;
  const gap = 44;

  // Estado inicial
  p.push(`<circle cx="60" cy="${y + bh / 2}" r="13" fill="${COLORS.text}"/>`);
  p.push(text(60, y + bh + 34, 'captura del lead', { size: 12, fill: COLORS.muted }));
  p.push(arrow(76, y + bh / 2, 96, y + bh / 2, { color: COLORS.slate }));

  etapas.forEach(([titulo, sub], i) => {
    const x = 98 + i * (bw + gap);
    const esGanado = i === etapas.length - 1;
    p.push(
      box({
        x,
        y,
        w: bw,
        h: bh,
        title: titulo,
        subtitle: sub,
        titleSize: 15,
        radius: 16,
        fill: esGanado ? COLORS.greenSoft : COLORS.box,
        border: esGanado ? COLORS.green : COLORS.boxBorder,
      })
    );
    if (i < etapas.length - 1) {
      p.push(arrow(x + bw, y + bh / 2, x + bw + gap, y + bh / 2, { color: COLORS.primary }));
      // La etiqueta va bajo la flecha: arriba pasan los arcos de retroceso
      p.push(text(x + bw + gap / 2, y + bh + 26, transiciones[i], { size: 11.5, fill: COLORS.muted }));
    }
    // Descarte: todas las etapas bajan a una misma línea y entran juntas a "Perdido"
    if (i < 5) {
      p.push(elbow([[x + bw / 2, y + bh], [x + bw / 2, 418], [840, 418]], { color: COLORS.red, marker: false }));
    }
    // Retroceso a la etapa anterior (solo gerencia)
    if (i > 0) {
      p.push(arrow(x + bw / 2, y, x - gap - bw / 2, y, { color: COLORS.amber, curve: -78 }));
    }
  });
  p.push(arrow(840, 418, 840, 468, { color: COLORS.red }));

  p.push(text(900, 150, 'Retroceder a la etapa anterior: solo gerencia', { size: 13, weight: 700, fill: COLORS.amber }));

  // Estado perdido
  p.push(box({ x: 640, y: 468, w: 400, h: 80, title: 'Perdido / Descartado', subtitle: '0% · estado final · se conserva para medir la conversión', titleSize: 16, radius: 16, fill: COLORS.redSoft, border: COLORS.red }));
  p.push(text(840, 585, 'no califica · sin respuesta · eligió a la competencia', { size: 12.5, fill: COLORS.muted }));

  // Estados finales (doble círculo)
  p.push(`<circle cx="1700" cy="${y + bh / 2}" r="15" fill="none" stroke="${COLORS.text}" stroke-width="2"/>`);
  p.push(`<circle cx="1700" cy="${y + bh / 2}" r="9" fill="${COLORS.text}"/>`);
  p.push(arrow(1616, y + bh / 2, 1682, y + bh / 2, { color: COLORS.slate }));
  p.push(`<circle cx="1120" cy="510" r="15" fill="none" stroke="${COLORS.text}" stroke-width="2"/>`);
  p.push(`<circle cx="1120" cy="510" r="9" fill="${COLORS.text}"/>`);
  p.push(arrow(1044, 510, 1102, 510, { color: COLORS.slate }));

  // Reglas
  const reglas = [
    ['Usuario base', 'Solo avanza: no puede retroceder ni sacar un lead de Ganado o Perdido.'],
    ['Gerente', 'Mueve el lead en cualquier dirección y revierte cambios desde Auditoría.'],
    ['Automático', 'Registrar un contacto puede avanzar la etapa. Un lead descartado sale de las métricas de zona.'],
    ['Control', 'La regla vive en el guard (sanitizeLeadUpdate + canChangeStage): vale igual para la pantalla y el asistente IA.'],
  ];
  p.push(`<rect x="40" y="636" width="1700" height="200" rx="14" fill="#FFFFFF" stroke="${COLORS.boxBorder}"/>`);
  p.push(text(64, 668, 'Reglas de transición', { size: 16, weight: 700, anchor: 'start' }));
  reglas.forEach(([titulo, detalle], i) => {
    const yy = 700 + i * 32;
    p.push(text(64, yy, `${titulo}:`, { size: 13.5, weight: 700, anchor: 'start', fill: COLORS.primary }));
    p.push(text(196, yy, detalle, { size: 13.5, anchor: 'start', fill: COLORS.muted }));
  });

  // Leyenda de colores
  p.push(`<line x1="1180" y1="663" x2="1230" y2="663" stroke="${COLORS.primary}" stroke-width="2"/>`);
  p.push(text(1240, 668, 'avance (usuario base y gerente)', { size: 12.5, fill: COLORS.muted, anchor: 'start' }));
  p.push(`<line x1="1180" y1="687" x2="1230" y2="687" stroke="${COLORS.amber}" stroke-width="2"/>`);
  p.push(text(1240, 692, 'retroceso (solo gerente)', { size: 12.5, fill: COLORS.muted, anchor: 'start' }));
  p.push(`<line x1="1180" y1="711" x2="1230" y2="711" stroke="${COLORS.red}" stroke-width="2"/>`);
  p.push(text(1240, 716, 'descarte del lead', { size: 12.5, fill: COLORS.muted, anchor: 'start' }));

  return svgDoc(W, H, 'Revela · Diagrama de estados del lead', 'Etapas del pipeline comercial, con probabilidad de cierre y SLA por etapa', p.join('\n'));
}

// ------------------------------------------------------------------ 3. Estados de las demás entidades
function diagramaEstadosEntidades() {
  const W = 1680;
  const H = 880;
  const p = [];

  // Grilla de 3 × 2 paneles de 520 × 350
  const PX = [40, 580, 1120];
  const PY = [84, 462];
  const PW = 520;
  const PH = 350;
  const BW = 180; // ancho de cada estado
  const BH = 70;

  const panel = (px, py, titulo) => {
    p.push(`<rect x="${px}" y="${py}" width="${PW}" height="${PH}" rx="14" fill="#FFFFFF" stroke="${COLORS.boxBorder}"/>`);
    p.push(text(px + 20, py + 32, titulo, { size: 16, weight: 700, anchor: 'start', fill: COLORS.primary }));
  };
  const estado = (x, y, titulo, sub, tono) => {
    const t = {
      verde: [COLORS.greenSoft, COLORS.green],
      ambar: [COLORS.amberSoft, COLORS.amber],
      rojo: [COLORS.redSoft, COLORS.red],
      azul: [COLORS.primarySoft, COLORS.primary],
      gris: [COLORS.slateSoft, COLORS.boxBorder],
      blanco: [COLORS.box, COLORS.boxBorder],
    }[tono];
    p.push(box({ x, y, w: BW, h: BH, title: titulo, subtitle: sub, radius: 16, fill: t[0], border: t[1] }));
  };
  // Par de estados con ida y vuelta: A a la izquierda, B a la derecha
  const par = (px, y, [ta, sa, ca], [tb, sb, cb], ida, vuelta, colorIda, colorVuelta) => {
    const ax = px + 24;
    const bx = px + PW - 24 - BW;
    estado(ax, y, ta, sa, ca);
    estado(bx, y, tb, sb, cb);
    p.push(arrow(ax + BW, y + 24, bx, y + 24, { color: colorIda, label: ida }));
    if (vuelta) p.push(arrow(bx, y + 48, ax + BW, y + 48, { color: colorVuelta, label: vuelta, labelDy: 20 }));
  };
  const nota = (px, py, lineas) =>
    lineas.forEach((l, i) => p.push(text(px + 20, py + 300 + i * 20, l, { size: 12.5, fill: COLORS.muted, anchor: 'start' })));

  // 1. Empresa cliente y producto del catálogo
  panel(PX[0], PY[0], 'Empresa cliente y producto');
  par(PX[0], PY[0] + 70, ['Activa', 'recibe nuevos leads', 'verde'], ['Desactivada', 'conserva su historial', 'ambar'], 'desactivar', 'activar', COLORS.amber, COLORS.green);
  estado(PX[0] + 24, PY[0] + 196, 'Eliminada', 'solo si nunca tuvo leads', 'rojo');
  p.push(arrow(PX[0] + 114, PY[0] + 140, PX[0] + 114, PY[0] + 194, { color: COLORS.red, label: 'eliminar', labelDy: 4 }));
  nota(PX[0], PY[0], ['Lo que tiene historial se desactiva, nunca se borra.', 'El gerente puede restaurar una eliminación.']);

  // 2. CRM de la empresa (tenant)
  panel(PX[1], PY[0], 'CRM de la empresa (tenant)');
  par(PX[1], PY[0] + 70, ['Activo', 'sus usuarios entran', 'verde'], ['Suspendido', 'sin acceso, datos intactos', 'rojo'], 'admin suspende', 'admin activa', COLORS.red, COLORS.green);
  par(PX[1], PY[0] + 196, ['Plan Nacional', 'un país y su moneda', 'blanco'], ['Plan Internacional', 'varios países y monedas', 'azul'], 'activar plan', 'desactivar', COLORS.primary, COLORS.slate);
  nota(PX[1], PY[0], ['Cada país habilitado suma su moneda para los leads.', 'Desactivar el plan oculta los datos, no los borra.']);

  // 3. Usuario del CRM
  panel(PX[2], PY[0], 'Usuario del CRM');
  par(PX[2], PY[0] + 70, ['Activo', 'puede iniciar sesión', 'verde'], ['Desactivado', 'no entra · historial intacto', 'gris'], 'desactivar', 'reactivar', COLORS.slate, COLORS.green);
  par(PX[2], PY[0] + 196, ['Usuario base', 'captura y avanza', 'blanco'], ['Gerente', 'administra su CRM', 'azul'], 'cambiar perfil', 'cambiar perfil', COLORS.primary, COLORS.slate);
  nota(PX[2], PY[0], ['Lo crea el gerente de su CRM o el administrador.', 'El gerente no puede desactivarse a sí mismo.']);

  // 4. Ubicación y valor del lead
  panel(PX[0], PY[1], 'Ubicación y valor del lead');
  par(PX[0], PY[1] + 70, ['Sin zona', 'no aparece en el mapa', 'ambar'], ['Ubicado', 'punto y resultados por zona', 'verde'], 'asignar zona', 'cambia de país', COLORS.green, COLORS.amber);
  par(PX[0], PY[1] + 196, ['Valor calculado', 'suma de sus productos', 'blanco'], ['Valor manual', 'queda con etiqueta', 'ambar'], 'editar a mano', 'recalcular', COLORS.amber, COLORS.slate);
  nota(PX[0], PY[1], ['La cola «Leads sin zona» de Gerencia junta los que', 'llegaron sin ubicación (importación o asistente IA).']);

  // 5. Seguimiento agendado
  panel(PX[1], PY[1], 'Seguimiento agendado (agenda)');
  par(PX[1], PY[1] + 70, ['Agendado', 'fecha por delante', 'azul'], ['Atrasado', 'ya pasó la fecha', 'rojo'], 'pasa la fecha', null, COLORS.red, null);
  estado(PX[1] + (PW - BW) / 2, PY[1] + 196, 'Atendido', 'sale de la agenda', 'verde');
  p.push(arrow(PX[1] + 114, PY[1] + 140, PX[1] + 200, PY[1] + 194, { color: COLORS.green, label: 'nuevo contacto', labelDy: 2 }));
  p.push(arrow(PX[1] + PW - 114, PY[1] + 140, PX[1] + PW - 200, PY[1] + 194, { color: COLORS.green }));
  nota(PX[1], PY[1], ['Un lead tiene un solo compromiso vigente: el de su', 'última interacción. Ganados y perdidos salen de la agenda.']);

  // 6. Entrada del historial de auditoría
  panel(PX[2], PY[1], 'Entrada de auditoría');
  estado(PX[2] + 24, PY[1] + 118, 'Registrada', 'quién, qué y cuándo', 'azul');
  estado(PX[2] + PW - 24 - BW, PY[1] + 70, 'Revertida', 'una sola vez', 'ambar');
  estado(PX[2] + PW - 24 - BW, PY[1] + 196, 'No reversible', 'creaciones y contactos', 'gris');
  p.push(arrow(PX[2] + 24 + BW, PY[1] + 140, PX[2] + PW - 24 - BW, PY[1] + 104, { color: COLORS.amber, label: 'revertir', labelDy: -8 }));
  p.push(arrow(PX[2] + 24 + BW, PY[1] + 166, PX[2] + PW - 24 - BW, PY[1] + 230, { color: COLORS.slate }));
  nota(PX[2], PY[1], ['Solo se agrega: nadie la edita ni la borra.', 'Revertir crea una entrada nueva y marca la original.']);

  p.push(text(W / 2, 848, 'Todas estas reglas están implementadas y cubiertas por pruebas automáticas (npm run test:tenant · test:e2e).', { size: 13, fill: COLORS.muted }));

  return svgDoc(W, H, 'Revela · Diagrama de estados de las entidades', 'Estados y transiciones del resto del sistema', p.join('\n'));
}

// ------------------------------------------------------------------ generación
const diagramas = [
  ['arquitectura-revela', diagramaArquitectura()],
  ['componentes-revela', diagramaComponentes()],
  ['estados-lead-revela', diagramaEstadosLead()],
  ['estados-entidades-revela', diagramaEstadosEntidades()],
];

for (const [nombre, svg] of diagramas) {
  writeFileSync(`${OUT}/${nombre}.svg`, svg, 'utf8');
  console.log(`✓ ${OUT}/${nombre}.svg`);
}

// PNG para pegar en PowerPoint (Chrome renderiza el SVG a doble resolución)
const puppeteer = require('puppeteer-core');
const CHROME_PATH = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true });
const page = await browser.newPage();
for (const [nombre, svg] of diagramas) {
  const [, w, h] = svg.match(/width="(\d+)" height="(\d+)"/).map(Number);
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  await page.goto(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`, { waitUntil: 'networkidle0' });
  await page.screenshot({ path: `${OUT}/${nombre}.png` });
  console.log(`✓ ${OUT}/${nombre}.png`);
}
await browser.close();
