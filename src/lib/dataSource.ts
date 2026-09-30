import { isSupabaseConfigured } from './supabaseClient';

// De dónde salen los datos de la app:
//   demo     → datos de ejemplo en memoria (por defecto; se pierden al recargar)
//   supabase → la base real. Hoy conecta el login y la administración de la plataforma;
//              los módulos del CRM se conectan por etapas (ver docs/BASE_DE_DATOS.md).
//
// Se elige con VITE_DATA_SOURCE en .env.local. Dos direcciones fuerzan la demo:
//   · ?demo o /demo, también en la app publicada: la demo pública, que se abre desde la landing sin
//     contraseña, con datos ficticios que solo viven en esa pestaña y sin asistente de IA.
//   · ?pruebas, solo en desarrollo: los CRMs de prueba de npm run test:e2e, que entran por el login.
export type DataSource = 'demo' | 'supabase';

const parametros = () => new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);

export const publicDemo =
  typeof window !== 'undefined' && (parametros().has('demo') || window.location.pathname.replace(/\/+$/, '') === '/demo');

const forzarPruebas = import.meta.env.DEV && parametros().has('pruebas');

export const DATA_SOURCE: DataSource =
  import.meta.env.VITE_DATA_SOURCE === 'supabase' && isSupabaseConfigured && !publicDemo && !forzarPruebas ? 'supabase' : 'demo';

export const usingSupabase = DATA_SOURCE === 'supabase';
