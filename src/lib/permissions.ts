import type { AppUser, Company, UserRole } from '../types/crm';

export type ActiveTab = 'kpi' | 'kanban' | 'contact' | 'stages' | 'manager' | 'audit' | 'admin';

export const ROLE_LABEL: Record<UserRole, string> = {
  agent: 'Usuario base',
  manager: 'Gerente',
  superadmin: 'Administrador',
};

// Módulos visibles por perfil (el primero es la pestaña inicial).
// 'stages' (configuración de etapas del pipeline) está oculto por ahora: las etapas por defecto
// alcanzan para el piloto y la pestaña sobrecargaba la barra. El módulo sigue completo:
// para volver a mostrarlo basta con agregar 'stages' a la lista del gerente.
export const ROLE_TABS: Record<UserRole, ActiveTab[]> = {
  agent: ['kanban', 'contact'],
  manager: ['kpi', 'kanban', 'contact', 'manager', 'audit'],
  superadmin: ['admin'],
};

// El gerente también puede hacer todo lo del usuario base
export const canCaptureLeads = (role: UserRole) => role === 'agent' || role === 'manager';

// Solo gerencia puede retroceder un lead a una etapa anterior o revertir cambios del historial
export const canMoveLeadBackwards = (role: UserRole) => role === 'manager';
export const canRevertChanges = (role: UserRole) => role === 'manager';

export type AuthResult = { ok: true; user: AppUser } | { ok: false; error: string };

// Autenticación simulada. En producción: supabase.auth.signInWithPassword + perfil con RLS.
export function authenticate(
  email: string,
  password: string,
  users: AppUser[],
  companies: Company[]
): AuthResult {
  const user = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());

  if (!user || !user.password || user.password !== password) {
    return { ok: false, error: 'Email o contraseña incorrectos.' };
  }
  if (!user.isActive) {
    return { ok: false, error: 'Tu usuario está desactivado. Contacta al administrador.' };
  }
  if (user.role !== 'superadmin') {
    const company = companies.find((c) => c.id === user.companyId);
    if (!company || !company.isActive) {
      return {
        ok: false,
        error: 'El CRM de tu empresa está desactivado. Contacta al administrador de la plataforma.',
      };
    }
  }

  return { ok: true, user };
}
