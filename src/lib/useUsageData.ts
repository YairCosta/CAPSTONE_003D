import { useCallback, useEffect, useState } from 'react';
import type { BugReport, BugStatus, SurveyResponse } from '../types/crm';
import type { AdminUsageApi, UsageParams, UsageSnapshot } from './usage';

/**
 * Datos del panel de uso del administrador: conteos, encuestas y reportes. Se piden al abrir el panel y
 * cada vez que cambia el período o el plazo de "estancado". `api` tiene que ser siempre el mismo objeto
 * (se crea una vez): si cambiara en cada dibujo, el panel volvería a pedir todo sin parar.
 */
export function useUsageData(api: AdminUsageApi, params: Pick<UsageParams, 'days' | 'stagnantDays'>) {
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [surveys, setSurveys] = useState<SurveyResponse[]>([]);
  const [bugs, setBugs] = useState<BugReport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  // Qué combinación de período y plazo ya llegó: mientras no coincida con la pedida, está cargando
  const [cargado, setCargado] = useState<string | null>(null);
  const { days, stagnantDays } = params;
  const pedido = `${days}-${stagnantDays}-${tick}`;

  useEffect(() => {
    let vigente = true;
    void Promise.all([api.loadUsage({ days, stagnantDays, inactiveDays: 0 }), api.loadSurveys(), api.loadBugs()]).then(([uso, encuestas, reportes]) => {
      if (!vigente) return;
      if (uso.ok) setUsage(uso.data);
      if (encuestas.ok) setSurveys(encuestas.data);
      if (reportes.ok) setBugs(reportes.data);
      // Si algo falla, lo demás se muestra igual y se avisa cuál no cargó
      const fallas = [uso, encuestas, reportes].flatMap((r) => (r.ok ? [] : [r.error]));
      setError(fallas.length > 0 ? fallas[0] : null);
      setCargado(pedido);
    });
    return () => {
      vigente = false;
    };
  }, [api, days, stagnantDays, pedido]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  /** Cambia el estado de un reporte y lo refleja al tiro. Devuelve el mensaje de error, o null. */
  const changeBugStatus = useCallback(
    async (id: string, status: BugStatus): Promise<string | null> => {
      const fallo = await api.setBugStatus(id, status);
      if (!fallo) setBugs((prev) => prev.map((b) => (b.id === id ? { ...b, status, resolvedAt: status === 'resolved' ? new Date().toISOString() : undefined } : b)));
      return fallo;
    },
    [api]
  );

  return { usage, surveys, bugs, loading: cargado !== pedido, error, refresh, changeBugStatus };
}
