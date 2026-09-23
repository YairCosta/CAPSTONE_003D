// Reglas de contraseña de la cuenta propia.
//
// Hoy los datos viven en memoria y la contraseña se guarda tal cual, solo para la demostración.
// En producción la autenticación la resuelve Supabase Auth: la contraseña viaja por HTTPS, se
// guarda con hash y ni la plataforma ni el CRM del cliente pueden leerla (Ley 21.719, principio de
// seguridad). Esta función valida lo que sí es responsabilidad de la aplicación: que la persona
// pruebe su contraseña actual y que la nueva sea razonable.

export const MIN_PASSWORD_LENGTH = 8;

export interface PasswordChange {
  current: string;
  next: string;
  confirm: string;
}

/** Devuelve el mensaje de error, o null si el cambio es válido. */
export const validatePasswordChange = (storedPassword: string, { current, next, confirm }: PasswordChange): string | null => {
  if (!current || !next || !confirm) return 'Completa los tres campos.';
  if (current !== storedPassword) return 'La contraseña actual no es correcta.';
  if (next.length < MIN_PASSWORD_LENGTH) return `La nueva contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  if (!/[a-zA-Z]/.test(next) || !/[0-9]/.test(next)) return 'La nueva contraseña debe combinar letras y números.';
  if (next === current) return 'La nueva contraseña tiene que ser distinta de la actual.';
  if (next !== confirm) return 'La nueva contraseña y su confirmación no coinciden.';
  return null;
};
