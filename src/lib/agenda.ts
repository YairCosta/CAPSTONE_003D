import type { Lead, LeadActivity, ContactChannel } from '../types/crm';
import { canContact } from './privacy.ts';

// Agenda de seguimientos: reúne en un solo lugar los "próximo contacto agendado" que hoy
// quedan escondidos dentro de cada bitácora. Sin esto hay que abrir lead por lead para
// saber a quién toca llamar.

export type FollowUpBucket = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later';

export interface FollowUp {
  leadId: string;
  leadName: string;
  companyName?: string;
  contactName?: string; // con quién se acordó el próximo contacto
  channel: ContactChannel;
  date: string; // ISO del compromiso
  dayKey: string; // AAAA-MM-DD en hora local, para agrupar por día
  agentName: string;
  summary: string;
  bucket: FollowUpBucket;
}

export const BUCKET_LABEL: Record<FollowUpBucket, string> = {
  overdue: 'Atrasados',
  today: 'Hoy',
  tomorrow: 'Mañana',
  week: 'Esta semana',
  later: 'Más adelante',
};

export const BUCKET_ORDER: FollowUpBucket[] = ['overdue', 'today', 'tomorrow', 'week', 'later'];

// Clave de día en hora local (no UTC): lo que el usuario ve como "hoy" en su pantalla
export const dayKeyOf = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const bucketFor = (date: Date, now: Date): FollowUpBucket => {
  const dias = Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / 86400000);
  if (dias < 0) return 'overdue';
  if (dias === 0) return 'today';
  if (dias === 1) return 'tomorrow';
  return dias <= 7 ? 'week' : 'later';
};

// Compromiso vigente de un lead: el de su última interacción. Si después se registró otro
// contacto, el compromiso anterior ya fue atendido y deja de aparecer.
// Los leads ganados y perdidos quedan fuera: no hay nada que seguir.
// Tampoco aparece quien se opuso, revocó su consentimiento o tiene una solicitud pendiente:
// la agenda no puede empujar a contactar a alguien que pidió lo contrario (Ley 21.719, arts. 8 y 8 ter).
export function pendingFollowUps(leads: Lead[], activities: LeadActivity[], now: Date = new Date()): FollowUp[] {
  const ultimaPorLead = new Map<string, LeadActivity>();
  for (const act of activities) {
    const previa = ultimaPorLead.get(act.leadId);
    if (!previa || act.createdAt > previa.createdAt) ultimaPorLead.set(act.leadId, act);
  }

  const resultado: FollowUp[] = [];
  for (const lead of leads) {
    if (lead.commercialStatus === 'won' || lead.commercialStatus === 'lost') continue;
    if (!canContact(lead)) continue;
    const ultima = ultimaPorLead.get(lead.id);
    if (!ultima?.nextFollowUpDate) continue;
    const fecha = new Date(ultima.nextFollowUpDate);
    if (Number.isNaN(fecha.getTime())) continue;

    resultado.push({
      leadId: lead.id,
      leadName: lead.fullName,
      companyName: lead.companyName,
      contactName: ultima.contactName,
      channel: ultima.channel,
      date: ultima.nextFollowUpDate,
      dayKey: dayKeyOf(fecha),
      agentName: ultima.agentName,
      summary: ultima.summary,
      bucket: bucketFor(fecha, now),
    });
  }

  return resultado.sort((a, b) => a.date.localeCompare(b.date));
}

// Seguimientos por día, para pintar el calendario del mes
export function countsByDay(followUps: FollowUp[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const f of followUps) counts.set(f.dayKey, (counts.get(f.dayKey) ?? 0) + 1);
  return counts;
}

// Días del mes que se muestran en la grilla, completando la primera y la última semana
// para que el calendario siempre tenga semanas enteras (lunes a domingo).
export function monthGrid(year: number, month: number): Date[] {
  const primero = new Date(year, month, 1);
  const desplazamiento = (primero.getDay() + 6) % 7; // 0 = lunes
  const inicio = new Date(year, month, 1 - desplazamiento);
  const dias: Date[] = [];
  for (let i = 0; i < 42; i++) dias.push(new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i));
  // La sexta fila solo se dibuja si el mes la necesita
  return dias.filter((d, i) => i < 35 || d.getMonth() === month);
}

export const CHANNEL_LABEL: Record<ContactChannel, string> = {
  call: 'Llamada',
  whatsapp: 'WhatsApp',
  email: 'Email',
  meeting: 'Reunión',
  video_call: 'Videollamada',
};
