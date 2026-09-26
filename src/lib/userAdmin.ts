// Quién puede invitar a quién. Lo aplica el servidor antes de usar la clave secreta de Supabase:
// la invitación crea el usuario en Auth y su perfil saltándose RLS, así que esta regla es la única
// barrera. Función pura: se prueba en npm run test:supabase.

import type { UserRole } from '../types/crm.ts';

export interface InviteCaller {
  role: UserRole | null;
  companyId: string | null;
  isActive: boolean;
}

export interface InviteRequest {
  email: string;
  fullName: string;
  role: UserRole;
  companyId: string | null;
}

export type InviteDecision = { ok: true; invite: InviteRequest } | { ok: false; status: number; error: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES: UserRole[] = ['agent', 'manager', 'superadmin'];

export function authorizeInvite(caller: InviteCaller | null, body: unknown): InviteDecision {
  if (!caller || !caller.isActive || !caller.role) {
    return { ok: false, status: 403, error: 'Tu usuario no puede invitar a otras personas.' };
  }

  const datos = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const email = typeof datos.email === 'string' ? datos.email.trim().toLowerCase() : '';
  const fullName = typeof datos.fullName === 'string' ? datos.fullName.trim().slice(0, 200) : '';
  const role = ROLES.includes(datos.role as UserRole) ? (datos.role as UserRole) : null;
  const companyId = typeof datos.companyId === 'string' && datos.companyId ? datos.companyId : null;

  if (!EMAIL.test(email)) return { ok: false, status: 400, error: 'Ingresa un email válido.' };
  if (!fullName) return { ok: false, status: 400, error: 'Ingresa el nombre de la persona.' };
  if (!role) return { ok: false, status: 400, error: 'Perfil no válido.' };
  if (role !== 'superadmin' && !companyId) return { ok: false, status: 400, error: 'Selecciona el CRM al que pertenece.' };

  if (caller.role === 'superadmin') {
    return { ok: true, invite: { email, fullName, role, companyId: role === 'superadmin' ? null : companyId } };
  }

  // Gerencia invita solo a su propio CRM, y nunca administradores de plataforma
  if (caller.role === 'manager') {
    if (role === 'superadmin') {
      return { ok: false, status: 403, error: 'Solo el administrador de la plataforma crea administradores.' };
    }
    if (!caller.companyId || companyId !== caller.companyId) {
      return { ok: false, status: 403, error: 'Solo puedes invitar personas a tu propio CRM.' };
    }
    return { ok: true, invite: { email, fullName, role, companyId } };
  }

  return { ok: false, status: 403, error: 'Tu perfil no puede invitar a otras personas.' };
}
