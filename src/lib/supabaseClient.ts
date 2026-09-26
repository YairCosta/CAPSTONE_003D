import { createClient } from '@supabase/supabase-js';

// La URL y la clave pública (anon / publishable) pueden ir en el navegador: la protección de los
// datos la dan RLS y los triggers de la base. La clave secreta (service_role) nunca se usa aquí.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Un enlace de invitación o de recuperación trae "type=invite|recovery" en la URL. Se lee antes de
// crear el cliente, porque el cliente consume y limpia la URL al iniciar la sesión.
const hashInicial = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, ''));
const tipoInicial = hashInicial.get('type');
export const initialAuthLinkType: 'invite' | 'recovery' | null =
  tipoInicial === 'invite' || tipoInicial === 'recovery' ? tipoInicial : null;

// Un enlace vencido o ya usado vuelve con "error_code" en la URL en vez de una sesión
export const initialAuthLinkError: string | null = hashInicial.get('error_code')
  ? 'El enlace que abriste venció o ya se usó. Pide uno nuevo con "¿Olvidaste tu contraseña?" o pide otra invitación.'
  : null;

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;
