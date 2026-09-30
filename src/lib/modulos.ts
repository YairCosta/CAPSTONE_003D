// Módulos que no hacen falta en la primera pantalla: se descargan cuando se abren. Así el login y el
// encabezado cargan rápido, cada perfil baja solo lo que usa (el usuario base nunca baja el mapa, y
// solo el administrador baja su panel y el portal fiscalizador) y publicar un cambio no obliga a
// volver a bajar todo. Después de entrar, precargarModulos() baja en segundo plano los del perfil,
// para que cambiar de pestaña siga siendo instantáneo.
import { lazy } from 'react';
import type { UserRole } from '../types/crm';

const cargas = {
  mapa: () => import('../components/GeoStrategicMap'),
  productos: () => import('../components/CatalogInsights'),
  captura: () => import('../components/LeadCaptureModal'),
  pipeline: () => import('../components/KanbanBoard'),
  contacto: () => import('../components/ContactModule'),
  gerencia: () => import('../components/ManagerModule'),
  auditoria: () => import('../components/AuditModule'),
  etapas: () => import('../components/StageAdminModule'),
  administracion: () => import('../components/AdminModule'),
  asistente: () => import('../components/AiChatWidget'),
};

export const GeoStrategicMap = lazy(() => cargas.mapa().then((m) => ({ default: m.GeoStrategicMap })));
export const CatalogInsights = lazy(() => cargas.productos().then((m) => ({ default: m.CatalogInsights })));
export const LeadCaptureModal = lazy(() => cargas.captura().then((m) => ({ default: m.LeadCaptureModal })));
export const KanbanBoard = lazy(() => cargas.pipeline().then((m) => ({ default: m.KanbanBoard })));
export const ContactModule = lazy(() => cargas.contacto().then((m) => ({ default: m.ContactModule })));
export const ManagerModule = lazy(() => cargas.gerencia().then((m) => ({ default: m.ManagerModule })));
export const AuditModule = lazy(() => cargas.auditoria().then((m) => ({ default: m.AuditModule })));
export const StageAdminModule = lazy(() => cargas.etapas().then((m) => ({ default: m.StageAdminModule })));
export const AdminModule = lazy(() => cargas.administracion().then((m) => ({ default: m.AdminModule })));
export const AiChatWidget = lazy(() => cargas.asistente().then((m) => ({ default: m.AiChatWidget })));

const POR_PERFIL: Record<UserRole, (keyof typeof cargas)[]> = {
  agent: ['pipeline', 'contacto', 'captura', 'asistente'],
  manager: ['mapa', 'productos', 'pipeline', 'contacto', 'gerencia', 'auditoria', 'captura', 'asistente'],
  superadmin: ['administracion'],
};

/** Baja en segundo plano los módulos del perfil. Si falla (sin conexión), se reintenta al abrirlos. */
export function precargarModulos(rol: UserRole): void {
  for (const modulo of POR_PERFIL[rol]) void cargas[modulo]().catch(() => undefined);
}
