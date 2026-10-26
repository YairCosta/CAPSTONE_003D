// Tildes de los nombres de zona. Varias fuentes oficiales vienen sin tildes (Costa Rica, Ecuador,
// Honduras, los distritos de Perú): "San Jose", "Concepcion de Maria". Se corrigen solo palabras que en
// español se escriben siempre igual, sacadas de las fuentes que sí traen tildes (México, Colombia,
// Guatemala…) y revisadas a mano. Una palabra que no está en la lista queda como viene: mejor sin tilde
// que con una equivocada. No se usa en Brasil (portugués: "Rio", "Maria"). La ñ no va aquí: es otra
// letra, y "Canas" (Cusco) y "Cañas" (Guanacaste) existen las dos; esas van en CORRECCIONES del importador.
// Tampoco "César": el departamento colombiano es Cesar, sin tilde (por el río).

const PALABRAS = [
  // Nombres de santos y de pila
  'Agustín', 'Andrés', 'Ángel', 'Ángeles', 'Bárbara', 'Bartolomé', 'Benjamín', 'Cristóbal', 'Damián',
  'Elías', 'Fabián', 'Germán', 'Héctor', 'Hernán', 'Inés', 'Jerónimo', 'Jesús', 'Joaquín', 'José', 'Julián',
  'Lucía', 'María', 'Martín', 'Matías', 'Nicolás', 'Ramón', 'Raúl', 'Rubén', 'Sebastián', 'Simón', 'Tomás',
  'Víctor',
  // Apellidos
  'Álvarez', 'Báez', 'Benítez', 'Cáceres', 'Carrión', 'Chávez', 'Díaz', 'Domínguez', 'Fernández', 'Gálvez',
  'Gómez', 'González', 'Gutiérrez', 'Hernández', 'Jiménez', 'Juárez', 'López', 'Márquez', 'Martínez', 'Mejía',
  'Méndez', 'Morazán', 'Pérez', 'Piérola', 'Ramírez', 'Rodríguez', 'Sánchez', 'Suárez', 'Valcárcel', 'Vásquez',
  'Vázquez', 'Velásquez', 'Zeledón',
  // Lugares y palabras comunes en nombres de zona
  'Belén', 'Bolívar', 'Colón', 'Córdoba', 'Cortés', 'Junín', 'León', 'Limón', 'México', 'Pacífico',
  'Panamá', 'Paraíso', 'Perú', 'Río', 'Unión',
];

const sinTilde = (texto) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '');
const MAPA = new Map(PALABRAS.map((p) => [sinTilde(p).toLowerCase(), p.toLowerCase()]));

const conMayuscula = (original, corregida) =>
  original[0] === original[0].toUpperCase() ? corregida[0].toUpperCase() + corregida.slice(1) : corregida;

const corregirPalabra = (palabra) => {
  // Solo palabras escritas sin ningún acento: lo que ya trae tilde o ñ se respeta
  if (/\P{ASCII}/u.test(palabra)) return palabra;
  const minuscula = palabra.toLowerCase();
  const exacta = MAPA.get(minuscula);
  if (exacta) return conMayuscula(palabra, exacta);
  // Terminadas en -ción y -sión: siempre con tilde en español (Asunción, Concepción, Ascensión)
  if (minuscula.length >= 6 && /[cs]ion$/.test(minuscula)) return `${palabra.slice(0, -3)}ión`;
  return palabra;
};

/**
 * "San Jose de la Concepcion" → "San José de la Concepción". Palabra por palabra, enteras: "Mariaña" no se
 * toca por contener "Maria".
 */
export const conTildes = (nombre) => String(nombre).replace(/\p{L}+/gu, corregirPalabra);
