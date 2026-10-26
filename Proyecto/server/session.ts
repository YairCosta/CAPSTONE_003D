// Quién llama a la API (/api/*): se verifica su sesión de Supabase con Auth y se lee su perfil con la
// clave secreta. Nunca se confía en lo que diga el navegador sobre su rol o su CRM.
// Lo usan las invitaciones (server/adminUsers.ts) y el asistente de IA (server/aiChat.ts).
import type { IncomingMessage } from 'node:http';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { UserRole } from '../src/types/crm.ts';

export interface SessionCaller {
  userId: string;
  role: UserRole;
  companyId: string | null;
  /** Usuario activo y, si pertenece a un CRM, ese CRM también activo */
  isActive: boolean;
}

/** Resultado de revisar un token: inválido, válido sin perfil en Revela, o válido con perfil. */
export type CallerCheck = { valid: false } | { valid: true; caller: SessionCaller | null };

export const bearerToken = (req: IncomingMessage): string => {
  const auth = req.headers.authorization ?? '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
};

export async function identifyCaller(admin: SupabaseClient, token: string): Promise<CallerCheck> {
  if (!token) return { valid: false };
  const { data: sesion, error } = await admin.auth.getUser(token);
  if (error || !sesion?.user) return { valid: false };

  const { data: perfil } = await admin.from('profiles').select('role, company_id, is_active').eq('id', sesion.user.id).maybeSingle();
  if (!perfil) return { valid: true, caller: null };

  let activo = Boolean(perfil.is_active);
  if (perfil.role !== 'superadmin' && perfil.company_id) {
    const { data: crm } = await admin.from('companies').select('is_active').eq('id', perfil.company_id).maybeSingle();
    activo = activo && Boolean(crm?.is_active);
  }
  return {
    valid: true,
    caller: { userId: sesion.user.id, role: perfil.role as UserRole, companyId: perfil.company_id, isActive: activo },
  };
}

/**
 * Límite de uso por persona dentro de una ventana de tiempo. Vive en la memoria de cada instancia
 * del servidor: frena el abuso de una sesión, no reemplaza un límite global.
 */
export function createRateLimiter({ max, windowMs, now = () => Date.now() }: { max: number; windowMs: number; now?: () => number }) {
  const uso = new Map<string, number[]>();
  return (key: string): boolean => {
    const ahora = now();
    const recientes = (uso.get(key) ?? []).filter((t) => ahora - t < windowMs);
    if (recientes.length >= max) {
      uso.set(key, recientes);
      return false;
    }
    recientes.push(ahora);
    uso.set(key, recientes);
    return true;
  };
}
