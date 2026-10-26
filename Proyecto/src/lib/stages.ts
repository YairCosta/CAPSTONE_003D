import type { CommercialStatus } from '../types/crm.ts';

// Nombre corto de cada etapa, para etiquetas, fichas y exportaciones. Las columnas del pipeline
// usan el nombre que cada CRM configura (StageConfig.label).
export const STATUS_LABEL: Record<CommercialStatus, string> = {
  new: 'Nuevo',
  contacted: 'Contactado',
  qualified: 'Calificado',
  proposal: 'Propuesta',
  pending_payment: 'Pago pendiente',
  won: 'Ganado',
  lost: 'Perdido',
};
