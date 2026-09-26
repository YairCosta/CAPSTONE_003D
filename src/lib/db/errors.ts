// Mensajes para la persona a partir de un error de Supabase/PostgreSQL. Nunca se muestra el texto
// crudo de la base: puede traer nombres de tablas, restricciones o valores de otras filas.

export interface DbErrorLike {
  code?: string | null;
  message?: string | null;
  status?: number | null;
}

// Mensajes técnicos de PostgreSQL/PostgREST: nombran tablas, políticas o restricciones
const TECNICO = /row-level security|permission denied|violates|constraint|relation |column |syntax|function |duplicate key/i;

export function dbErrorMessage(error: DbErrorLike | null | undefined, fallback: string): string {
  if (!error) return fallback;
  // Los triggers de Revela también usan 42501 y 23514, pero con mensajes escritos para la persona
  const propio = error.message?.trim();
  if ((error.code === '42501' || error.code === '23514') && propio && !TECNICO.test(propio)) return propio;
  switch (error.code) {
    case '23505':
      return 'Ya existe un registro con esos datos (por ejemplo, el mismo identificador o email).';
    case '23503':
      return 'El registro hace referencia a algo que no existe o no está disponible.';
    case '23514':
      return 'Algún dato no cumple las reglas de la base (revisa los campos obligatorios).';
    case '42501':
      return 'Tu perfil no tiene permiso para hacer este cambio.';
    case 'PGRST116':
      return 'No se encontró el registro, o tu perfil no puede verlo.';
    case 'P0001':
      // Mensajes de los triggers de Revela: se escriben pensando en la persona, en español
      return error.message?.trim() || fallback;
  }
  if (error.status === 401 || error.status === 403) return 'Tu sesión expiró. Vuelve a iniciar sesión.';
  return fallback;
}

/** Traduce los errores de inicio de sesión de Supabase Auth sin revelar si el email existe. */
export function authErrorMessage(error: DbErrorLike | null | undefined): string {
  const code = error?.code ?? '';
  const message = (error?.message ?? '').toLowerCase();
  if (code === 'email_not_confirmed' || message.includes('not confirmed')) {
    return 'Tu cuenta aún no está confirmada. Abre el enlace de invitación que te llegó por correo.';
  }
  if (code === 'over_request_rate_limit' || error?.status === 429) {
    return 'Demasiados intentos seguidos. Espera un momento antes de volver a intentarlo.';
  }
  if (code === 'invalid_credentials' || message.includes('invalid login')) return 'Email o contraseña incorrectos.';
  if (error?.status === 0 || message.includes('fetch')) return 'No hay conexión con el servidor. Revisa tu internet.';
  return 'No se pudo iniciar sesión. Inténtalo de nuevo.';
}
