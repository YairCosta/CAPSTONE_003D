// Diagramas UML 2 de las vistas 4+1 de Revela: clases, secuencia, estados, componentes, despliegue y casos de uso.
// Ejecutar: npm run diagramas:uml    →    docs/diagramas/uml-*.svg y *.png
// Dibujan el sistema tal como está publicado hoy; las cifras y nombres salen de src/types/crm.ts y de la arquitectura real.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const OUT = process.argv[2] ?? 'docs/diagramas';
const CHROME_PATH = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
mkdirSync(OUT, { recursive: true });

const C = {
  ink: '#0F172A', muted: '#475569', line: '#334155', head: '#E0E7FF', soft: '#F1F5F9', accent: '#3730A3',
  amber: '#B45309', amberSoft: '#FEF3C7', green: '#047857', greenSoft: '#D1FAE5', rose: '#9F1239', roseSoft: '#FFE4E6',
};
const FONT = "'Segoe UI', system-ui, sans-serif";
const MONO = "Consolas, 'Courier New', monospace";
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const t = (x, y, s, { size = 16, weight = 400, fill = C.ink, anchor = 'start', italic = false, mono = false } = {}) =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" font-style="${italic ? 'italic' : 'normal'}" font-family="${mono ? MONO : FONT}">${esc(s)}</text>`;
const ln = (pts, { dash = false, w = 2, color = C.line, end = null, start = null } = {}) => {
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
  return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" ${dash ? 'stroke-dasharray="8 6"' : ''} ${end ? `marker-end="url(#${end})"` : ''} ${start ? `marker-start="url(#${start})"` : ''}/>`;
};
const DEFS = `<defs>
<marker id="abierta" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="11" markerHeight="11" orient="auto"><path d="M1 1L11 6L1 11" fill="none" stroke="${C.line}" stroke-width="1.8"/></marker>
<marker id="solida" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="11" markerHeight="11" orient="auto"><path d="M0 0L12 6L0 12z" fill="${C.line}"/></marker>
<marker id="hueca" viewBox="0 0 14 14" refX="13" refY="7" markerWidth="14" markerHeight="14" orient="auto"><path d="M1 1L13 7L1 13z" fill="#fff" stroke="${C.line}" stroke-width="1.8"/></marker>
<marker id="rombo" viewBox="0 0 18 12" refX="1" refY="6" markerWidth="18" markerHeight="12" orient="auto-start-reverse"><path d="M1 6L9 1L17 6L9 11z" fill="${C.line}" stroke="${C.line}" stroke-width="1"/></marker>
<marker id="romboHueco" viewBox="0 0 18 12" refX="1" refY="6" markerWidth="18" markerHeight="12" orient="auto-start-reverse"><path d="M1 6L9 1L17 6L9 11z" fill="#fff" stroke="${C.line}" stroke-width="1.6"/></marker>
</defs>`;
const lienzo = (W, H, tag, nombre, cuerpo) => {
  const wTab = (tag.length + nombre.length) * 9.4 + 46;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${DEFS}<rect width="${W}" height="${H}" fill="#FFFFFF"/>
<rect x="8" y="8" width="${W - 16}" height="${H - 16}" fill="#FFFFFF" stroke="${C.line}" stroke-width="2.2"/>
<polygon points="8,8 ${8 + wTab},8 ${8 + wTab},32 ${8 + wTab - 14},46 8,46" fill="${C.soft}" stroke="${C.line}" stroke-width="2.2"/>
${t(22, 34, tag, { weight: 800, size: 18, fill: C.accent })}${t(22 + tag.length * 11 + 12, 34, nombre, { weight: 700, size: 18 })}
${cuerpo}
</svg>`;
};

// ------------------------------------------------------------------ 1. Diagrama de clases (vista lógica)
function clases() {
  const W = 1500, H = 700;
  const p = [];
  const clase = ({ x, y, w, nombre, attrs, fill = C.head, estereo }) => {
    const hh = estereo ? 54 : 38;
    const h = hh + attrs.length * 23 + 14;
    p.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="${C.line}" stroke-width="2.2"/>`);
    p.push(`<rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="${fill}" stroke="${C.line}" stroke-width="2.2"/>`);
    if (estereo) p.push(t(x + w / 2, y + 19, `«${estereo}»`, { size: 13.5, anchor: 'middle', fill: C.muted }));
    p.push(t(x + w / 2, y + hh - 11, nombre, { size: 19, weight: 700, anchor: 'middle' }));
    attrs.forEach((a, i) => p.push(t(x + 12, y + hh + 25 + i * 23, a, { size: 15.5, mono: true })));
    return { x, y, w, h };
  };
  const L = clase({ x: 560, y: 70, w: 300, nombre: 'Lead', attrs: ['+ id', '+ countryCode', '+ fullName', '+ companyName', '+ commercialStatus', '+ estimatedDealValue', '+ currency', '+ dataOrigin', '+ consentStatus', '+ anonymizedAt'] });
  const crm = clase({ x: 50, y: 60, w: 260, nombre: 'Company', estereo: 'CRM de una empresa', attrs: ['+ id', '+ name', '+ plan', '+ planEndsOn', '+ isActive'] });
  const zona = clase({ x: 50, y: 290, w: 260, nombre: 'Territory', estereo: 'zona oficial', attrs: ['+ id', '+ name', '+ countryCode', '+ kind'] });
  const cuenta = clase({ x: 50, y: 500, w: 260, nombre: 'ClientAccount', estereo: 'empresa cliente', attrs: ['+ id', '+ name', '+ countryCode'] });
  const persona = clase({ x: 1010, y: 52, w: 260, nombre: 'LeadContact', estereo: 'persona del lead', attrs: ['+ fullName', '+ jobTitle', '+ email', '+ isPrimary'] });
  const seg = clase({ x: 1010, y: 252, w: 260, nombre: 'LeadActivity', estereo: 'seguimiento', attrs: ['+ channel', '+ outcome', '+ summary', '+ nextFollowUpDate'] });
  const item = clase({ x: 1010, y: 466, w: 260, nombre: 'LeadItem', estereo: 'qué se vende', attrs: ['+ quantity', '+ unitPrice', '+ currency'] });
  const cat = clase({ x: 1330, y: 466, w: 150, nombre: 'CatalogItem', attrs: ['+ itemType', '+ name', '+ billing'] });
  const priv = clase({ x: 560, y: 500, w: 300, nombre: 'PrivacyRequest', estereo: 'solicitud del titular', attrs: ['+ reason', '+ status', '+ decidedBy'], fill: C.amberSoft });

  // composición (rombo relleno del lado del todo): Company ◆— Lead
  const comp = (from, to, mulIni, mulFin, rol) => {
    p.push(ln([from, to], { start: 'rombo' }));
    return { mulIni, mulFin, rol };
  };
  // Company ◆ — * Lead
  p.push(ln([[310, 150], [560, 150]], { start: 'rombo' }));
  p.push(t(330, 138, '1', { size: 16, weight: 700 }));
  p.push(t(525, 138, '*', { size: 18, weight: 700 }));
  p.push(t(402, 170, 'tiene', { size: 14, italic: true, fill: C.muted }));
  // Lead * — 0..1 Territory
  p.push(ln([[560, 300], [310, 360]]));
  p.push(t(525, 292, '*', { size: 18, weight: 700 }));
  p.push(t(318, 350, '0..1', { size: 15, weight: 700 }));
  p.push(t(400, 318, 'se ubica en', { size: 14, italic: true, fill: C.muted }));
  // Lead * — 0..1 ClientAccount
  p.push(ln([[560, 338], [310, 545]]));
  p.push(t(525, 330, '*', { size: 18, weight: 700 }));
  p.push(t(318, 568, '0..1', { size: 15, weight: 700 }));
  p.push(t(412, 470, 'es de', { size: 14, italic: true, fill: C.muted }));
  // Lead ◆ — * LeadContact
  p.push(ln([[860, 120], [1010, 120]], { start: 'rombo' }));
  p.push(t(885, 108, '1', { size: 16, weight: 700 }));
  p.push(t(985, 108, '*', { size: 18, weight: 700 }));
  // Lead ◆ — * LeadActivity
  p.push(ln([[860, 310], [1010, 310]], { start: 'rombo' }));
  p.push(t(885, 298, '1', { size: 16, weight: 700 }));
  p.push(t(985, 298, '*', { size: 18, weight: 700 }));
  // Lead ◆ — * LeadItem
  p.push(ln([[860, 330], [940, 330], [940, 520], [1010, 520]], { start: 'rombo' }));
  p.push(t(868, 352, '1', { size: 16, weight: 700 }));
  p.push(t(985, 508, '*', { size: 18, weight: 700 }));
  // LeadItem * — 1 CatalogItem
  p.push(ln([[1270, 520], [1330, 520]], { end: 'abierta' }));
  p.push(t(1275, 508, '*', { size: 18, weight: 700 }));
  p.push(t(1302, 542, '1', { size: 16, weight: 700 }));
  // Lead ◆ — 0..1 PrivacyRequest
  p.push(ln([[710, 352], [710, 500]], { start: 'rombo' }));
  p.push(t(724, 378, '1', { size: 16, weight: 700 }));
  p.push(t(724, 488, '0..1', { size: 15, weight: 700 }));
  // nota
  p.push(`<polygon points="1010,618 1470,618 1470,684 1030,684 1010,664" fill="${C.amberSoft}" stroke="${C.amber}" stroke-width="1.8"/>`);
  p.push(t(1026, 642, 'Toda fila lleva su CRM (companyId): las empresas', { size: 15 }));
  p.push(t(1026, 664, 'nunca se mezclan. La zona reemplaza a la coordenada.', { size: 15 }));
  void L; void crm; void zona; void cuenta; void persona; void seg; void item; void cat; void priv; void comp;
  return lienzo(W, H, 'class', 'Dominio de Revela: el lead y su entorno', p.join('\n'));
}

// ------------------------------------------------------------------ 2. Diagrama de secuencia (vista de procesos)
function secuencia() {
  const W = 1500, H = 820;
  const p = [];
  const X = { persona: 130, nav: 440, srv: 750, db: 1060, ia: 1370 };
  const cab = [
    ['persona', 'Persona', null, true],
    ['nav', 'Navegador', 'la app (React)', false],
    ['srv', 'Servidor', 'función /api (Vercel)', false],
    ['db', 'Supabase', 'base de datos', false],
    ['ia', 'OpenAI', 'modelo de IA', false],
  ];
  for (const [k, n, sub, actor] of cab) {
    const x = X[k];
    if (actor) {
      p.push(`<circle cx="${x}" cy="76" r="13" fill="#fff" stroke="${C.line}" stroke-width="2.2"/>`);
      p.push(`<path d="M${x} 89 L${x} 118 M${x - 20} 98 L${x + 20} 98 M${x} 118 L${x - 15} 140 M${x} 118 L${x + 15} 140" stroke="${C.line}" stroke-width="2.2" fill="none"/>`);
      p.push(t(x, 160, n, { size: 18, weight: 700, anchor: 'middle' }));
    } else {
      p.push(`<rect x="${x - 95}" y="60" width="190" height="66" fill="${C.head}" stroke="${C.line}" stroke-width="2.2"/>`);
      p.push(t(x, 88, n, { size: 19, weight: 700, anchor: 'middle' }));
      p.push(t(x, 112, sub, { size: 14, anchor: 'middle', fill: C.muted }));
    }
    p.push(ln([[x, k === 'persona' ? 170 : 128], [x, H - 30]], { dash: true, w: 1.8, color: '#94A3B8' }));
  }
  const msg = (y, de, a, texto, tipo = 'sync') => {
    const x1 = X[de], x2 = X[a];
    p.push(ln([[x1, y], [x2, y]], { dash: tipo === 'ret', end: tipo === 'ret' ? 'abierta' : 'solida' }));
    const izq = Math.min(x1, x2);
    p.push(t(izq + (tipo === 'ret' && x2 < x1 ? 30 : 16), y - 9, texto, { size: 16.5 }));
  };
  const auto = (y, k, texto) => {
    const x = X[k];
    p.push(ln([[x, y - 13], [x + 64, y - 13], [x + 64, y + 13], [x + 4, y + 13]], { end: 'solida' }));
    p.push(t(x + 78, y + 5, texto, { size: 16.5 }));
  };
  let y = 212;
  const dy = 38;
  msg(y, 'persona', 'nav', 'Pide buscar empresas'); y += dy;
  msg(y, 'nav', 'srv', 'POST /api/ai/chat, con su sesión'); y += dy;
  msg(y, 'srv', 'db', 'Revisa el presupuesto del mes'); y += dy + 8;

  // fragmento alt con dos operandos
  const y0 = y - 20;
  const yMid = y0 + 30 + dy * 4 + 22;
  const yFin = yMid + 22 + dy + 22;
  p.push(`<rect x="290" y="${y0}" width="1170" height="${yFin - y0}" fill="none" stroke="${C.line}" stroke-width="2"/>`);
  p.push(`<polygon points="290,${y0} 352,${y0} 352,${y0 + 18} 340,${y0 + 30} 290,${y0 + 30}" fill="${C.soft}" stroke="${C.line}" stroke-width="2"/>`);
  p.push(t(304, y0 + 22, 'alt', { size: 15.5, weight: 800 }));
  p.push(t(366, y0 + 22, '[hay presupuesto]', { size: 15.5, italic: true, fill: C.muted }));
  y = y0 + 30 + 30;
  msg(y, 'srv', 'ia', 'Conversación y herramientas permitidas'); y += dy;
  msg(y, 'ia', 'srv', 'Empresas propuestas', 'ret'); y += dy;
  msg(y, 'srv', 'db', 'Anota el gasto del mes'); y += dy;
  msg(y, 'srv', 'nav', 'Devuelve las propuestas', 'ret');
  p.push(`<line x1="290" y1="${yMid}" x2="1460" y2="${yMid}" stroke="${C.line}" stroke-width="1.8" stroke-dasharray="8 6"/>`);
  p.push(t(304, yMid + 22, '[sin presupuesto]', { size: 15.5, italic: true, fill: C.muted }));
  y = yMid + 22 + 30;
  msg(y, 'srv', 'nav', 'Avisa que alcanzó el límite del mes', 'ret');
  y = yFin + 40;

  msg(y, 'persona', 'nav', 'Elige una empresa y pide guardarla'); y += dy + 6;
  auto(y, 'nav', 'Aplica las reglas del CRM'); y += dy + 20;
  msg(y, 'nav', 'db', 'Guarda el lead con su sesión (RLS, triggers y auditoría)'); y += dy;
  msg(y, 'db', 'nav', 'Lead guardado', 'ret');
  return lienzo(W, H, 'sd', 'Buscar empresas con el asistente y guardar un lead', p.join('\n'));
}

// ------------------------------------------------------------------ 3. Diagrama de componentes (vista de desarrollo)
function componentes() {
  const W = 1500, H = 700;
  const p = [];
  const comp = (x, y, w, h, lineas, carpeta, fill = '#fff', borde = C.line) => {
    p.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${borde}" stroke-width="2.4"/>`);
    p.push(`<rect x="${x + w - 40}" y="${y + 10}" width="28" height="20" fill="#fff" stroke="${borde}" stroke-width="1.8"/>`);
    p.push(`<rect x="${x + w - 46}" y="${y + 14}" width="12" height="5" fill="#fff" stroke="${borde}" stroke-width="1.6"/><rect x="${x + w - 46}" y="${y + 22}" width="12" height="5" fill="#fff" stroke="${borde}" stroke-width="1.6"/>`);
    p.push(t(x + 14, y + 26, '«component»', { size: 13.5, fill: C.muted }));
    const ls = Array.isArray(lineas) ? lineas : [lineas];
    const base = y + h / 2 + 6 - (ls.length - 1) * 12;
    ls.forEach((l, i) => p.push(t(x + w / 2, base + i * 25, l, { size: 20, weight: 700, anchor: 'middle' })));
    p.push(t(x + w / 2, base + ls.length * 25 + 4, carpeta, { size: 15, anchor: 'middle', mono: true, fill: C.muted }));
  };
  // la app, en el navegador
  p.push(`<rect x="40" y="70" width="640" height="590" fill="${C.soft}" stroke="${C.line}" stroke-width="2" stroke-dasharray="10 6"/>`);
  p.push(t(56, 100, '«subsystem»  App en el navegador', { size: 17, weight: 700, fill: C.accent }));
  comp(80, 130, 280, 116, 'Interfaz', 'src/components');
  comp(80, 330, 280, 116, 'Reglas del negocio', 'src/lib');
  comp(80, 520, 280, 116, 'Datos fijos', 'src/data');
  comp(400, 330, 250, 116, 'Acceso a datos', 'src/lib/db');
  p.push(ln([[220, 246], [220, 330]], { dash: true, end: 'abierta' }));
  p.push(t(232, 292, '«usa»', { size: 14, italic: true, fill: C.muted }));
  p.push(ln([[220, 446], [220, 520]], { dash: true, end: 'abierta' }));
  p.push(ln([[360, 214], [525, 214], [525, 330]], { dash: true, end: 'abierta' }));
  p.push(ln([[400, 388], [360, 388]], { dash: true, end: 'abierta' }));
  p.push(ln([[525, 446], [525, 578], [360, 578]], { dash: true, end: 'abierta' }));
  // servidor
  p.push(`<rect x="780" y="70" width="330" height="250" fill="${C.amberSoft}" stroke="${C.amber}" stroke-width="2" stroke-dasharray="10 6"/>`);
  p.push(t(796, 100, '«subsystem»  Servidor', { size: 17, weight: 700, fill: C.amber }));
  comp(810, 130, 270, 160, ['Asistente de IA,', 'tipos de cambio', 'e invitaciones'], 'server/', '#fff', C.amber);
  // base de datos
  p.push(`<rect x="780" y="400" width="330" height="250" fill="${C.greenSoft}" stroke="${C.green}" stroke-width="2" stroke-dasharray="10 6"/>`);
  p.push(t(796, 430, '«subsystem»  Base de datos', { size: 17, weight: 700, fill: C.green }));
  comp(810, 460, 270, 160, ['Tablas, reglas', 'y funciones'], 'supabase/migrations', '#fff', C.green);
  // externo y herramientas
  p.push(`<rect x="1230" y="130" width="230" height="130" fill="#fff" stroke="${C.line}" stroke-width="2.4"/>`);
  p.push(t(1245, 156, '«external»', { size: 13.5, fill: C.muted }));
  p.push(t(1345, 214, 'OpenAI', { size: 20, weight: 700, anchor: 'middle' }));
  p.push(`<rect x="1230" y="460" width="230" height="160" fill="#fff" stroke="${C.line}" stroke-width="2.4"/>`);
  p.push(t(1245, 486, '«component»', { size: 13.5, fill: C.muted }));
  p.push(t(1345, 546, 'Pruebas y', { size: 20, weight: 700, anchor: 'middle' }));
  p.push(t(1345, 571, 'herramientas', { size: 20, weight: 700, anchor: 'middle' }));
  p.push(t(1345, 598, 'scripts/', { size: 15, mono: true, anchor: 'middle', fill: C.muted }));

  // interfaz /api: la ofrece el servidor (bola) y la requiere la interfaz (enchufe)
  p.push(ln([[360, 160], [738, 160]], { w: 2.2 }));
  p.push(`<path d="M762 136 A24 24 0 0 0 762 184" fill="none" stroke="${C.line}" stroke-width="2.4"/>`);
  p.push(`<circle cx="764" cy="160" r="11" fill="#fff" stroke="${C.line}" stroke-width="2.4"/>`);
  p.push(ln([[775, 160], [810, 160]], { w: 2.2 }));
  p.push(t(700, 138, '/api', { size: 16, weight: 700, mono: true, anchor: 'middle' }));
  // interfaz de Supabase (API y Auth): bola en la base, enchufe en el acceso a datos
  p.push(ln([[650, 388], [700, 388], [700, 540], [738, 540]], { w: 2.2 }));
  p.push(`<path d="M762 516 A24 24 0 0 0 762 564" fill="none" stroke="${C.line}" stroke-width="2.4"/>`);
  p.push(`<circle cx="764" cy="540" r="11" fill="#fff" stroke="${C.line}" stroke-width="2.4"/>`);
  p.push(ln([[775, 540], [810, 540]], { w: 2.2 }));
  p.push(t(738, 596, 'API y Auth', { size: 15.5, weight: 700, anchor: 'end' }));
  // dependencias del servidor
  p.push(ln([[1020, 290], [1020, 460]], { dash: true, end: 'abierta' }));
  p.push(t(1034, 372, '«usa» con clave de servicio', { size: 14, italic: true, fill: C.muted }));
  p.push(ln([[1080, 190], [1230, 190]], { dash: true, end: 'abierta' }));
  p.push(t(1155, 176, '«usa»', { size: 14, italic: true, fill: C.muted, anchor: 'middle' }));
  // las pruebas verifican al servidor y a la base
  p.push(ln([[1230, 500], [1170, 500], [1170, 262], [1080, 262]], { dash: true, end: 'abierta' }));
  p.push(ln([[1230, 580], [1080, 580]], { dash: true, end: 'abierta' }));
  p.push(t(1190, 570, '«verifica»', { size: 14, italic: true, fill: C.muted, anchor: 'middle' }));
  return lienzo(W, H, 'cmp', 'Componentes de Revela y sus dependencias', p.join('\n'));
}

// ------------------------------------------------------------------ 4. Diagrama de despliegue (vista física)
function despliegue() {
  const W = 1500, H = 770;
  const p = [];
  const nodo = (x, y, w, h, estereo, nombre, { fill = '#fff', stroke = C.line } = {}) => {
    const d = 16;
    p.push(`<polygon points="${x},${y} ${x + d},${y - d} ${x + w + d},${y - d} ${x + w},${y}" fill="${C.soft}" stroke="${stroke}" stroke-width="2.2"/>`);
    p.push(`<polygon points="${x + w},${y} ${x + w + d},${y - d} ${x + w + d},${y + h - d} ${x + w},${y + h}" fill="#E2E8F0" stroke="${stroke}" stroke-width="2.2"/>`);
    p.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="2.4"/>`);
    p.push(t(x + 14, y + 24, `«${estereo}»`, { size: 14, fill: C.muted }));
    p.push(t(x + 14, y + 50, nombre, { size: 20, weight: 700 }));
  };
  const artefacto = (x, y, w, h, nombre, estereo = 'artifact') => {
    p.push(`<polygon points="${x},${y} ${x + w - 14},${y} ${x + w},${y + 14} ${x + w},${y + h} ${x},${y + h}" fill="#fff" stroke="${C.line}" stroke-width="2"/>`);
    p.push(`<path d="M${x + w - 14} ${y} L${x + w - 14} ${y + 14} L${x + w} ${y + 14}" fill="none" stroke="${C.line}" stroke-width="1.8"/>`);
    p.push(t(x + 12, y + 22, `«${estereo}»`, { size: 13, fill: C.muted }));
    p.push(t(x + 12, y + 46, nombre, { size: 16.5, weight: 600 }));
  };
  const etiqueta = (x, y, a, b) => {
    const ancho = a.length * 8.6 + 12;
    p.push(`<rect x="${x - ancho / 2}" y="${y - 19}" width="${ancho}" height="${b ? 44 : 26}" fill="#fff"/>`);
    p.push(t(x, y, a, { size: 15, anchor: 'middle', weight: 700 }));
    if (b) p.push(t(x, y + 20, b, { size: 14, anchor: 'middle', fill: C.muted }));
  };
  // la persona
  nodo(50, 130, 360, 330, 'device', 'Computador o celular');
  p.push(`<rect x="76" y="210" width="308" height="210" fill="${C.soft}" stroke="${C.line}" stroke-width="2"/>`);
  p.push(t(90, 236, '«execution environment»', { size: 13.5, fill: C.muted }));
  p.push(t(90, 262, 'Navegador web', { size: 18, weight: 700 }));
  artefacto(96, 300, 268, 90, 'Aplicación web (React)');
  // Vercel
  nodo(630, 100, 420, 270, 'execution environment', 'Vercel');
  artefacto(654, 190, 180, 88, 'Archivos de la app');
  artefacto(852, 190, 170, 88, 'Función /api');
  p.push(t(654, 322, 'Se publica sola con cada cambio aprobado', { size: 14.5, fill: C.muted }));
  // Supabase
  nodo(630, 470, 420, 215, 'execution environment', 'Supabase (São Paulo)');
  artefacto(654, 560, 118, 96, 'PostgreSQL', 'database');
  artefacto(784, 560, 92, 96, 'Auth');
  artefacto(888, 560, 138, 96, 'Vault');
  // servicios externos
  nodo(1190, 100, 270, 110, 'web service', 'OpenAI');
  nodo(1190, 290, 270, 130, 'web service', 'Tipos de cambio');
  p.push(t(1204, 374, 'Banco Central y open.er-api', { size: 14, fill: C.muted }));
  nodo(1190, 500, 270, 130, 'web service', 'Mapa base (Esri)');
  p.push(t(1204, 584, 'teselas del mapa', { size: 14, fill: C.muted }));

  // rutas de comunicación
  p.push(ln([[426, 250], [630, 250]]));
  etiqueta(528, 236, '«HTTPS»', null);
  p.push(t(528, 274, 'app y API', { size: 14, anchor: 'middle', fill: C.muted }));
  p.push(ln([[426, 400], [540, 400], [540, 580], [630, 580]]));
  etiqueta(585, 560, '«HTTPS»', null);
  p.push(t(585, 614, 'login y datos', { size: 14, anchor: 'middle', fill: C.muted }));
  p.push(ln([[840, 370], [840, 470]]));
  etiqueta(1000, 426, '«HTTPS»', null);
  p.push(t(1000, 448, 'sesión y datos', { size: 14, anchor: 'middle', fill: C.muted }));
  p.push(ln([[1066, 170], [1190, 160]]));
  etiqueta(1128, 140, '«HTTPS»', null);
  p.push(ln([[1066, 270], [1128, 270], [1128, 352], [1190, 352]]));
  etiqueta(1128, 312, '«HTTPS»', null);
  p.push(ln([[230, 460], [230, 730], [1325, 730], [1325, 630]]));
  etiqueta(780, 722, '«HTTPS»  mapa base', null);
  return lienzo(W, H, 'deployment', 'Dónde corre cada pieza', p.join('\n'));
}

// ------------------------------------------------------------------ 5. Diagrama de casos de uso (escenarios)
function casosDeUso() {
  const W = 1500, H = 790;
  const p = [];
  const actor = (x, y, nombre, sub) => {
    p.push(`<circle cx="${x}" cy="${y - 30}" r="14" fill="#fff" stroke="${C.line}" stroke-width="2.4"/>`);
    p.push(`<path d="M${x} ${y - 16} L${x} ${y + 16} M${x - 24} ${y - 5} L${x + 24} ${y - 5} M${x} ${y + 16} L${x - 18} ${y + 44} M${x} ${y + 16} L${x + 18} ${y + 44}" stroke="${C.line}" stroke-width="2.4" fill="none"/>`);
    p.push(t(x, y + 68, nombre, { size: 17.5, weight: 700, anchor: 'middle' }));
    if (sub) p.push(t(x, y + 88, sub, { size: 14, anchor: 'middle', fill: C.muted }));
  };
  const caso = (cx, cy, texto, { e = null, fill = '#fff', stroke = C.line, w = 330, h = 62 } = {}) => {
    p.push(`<ellipse cx="${cx}" cy="${cy}" rx="${w / 2}" ry="${h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="2.2"/>`);
    const corte = texto.length > 36 ? texto.lastIndexOf(' ', 32) : -1;
    const partes = corte > 0 ? [texto.slice(0, corte), texto.slice(corte + 1)] : [texto];
    partes.forEach((l, i) => p.push(t(cx, cy + 6 - (partes.length - 1) * 10 + i * 21, l, { size: 16.5, anchor: 'middle' })));
    if (e) {
      p.push(`<circle cx="${cx - w / 2 + 16}" cy="${cy - h / 2 + 8}" r="15" fill="${C.accent}"/>`);
      p.push(t(cx - w / 2 + 16, cy - h / 2 + 13.5, e, { size: 13.5, weight: 800, fill: '#fff', anchor: 'middle' }));
    }
    return { cx, cy, w, h };
  };
  p.push(`<rect x="300" y="70" width="920" height="670" fill="#FAFAFF" stroke="${C.line}" stroke-width="2.2"/>`);
  p.push(t(320, 102, 'Revela', { size: 19, weight: 800, fill: C.accent }));
  // columna izquierda: lo que hacen usuario base y gerente (E1 arriba)
  const a1 = caso(500, 170, 'Buscar empresas con el asistente', { e: 'E1', fill: C.head, stroke: C.accent });
  const a2 = caso(500, 260, 'Capturar un lead con su origen', { e: 'E2' });
  const a3 = caso(500, 350, 'Mover el lead por el pipeline');
  const a4 = caso(500, 450, 'Ver el mapa y los KPI por zona');
  const a5 = caso(500, 545, 'Resolver solicitudes del titular', { e: 'E3' });
  const a6 = caso(500, 640, 'Fijar presupuesto y clave de IA', { e: 'E5' });
  // include y extend
  const inc = caso(930, 170, 'Revisar el presupuesto del mes', { w: 300, h: 56 });
  const ext = caso(930, 280, 'Guardar la empresa como lead', { w: 300, h: 56 });
  // columna derecha
  const b1 = caso(930, 420, 'Pedir acceso o supresión de datos', { e: 'E3', w: 330 });
  const b2 = caso(930, 515, 'Crear o suspender un CRM', { w: 300, h: 56 });
  const b3 = caso(930, 610, 'Suspender el CRM con plan vencido', { e: 'E4', fill: C.amberSoft, stroke: C.amber, w: 340 });
  const b4 = caso(930, 700, 'Anonimizar prospectos a los 30 días', { fill: C.amberSoft, stroke: C.amber, w: 340 });
  // actores
  actor(110, 240, 'Usuario base', 'agente de ventas');
  actor(110, 560, 'Gerente', 'administra su CRM');
  actor(1360, 330, 'Titular', 'dueño de los datos');
  actor(1360, 510, 'Administrador', 'de la plataforma');
  actor(1360, 670, 'Tarea automática', 'pg_cron');
  const izq = (x, y, c) => p.push(ln([[x, y], [c.cx - c.w / 2, c.cy]], { w: 1.8 }));
  const der = (x, y, c) => p.push(ln([[x, y], [c.cx + c.w / 2, c.cy]], { w: 1.8 }));
  for (const c of [a1, a2, a3]) izq(134, 235, c);
  for (const c of [a4, a5, a6]) izq(134, 555, c);
  p.push(ln([[110, 478], [110, 340]], { end: 'hueca' }));
  p.push(t(126, 404, 'además hace todo', { size: 13.5, fill: C.muted }));
  p.push(t(126, 422, 'lo del usuario base', { size: 13.5, fill: C.muted }));
  der(1336, 325, b1);
  der(1336, 505, b2);
  der(1336, 665, b3);
  der(1336, 665, b4);
  // «include»: el asistente siempre revisa el presupuesto
  p.push(ln([[a1.cx + a1.w / 2, a1.cy], [inc.cx - inc.w / 2, inc.cy]], { dash: true, end: 'abierta' }));
  p.push(t(752, 150, '«include»', { size: 14.5, italic: true, fill: C.muted, anchor: 'middle' }));
  // «extend»: guardar la empresa extiende la búsqueda
  p.push(ln([[ext.cx - ext.w / 2, ext.cy], [730, 280], [730, 200], [644, 187]], { dash: true, end: 'abierta' }));
  p.push(t(722, 246, '«extend»', { size: 14.5, italic: true, fill: C.muted, anchor: 'end' }));
  return lienzo(W, H, 'uc', 'Quién usa Revela y para qué (escenarios E1 a E5)', p.join('\n'));
}

// ------------------------------------------------------------------ 6. Diagrama de estados del lead
function estados() {
  const W = 1500, H = 640;
  const p = [];
  const estado = (x, y, w, nombre, sub, { fill = '#fff', stroke = C.line } = {}) => {
    p.push(`<rect x="${x}" y="${y}" width="${w}" height="84" rx="22" fill="${fill}" stroke="${stroke}" stroke-width="2.4"/>`);
    p.push(t(x + w / 2, y + 38, nombre, { size: 18, weight: 700, anchor: 'middle' }));
    if (sub) p.push(t(x + w / 2, y + 62, sub, { size: 14, anchor: 'middle', fill: C.muted }));
  };
  const w = 176, gap = 52, x0 = 108, y = 270;
  const xs = Array.from({ length: 6 }, (_, i) => x0 + i * (w + gap));
  const nombres = [['Nuevo lead', 'prob. 10 %'], ['Toma de contacto', 'prob. 25 %'], ['Calificado', 'prob. 45 %'], ['Propuesta', 'prob. 70 %'], ['Pendiente de pago', 'prob. 90 %'], ['Cerrado (ganado)', 'prob. 100 %']];
  p.push(`<circle cx="62" cy="${y + 42}" r="13" fill="${C.line}"/>`);
  p.push(ln([[75, y + 42], [x0, y + 42]], { end: 'solida' }));
  xs.forEach((x, i) => estado(x, y, w, nombres[i][0], nombres[i][1], i === 5 ? { fill: C.greenSoft, stroke: C.green } : {}));
  const etiq = ['registra contacto', 'califica', 'envía propuesta', 'acepta', 'paga'];
  for (let i = 0; i < 5; i++) {
    const a = xs[i] + w, b = xs[i + 1];
    p.push(ln([[a, y + 42], [b, y + 42]], { end: 'solida' }));
    p.push(`<rect x="${(a + b) / 2 - 62}" y="${y - 28}" width="124" height="22" fill="#fff"/>`);
    p.push(t((a + b) / 2, y - 11, etiq[i], { size: 14, anchor: 'middle', fill: C.muted, italic: true }));
  }
  // estado final tras el cierre
  const xf = xs[5] + w + 38;
  p.push(ln([[xs[5] + w, y + 42], [xf - 15, y + 42]], { end: 'solida' }));
  p.push(`<circle cx="${xf}" cy="${y + 42}" r="14" fill="none" stroke="${C.line}" stroke-width="2.4"/><circle cx="${xf}" cy="${y + 42}" r="8" fill="${C.line}"/>`);

  // perdido, desde cualquier etapa abierta
  const dx = xs[2] + w / 2 + (w + gap) / 2 - 100;
  estado(dx, 70, 200, 'Perdido / descartado', 'prob. 0 %', { fill: C.roseSoft, stroke: C.rose });
  const busY = 196;
  p.push(ln([[xs[0] + w / 2, busY], [xs[4] + w / 2, busY]], { dash: true }));
  for (let i = 0; i < 5; i++) p.push(ln([[xs[i] + w / 2, y - 50], [xs[i] + w / 2, busY]], { dash: true }));
  // tramo corto entre el borde superior de cada caja y la barra (queda debajo de las etiquetas)
  for (let i = 0; i < 5; i++) p.push(ln([[xs[i] + w / 2, y - 50], [xs[i] + w / 2, y]], { dash: true }));
  p.push(ln([[dx + 100, busY], [dx + 100, 154]], { dash: true, end: 'abierta' }));
  p.push(t(xs[0] + w / 2 + 8, busY - 8, 'desde cualquier etapa abierta', { size: 14, italic: true, fill: C.muted }));
  // Perdido también termina el ciclo
  p.push(ln([[dx + 200, 112], [xf, 112], [xf, y + 28]], { end: 'solida' }));

  // anonimizado, desde cualquier lead
  const ay = 500;
  const bus2 = 430;
  estado(xs[2] + w / 2 + (w + gap) / 2 - 150, ay, 300, 'Anonimizado', 'datos personales borrados, la operación queda', { fill: C.amberSoft, stroke: C.amber });
  p.push(ln([[xs[0] + w / 2, bus2], [xs[5] + w / 2, bus2]], { dash: true, color: C.amber }));
  for (let i = 0; i < 6; i++) p.push(ln([[xs[i] + w / 2, y + 84], [xs[i] + w / 2, bus2]], { dash: true, color: C.amber }));
  const ax = xs[2] + w / 2 + (w + gap) / 2;
  p.push(ln([[ax, bus2], [ax, ay]], { dash: true, color: C.amber, end: 'abierta' }));
  p.push(t(xs[0] + w / 2 + 8, bus2 + 24, 'prospecto sin contacto en 30 días, o a pedido del titular', { size: 14.5, italic: true, fill: C.amber }));
  // nota
  p.push(`<polygon points="1010,500 1470,500 1470,590 1030,590 1010,570" fill="${C.soft}" stroke="${C.line}" stroke-width="1.8"/>`);
  p.push(t(1026, 530, 'Con una solicitud del titular pendiente, el lead', { size: 15 }));
  p.push(t(1026, 554, 'queda bloqueado: no se edita ni avanza. Solo el', { size: 15 }));
  p.push(t(1026, 578, 'gerente la resuelve.', { size: 15 }));
  return lienzo(W, H, 'stm', 'Ciclo de vida de un lead', p.join('\n'));
}

const diagramas = [
  ['1-clases', clases()],
  ['2-secuencia', secuencia()],
  ['3-componentes', componentes()],
  ['4-despliegue', despliegue()],
  ['5-casos-de-uso', casosDeUso()],
  ['6-estados', estados()],
];
const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true });
const page = await browser.newPage();
for (const [nombre, svg] of diagramas) {
  const [, W, H] = /width="(\d+)" height="(\d+)"/.exec(svg);
  writeFileSync(`${OUT}/uml-${nombre}.svg`, svg);
  await page.setViewport({ width: Number(W), height: Number(H), deviceScaleFactor: 2 });
  await page.setContent(`<!doctype html><body style="margin:0">${svg}</body>`, { waitUntil: 'load' });
  await page.screenshot({ path: `${OUT}/uml-${nombre}.png` });
  console.log('✓', `${OUT}/uml-${nombre}.png`);
}
await browser.close();
