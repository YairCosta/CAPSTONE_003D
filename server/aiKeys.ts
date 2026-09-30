// Clave de OpenAI de cada CRM (migración 0032). El asistente se paga con la cuenta de OpenAI de quien lo usa:
// la gerencia pega la clave de su empresa en la configuración del chat y el servidor la usa solo para ese CRM.
//
// La clave vive cifrada en Supabase Vault. Este módulo la guarda y la lee con funciones de la base que solo
// ejecuta la clave secreta del servidor; nunca se manda al navegador (la pantalla solo ve sus últimos 4
// caracteres) y nunca se escribe en un registro: todo mensaje de error es fijo y todo texto que se registra
// pasa por redactSecrets.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface AiKeyInfo {
  configured: boolean;
  /** Últimos 4 caracteres de la clave, para reconocerla */
  last4: string | null;
  updatedAt: string | null;
}

/** Por qué falló guardar o leer la clave. El mensaje es fijo: nunca lleva la clave ni el texto de la base. */
export class AiKeyError extends Error {
  code: 'forbidden' | 'invalid' | 'unavailable';
  constructor(code: AiKeyError['code']) {
    super(`clave de IA: ${code}`);
    this.code = code;
  }
}

export interface AiKeyStore {
  info(companyId: string): Promise<AiKeyInfo>;
  /** La clave completa, solo para llamar a OpenAI a nombre de ese CRM */
  get(companyId: string): Promise<string | null>;
  /** Guarda o reemplaza la clave a nombre de una persona, que la base exige gerente activo de ese CRM */
  set(companyId: string, userId: string, apiKey: string): Promise<AiKeyInfo>;
  /** Devuelve si había una clave para quitar */
  clear(companyId: string, userId: string): Promise<boolean>;
}

// Las claves de OpenAI empiezan con sk- (sk-proj-…, sk-svcacct-…) y usan letras, números, guion y guion bajo
const OPENAI_KEY_PATTERN = /^sk-[A-Za-z0-9_-]{20,250}$/;

/** Acepta la clave con espacios o saltos de línea alrededor (al pegar suelen venir) y rechaza todo lo demás. Nunca la repite en el error. */
export function validateOpenAiKey(value: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== 'string' || !value.trim()) return { ok: false, error: 'Pega la clave de OpenAI de tu empresa (empieza con sk-).' };
  const clave = value.trim();
  if (!OPENAI_KEY_PATTERN.test(clave)) {
    return { ok: false, error: 'Eso no parece una clave de OpenAI: debe empezar con sk- y no llevar espacios ni otros símbolos. Cópiala completa desde platform.openai.com/api-keys.' };
  }
  return { ok: true, value: clave };
}

/** Para todo texto que se registre: OpenAI repite su clave (enmascarada) en algunos errores y aun así no debe quedar en un log */
export const redactSecrets = (text: string): string => text.replace(/sk-[A-Za-z0-9_*-]{6,}/g, 'sk-***');

export type KeyCheck = 'valid' | 'invalid' | 'unverified';

/**
 * Comprueba la clave con OpenAI antes de guardarla (listar modelos no cuesta nada). Solo un 401 la da por inválida:
 * una clave restringida puede no tener permiso de lectura (403) y servir igual para el chat, y una caída de red
 * no debe impedir guardarla.
 */
export async function verifyOpenAiKey(apiKey: string, timeoutMs = 8000): Promise<KeyCheck> {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.ok) return 'valid';
    return response.status === 401 ? 'invalid' : 'unverified';
  } catch {
    return 'unverified';
  }
}

// ------------------------------------------------------------------ en memoria (pruebas)
/** Se reinicia al apagar el servidor. Solo para pruebas: nada sensible debe vivir en la memoria de un servidor real. */
export function createMemoryKeyStore(now: () => Date = () => new Date()): AiKeyStore {
  const claves = new Map<string, { key: string; updatedAt: string }>();
  const info = (companyId: string): AiKeyInfo => {
    const guardada = claves.get(companyId);
    return { configured: Boolean(guardada), last4: guardada ? guardada.key.slice(-4) : null, updatedAt: guardada?.updatedAt ?? null };
  };
  return {
    info: async (companyId) => info(companyId),
    get: async (companyId) => claves.get(companyId)?.key ?? null,
    set: async (companyId, _userId, apiKey) => {
      if (!validateOpenAiKey(apiKey).ok) throw new AiKeyError('invalid');
      claves.set(companyId, { key: apiKey, updatedAt: now().toISOString() });
      return info(companyId);
    },
    clear: async (companyId) => claves.delete(companyId),
  };
}

// ------------------------------------------------------------------ Supabase (producción)
const codeFrom = (error: { code?: string }): AiKeyError['code'] => (error.code === '42501' ? 'forbidden' : error.code === '22023' ? 'invalid' : 'unavailable');

/** Con la clave secreta del servidor: las personas con sesión no pueden leer ni escribir estas tablas. */
export function createSupabaseKeyStore(admin: SupabaseClient): AiKeyStore {
  const info = async (companyId: string): Promise<AiKeyInfo> => {
    const { data, error } = await admin.from('company_ai_keys').select('key_last4, updated_at').eq('company_id', companyId).maybeSingle();
    if (error) throw new AiKeyError('unavailable');
    return { configured: Boolean(data), last4: data ? String(data.key_last4) : null, updatedAt: data ? String(data.updated_at) : null };
  };
  return {
    info,
    get: async (companyId) => {
      const { data, error } = await admin.rpc('get_company_ai_key', { p_company_id: companyId });
      if (error) throw new AiKeyError('unavailable');
      return typeof data === 'string' && data ? data : null;
    },
    set: async (companyId, userId, apiKey) => {
      const { error } = await admin.rpc('set_company_ai_key', { p_company_id: companyId, p_user_id: userId, p_api_key: apiKey });
      if (error) throw new AiKeyError(codeFrom(error));
      return info(companyId);
    },
    clear: async (companyId, userId) => {
      const { data, error } = await admin.rpc('clear_company_ai_key', { p_company_id: companyId, p_user_id: userId });
      if (error) throw new AiKeyError(codeFrom(error));
      return data === true;
    },
  };
}
