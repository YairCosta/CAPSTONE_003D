// Reglas de contraseña de la cuenta propia.
//
// En la demo los datos viven en memoria y la contraseña se guarda tal cual, solo para mostrar el
// flujo. Con Supabase (VITE_DATA_SOURCE=supabase) la autenticación la resuelve Supabase Auth: la
// contraseña viaja por HTTPS, se guarda con hash y ni la plataforma ni el CRM del cliente pueden
// leerla (Ley 21.719, principio de seguridad). Estas funciones validan lo que sí es responsabilidad
// de la aplicación: que la nueva sea razonable y, al cambiarla, que la persona pruebe la actual.

export const MIN_PASSWORD_LENGTH = 8;

export interface PasswordChange {
  current: string;
  next: string;
  confirm: string;
}

/** Reglas de una contraseña nueva (invitación, recuperación o cambio). Devuelve el error o null. */
export const validateNewPassword = (next: string, confirm: string, current?: string): string | null => {
  if (!next || !confirm) return 'Completa la contraseña y su confirmación.';
  if (next.length < MIN_PASSWORD_LENGTH) return `La nueva contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  if (!/[a-zA-Z]/.test(next) || !/[0-9]/.test(next)) return 'La nueva contraseña debe combinar letras y números.';
  if (current !== undefined && next === current) return 'La nueva contraseña tiene que ser distinta de la actual.';
  if (next !== confirm) return 'La nueva contraseña y su confirmación no coinciden.';
  return null;
};

/** Cambio de contraseña en la demo. Devuelve el mensaje de error, o null si el cambio es válido. */
export const validatePasswordChange = (storedPassword: string, { current, next, confirm }: PasswordChange): string | null => {
  if (!current || !next || !confirm) return 'Completa los tres campos.';
  if (current !== storedPassword) return 'La contraseña actual no es correcta.';
  return validateNewPassword(next, confirm, current);
};
