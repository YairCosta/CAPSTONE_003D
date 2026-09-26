// Pruebas del proveedor OpenAI (GPT) del asistente, sin clave real: OpenAI se simula.
// Ejecutar: npm run test:ai
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  OpenAiError,
  callOpenAi,
  describeOpenAiError,
  fromOpenAiMessage,
  toOpenAiMessages,
  toOpenAiTools,
} from '../server/openaiChat.ts';
import { buildToolDeclarations, createAiMiddleware, resolveProvider } from '../server/aiChat.ts';

const results: { name: string; ok: boolean; error?: string }[] = [];
const pending: Promise<void>[] = [];
const test = (name: string, fn: () => void | Promise<void>) => {
  pending.push(
    (async () => {
      try {
        await fn();
        results.push({ name, ok: true });
      } catch (e) {
        results.push({ name, ok: false, error: (e as Error).message });
      }
    })()
  );
};

const PAISES = [{ code: 'CL', name: 'Chile', zoneLabel: 'Comuna', currency: 'CLP', zones: ['Providencia'] }];

// Respuesta simulada de OpenAI
const respuesta = (message: object, status = 200) =>
  new Response(JSON.stringify(status === 200 ? { choices: [{ message }] } : message), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

// ------------------------------------------------------------------ proveedor
test('Proveedor: por defecto sigue Gemini aunque se agregue la clave de OpenAI', () => {
  assert.equal(resolveProvider({ GEMINI_API_KEY: 'g', OPENAI_API_KEY: 'o' }), 'gemini');
  assert.equal(resolveProvider({ AI_PROVIDER: 'openai', GEMINI_API_KEY: 'g', OPENAI_API_KEY: 'o' }), 'openai');
  assert.equal(resolveProvider({ AI_PROVIDER: 'GPT' }), 'openai');
  assert.equal(resolveProvider({ OPENAI_API_KEY: 'o' }), 'openai'); // única clave disponible
  assert.equal(resolveProvider({}), 'gemini');
});

// ------------------------------------------------------------------ traducción
test('Herramientas: los tipos de Gemini pasan a JSON Schema de OpenAI', () => {
  const tools = toOpenAiTools(buildToolDeclarations(PAISES));
  const guardar = tools.find((t) => t.function.name === 'save_lead_to_crm')!;
  const params = guardar.function.parameters as { type: string; properties: Record<string, { type: string; enum?: string[] }> };
  assert.equal(params.type, 'object');
  assert.equal(params.properties.company_name.type, 'string');
  assert.ok(params.properties.status.enum?.includes('ganado'));
  // La herramienta de guardar no acepta datos de personas (Ley 21.719)
  assert.equal(params.properties.contact_name, undefined);
  assert.equal(params.properties.email, undefined);
  assert.ok(!JSON.stringify(tools).includes('"STRING"'));
});

test('Historial: cada respuesta de herramienta queda unida a su llamada', () => {
  const mensajes = toOpenAiMessages('SISTEMA', [
    { role: 'user', parts: [{ text: 'mueve a Minera Sur a ganado' }] },
    { role: 'model', parts: [{ functionCall: { id: 'call_1', name: 'find_leads_in_crm', args: { query: 'Minera Sur' } } }] },
    { role: 'user', parts: [{ functionResponse: { id: 'call_1', name: 'find_leads_in_crm', response: { ok: true } } }] },
    { role: 'model', parts: [{ text: 'Listo.' }] },
  ]);
  assert.equal(mensajes[0].role, 'system');
  assert.equal(mensajes[1].role, 'user');
  const asistente = mensajes[2] as { role: string; tool_calls: { id: string; function: { arguments: string } }[] };
  assert.equal(asistente.tool_calls[0].id, 'call_1');
  assert.deepEqual(JSON.parse(asistente.tool_calls[0].function.arguments), { query: 'Minera Sur' });
  assert.deepEqual(mensajes[3], { role: 'tool', tool_call_id: 'call_1', content: '{"ok":true}' });
  assert.equal((mensajes[4] as { content: string }).content, 'Listo.');
});

test('Historial: una conversación empezada con Gemini (sin ids) se puede seguir con GPT', () => {
  const mensajes = toOpenAiMessages('S', [
    { role: 'model', parts: [{ functionCall: { name: 'find_leads_in_crm', args: {} } }, { functionCall: { name: 'update_lead_stage', args: {} } }] },
    { role: 'user', parts: [
      { functionResponse: { name: 'update_lead_stage', response: { b: 2 } } },
      { functionResponse: { name: 'find_leads_in_crm', response: { a: 1 } } },
    ] },
  ]);
  const llamadas = (mensajes[1] as { tool_calls: { id: string; function: { name: string } }[] }).tool_calls;
  const idDe = (n: string) => llamadas.find((c) => c.function.name === n)!.id;
  const tools = mensajes.filter((m) => m.role === 'tool') as { tool_call_id: string; content: string }[];
  assert.equal(tools.find((t) => t.content === '{"b":2}')!.tool_call_id, idDe('update_lead_stage'));
  assert.equal(tools.find((t) => t.content === '{"a":1}')!.tool_call_id, idDe('find_leads_in_crm'));
});

test('Respuesta: argumentos malformados no rompen el asistente', () => {
  const paso = fromOpenAiMessage({
    content: null,
    tool_calls: [{ id: 'c1', type: 'function', function: { name: 'save_lead_to_crm', arguments: '{roto' } }],
  });
  assert.deepEqual(paso.functionCalls[0], { id: 'c1', name: 'save_lead_to_crm', args: {} });
  assert.equal(paso.text, '');
});

// ------------------------------------------------------------------ llamada
test('Llamada: la clave viaja solo en la cabecera y no se envía temperatura', async () => {
  let enviado: { url: string; headers: Record<string, string>; body: Record<string, unknown> } | null = null;
  const fetchFalso = (async (url: string, init: RequestInit) => {
    enviado = { url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) };
    return respuesta({ content: 'Hola' });
  }) as unknown as typeof fetch;
  const paso = await callOpenAi({ apiKey: 'sk-prueba', model: 'gpt-5-mini', messages: [{ role: 'user', content: 'hola' }], tools: [], fetchImpl: fetchFalso });
  assert.equal(paso.text, 'Hola');
  assert.equal(enviado!.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(enviado!.headers.Authorization, 'Bearer sk-prueba');
  assert.equal(enviado!.body.model, 'gpt-5-mini');
  assert.equal(enviado!.body.temperature, undefined);
  assert.ok(!JSON.stringify(enviado!.body).includes('sk-prueba'));
});

test('Errores: cada falla de OpenAI se explica en español', async () => {
  const falla = (status: number, error: object) =>
    (async () => respuesta({ error }, status)) as unknown as typeof fetch;
  const intentar = (f: typeof fetch) => callOpenAi({ apiKey: 'k', model: 'm', messages: [], tools: [], fetchImpl: f }).then(() => null, (e) => e);

  const sinSaldo = await intentar(falla(429, { code: 'insufficient_quota', message: 'quota' }));
  assert.ok(sinSaldo instanceof OpenAiError);
  assert.match(describeOpenAiError(sinSaldo, 'm').message, /saldo/);
  assert.match(describeOpenAiError(await intentar(falla(401, { message: 'bad key' })), 'm').message, /OPENAI_API_KEY/);
  assert.match(describeOpenAiError(await intentar(falla(404, { code: 'model_not_found' })), 'gpt-x').message, /gpt-x/);
});

// ------------------------------------------------------------------ servidor completo con OpenAI simulado
const pedir = (middleware: ReturnType<typeof createAiMiddleware>, url: string, body?: object) =>
  new Promise<{ status: number; json: Record<string, unknown> }>((resolve) => {
    const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []) as unknown as IncomingMessage;
    Object.assign(req, { method: body ? 'POST' : 'GET', url, headers: {} });
    let status = 200;
    const res = {
      set statusCode(v: number) { status = v; },
      setHeader() {},
      end(texto: string) { resolve({ status, json: JSON.parse(texto) }); },
    } as unknown as ServerResponse;
    void middleware(req, res, () => resolve({ status: 404, json: {} }));
  });

test('Servidor con GPT: pide al navegador guardar el lead y luego responde', async () => {
  const llamadas: Record<string, unknown>[] = [];
  const fetchOriginal = globalThis.fetch;
  const guiones = [
    respuesta({ content: null, tool_calls: [{ id: 'call_g', type: 'function', function: { name: 'save_lead_to_crm', arguments: '{"company_name":"Minera Sur","status":"nuevo"}' } }] }),
    respuesta({ content: 'Guardé Minera Sur como lead nuevo.' }),
  ];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    llamadas.push(JSON.parse(String(init.body)));
    return guiones.shift()!;
  }) as unknown as typeof fetch;
  try {
    const mw = createAiMiddleware({ provider: 'openai', openaiApiKey: 'sk-x', openaiModel: 'gpt-5-mini', geminiModel: 'g' });

    const estado = await pedir(mw, '/status');
    assert.deepEqual([estado.json.provider, estado.json.model, estado.json.serverKeyConfigured], ['openai', 'gpt-5-mini', true]);

    const contexto = { userName: 'Ana', tenantName: 'Demo', countries: PAISES };
    const primero = await pedir(mw, '/chat', { contents: [{ role: 'user', parts: [{ text: 'guarda Minera Sur' }] }], context: contexto });
    assert.equal(primero.json.type, 'tool_calls');
    const calls = primero.json.calls as { id: string; name: string; executedOn: string }[];
    assert.deepEqual([calls[0].id, calls[0].name, calls[0].executedOn], ['call_g', 'save_lead_to_crm', 'client']);

    // El navegador ejecuta la herramienta y devuelve el resultado, como hace AiChatWidget
    const historial = [
      ...(primero.json.contents as object[]),
      { role: 'user', parts: [{ functionResponse: { id: 'call_g', name: 'save_lead_to_crm', response: { ok: true, lead_id: 'lead-1' } } }] },
    ];
    const segundo = await pedir(mw, '/chat', { contents: historial, context: contexto });
    assert.equal(segundo.json.type, 'message');
    assert.equal(segundo.json.text, 'Guardé Minera Sur como lead nuevo.');

    // La segunda llamada a OpenAI llevó el resultado unido a su llamada
    const tool = (llamadas[1].messages as { role: string; tool_call_id?: string }[]).find((m) => m.role === 'tool');
    assert.equal(tool?.tool_call_id, 'call_g');
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test('Servidor con GPT y sin clave: explica qué falta', async () => {
  const mw = createAiMiddleware({ provider: 'openai', openaiModel: 'gpt-5-mini', geminiModel: 'g' });
  const r = await pedir(mw, '/chat', { contents: [{ role: 'user', parts: [{ text: 'hola' }] }], context: {} });
  assert.equal(r.status, 400);
  assert.match(String(r.json.error), /OPENAI_API_KEY/);
});

await Promise.all(pending);
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.error ? `\n    ${r.error}` : ''}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} pruebas del asistente OK`);
process.exit(failed ? 1 : 0);
