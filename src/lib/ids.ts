// IDs únicos. Evita colisiones cuando se crean varios registros en el mismo milisegundo
// (por ejemplo, el asistente IA guardando dos leads en un mismo turno).
export function newId(prefix: string): string {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}-${uuid}`;
}
