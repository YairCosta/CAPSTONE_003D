// Diagramas de procesos BPMN 2.0 de Revela: cómo trabaja cada persona con la app, de punta a punta.
// Ejecutar: npm run bpmn    →    docs/bpmn/<proceso>.bpmn, .svg y .png
//
// Cada proceso sale en dos formas desde el mismo modelo:
//   · .bpmn: BPMN 2.0 estándar con su diagrama (coordenadas). Se abre y se edita en Camunda Modeler o
//     en https://demo.bpmn.io, así que sirve de fuente si hay que ajustarlo a mano.
//   · .svg y .png: la imagen con la notación BPMN (eventos, tareas, compuertas, carriles), para las
//     presentaciones.
// Los procesos describen lo que hace la app hoy (ver docs/PROCESOS.md); si cambia un flujo, se
// cambia aquí y se vuelve a generar.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const OUT = 'docs/bpmn';
mkdirSync(OUT, { recursive: true });

// ------------------------------------------------------------------ procesos
// Nodo: { id, tipo, lane, col, nombre }. Tipos: inicio, inicioMensaje, inicioTimer, fin, tareaUsuario,
// tareaServicio, tareaEnvio, compuerta, compuertaEventos, esperaTimer, esperaMensaje.
// Flujo: { de, a, nombre?, via? }. `via: 'arriba'` lleva una vuelta atrás por encima de su carril.
const PROCESOS = [
  {
    id: 'proceso-comercial',
    titulo: 'Proceso comercial: de la captura al cierre de un lead',
    pool: 'CRM de una empresa en Revela',
    lanes: [
      { id: 'vendedor', nombre: 'Usuario base (vendedor)' },
      { id: 'sistema', nombre: 'Revela (app y base de datos)' },
      { id: 'gerente', nombre: 'Gerente' },
    ],
    nodos: [
      { id: 'inicio', tipo: 'inicio', lane: 'vendedor', col: 0, nombre: 'Aparece una empresa interesada' },
      { id: 'capturar', tipo: 'tareaUsuario', lane: 'vendedor', col: 1, nombre: 'Capturar lead con país, zona, productos, origen y base del dato' },
      { id: 'validar', tipo: 'tareaServicio', lane: 'sistema', col: 2, nombre: 'Validar CRM, país habilitado, zona del país y moneda' },
      { id: 'gValido', tipo: 'compuerta', lane: 'sistema', col: 3, nombre: '¿Datos válidos?' },
      { id: 'guardar', tipo: 'tareaServicio', lane: 'sistema', col: 4, nombre: 'Guardar en «Nuevo», calcular el valor y registrar el cambio' },
      { id: 'gZona', tipo: 'compuerta', lane: 'sistema', col: 5, nombre: '¿Tiene zona?' },
      { id: 'ubicar', tipo: 'tareaUsuario', lane: 'gerente', col: 6, nombre: 'Ubicar el lead en su zona (Leads sin zona)' },
      { id: 'contactar', tipo: 'tareaUsuario', lane: 'vendedor', col: 7, nombre: 'Registrar contacto: canal, resultado y próximo seguimiento' },
      { id: 'avanzar', tipo: 'tareaUsuario', lane: 'vendedor', col: 8, nombre: 'Avanzar el lead en el pipeline (solo hacia adelante)' },
      { id: 'gResultado', tipo: 'compuerta', lane: 'vendedor', col: 9, nombre: '¿Cómo sigue?' },
      { id: 'descartado', tipo: 'fin', lane: 'vendedor', col: 10, nombre: 'Lead descartado' },
      { id: 'kpi', tipo: 'tareaServicio', lane: 'sistema', col: 10, nombre: 'Sumar al KPI, al mapa por zona y al ranking' },
      { id: 'revisar', tipo: 'tareaUsuario', lane: 'gerente', col: 11, nombre: 'Revisar resultados por zona y producto' },
      { id: 'ganado', tipo: 'fin', lane: 'gerente', col: 12, nombre: 'Negocio ganado y analizado' },
    ],
    flujos: [
      { de: 'inicio', a: 'capturar' },
      { de: 'capturar', a: 'validar' },
      { de: 'validar', a: 'gValido' },
      { de: 'gValido', a: 'capturar', nombre: 'No: se corrige', via: 'arriba' },
      { de: 'gValido', a: 'guardar', nombre: 'Sí' },
      { de: 'guardar', a: 'gZona' },
      { de: 'gZona', a: 'ubicar', nombre: 'No' },
      { de: 'gZona', a: 'contactar', nombre: 'Sí' },
      { de: 'ubicar', a: 'contactar' },
      { de: 'contactar', a: 'avanzar' },
      { de: 'avanzar', a: 'gResultado' },
      { de: 'gResultado', a: 'contactar', nombre: 'Sigue en curso', via: 'arriba' },
      { de: 'gResultado', a: 'descartado', nombre: 'Descartado' },
      { de: 'gResultado', a: 'kpi', nombre: 'Ganado' },
      { de: 'kpi', a: 'revisar' },
      { de: 'revisar', a: 'ganado' },
    ],
  },
  {
    id: 'derechos-del-titular',
    titulo: 'Derechos del titular de los datos (Ley 21.719)',
    pool: 'CRM de una empresa en Revela',
    lanes: [
      { id: 'titular', nombre: 'Titular de los datos' },
      { id: 'usuario', nombre: 'Usuario del CRM (vendedor o gerente)' },
      { id: 'gerente', nombre: 'Gerente' },
      { id: 'sistema', nombre: 'Revela (app y base de datos)' },
    ],
    nodos: [
      { id: 'pide', tipo: 'inicioMensaje', lane: 'titular', col: 0, nombre: 'Pide acceder, corregir, oponerse o borrar sus datos' },
      { id: 'registrar', tipo: 'tareaUsuario', lane: 'usuario', col: 1, nombre: 'Registrar la solicitud y su motivo en Registro de contacto' },
      { id: 'bloquear', tipo: 'tareaServicio', lane: 'sistema', col: 2, nombre: 'Bloquear el lead: no se edita, no se mueve ni se contacta' },
      { id: 'revisar', tipo: 'tareaUsuario', lane: 'gerente', col: 3, nombre: 'Verificar la identidad y revisar la solicitud' },
      { id: 'gAprueba', tipo: 'compuerta', lane: 'gerente', col: 4, nombre: '¿Se aprueba?' },
      { id: 'motivo', tipo: 'tareaUsuario', lane: 'gerente', col: 5, nombre: 'Registrar el motivo del rechazo' },
      { id: 'anonimizar', tipo: 'tareaServicio', lane: 'sistema', col: 5, nombre: 'Anonimizar: borra los datos personales y conserva la operación' },
      { id: 'cerrar', tipo: 'tareaServicio', lane: 'sistema', col: 6, nombre: 'Cerrar la solicitud, desbloquear y dejarla en el historial' },
      { id: 'responder', tipo: 'tareaEnvio', lane: 'gerente', col: 7, nombre: 'Responder al titular dentro del plazo' },
      { id: 'recibe', tipo: 'fin', lane: 'titular', col: 8, nombre: 'Recibe la respuesta' },
    ],
    flujos: [
      { de: 'pide', a: 'registrar' },
      { de: 'registrar', a: 'bloquear' },
      { de: 'bloquear', a: 'revisar' },
      { de: 'revisar', a: 'gAprueba' },
      { de: 'gAprueba', a: 'motivo', nombre: 'No' },
      { de: 'gAprueba', a: 'anonimizar', nombre: 'Sí' },
      { de: 'motivo', a: 'cerrar' },
      { de: 'anonimizar', a: 'cerrar' },
      { de: 'cerrar', a: 'responder' },
      { de: 'responder', a: 'recibe' },
    ],
  },
  {
    id: 'prospecto-30-dias',
    titulo: 'Prospecto: primer contacto o anonimización a los 30 días',
    pool: 'CRM de una empresa en Revela',
    lanes: [
      { id: 'vendedor', nombre: 'Usuario base (vendedor)' },
      { id: 'sistema', nombre: 'Revela (app y base de datos)' },
    ],
    nodos: [
      { id: 'captura', tipo: 'inicio', lane: 'vendedor', col: 0, nombre: 'Captura a una persona sin su autorización (prospecto)' },
      { id: 'guardar', tipo: 'tareaServicio', lane: 'sistema', col: 1, nombre: 'Guardar como prospecto con plazo de 30 días' },
      { id: 'gEvento', tipo: 'compuertaEventos', lane: 'sistema', col: 2, nombre: '¿Qué pasa primero?' },
      { id: 'contacto', tipo: 'esperaMensaje', lane: 'vendedor', col: 3, nombre: 'Primer contacto con el prospecto' },
      { id: 'informar', tipo: 'tareaUsuario', lane: 'vendedor', col: 4, nombre: 'Informar al titular y registrar su respuesta' },
      { id: 'gAutoriza', tipo: 'compuerta', lane: 'vendedor', col: 6, nombre: '¿Autoriza?' },
      { id: 'sigue', tipo: 'fin', lane: 'vendedor', col: 7, nombre: 'Sigue como lead normal' },
      { id: 'noContactar', tipo: 'tareaServicio', lane: 'sistema', col: 7, nombre: 'Marcar «no contactar» en todo el CRM' },
      { id: 'finNo', tipo: 'fin', lane: 'sistema', col: 8, nombre: 'No se le vuelve a contactar' },
      { id: 'plazo', tipo: 'esperaTimer', lane: 'sistema', col: 3, nombre: 'Pasan 30 días sin contacto' },
      { id: 'anonimizar', tipo: 'tareaServicio', lane: 'sistema', col: 4, nombre: 'Anonimizar el prospecto (tarea diaria 03:15 UTC)' },
      { id: 'finAnon', tipo: 'fin', lane: 'sistema', col: 5, nombre: 'Datos personales eliminados' },
    ],
    flujos: [
      { de: 'captura', a: 'guardar' },
      { de: 'guardar', a: 'gEvento' },
      { de: 'gEvento', a: 'contacto' },
      { de: 'gEvento', a: 'plazo' },
      { de: 'contacto', a: 'informar' },
      { de: 'informar', a: 'gAutoriza' },
      { de: 'gAutoriza', a: 'sigue', nombre: 'Sí' },
      { de: 'gAutoriza', a: 'noContactar', nombre: 'No' },
      { de: 'noContactar', a: 'finNo' },
      { de: 'plazo', a: 'anonimizar' },
      { de: 'anonimizar', a: 'finAnon' },
    ],
  },
  {
    id: 'alta-crm-e-invitaciones',
    titulo: 'Alta de un CRM e invitación de su equipo',
    pool: 'Plataforma Revela',
    lanes: [
      { id: 'admin', nombre: 'Administrador de la plataforma' },
      { id: 'sistema', nombre: 'Revela (servidor y base de datos)' },
      { id: 'gerente', nombre: 'Gerente de la empresa cliente' },
      { id: 'invitado', nombre: 'Persona invitada' },
    ],
    nodos: [
      { id: 'contrata', tipo: 'inicio', lane: 'admin', col: 0, nombre: 'Una empresa contrata Revela' },
      { id: 'crear', tipo: 'tareaUsuario', lane: 'admin', col: 1, nombre: 'Crear el CRM: nombre, plan, país base y países' },
      { id: 'sembrar', tipo: 'tareaServicio', lane: 'sistema', col: 2, nombre: 'Copiar las zonas oficiales de sus países y las etapas' },
      { id: 'invitarGerente', tipo: 'tareaUsuario', lane: 'admin', col: 3, nombre: 'Invitar al gerente del cliente' },
      { id: 'verificar', tipo: 'tareaServicio', lane: 'sistema', col: 4, nombre: 'Verificar la sesión y el perfil de quien invita' },
      { id: 'gPuede', tipo: 'compuerta', lane: 'sistema', col: 5, nombre: '¿Puede invitar a ese CRM y perfil?' },
      { id: 'rechazo', tipo: 'fin', lane: 'admin', col: 6, nombre: 'Invitación rechazada' },
      { id: 'enviar', tipo: 'tareaEnvio', lane: 'sistema', col: 6, nombre: 'Crear el perfil y enviar la invitación por correo' },
      { id: 'contrasena', tipo: 'tareaUsuario', lane: 'gerente', col: 7, nombre: 'Abrir el enlace y crear su propia contraseña' },
      { id: 'invitarEquipo', tipo: 'tareaUsuario', lane: 'gerente', col: 8, nombre: 'Invitar a su equipo (usuarios base o gerentes)' },
      { id: 'enviarEquipo', tipo: 'tareaEnvio', lane: 'sistema', col: 9, nombre: 'Verificar que invita a su propio CRM y enviar los correos' },
      { id: 'entrar', tipo: 'tareaUsuario', lane: 'invitado', col: 10, nombre: 'Crear su contraseña y entrar a su CRM' },
      { id: 'operando', tipo: 'fin', lane: 'invitado', col: 11, nombre: 'Equipo trabajando en su CRM' },
    ],
    flujos: [
      { de: 'contrata', a: 'crear' },
      { de: 'crear', a: 'sembrar' },
      { de: 'sembrar', a: 'invitarGerente' },
      { de: 'invitarGerente', a: 'verificar' },
      { de: 'verificar', a: 'gPuede' },
      { de: 'gPuede', a: 'rechazo', nombre: 'No' },
      { de: 'gPuede', a: 'enviar', nombre: 'Sí' },
      { de: 'enviar', a: 'contrasena' },
      { de: 'contrasena', a: 'invitarEquipo' },
      { de: 'invitarEquipo', a: 'enviarEquipo' },
      { de: 'enviarEquipo', a: 'entrar' },
      { de: 'entrar', a: 'operando' },
    ],
  },
  {
    id: 'asistente-ia',
    titulo: 'Prospección con el asistente de IA',
    pool: 'CRM de una empresa en Revela',
    lanes: [
      { id: 'usuario', nombre: 'Usuario del CRM (vendedor o gerente)' },
      { id: 'servidor', nombre: 'Servidor del asistente (IA)' },
      { id: 'crm', nombre: 'CRM (navegador y base de datos)' },
    ],
    nodos: [
      { id: 'pide', tipo: 'inicio', lane: 'usuario', col: 0, nombre: 'Pide al asistente buscar empresas' },
      { id: 'verificar', tipo: 'tareaServicio', lane: 'servidor', col: 1, nombre: 'Verificar la sesión de CRM y el límite de consultas' },
      { id: 'gSesion', tipo: 'compuerta', lane: 'servidor', col: 2, nombre: '¿Sesión válida o clave propia?' },
      { id: 'sinSesion', tipo: 'fin', lane: 'usuario', col: 3, nombre: 'Se le pide iniciar sesión' },
      { id: 'buscar', tipo: 'tareaServicio', lane: 'servidor', col: 3, nombre: 'Buscar empresas con la IA (Google Places o demo)' },
      { id: 'elegir', tipo: 'tareaUsuario', lane: 'usuario', col: 4, nombre: 'Elegir una empresa y pedir que la guarde' },
      { id: 'duplicados', tipo: 'tareaServicio', lane: 'crm', col: 5, nombre: 'Buscar leads parecidos en el CRM' },
      { id: 'gParecidos', tipo: 'compuerta', lane: 'crm', col: 6, nombre: '¿Hay parecidos?' },
      { id: 'confirmar', tipo: 'tareaUsuario', lane: 'usuario', col: 7, nombre: 'Confirmar si es el mismo lead o uno nuevo' },
      { id: 'guardar', tipo: 'tareaServicio', lane: 'crm', col: 8, nombre: 'Guardar solo datos de la empresa (reglas del perfil y RLS)' },
      { id: 'registrado', tipo: 'fin', lane: 'crm', col: 9, nombre: 'Lead registrado y en el historial' },
    ],
    flujos: [
      { de: 'pide', a: 'verificar' },
      { de: 'verificar', a: 'gSesion' },
      { de: 'gSesion', a: 'sinSesion', nombre: 'No' },
      { de: 'gSesion', a: 'buscar', nombre: 'Sí' },
      { de: 'buscar', a: 'elegir' },
      { de: 'elegir', a: 'duplicados' },
      { de: 'duplicados', a: 'gParecidos' },
      { de: 'gParecidos', a: 'confirmar', nombre: 'Sí' },
      { de: 'gParecidos', a: 'guardar', nombre: 'No' },
      { de: 'confirmar', a: 'guardar' },
      { de: 'guardar', a: 'registrado' },
    ],
  },
];

// ------------------------------------------------------------------ medidas
const M = {
  margen: 24,
  tituloAlto: 70,
  poolCab: 34,
  laneCab: 34,
  laneAlto: 170,
  colAncho: 176,
  colInicio: 26,
  tareaAncho: 138,
  tareaAlto: 96,
  evento: 38,
  compuerta: 52,
};
const C = {
  fondo: '#FFFFFF',
  pool: '#EEF2FF',
  poolBorde: '#4F46E5',
  laneA: '#FFFFFF',
  laneB: '#F8FAFC',
  laneBorde: '#CBD5E1',
  texto: '#0F172A',
  suave: '#475569',
  tarea: '#FFFFFF',
  tareaBorde: '#334155',
  icono: '#4F46E5',
  inicio: '#059669',
  inicioFondo: '#ECFDF5',
  fin: '#DC2626',
  finFondo: '#FEF2F2',
  espera: '#B45309',
  esperaFondo: '#FFFBEB',
  compuerta: '#B45309',
  compuertaFondo: '#FEF3C7',
  flujo: '#334155',
};
const FUENTE = "'Segoe UI', system-ui, sans-serif";

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const partir = (texto, max) => {
  const lineas = [];
  let linea = '';
  for (const palabra of String(texto).split(' ')) {
    if (`${linea} ${palabra}`.trim().length > max && linea) {
      lineas.push(linea.trim());
      linea = palabra;
    } else linea = `${linea} ${palabra}`;
  }
  if (linea.trim()) lineas.push(linea.trim());
  return lineas;
};

const esEvento = (t) => ['inicio', 'inicioMensaje', 'inicioTimer', 'fin', 'esperaTimer', 'esperaMensaje'].includes(t);
const esCompuerta = (t) => t === 'compuerta' || t === 'compuertaEventos';
const tamano = (t) => (esEvento(t) ? [M.evento, M.evento] : esCompuerta(t) ? [M.compuerta, M.compuerta] : [M.tareaAncho, M.tareaAlto]);

// ------------------------------------------------------------------ geometría de un proceso
function layout(proc) {
  const nodos = proc.nodos;
  const flujos = proc.flujos.map((f, i) => ({ ...f, id: `Flujo_${i + 1}` }));
  const columnas = Math.max(...nodos.map((n) => n.col)) + 1;
  const poolX = M.margen;
  const poolY = M.margen + M.tituloAlto;
  const contenidoX = poolX + M.poolCab + M.laneCab + M.colInicio;
  const poolAncho = M.poolCab + M.laneCab + M.colInicio + columnas * M.colAncho + 10;
  const poolAlto = proc.lanes.length * M.laneAlto;
  const lanes = proc.lanes.map((l, i) => ({ ...l, x: poolX + M.poolCab, y: poolY + i * M.laneAlto, w: poolAncho - M.poolCab, h: M.laneAlto, indice: i }));
  const laneDe = Object.fromEntries(lanes.map((l) => [l.id, l]));

  const pos = {};
  for (const n of nodos) {
    const lane = laneDe[n.lane];
    if (!lane) throw new Error(`${proc.id}: el nodo ${n.id} está en un carril que no existe (${n.lane})`);
    const [w, h] = tamano(n.tipo);
    const cx = contenidoX + n.col * M.colAncho + M.colAncho / 2;
    const cy = lane.y + lane.h / 2;
    pos[n.id] = { ...n, cx, cy, w, h, lane };
  }

  const puertos = (n) => ({
    der: [n.cx + n.w / 2, n.cy],
    izq: [n.cx - n.w / 2, n.cy],
    arr: [n.cx, n.cy - n.h / 2],
    aba: [n.cx, n.cy + n.h / 2],
  });

  const rutas = flujos.map((f) => {
    const a = pos[f.de];
    const b = pos[f.a];
    if (!a || !b) throw new Error(`${proc.id}: el flujo ${f.de} → ${f.a} usa un nodo que no existe`);
    const pa = puertos(a);
    const pb = puertos(b);
    let puntos;
    if (b.col > a.col) {
      if (a.lane === b.lane) puntos = [pa.der, pb.izq];
      else if (esCompuerta(a.tipo)) {
        const salida = b.cy < a.cy ? pa.arr : pa.aba;
        puntos = [salida, [a.cx, b.cy], pb.izq];
      } else {
        // Desde un evento, la bajada va junto al destino para no cruzar su nombre (que va debajo)
        const bajada = esEvento(a.tipo) ? pb.izq[0] - 22 : (pa.der[0] + pb.izq[0]) / 2;
        puntos = [pa.der, [bajada, a.cy], [bajada, b.cy], pb.izq];
      }
    } else if (f.via === 'arriba' || (a.lane === b.lane && f.via !== 'abajo')) {
      // Vuelta atrás por encima del carril de destino: no cruza las flechas que avanzan
      const y = b.lane.y + 16;
      puntos = [b.cy <= a.cy ? pa.arr : pa.aba, [a.cx, y], [b.cx, y], pb.arr];
    } else if (f.via === 'abajo') {
      const y = b.lane.y + b.lane.h - 14;
      puntos = [b.cy >= a.cy ? pa.aba : pa.arr, [a.cx, y], [b.cx, y], pb.aba];
    } else if (b.cy < a.cy) {
      // Vuelve a un carril de arriba: entra por debajo del destino
      const y = b.cy + b.h / 2 + 26;
      puntos = [pa.arr, [a.cx, y], [b.cx, y], pb.aba];
    } else {
      const y = b.cy - b.h / 2 - 26;
      puntos = [pa.aba, [a.cx, y], [b.cx, y], pb.arr];
    }
    return { ...f, puntos };
  });

  return { proc, nodos: Object.values(pos), flujos: rutas, lanes, poolX, poolY, poolAncho, poolAlto, ancho: poolX + poolAncho + M.margen, alto: poolY + poolAlto + M.margen };
}

// ------------------------------------------------------------------ validación del modelo
function validar(L) {
  const errores = [];
  const ids = new Set();
  for (const n of L.nodos) {
    if (ids.has(n.id)) errores.push(`id repetido: ${n.id}`);
    ids.add(n.id);
    const entra = L.flujos.filter((f) => f.a === n.id).length;
    const sale = L.flujos.filter((f) => f.de === n.id).length;
    if (!n.tipo.startsWith('inicio') && entra === 0) errores.push(`${n.id} no tiene flujo de entrada`);
    if (n.tipo !== 'fin' && sale === 0) errores.push(`${n.id} no tiene flujo de salida`);
    if (n.tipo === 'compuerta' && sale > 1) {
      for (const f of L.flujos.filter((f) => f.de === n.id)) if (!f.nombre) errores.push(`la salida ${n.id} → ${f.a} no dice su condición`);
    }
    if (n.tipo === 'compuertaEventos') {
      for (const f of L.flujos.filter((f) => f.de === n.id)) {
        const destino = L.nodos.find((d) => d.id === f.a);
        if (!['esperaTimer', 'esperaMensaje'].includes(destino?.tipo)) errores.push(`tras la compuerta de eventos ${n.id} debe venir un evento de espera`);
      }
    }
  }
  const celdas = new Set();
  for (const n of L.nodos) {
    const celda = `${n.lane.id}:${n.col}`;
    if (celdas.has(celda)) errores.push(`dos nodos en la misma celda (${celda})`);
    celdas.add(celda);
  }
  if (errores.length) throw new Error(`${L.proc.id}: ${errores.join('; ')}`);
}

// ------------------------------------------------------------------ BPMN 2.0 (XML con diagrama)
const TIPO_BPMN = {
  inicio: 'startEvent',
  inicioMensaje: 'startEvent',
  inicioTimer: 'startEvent',
  fin: 'endEvent',
  tareaUsuario: 'userTask',
  tareaServicio: 'serviceTask',
  tareaEnvio: 'sendTask',
  compuerta: 'exclusiveGateway',
  compuertaEventos: 'eventBasedGateway',
  esperaTimer: 'intermediateCatchEvent',
  esperaMensaje: 'intermediateCatchEvent',
};

function bpmnXml(L) {
  const p = L.proc;
  const nid = (id) => `Nodo_${id}`;
  const lineas = [];
  lineas.push('<?xml version="1.0" encoding="UTF-8"?>');
  lineas.push(
    `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" id="Definiciones_${p.id}" targetNamespace="https://revela.cl/bpmn" exporter="Revela (scripts/generar-bpmn.mjs)" exporterVersion="1.0">`
  );
  lineas.push(`  <bpmn:collaboration id="Colaboracion_${p.id}">`);
  lineas.push(`    <bpmn:documentation>${esc(p.titulo)}</bpmn:documentation>`);
  lineas.push(`    <bpmn:participant id="Participante_${p.id}" name="${esc(p.pool)}" processRef="Proceso_${p.id}" />`);
  lineas.push('  </bpmn:collaboration>');
  lineas.push(`  <bpmn:process id="Proceso_${p.id}" name="${esc(p.titulo)}" isExecutable="false">`);
  lineas.push(`    <bpmn:laneSet id="Carriles_${p.id}">`);
  for (const lane of L.lanes) {
    lineas.push(`      <bpmn:lane id="Carril_${lane.id}" name="${esc(lane.nombre)}">`);
    for (const n of L.nodos.filter((n) => n.lane.id === lane.id)) lineas.push(`        <bpmn:flowNodeRef>${nid(n.id)}</bpmn:flowNodeRef>`);
    lineas.push('      </bpmn:lane>');
  }
  lineas.push('    </bpmn:laneSet>');
  for (const n of L.nodos) {
    const tag = `bpmn:${TIPO_BPMN[n.tipo]}`;
    lineas.push(`    <${tag} id="${nid(n.id)}" name="${esc(n.nombre)}">`);
    for (const f of L.flujos.filter((f) => f.a === n.id)) lineas.push(`      <bpmn:incoming>${f.id}</bpmn:incoming>`);
    for (const f of L.flujos.filter((f) => f.de === n.id)) lineas.push(`      <bpmn:outgoing>${f.id}</bpmn:outgoing>`);
    if (n.tipo === 'inicioMensaje' || n.tipo === 'esperaMensaje') lineas.push(`      <bpmn:messageEventDefinition id="Mensaje_${n.id}" />`);
    if (n.tipo === 'esperaTimer' || n.tipo === 'inicioTimer') {
      lineas.push(`      <bpmn:timerEventDefinition id="Timer_${n.id}">`);
      lineas.push('        <bpmn:timeDuration xsi:type="bpmn:tFormalExpression">P30D</bpmn:timeDuration>');
      lineas.push('      </bpmn:timerEventDefinition>');
    }
    lineas.push(`    </${tag}>`);
  }
  for (const f of L.flujos) {
    lineas.push(`    <bpmn:sequenceFlow id="${f.id}"${f.nombre ? ` name="${esc(f.nombre)}"` : ''} sourceRef="${nid(f.de)}" targetRef="${nid(f.a)}" />`);
  }
  lineas.push('  </bpmn:process>');
  lineas.push(`  <bpmndi:BPMNDiagram id="Diagrama_${p.id}">`);
  lineas.push(`    <bpmndi:BPMNPlane id="Plano_${p.id}" bpmnElement="Colaboracion_${p.id}">`);
  const r = (v) => Math.round(v);
  lineas.push(`      <bpmndi:BPMNShape id="Participante_${p.id}_di" bpmnElement="Participante_${p.id}" isHorizontal="true">`);
  lineas.push(`        <dc:Bounds x="${r(L.poolX)}" y="${r(L.poolY)}" width="${r(L.poolAncho)}" height="${r(L.poolAlto)}" />`);
  lineas.push('      </bpmndi:BPMNShape>');
  for (const lane of L.lanes) {
    lineas.push(`      <bpmndi:BPMNShape id="Carril_${lane.id}_di" bpmnElement="Carril_${lane.id}" isHorizontal="true">`);
    lineas.push(`        <dc:Bounds x="${r(lane.x)}" y="${r(lane.y)}" width="${r(lane.w)}" height="${r(lane.h)}" />`);
    lineas.push('      </bpmndi:BPMNShape>');
  }
  for (const n of L.nodos) {
    const marca = n.tipo === 'compuerta' ? ' isMarkerVisible="true"' : '';
    lineas.push(`      <bpmndi:BPMNShape id="${nid(n.id)}_di" bpmnElement="${nid(n.id)}"${marca}>`);
    lineas.push(`        <dc:Bounds x="${r(n.cx - n.w / 2)}" y="${r(n.cy - n.h / 2)}" width="${r(n.w)}" height="${r(n.h)}" />`);
    if (!TIPO_BPMN[n.tipo].endsWith('Task')) {
      const e = etiquetaDe(L, n);
      const caja = cajaDe(e.lineas, e.tam, e.x, e.y, e.ancla);
      lineas.push(
        `        <bpmndi:BPMNLabel><dc:Bounds x="${r(caja.x0)}" y="${r(caja.y0)}" width="${r(caja.x1 - caja.x0)}" height="${r(caja.y1 - caja.y0)}" /></bpmndi:BPMNLabel>`
      );
    }
    lineas.push('      </bpmndi:BPMNShape>');
  }
  for (const f of L.flujos) {
    lineas.push(`      <bpmndi:BPMNEdge id="${f.id}_di" bpmnElement="${f.id}">`);
    for (const [x, y] of f.puntos) lineas.push(`        <di:waypoint x="${r(x)}" y="${r(y)}" />`);
    lineas.push('      </bpmndi:BPMNEdge>');
  }
  lineas.push('    </bpmndi:BPMNPlane>');
  lineas.push('  </bpmndi:BPMNDiagram>');
  lineas.push('</bpmn:definitions>');
  return `${lineas.join('\n')}\n`;
}

// ------------------------------------------------------------------ dibujo (SVG con notación BPMN)
const texto = (x, y, contenido, { tam = 13, peso = 400, color = C.texto, ancla = 'middle' } = {}) =>
  `<text x="${x}" y="${y}" font-size="${tam}" font-weight="${peso}" fill="${color}" text-anchor="${ancla}" font-family="${FUENTE}">${esc(contenido)}</text>`;

const textoVertical = (x, y, contenido, tam, peso, color) =>
  `<text x="${x}" y="${y}" font-size="${tam}" font-weight="${peso}" fill="${color}" text-anchor="middle" font-family="${FUENTE}" transform="rotate(-90 ${x} ${y})">${esc(contenido)}</text>`;

const lineasCentradas = (cx, cy, lineas, tam, color = C.texto, peso = 400) => {
  const alto = tam * 1.25;
  const y0 = cy - ((lineas.length - 1) * alto) / 2 + tam * 0.35;
  return lineas.map((l, i) => texto(cx, y0 + i * alto, l, { tam, color, peso })).join('');
};

const iconoUsuario = (x, y) =>
  `<circle cx="${x + 8}" cy="${y + 6}" r="3.6" fill="none" stroke="${C.icono}" stroke-width="1.5"/><path d="M ${x + 1.5} ${y + 17} Q ${x + 8} ${y + 8.5} ${x + 14.5} ${y + 17} Z" fill="none" stroke="${C.icono}" stroke-width="1.5"/>`;
const iconoServicio = (x, y) => {
  const cx = x + 8;
  const cy = y + 9;
  const dientes = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    return `<line x1="${cx + Math.cos(a) * 5}" y1="${cy + Math.sin(a) * 5}" x2="${cx + Math.cos(a) * 8}" y2="${cy + Math.sin(a) * 8}" stroke="${C.icono}" stroke-width="2.2" stroke-linecap="round"/>`;
  }).join('');
  return `${dientes}<circle cx="${cx}" cy="${cy}" r="5" fill="#FFFFFF" stroke="${C.icono}" stroke-width="1.5"/><circle cx="${cx}" cy="${cy}" r="1.8" fill="${C.icono}"/>`;
};
const sobre = (x, y, w, h, relleno) =>
  relleno
    ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="${C.icono}"/><path d="M ${x} ${y} L ${x + w / 2} ${y + h * 0.6} L ${x + w} ${y}" fill="none" stroke="#FFFFFF" stroke-width="1.3"/>`
    : `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="#FFFFFF" stroke="${C.espera}" stroke-width="1.4"/><path d="M ${x} ${y} L ${x + w / 2} ${y + h * 0.6} L ${x + w} ${y}" fill="none" stroke="${C.espera}" stroke-width="1.4"/>`;
const reloj = (cx, cy) =>
  `<circle cx="${cx}" cy="${cy}" r="10" fill="#FFFFFF" stroke="${C.espera}" stroke-width="1.5"/>${Array.from({ length: 12 }, (_, i) => {
    const a = (i * Math.PI) / 6;
    return `<line x1="${cx + Math.cos(a) * 8}" y1="${cy + Math.sin(a) * 8}" x2="${cx + Math.cos(a) * 9.6}" y2="${cy + Math.sin(a) * 9.6}" stroke="${C.espera}" stroke-width="1"/>`;
  }).join('')}<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - 6.5}" stroke="${C.espera}" stroke-width="1.5"/><line x1="${cx}" y1="${cy}" x2="${cx + 4.5}" y2="${cy + 1.5}" stroke="${C.espera}" stroke-width="1.5"/>`;

// ------------------------------------------------------------------ ubicación de etiquetas sin choques
const ALTO_LINEA = 15;
const anchoTexto = (linea, tam) => linea.length * tam * 0.56;
const cajaDe = (lineas, tam, x, yPrimera, ancla) => {
  const w = Math.max(...lineas.map((l) => anchoTexto(l, tam)));
  const x0 = ancla === 'end' ? x - w : ancla === 'middle' ? x - w / 2 : x;
  return { x0, y0: yPrimera - tam, x1: x0 + w, y1: yPrimera - tam + lineas.length * ALTO_LINEA + 2 };
};
const pisan = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const pisaSegmento = (caja, [x1, y1], [x2, y2]) =>
  pisan(caja, { x0: Math.min(x1, x2) - 2, x1: Math.max(x1, x2) + 2, y0: Math.min(y1, y2) - 2, y1: Math.max(y1, y2) + 2 });

function ubicarEtiqueta(L, n, lineas, tam, candidatos) {
  const libre = (c) => {
    const caja = cajaDe(lineas, tam, c.x, c.y, c.ancla);
    if (caja.y0 < L.poolY + 2 || caja.y1 > L.poolY + L.poolAlto - 2) return false;
    if (L.nodos.some((o) => pisan(caja, { x0: o.cx - o.w / 2 - 4, x1: o.cx + o.w / 2 + 4, y0: o.cy - o.h / 2 - 4, y1: o.cy + o.h / 2 + 4 }))) return false;
    return !L.flujos.some((f) => f.puntos.slice(1).some((p, i) => pisaSegmento(caja, f.puntos[i], p)));
  };
  return candidatos.find(libre) ?? candidatos[0];
}

function etiquetaDe(L, n) {
  const r = n.h / 2;
  if (esCompuerta(n.tipo)) {
    const lineas = partir(n.nombre, 16);
    const arriba = n.cy - r - 8 - (lineas.length - 1) * ALTO_LINEA;
    const abajo = n.cy + r + 18;
    const c = ubicarEtiqueta(L, n, lineas, 12, [
      { x: n.cx - 10, y: arriba, ancla: 'end' },
      { x: n.cx + 10, y: arriba, ancla: 'start' },
      { x: n.cx - 10, y: abajo, ancla: 'end' },
      { x: n.cx + 10, y: abajo, ancla: 'start' },
      { x: n.cx, y: arriba - 6, ancla: 'middle' },
    ]);
    return { lineas, tam: 12, peso: 600, ...c };
  }
  const lineas = partir(n.nombre, 20);
  const c = ubicarEtiqueta(L, n, lineas, 12, [
    { x: n.cx, y: n.cy + r + 18, ancla: 'middle' },
    { x: n.cx, y: n.cy - r - 10 - (lineas.length - 1) * ALTO_LINEA, ancla: 'middle' },
    { x: n.cx - r - 6, y: n.cy + r + 18, ancla: 'end' },
    { x: n.cx + r + 6, y: n.cy + r + 18, ancla: 'start' },
  ]);
  return { lineas, tam: 12, peso: 400, ...c };
}

const dibujarEtiqueta = (e) => e.lineas.map((l, i) => texto(e.x, e.y + i * ALTO_LINEA, l, { tam: e.tam, peso: e.peso, ancla: e.ancla })).join('');

function dibujarNodo(L, n) {
  const x = n.cx - n.w / 2;
  const y = n.cy - n.h / 2;
  const r = n.w / 2;
  const etiqueta = () => dibujarEtiqueta(etiquetaDe(L, n));
  switch (n.tipo) {
    case 'inicio':
    case 'inicioMensaje':
    case 'inicioTimer':
      return (
        `<circle cx="${n.cx}" cy="${n.cy}" r="${r}" fill="${C.inicioFondo}" stroke="${C.inicio}" stroke-width="2"/>` +
        (n.tipo === 'inicioMensaje' ? sobre(n.cx - 9, n.cy - 6, 18, 12, false).replaceAll(C.espera, C.inicio) : '') +
        (n.tipo === 'inicioTimer' ? reloj(n.cx, n.cy) : '') +
        etiqueta()
      );
    case 'fin':
      return `<circle cx="${n.cx}" cy="${n.cy}" r="${r - 1.5}" fill="${C.finFondo}" stroke="${C.fin}" stroke-width="4"/>${etiqueta()}`;
    case 'esperaTimer':
    case 'esperaMensaje':
      return (
        `<circle cx="${n.cx}" cy="${n.cy}" r="${r}" fill="${C.esperaFondo}" stroke="${C.espera}" stroke-width="1.6"/>` +
        `<circle cx="${n.cx}" cy="${n.cy}" r="${r - 4}" fill="none" stroke="${C.espera}" stroke-width="1.6"/>` +
        (n.tipo === 'esperaTimer' ? reloj(n.cx, n.cy) : sobre(n.cx - 8, n.cy - 5.5, 16, 11, false)) +
        etiqueta()
      );
    case 'compuerta':
    case 'compuertaEventos': {
      const d = `M ${n.cx} ${y} L ${n.cx + r} ${n.cy} L ${n.cx} ${y + n.h} L ${n.cx - r} ${n.cy} Z`;
      let marca;
      if (n.tipo === 'compuerta') {
        const s = 9;
        marca = `<path d="M ${n.cx - s} ${n.cy - s} L ${n.cx + s} ${n.cy + s} M ${n.cx + s} ${n.cy - s} L ${n.cx - s} ${n.cy + s}" stroke="${C.compuerta}" stroke-width="3.5" stroke-linecap="round"/>`;
      } else {
        const pent = Array.from({ length: 5 }, (_, i) => {
          const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
          return `${n.cx + Math.cos(a) * 7} ${n.cy + Math.sin(a) * 7}`;
        }).join(' L ');
        marca = `<circle cx="${n.cx}" cy="${n.cy}" r="14" fill="none" stroke="${C.compuerta}" stroke-width="1.4"/><circle cx="${n.cx}" cy="${n.cy}" r="11" fill="none" stroke="${C.compuerta}" stroke-width="1.4"/><path d="M ${pent} Z" fill="none" stroke="${C.compuerta}" stroke-width="1.4"/>`;
      }
      return `<path d="${d}" fill="${C.compuertaFondo}" stroke="${C.compuerta}" stroke-width="2"/>${marca}${etiqueta()}`;
    }
    default: {
      const icono =
        n.tipo === 'tareaUsuario' ? iconoUsuario(x + 7, y + 6) : n.tipo === 'tareaServicio' ? iconoServicio(x + 7, y + 5) : sobre(x + 8, y + 8, 17, 12, true);
      const lineas = partir(n.nombre, 20);
      return (
        `<rect x="${x}" y="${y}" width="${n.w}" height="${n.h}" rx="10" fill="${C.tarea}" stroke="${C.tareaBorde}" stroke-width="1.6"/>` +
        icono +
        // Con cuatro líneas, el texto baja un poco para no tocar el ícono de la esquina
        lineasCentradas(n.cx, n.cy + (lineas.length >= 4 ? 9 : 5), lineas, 12.5)
      );
    }
  }
}

function dibujarFlujo(f) {
  const d = f.puntos.map(([x, y], i) => `${i ? 'L' : 'M'} ${x} ${y}`).join(' ');
  let etiqueta = '';
  if (f.nombre) {
    const [[x1, y1], [x2, y2]] = f.puntos;
    if (x1 === x2) {
      const arriba = y2 < y1;
      etiqueta = texto(x1 + 7, y1 + (arriba ? -12 : 20), f.nombre, { tam: 11.5, color: C.suave, ancla: 'start', peso: 600 });
    } else {
      etiqueta = texto(x1 + 8, y1 - 8, f.nombre, { tam: 11.5, color: C.suave, ancla: 'start', peso: 600 });
    }
  }
  return `<path d="${d}" fill="none" stroke="${C.flujo}" stroke-width="1.6" marker-end="url(#flecha)"/>${etiqueta}`;
}

function svg(L) {
  const p = L.proc;
  const partes = [];
  partes.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${L.ancho}" height="${L.alto}" viewBox="0 0 ${L.ancho} ${L.alto}">`);
  partes.push(
    `<defs><marker id="flecha" viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${C.flujo}"/></marker></defs>`
  );
  partes.push(`<rect width="100%" height="100%" fill="${C.fondo}"/>`);
  partes.push(texto(M.margen, M.margen + 26, p.titulo, { tam: 24, peso: 700, ancla: 'start' }));
  partes.push(texto(M.margen, M.margen + 50, 'Diagrama de proceso BPMN 2.0 · Revela · editable en docs/bpmn/' + p.id + '.bpmn', { tam: 13, color: C.suave, ancla: 'start' }));

  // Pool y carriles
  partes.push(`<rect x="${L.poolX}" y="${L.poolY}" width="${L.poolAncho}" height="${L.poolAlto}" fill="${C.pool}" stroke="${C.poolBorde}" stroke-width="2"/>`);
  partes.push(textoVertical(L.poolX + M.poolCab / 2 + 5, L.poolY + L.poolAlto / 2, p.pool, 14, 700, C.poolBorde));
  for (const lane of L.lanes) {
    partes.push(`<rect x="${lane.x}" y="${lane.y}" width="${lane.w}" height="${lane.h}" fill="${lane.indice % 2 ? C.laneB : C.laneA}" stroke="${C.laneBorde}" stroke-width="1.2"/>`);
    partes.push(`<line x1="${lane.x + M.laneCab}" y1="${lane.y}" x2="${lane.x + M.laneCab}" y2="${lane.y + lane.h}" stroke="${C.laneBorde}" stroke-width="1.2"/>`);
    const lineas = partir(lane.nombre, 22);
    lineas.forEach((l, i) =>
      partes.push(textoVertical(lane.x + M.laneCab / 2 + 5 + (i - (lineas.length - 1) / 2) * 14, lane.y + lane.h / 2, l, 12.5, 600, C.texto))
    );
  }
  partes.push(`<rect x="${L.poolX}" y="${L.poolY}" width="${L.poolAncho}" height="${L.poolAlto}" fill="none" stroke="${C.poolBorde}" stroke-width="2"/>`);

  for (const f of L.flujos) partes.push(dibujarFlujo(f));
  for (const n of L.nodos) partes.push(dibujarNodo(L, n));
  partes.push('</svg>');
  return partes.join('\n');
}

// ------------------------------------------------------------------ generar
const CHROME_PATH = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const puppeteer = require('puppeteer-core');
const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: true });
try {
  const page = await browser.newPage();
  for (const proc of PROCESOS) {
    const L = layout(proc);
    validar(L);
    const xml = bpmnXml(L);
    const dibujo = svg(L);

    // El XML tiene que ser válido: lo revisa el parser del navegador
    const problema = await page.evaluate((x) => {
      const doc = new DOMParser().parseFromString(x, 'application/xml');
      return doc.getElementsByTagName('parsererror')[0]?.textContent ?? null;
    }, xml);
    if (problema) throw new Error(`${proc.id}.bpmn no es XML válido: ${problema}`);

    writeFileSync(`${OUT}/${proc.id}.bpmn`, xml, 'utf8');
    writeFileSync(`${OUT}/${proc.id}.svg`, dibujo, 'utf8');
    await page.setViewport({ width: Math.ceil(L.ancho), height: Math.ceil(L.alto), deviceScaleFactor: 2 });
    await page.setContent(`<!doctype html><html><body style="margin:0">${dibujo}</body></html>`);
    await page.screenshot({ path: `${OUT}/${proc.id}.png`, clip: { x: 0, y: 0, width: L.ancho, height: L.alto } });
    console.log(`✓ ${OUT}/${proc.id} (.bpmn .svg .png) · ${L.nodos.length} elementos, ${L.flujos.length} flujos`);
  }
} finally {
  await browser.close();
}
