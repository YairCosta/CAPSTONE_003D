import type { Lead } from '../types/crm';
import type { CountryCode } from '../data/countries';

// Búsqueda de leads YA existentes en el CRM, pensada para el asistente de IA.
// Sin esto, el asistente solo sabía crear leads: pedirle "mueve a Carolina Peña a descartado"
// terminaba creando un duplicado porque el nombre de la empresa no calzaba exacto.

export const normalizeText = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // acentos
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const digitsOf = (value: string) => value.replace(/\D/g, '');

export interface LeadMatch {
  lead: Lead;
  score: number; // 0 a 1
}

export interface LeadQuery {
  query?: string; // texto libre: persona, empresa, email o teléfono
  countryCode?: CountryCode;
}

// Puntaje de coincidencia. Alto = casi seguro es este lead; bajo = solo se parece.
export function scoreLead(lead: Lead, rawQuery: string): number {
  const q = normalizeText(rawQuery);
  if (!q) return 0;

  const nombre = normalizeText(lead.fullName);
  const empresa = normalizeText(lead.companyName ?? '');
  const email = normalizeText(lead.email ?? '');
  const telefono = digitsOf(lead.phone ?? '');
  const qDigits = digitsOf(rawQuery);

  // Identificadores únicos: no hay ambigüedad posible
  if (lead.id === rawQuery.trim()) return 1;
  if (email && email === q) return 1;
  if (telefono && qDigits.length >= 7 && telefono.endsWith(qDigits)) return 1;

  if (nombre === q || empresa === q) return 0.95;
  if (nombre.includes(q) || q.includes(nombre)) return 0.85;
  if (empresa.includes(q) || q.includes(empresa)) return 0.8;

  // El usuario suele escribir el nombre pegado: "bancoandes" por "Banco Andes Sucursales".
  // Comparar sin espacios recupera esos casos, que son los que antes creaban duplicados.
  const sinEspacios = (value: string) => value.replace(/\s/g, '');
  const qCompacta = sinEspacios(q);
  if (qCompacta.length >= 4) {
    for (const campo of [empresa, nombre]) {
      const compacto = sinEspacios(campo);
      if (compacto && (compacto.includes(qCompacta) || qCompacta.includes(compacto))) return 0.8;
    }
  }

  // Coincidencia por palabras: "banco andes" contra "Banco Andes Sucursales".
  // Las palabras de una letra se ignoran para que "y" o "e" no sumen.
  const palabras = q.split(' ').filter((w) => w.length > 1);
  if (palabras.length === 0) return 0;
  const texto = `${nombre} ${empresa} ${normalizeText(lead.notes ?? '')}`;
  const aciertos = palabras.filter((w) => texto.includes(w)).length;
  const proporcion = aciertos / palabras.length;
  return proporcion >= 0.5 ? 0.4 + proporcion * 0.3 : 0;
}

// Coincidencias ordenadas de mejor a peor. `leads` ya viene acotado al CRM del usuario.
export function findLeadMatches(leads: Lead[], { query = '', countryCode }: LeadQuery, limit = 8): LeadMatch[] {
  const candidatos = countryCode ? leads.filter((l) => l.countryCode === countryCode) : leads;
  return candidatos
    .map((lead) => ({ lead, score: scoreLead(lead, query) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || a.lead.fullName.localeCompare(b.lead.fullName, 'es'))
    .slice(0, limit);
}

// Umbral para actuar sin preguntar: por encima, el asistente puede dar por hecho que es ese lead.
export const CONFIDENT_MATCH = 0.8;

// ¿Hay un lead claramente equivalente al que se quiere crear? Si lo hay, crear otro sería duplicar.
export function findDuplicateCandidates(
  leads: Lead[],
  data: { companyName: string; contactName?: string; phone?: string; countryCode?: CountryCode },
  limit = 5
): LeadMatch[] {
  const consultas = [data.companyName, data.contactName, data.phone].filter((v): v is string => Boolean(v && v.trim()));
  const mejores = new Map<string, LeadMatch>();
  for (const consulta of consultas) {
    for (const match of findLeadMatches(leads, { query: consulta, countryCode: data.countryCode }, limit)) {
      const previo = mejores.get(match.lead.id);
      if (!previo || match.score > previo.score) mejores.set(match.lead.id, match);
    }
  }
  return [...mejores.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}
