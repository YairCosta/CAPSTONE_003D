// Proveedor OpenAI (GPT) para el asistente IA.
//
// La conversación se guarda siempre en el formato de Gemini (role user/model con parts): así el
// navegador no cambia y se puede pasar de un proveedor a otro. Este módulo traduce ese historial al
// formato de Chat Completions de OpenAI y devuelve la respuesta de vuelta en partes de Gemini.
// Se llama con fetch, sin SDK: la clave (OPENAI_API_KEY) vive solo en el servidor.

import type { Content, FunctionDeclaration, Part } from '@google/genai';
import { estimateUsage, type ModelUsage } from './aiPricing.ts';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

// ------------------------------------------------------------------ tipos de OpenAI (mínimos)
interface OpenAiToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type OpenAiMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: OpenAiToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface OpenAiTool {
  type: 'function';
  function: { name: string; description?: string; parameters?: Record<string, unknown> };
}

export interface ModelStep {
  parts: Part[];
  functionCalls: { id?: string; name: string; args: Record<string, unknown> }[];
  text: string;
  /** Lo que gastó la llamada (solo OpenAI): con esto se calcula el costo y se aplica el presupuesto */
  usage?: ModelUsage;
}

// Tope de la respuesta del modelo, razonamiento incluido. Un lead o una búsqueda caben de sobra; el tope
// evita que una respuesta desbocada cueste de más.
export const MAX_OUTPUT_TOKENS = 1500;

// ------------------------------------------------------------------ herramientas
// Gemini describe los tipos en mayúsculas (Type.STRING); OpenAI usa JSON Schema en minúsculas.
function toJsonSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toJsonSchema);
  if (typeof schema !== 'object' || schema === null) return schema;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (key === 'type' && typeof value === 'string') out.type = value.toLowerCase();
    else if (key === 'properties' && value && typeof value === 'object') {
      out.properties = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toJsonSchema(v)]));
    } else out[key] = toJsonSchema(value);
  }
  return out;
}

export function toOpenAiTools(declarations: FunctionDeclaration[]): OpenAiTool[] {
  return declarations.map((d) => ({
    type: 'function',
    function: {
      name: d.name ?? '',
      description: d.description,
      parameters: (toJsonSchema(d.parameters ?? { type: 'OBJECT', properties: {} }) as Record<string, unknown>) ?? undefined,
    },
  }));
}

// ------------------------------------------------------------------ historial
/**
 * Traduce el historial al formato de OpenAI. Cada llamada a herramienta necesita un id que su
 * respuesta repita; las llamadas antiguas de Gemini pueden no traerlo, así que se genera uno y la
 * respuesta se empareja por nombre, en orden.
 */
export function toOpenAiMessages(systemInstruction: string, history: Content[]): OpenAiMessage[] {
  const messages: OpenAiMessage[] = [{ role: 'system', content: systemInstruction }];
  const pendientes = new Map<string, string[]>();
  let generados = 0;

  for (const content of history) {
    const parts = content.parts ?? [];
    const texto = parts
      .map((p) => p.text)
      .filter((t): t is string => typeof t === 'string' && t.length > 0)
      .join('\n');

    if (content.role === 'model') {
      const toolCalls: OpenAiToolCall[] = parts
        .filter((p) => p.functionCall)
        .map((p) => {
          const call = p.functionCall!;
          const id = call.id || `call_generado_${++generados}`;
          const name = call.name ?? '';
          pendientes.set(name, [...(pendientes.get(name) ?? []), id]);
          return { id, type: 'function', function: { name, arguments: JSON.stringify(call.args ?? {}) } };
        });
      messages.push({ role: 'assistant', content: texto || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });
      continue;
    }

    // Turno del usuario: respuestas de herramientas y/o texto
    for (const part of parts) {
      if (!part.functionResponse) continue;
      const name = part.functionResponse.name ?? '';
      const cola = pendientes.get(name) ?? [];
      const id = part.functionResponse.id || cola[0];
      pendientes.set(name, cola.filter((pendiente) => pendiente !== id));
      if (!id) continue; // una respuesta sin llamada previa rompería la conversación en OpenAI
      messages.push({ role: 'tool', tool_call_id: id, content: JSON.stringify(part.functionResponse.response ?? {}) });
    }
    if (texto) messages.push({ role: 'user', content: texto });
  }
  return messages;
}

/** Convierte la respuesta de OpenAI en partes de Gemini para guardarla en el historial. */
export function fromOpenAiMessage(message: { content?: string | null; tool_calls?: OpenAiToolCall[] } | undefined): ModelStep {
  const text = (message?.content ?? '').trim();
  const functionCalls = (message?.tool_calls ?? [])
    .filter((c) => c.type === 'function')
    .map((c) => {
      let args: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(c.function.arguments || '{}');
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) args = parsed as Record<string, unknown>;
      } catch {
        // Argumentos malformados: la herramienta los recibe vacíos y responde con su propio error
      }
      return { id: c.id, name: c.function.name, args };
    });
  const parts: Part[] = [
    ...(text ? [{ text }] : []),
    ...functionCalls.map((c) => ({ functionCall: { id: c.id, name: c.name, args: c.args } })),
  ];
  return { parts, functionCalls, text };
}

// ------------------------------------------------------------------ llamada y errores
export class OpenAiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface OpenAiResponse {
  choices?: { message?: { content?: string | null; tool_calls?: OpenAiToolCall[] } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
  error?: { message?: string; code?: string };
}

/** Los modelos GPT-5 razonan antes de responder, y ese razonamiento se cobra como salida: se pide el mínimo */
const admiteRazonamiento = (model: string) => /^gpt-5/i.test(model.trim());

export async function callOpenAi(options: {
  apiKey: string;
  model: string;
  messages: OpenAiMessage[];
  tools: OpenAiTool[];
  /** "minimal", "low"…: cuánto razona el modelo antes de responder. Solo los GPT-5; menos razonamiento, menos costo. */
  reasoningEffort?: string;
  fetchImpl?: typeof fetch;
}): Promise<ModelStep> {
  const doFetch = options.fetchImpl ?? fetch;
  const pedir = (conRazonamiento: boolean) => {
    // Sin temperatura: los modelos de razonamiento de OpenAI solo aceptan el valor por defecto
    const cuerpo = JSON.stringify({
      model: options.model,
      messages: options.messages,
      tools: options.tools,
      tool_choice: 'auto',
      max_completion_tokens: MAX_OUTPUT_TOKENS,
      ...(conRazonamiento && options.reasoningEffort && admiteRazonamiento(options.model) ? { reasoning_effort: options.reasoningEffort } : {}),
    });
    return doFetch(OPENAI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${options.apiKey}` },
      body: cuerpo,
    }).then(async (response) => ({ response, cuerpo, data: (await response.json().catch(() => ({}))) as OpenAiResponse }));
  };

  let { response, cuerpo, data } = await pedir(true);
  // Si OpenAI rechaza el nivel de razonamiento pedido, se reintenta una vez con el suyo por defecto
  if (response.status === 400 && /reasoning/i.test(data.error?.message ?? '') && options.reasoningEffort) {
    ({ response, cuerpo, data } = await pedir(false));
  }
  if (!response.ok) throw new OpenAiError(response.status, data.error?.message ?? `HTTP ${response.status}`, data.error?.code);

  const paso = fromOpenAiMessage(data.choices?.[0]?.message);
  const uso = data.usage;
  paso.usage =
    uso && typeof uso.prompt_tokens === 'number'
      ? {
          inputTokens: uso.prompt_tokens,
          cachedInputTokens: uso.prompt_tokens_details?.cached_tokens ?? 0,
          outputTokens: uso.completion_tokens ?? 0,
        }
      : estimateUsage(cuerpo.length, JSON.stringify(data.choices?.[0]?.message ?? {}).length);
  return paso;
}

export function describeOpenAiError(
  error: unknown,
  model: string,
  /** De quién es la clave: la de un CRM (la gerencia la cambia desde el chat) o la del servidor (.env.local, solo desarrollo) */
  keyFrom: 'crm' | 'server' | null = 'server'
): { status: number; message: string } {
  const deCrm = keyFrom === 'crm';
  if (error instanceof OpenAiError) {
    if (error.status === 401) {
      // 502 y no 401: que la clave del CRM falle no es un problema de sesión de quien escribe
      return deCrm
        ? { status: 502, message: 'OpenAI rechazó la clave de este CRM (es inválida o la revocaron). La gerencia debe cargar una nueva en la configuración del asistente (el ícono de la llave, arriba en el chat).' }
        : { status: 401, message: 'La API key de OpenAI no es válida. Revisa OPENAI_API_KEY en .env.local.' };
    }
    if (error.status === 429) {
      if (error.code === 'insufficient_quota') {
        return deCrm
          ? { status: 429, message: 'La cuenta de OpenAI de este CRM no tiene saldo. La gerencia debe agregar créditos en platform.openai.com (la suscripción de ChatGPT no sirve).' }
          : { status: 429, message: 'La cuenta de OpenAI no tiene saldo. Agrega créditos en platform.openai.com (la suscripción de ChatGPT no sirve).' };
      }
      return { status: 429, message: 'Se alcanzó el límite de solicitudes de OpenAI. Espera un momento e inténtalo de nuevo.' };
    }
    if (error.status === 404 || error.code === 'model_not_found') {
      return deCrm
        ? { status: 502, message: `El modelo "${model}" no está disponible para la cuenta de OpenAI de este CRM. Avisa a quien administra Revela.` }
        : { status: 502, message: `El modelo "${model}" no está disponible para esta cuenta de OpenAI. Revisa OPENAI_MODEL en .env.local.` };
    }
    if (error.status >= 500) return { status: 503, message: 'OpenAI no está disponible en este momento. Inténtalo de nuevo en unos segundos.' };
    return { status: 502, message: `OpenAI respondió con un error (${error.status}). Inténtalo de nuevo.` };
  }
  return { status: 502, message: 'No se pudo contactar a OpenAI. Revisa tu conexión a internet.' };
}
