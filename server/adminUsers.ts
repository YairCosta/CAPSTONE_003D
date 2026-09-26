// Invitaciones de usuarios (/api/admin/*), dentro del servidor de Vite; en producción, una Edge Function.
//
// Invitar exige la clave secreta de Supabase (service_role), que salta RLS: por eso vive solo aquí y
// nunca en el navegador. Quien invita se identifica con SU sesión (Authorization: Bearer <token>), y
// authorizeInvite() decide si puede. La persona invitada recibe un correo y elige su propia
// contraseña: nadie más la conoce (Ley 21.719, invariante 10 de CLAUDE.md).
//
// Los registros del servidor no llevan correos ni nombres (invariante 8).

import type { IncomingMessage, ServerResponse } from 'node:http';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { authorizeInvite } from '../src/lib/userAdmin.ts';
import type { UserRole } from '../src/types/crm.ts';

export interface AdminServerConfig {
  supabaseUrl?: string;
  serviceKey?: string;
  appUrl: string;
  /** Para pruebas: permite reemplazar el cliente de Supabase */
  createAdminClient?: (url: string, key: string) => SupabaseClient;
}

const MAX_BODY_BYTES = 10_000;

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let excedido = false;
    req.on('data', (chunk: Buffer) => {
      if (excedido) return;
      size += chunk.length;
      // Se deja de acumular pero no se corta la conexión: así el 400 alcanza a llegar
      if (size > MAX_BODY_BYTES) {
        excedido = true;
        reject(new Error('demasiado grande'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new Error('JSON inválido'));
      }
    });
    req.on('error', reject);
  });
}

export function createAdminMiddleware(config: AdminServerConfig) {
  const enabled = Boolean(config.supabaseUrl && config.serviceKey);
  const makeClient =
    config.createAdminClient ??
    ((url: string, key: string) => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));

  return async (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => {
    const path = (req.url ?? '').split('?')[0];

    if (req.method === 'GET' && path === '/status') {
      sendJson(res, 200, { invitationsEnabled: enabled });
      return;
    }
    if (path !== '/invite') {
      next();
      return;
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Método no permitido.' });
      return;
    }
    if (!enabled) {
      sendJson(res, 503, {
        error: 'Las invitaciones no están configuradas: falta SUPABASE_SERVICE_ROLE_KEY en .env.local del servidor.',
      });
      return;
    }

    const auth = req.headers.authorization ?? '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!token) {
      sendJson(res, 401, { error: 'Inicia sesión para invitar usuarios.' });
      return;
    }

    try {
      const admin = makeClient(config.supabaseUrl!, config.serviceKey!);

      // 1. Quién llama: se verifica su sesión con Auth, no se confía en lo que diga el cuerpo
      const { data: sesion, error: errorSesion } = await admin.auth.getUser(token);
      if (errorSesion || !sesion?.user) {
        sendJson(res, 401, { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' });
        return;
      }
      const { data: perfil } = await admin
        .from('profiles')
        .select('role, company_id, is_active')
        .eq('id', sesion.user.id)
        .maybeSingle();
      let callerActivo = Boolean(perfil?.is_active);
      if (perfil && perfil.role !== 'superadmin' && perfil.company_id) {
        const { data: crm } = await admin.from('companies').select('is_active').eq('id', perfil.company_id).maybeSingle();
        callerActivo = callerActivo && Boolean(crm?.is_active);
      }

      // 2. Qué pide y si puede
      const body = await readJson(req);
      const decision = authorizeInvite(
        perfil ? { role: perfil.role as UserRole, companyId: perfil.company_id, isActive: callerActivo } : null,
        body
      );
      if (!decision.ok) {
        sendJson(res, decision.status, { error: decision.error });
        return;
      }
      const invite = decision.invite;

      if (invite.companyId) {
        const { data: destino } = await admin.from('companies').select('is_active').eq('id', invite.companyId).maybeSingle();
        if (!destino) {
          sendJson(res, 404, { error: 'El CRM no existe.' });
          return;
        }
        if (!destino.is_active) {
          sendJson(res, 409, { error: 'Ese CRM está desactivado: actívalo antes de invitar personas.' });
          return;
        }
      }

      const { data: existente } = await admin.from('profiles').select('id').eq('email', invite.email).maybeSingle();
      if (existente) {
        sendJson(res, 409, { error: 'Ya existe un usuario con ese email.' });
        return;
      }

      // 3. Invitación: Supabase envía el correo y la persona elige su contraseña
      const { data: invitado, error: errorInvitacion } = await admin.auth.admin.inviteUserByEmail(invite.email, {
        data: { full_name: invite.fullName },
        redirectTo: config.appUrl,
      });
      if (errorInvitacion || !invitado?.user) {
        const mensaje = (errorInvitacion?.message ?? '').toLowerCase();
        const codigo = (errorInvitacion as { code?: string } | null)?.code ?? '';
        console.warn('[admin/invite] Supabase rechazó la invitación:', errorInvitacion?.status ?? 'sin estado', codigo);
        if (codigo === 'email_address_not_authorized' || mensaje.includes('not authorized')) {
          sendJson(res, 422, {
            error:
              'El correo de prueba de Supabase solo envía a los miembros de tu proyecto. Para invitar a otras personas configura un SMTP propio en Supabase (Authentication → Emails → SMTP Settings).',
          });
        } else if (mensaje.includes('already') || mensaje.includes('registered')) {
          sendJson(res, 409, { error: 'Ese email ya tiene una cuenta en Supabase.' });
        } else if (errorInvitacion?.status === 429 || mensaje.includes('rate')) {
          sendJson(res, 429, {
            error:
              'Supabase limitó el envío de correos. El correo de prueba de Supabase solo envía unos pocos por hora y solo a miembros del equipo: para clientes hay que configurar un SMTP propio.',
          });
        } else {
          sendJson(res, 502, { error: 'Supabase no pudo enviar la invitación. Inténtalo de nuevo.' });
        }
        return;
      }

      // 4. Perfil con su CRM y rol. Si falla, se deshace la invitación para no dejar usuarios huérfanos
      const fila = {
        id: invitado.user.id,
        company_id: invite.companyId,
        full_name: invite.fullName,
        email: invite.email,
        role: invite.role,
        is_active: true,
      };
      const { data: creado, error: errorPerfil } = await admin
        .from('profiles')
        .insert(fila)
        .select('id, company_id, full_name, email, role, is_active, created_at')
        .single();
      if (errorPerfil || !creado) {
        console.warn('[admin/invite] No se pudo crear el perfil; se deshace la invitación:', errorPerfil?.code ?? 'sin código');
        await admin.auth.admin.deleteUser(invitado.user.id);
        sendJson(res, 500, { error: 'No se pudo crear el perfil del usuario. No se envió ninguna cuenta a medias.' });
        return;
      }

      sendJson(res, 200, { ok: true, profile: creado });
    } catch (error) {
      const motivo = (error as Error)?.message ?? '';
      if (motivo === 'demasiado grande' || motivo === 'JSON inválido') {
        sendJson(res, 400, { error: 'Solicitud inválida.' });
        return;
      }
      console.error('[admin/invite] Error inesperado:', motivo.slice(0, 120));
      sendJson(res, 500, { error: 'No se pudo completar la invitación.' });
    }
  };
}
