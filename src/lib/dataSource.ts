import { isSupabaseConfigured } from './supabaseClient';

// De dónde salen los datos de la app:
//   demo     → datos de ejemplo en memoria (por defecto; se pierden al recargar)
//   supabase → la base real. Hoy conecta el login y la administración de la plataforma;
//              los módulos del CRM se conectan por etapas (ver docs/BASE_DE_DATOS.md).
//
// Se elige con VITE_DATA_SOURCE en .env.local. En desarrollo, ?demo o ?pruebas en la URL fuerzan
// la demo: así las pruebas automáticas no dependen de la base real.
export type DataSource = 'demo' | 'supabase';

const forzarDemo = (): boolean => {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.has('demo') || params.has('pruebas');
};

export const DATA_SOURCE: DataSource =
  import.meta.env.VITE_DATA_SOURCE === 'supabase' && isSupabaseConfigured && !forzarDemo() ? 'supabase' : 'demo';

export const usingSupabase = DATA_SOURCE === 'supabase';
