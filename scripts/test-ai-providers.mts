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
import { buildToolDeclarations, createAiMiddleware, exhaustedMessage, resolveProvider } from '../server/aiChat.ts';
import { OPENAI_PRICES, UNKNOWN_MODEL_PRICE, costOf, priceFor } from '../server/aiPricing.ts';
import { createMemoryBudgetStore, createSupabaseBudgetStore, validateBudget, type AiBudgetStore } from '../server/aiBudget.ts';
import { budgetStoreFrom } from '../server/api.ts';
import { budgetLevel, budgetPercent, formatSpentUsd, formatUsd, monthLabel } from '../src/lib/aiBudget.ts';

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

const PAISES = [{ code: 'CL', name: 'Chile', zoneLabel: 'Comuna', regionLabel: 'Región', currency: 'CLP', regions: ['Metropolitana de Santiago'] }];

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
const pedir = (middleware: ReturnType<typeof createAiMiddleware>, url: string, body?: object, headers: Record<string, string> = {}) =>
  new Promise<{ status: number; json: Record<string, unknown> }>((resolve) => {
    const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []) as unknown as IncomingMessage;
    Object.assign(req, { method: body ? 'POST' : 'GET', url, headers });
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
    const mw = createAiMiddleware({ provider: 'openai', openaiApiKey: 'sk-x', openaiModel: 'gpt-5-mini', geminiModel: 'g', requireSession: false });

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
  const mw = createAiMiddleware({ provider: 'openai', openaiModel: 'gpt-5-mini', geminiModel: 'g', requireSession: false });
  const r = await pedir(mw, '/chat', { contents: [{ role: 'user', parts: [{ text: 'hola' }] }], context: {} });
  assert.equal(r.status, 400);
  assert.match(String(r.json.error), /OPENAI_API_KEY/);
});

// ------------------------------------------------------------------ claves del servidor: solo con sesión
// Publicada, la API del asistente está en internet: sin estas reglas cualquiera usaría las claves del
// servidor (y su saldo). Ninguna de estas pruebas llega al modelo: cada barrera actúa antes.
const HOLA = { contents: [{ role: 'user', parts: [{ text: 'hola' }] }], context: {} };
const conSesion = (caller: object | null) => ({
  provider: 'openai' as const,
  openaiModel: 'gpt-5-mini',
  geminiModel: 'g',
  requireSession: true,
  identify: async (token: string) => (token === 'token-valido' ? (caller as never) : null),
});
const vendedor = { userId: 'u-vendedor', role: 'agent', companyId: 'crm-1', isActive: true };

test('Sesión: sin iniciar sesión ni clave propia, el asistente no usa las claves del servidor', async () => {
  const mw = createAiMiddleware({ ...conSesion(vendedor), openaiApiKey: 'sk-servidor' });
  const sinToken = await pedir(mw, '/chat', HOLA);
  assert.equal(sinToken.status, 401);
  assert.match(String(sinToken.json.error), /Inicia sesión/);
  const tokenFalso = await pedir(mw, '/chat', HOLA, { authorization: 'Bearer inventado' });
  assert.equal(tokenFalso.status, 401);
  const estado = await pedir(mw, '/status');
  assert.equal(estado.json.requiresSession, true);
});

test('Sesión: el administrador de plataforma y los usuarios desactivados tampoco las usan', async () => {
  for (const caller of [
    { userId: 'u-admin', role: 'superadmin', companyId: null, isActive: true },
    { ...vendedor, isActive: false },
  ]) {
    const mw = createAiMiddleware({ ...conSesion(caller), openaiApiKey: 'sk-servidor' });
    const r = await pedir(mw, '/chat', HOLA, { authorization: 'Bearer token-valido' });
    assert.equal(r.status, 401, `${caller.role} activo=${caller.isActive}`);
  }
});

test('Sesión: si verificar la sesión falla, se trata como sin sesión (falla cerrado)', async () => {
  const mw = createAiMiddleware({
    ...conSesion(vendedor),
    openaiApiKey: 'sk-servidor',
    identify: async () => {
      throw new Error('Supabase caído');
    },
  });
  const r = await pedir(mw, '/chat', HOLA, { authorization: 'Bearer token-valido' });
  assert.equal(r.status, 401);
});

test('Sesión: un usuario del CRM con sesión sí pasa (y sin clave configurada se le explica qué falta)', async () => {
  const mw = createAiMiddleware(conSesion(vendedor));
  const r = await pedir(mw, '/chat', HOLA, { authorization: 'Bearer token-valido' });
  assert.equal(r.status, 400);
  assert.match(String(r.json.error), /OPENAI_API_KEY/);
});

test('Límite: cada persona tiene un tope de consultas con las claves del servidor', async () => {
  const mw = createAiMiddleware({ ...conSesion(vendedor), rateLimit: { max: 2, windowMs: 60_000 } });
  const sesion = { authorization: 'Bearer token-valido' };
  assert.equal((await pedir(mw, '/chat', HOLA, sesion)).status, 400);
  assert.equal((await pedir(mw, '/chat', HOLA, sesion)).status, 400);
  const tercera = await pedir(mw, '/chat', HOLA, sesion);
  assert.equal(tercera.status, 429);
  assert.match(String(tercera.json.error), /límite/);
});

test('Conversación: no acepta imágenes ni archivos, y tiene un tope de texto total', async () => {
  const mw = createAiMiddleware(conSesion(vendedor));
  const sesion = { authorization: 'Bearer token-valido' };
  const imagen = await pedir(
    mw,
    '/chat',
    { contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/png', data: 'AAAA' } }] }], context: {} },
    sesion
  );
  assert.equal(imagen.status, 400);
  const parte = { text: 'x'.repeat(4000) };
  const larga = await pedir(mw, '/chat', { contents: [{ role: 'user', parts: Array(16).fill(parte) }], context: {} }, sesion);
  assert.equal(larga.status, 413);
});

// ------------------------------------------------------------------ presupuesto mensual (0031)
// Estas pruebas cambian el fetch global: corren una tras otra, después de las anteriores.
await Promise.all(pending);
const serie = async (name: string, fn: () => void | Promise<void>) => {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, error: (e as Error).message });
  }
};

/** OpenAI simulado: entrega los guiones en orden y anota cada llamada. Siempre se restaura. */
async function conOpenAi(guion: Response[], fn: (llamadas: Record<string, unknown>[]) => Promise<void>) {
  const original = globalThis.fetch;
  const llamadas: Record<string, unknown>[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    llamadas.push(JSON.parse(String(init.body)));
    const siguiente = guion.shift();
    if (!siguiente) throw new Error('OpenAI se llamó más veces de lo previsto');
    return siguiente;
  }) as unknown as typeof fetch;
  try {
    await fn(llamadas);
  } finally {
    globalThis.fetch = original;
  }
}

const conUso = (message: object, prompt: number, completion: number, cached = 0) =>
  new Response(
    JSON.stringify({ choices: [{ message }], usage: { prompt_tokens: prompt, completion_tokens: completion, prompt_tokens_details: { cached_tokens: cached } } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );

const gerente = { userId: 'u-gerente', role: 'manager', companyId: 'crm-1', isActive: true };
const otroGerente = { userId: 'u-otro', role: 'manager', companyId: 'crm-2', isActive: true };
const administrador = { userId: 'u-admin', role: 'superadmin', companyId: null, isActive: true };
const PERSONAS: Record<string, object> = {
  'tk-vendedor': vendedor,
  'tk-gerente': gerente,
  'tk-otro': otroGerente,
  'tk-admin': administrador,
};
const conPresupuesto = (budget: AiBudgetStore, extra: object = {}) =>
  createAiMiddleware({
    provider: 'openai',
    openaiApiKey: 'sk-servidor',
    openaiModel: 'gpt-5-nano',
    openaiReasoningEffort: 'minimal',
    geminiModel: 'g',
    requireSession: true,
    identify: async (token: string) => (PERSONAS[token] as never) ?? null,
    budget,
    ...extra,
  });
const como = (persona: keyof typeof PERSONAS extends never ? never : string) => ({ authorization: `Bearer ${persona}` });
const HOLA_CRM = { contents: [{ role: 'user', parts: [{ text: 'hola' }] }], context: { userName: 'Ana', tenantName: 'Piloto', countries: PAISES } };

await serie('Precios: el costo sale de los tokens, con el caché a precio aparte y los modelos desconocidos a precio alto', () => {
  // 800 tokens nuevos + 200 en caché + 500 de salida con gpt-5-nano: (800×0,05 + 200×0,005 + 500×0,40) / 1.000.000
  const nano = priceFor('gpt-5-nano');
  assert.ok(nano.known);
  assert.ok(Math.abs(costOf({ inputTokens: 1000, cachedInputTokens: 200, outputTokens: 500 }, nano.price) - 0.000241) < 1e-12);
  // El modelo que informa OpenAI trae la fecha; las variantes usan el precio de su modelo base
  assert.deepEqual(priceFor('gpt-5-nano-2025-08-07').price, OPENAI_PRICES['gpt-5-nano']);
  assert.deepEqual(priceFor('gpt-5-mini-high').price, OPENAI_PRICES['gpt-5-mini']);
  // Un modelo que no está en la tabla se cobra como uno caro: el tope protege de más, nunca de menos
  const raro = priceFor('gpt-9-ultra');
  assert.ok(!raro.known && raro.price === UNKNOWN_MODEL_PRICE);
  assert.ok(UNKNOWN_MODEL_PRICE.output >= Math.max(...Object.values(OPENAI_PRICES).map((p) => p.output)));
  // El caché nunca puede ser más que la entrada, y un uso negativo no descuenta
  assert.equal(costOf({ inputTokens: 100, cachedInputTokens: 500, outputTokens: 0 }, nano.price), (100 * 0.005) / 1e6);
  assert.equal(costOf({ inputTokens: -5, cachedInputTokens: 0, outputTokens: -5 }, nano.price), 0);
  // El más barato de la tabla es el predeterminado
  const masBarato = Object.entries(OPENAI_PRICES).sort((x, y) => x[1].input + x[1].output - (y[1].input + y[1].output))[0][0];
  assert.equal(masBarato, 'gpt-5-nano');
});

await serie('Presupuesto: se escribe en dólares y centavos, sin negativos ni exageraciones', () => {
  assert.deepEqual(validateBudget(30), { ok: true, value: 30 });
  assert.deepEqual(validateBudget('12,5'), { ok: true, value: 12.5 });
  assert.deepEqual(validateBudget('0'), { ok: true, value: 0 });
  assert.deepEqual(validateBudget(' 7 '), { ok: true, value: 7 });
  // Como se escribe en Chile: el punto separa miles y la coma los centavos
  assert.deepEqual(validateBudget('1.000'), { ok: true, value: 1000 });
  assert.deepEqual(validateBudget('30.5'), { ok: true, value: 30.5 });
  assert.deepEqual(validateBudget('0.75'), { ok: true, value: 0.75 });
  assert.equal(validateBudget('12.500').ok, false, '12.500 son doce mil quinientos, no doce y medio');
  for (const malo of [-1, 1001, 'abc', '', '   ', null, undefined, NaN, Infinity, {}]) assert.equal(validateBudget(malo).ok, false, String(malo));
});

await serie('Pantalla: el aviso se prende al 80% del presupuesto, se pone rojo al llegar y con 0 el asistente está apagado', () => {
  assert.equal(budgetLevel({ budgetUsd: 30, spentUsd: 0 }), 'ok');
  assert.equal(budgetLevel({ budgetUsd: 30, spentUsd: 23.99 }), 'ok');
  assert.equal(budgetLevel({ budgetUsd: 30, spentUsd: 24 }), 'warning');
  assert.equal(budgetLevel({ budgetUsd: 30, spentUsd: 29.99 }), 'warning');
  assert.equal(budgetLevel({ budgetUsd: 30, spentUsd: 30 }), 'exhausted');
  assert.equal(budgetLevel({ budgetUsd: 30, spentUsd: 45 }), 'exhausted');
  assert.equal(budgetLevel({ budgetUsd: 0, spentUsd: 0 }), 'exhausted', 'con 0 no hay asistente');
  assert.equal(budgetPercent({ budgetUsd: 30, spentUsd: 15 }), 50);
  assert.equal(budgetPercent({ budgetUsd: 30, spentUsd: 99 }), 100, 'la barra no pasa del 100%');
  assert.equal(budgetPercent({ budgetUsd: 0, spentUsd: 0 }), 100);
});

await serie('Pantalla: los dólares se escriben al estilo chileno y un gasto diminuto no se ve como cero', () => {
  assert.match(formatUsd(30), /^US\$\s?30,00$/);
  assert.match(formatUsd(1000), /^US\$\s?1\.000,00$/);
  assert.match(formatSpentUsd(0.000241), /^menos de US\$\s?0,01$/);
  assert.match(formatSpentUsd(0), /^US\$\s?0,00$/);
  assert.match(formatSpentUsd(1.2345), /^US\$\s?1,23$/);
  assert.equal(monthLabel('2026-10'), 'octubre de 2026');
  assert.equal(monthLabel('raro'), 'raro');
});

await serie('Consulta: se mide lo que costó, se suma al CRM y la respuesta dice cuánto lleva', async () => {
  const store = createMemoryBudgetStore(30);
  const mw = conPresupuesto(store);
  await conOpenAi([conUso({ content: 'Hola, ¿en qué te ayudo?' }, 1000, 500, 200)], async (llamadas) => {
    const r = await pedir(mw, '/chat', HOLA_CRM, como('tk-gerente'));
    assert.equal(r.status, 200);
    const budget = r.json.budget as { budgetUsd: number; spentUsd: number; remainingUsd: number; requests: number };
    // A la persona se le muestra redondeado a 4 decimales; el servidor guarda el costo exacto
    assert.deepEqual([budget.budgetUsd, budget.spentUsd, budget.requests], [30, 0.0002, 1]);
    assert.equal(budget.remainingUsd, 29.9998);
    assert.equal((await store.status('crm-1')).spentUsd, 0.000241);
    // Razonamiento mínimo y respuesta acotada: lo que mantiene el costo bajo
    assert.equal(llamadas[0].reasoning_effort, 'minimal');
    assert.equal(llamadas[0].max_completion_tokens, 1500);
    assert.equal(llamadas[0].model, 'gpt-5-nano');
  }, );
});

await serie('Consulta: el razonamiento mínimo solo se pide a los GPT-5, y si OpenAI lo rechaza se reintenta sin él', async () => {
  await conOpenAi([conUso({ content: 'ok' }, 10, 5)], async (llamadas) => {
    const mw = conPresupuesto(createMemoryBudgetStore(), { openaiModel: 'gpt-4.1-nano', openaiReasoningEffort: 'minimal' });
    await pedir(mw, '/chat', HOLA_CRM, como('tk-gerente'));
    assert.equal(llamadas[0].reasoning_effort, undefined, 'gpt-4.1 no razona');
  });
  await conOpenAi(
    [new Response(JSON.stringify({ error: { message: "Unsupported value: 'reasoning_effort'" } }), { status: 400 }), conUso({ content: 'ok' }, 10, 5)],
    async (llamadas) => {
      const r = await pedir(conPresupuesto(createMemoryBudgetStore()), '/chat', HOLA_CRM, como('tk-gerente'));
      assert.equal(r.status, 200);
      assert.equal(llamadas.length, 2);
      assert.equal(llamadas[0].reasoning_effort, 'minimal');
      assert.equal(llamadas[1].reasoning_effort, undefined);
    }
  );
});

await serie('Tope: al gastarse el presupuesto el asistente se detiene sin llamar al modelo', async () => {
  const store = createMemoryBudgetStore(0.0002);
  const mw = conPresupuesto(store);
  await conOpenAi([conUso({ content: 'Primera respuesta' }, 1000, 500, 200)], async (llamadas) => {
    assert.equal((await pedir(mw, '/chat', HOLA_CRM, como('tk-gerente'))).status, 200, 'la primera entra: todavía había presupuesto');
    // Gastó US$ 0,000241 de 0,0002: ya no hay más
    const segunda = await pedir(mw, '/chat', HOLA_CRM, como('tk-gerente'));
    assert.equal(segunda.status, 402);
    assert.match(String(segunda.json.error), /presupuesto mensual de IA \(US\$ 0,00\)/);
    assert.match(String(segunda.json.error), /gerencia puede subirlo/);
    assert.equal(llamadas.length, 1, 'la segunda consulta no llegó a OpenAI');
  });
  assert.match(exhaustedMessage({ month: 'm', budgetUsd: 0, spentUsd: 0, requests: 0 }), /apagado/);
});

await serie('Tope: cada CRM tiene el suyo y el gasto de uno no afecta al otro', async () => {
  const store = createMemoryBudgetStore(0.0002);
  const mw = conPresupuesto(store);
  await conOpenAi([conUso({ content: 'a' }, 1000, 500), conUso({ content: 'b' }, 10, 5)], async () => {
    assert.equal((await pedir(mw, '/chat', HOLA_CRM, como('tk-gerente'))).status, 200);
    assert.equal((await pedir(mw, '/chat', HOLA_CRM, como('tk-gerente'))).status, 402, 'crm-1 agotado');
    assert.equal((await pedir(mw, '/chat', HOLA_CRM, como('tk-otro'))).status, 200, 'crm-2 tiene el suyo entero');
  });
  assert.ok((await store.status('crm-2')).spentUsd < 0.0001);
});

await serie('Tope: una consulta con varias vueltas se corta a la mitad si se acaba el presupuesto', async () => {
  const store = createMemoryBudgetStore(0.0002);
  const mw = conPresupuesto(store);
  const buscar = { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'search_potential_leads', arguments: '{"query":"talleres","location":"Santiago","industry":"maestranza"}' } }] };
  // La primera vuelta (búsqueda del servidor) cuesta más de lo que quedaba: la segunda no se hace
  await conOpenAi([conUso(buscar, 1000, 500), conUso({ content: 'nunca llega' }, 10, 5)], async (llamadas) => {
    const r = await pedir(mw, '/chat', HOLA_CRM, como('tk-gerente'));
    assert.equal(r.status, 402);
    assert.equal(llamadas.length, 1, 'se cortó antes de la segunda vuelta');
  });
  assert.equal((await store.status('crm-1')).requests, 1, 'lo gastado en la primera vuelta quedó anotado');
});

await serie('Tope: si no se puede verificar el presupuesto, no se llama al modelo (falla cerrado)', async () => {
  const roto: AiBudgetStore = {
    status: async () => {
      throw new Error('Supabase caído');
    },
    setBudget: async () => undefined,
    record: async () => undefined,
  };
  await conOpenAi([conUso({ content: 'no debería' }, 1, 1)], async (llamadas) => {
    const r = await pedir(conPresupuesto(roto), '/chat', HOLA_CRM, como('tk-gerente'));
    assert.equal(r.status, 503);
    assert.match(String(r.json.error), /verificar el presupuesto/);
    assert.equal(llamadas.length, 0);
  });
});

await serie('Tope: si falla anotar el gasto, la persona igual recibe su respuesta', async () => {
  const sinGuardar: AiBudgetStore = { ...createMemoryBudgetStore(30), record: async () => { throw new Error('sin conexión'); } };
  await conOpenAi([conUso({ content: 'Aquí está' }, 100, 50)], async () => {
    const r = await pedir(conPresupuesto(sinGuardar), '/chat', HOLA_CRM, como('tk-gerente'));
    assert.equal(r.status, 200);
    assert.equal(r.json.text, 'Aquí está');
  });
});

await serie('Tope: sin uso informado por OpenAI se estima por el tamaño del texto (mejor de más que de menos)', async () => {
  const store = createMemoryBudgetStore(30);
  await conOpenAi([respuesta({ content: 'Respuesta sin cifras de uso' })], async () => {
    await pedir(conPresupuesto(store), '/chat', HOLA_CRM, como('tk-gerente'));
  });
  const { spentUsd, requests } = await store.status('crm-1');
  assert.ok(spentUsd > 0 && requests === 1, `se anotó algo: ${spentUsd}`);
});

await serie('Tope: con Gemini o con una clave propia no hay presupuesto que aplicar', async () => {
  const store = createMemoryBudgetStore(0);
  const conGemini = createAiMiddleware({ provider: 'gemini', geminiModel: 'g', requireSession: true, identify: async (t) => (PERSONAS[t] as never) ?? null, budget: store });
  const aplica = await pedir(conGemini, '/budget', undefined, como('tk-gerente'));
  assert.deepEqual(aplica.json, { applies: false });
  assert.equal((await pedir(conGemini, '/status')).json.budgetEnforced, false);
});

await serie('Endpoint /budget: cualquiera del CRM lo ve; solo la gerencia de ese CRM lo cambia', async () => {
  const store = createMemoryBudgetStore(30);
  const mw = conPresupuesto(store);

  const vista = await pedir(mw, '/budget', undefined, como('tk-vendedor'));
  assert.equal(vista.status, 200);
  assert.deepEqual([vista.json.applies, vista.json.canEdit, vista.json.budgetUsd, vista.json.spentUsd, vista.json.model], [true, false, 30, 0, 'gpt-5-nano']);

  const intento = await pedir(mw, '/budget', { budgetUsd: 500 }, como('tk-vendedor'));
  assert.equal(intento.status, 403, 'el usuario base no cambia el presupuesto');
  assert.equal((await store.status('crm-1')).budgetUsd, 30);

  const cambio = await pedir(mw, '/budget', { budgetUsd: '45,50' }, como('tk-gerente'));
  assert.equal(cambio.status, 200);
  assert.deepEqual([cambio.json.budgetUsd, cambio.json.canEdit], [45.5, true]);
  assert.equal((await store.status('crm-2')).budgetUsd, 30, 'el otro CRM no se toca');
  assert.equal((await pedir(mw, '/budget', undefined, como('tk-otro'))).json.budgetUsd, 30);

  for (const malo of [{ budgetUsd: -3 }, { budgetUsd: 5000 }, { budgetUsd: 'mucho' }, {}]) {
    const r = await pedir(mw, '/budget', malo, como('tk-gerente'));
    assert.equal(r.status, 400, JSON.stringify(malo));
  }
  assert.equal((await store.status('crm-1')).budgetUsd, 45.5, 'un valor inválido no cambia nada');
});

await serie('Endpoint /budget: sin sesión, el administrador de la plataforma y el gasto de quien no es del CRM no entran', async () => {
  const mw = conPresupuesto(createMemoryBudgetStore(30));
  assert.equal((await pedir(mw, '/budget')).status, 401);
  assert.equal((await pedir(mw, '/budget', undefined, como('tk-falso'))).status, 401);
  assert.equal((await pedir(mw, '/budget', undefined, como('tk-admin'))).status, 401);
  assert.equal((await pedir(mw, '/budget', { budgetUsd: 10 }, como('tk-admin'))).status, 401);
});

await serie('Endpoint /budget: bajar el presupuesto por debajo de lo gastado detiene el asistente; 0 lo apaga', async () => {
  const store = createMemoryBudgetStore(30);
  const mw = conPresupuesto(store);
  await conOpenAi([conUso({ content: 'hola' }, 1000, 500)], async (llamadas) => {
    assert.equal((await pedir(mw, '/chat', HOLA_CRM, como('tk-gerente'))).status, 200);
    await pedir(mw, '/budget', { budgetUsd: 0 }, como('tk-gerente'));
    const apagado = await pedir(mw, '/chat', HOLA_CRM, como('tk-gerente'));
    assert.equal(apagado.status, 402);
    assert.match(String(apagado.json.error), /apagado/);
    await pedir(mw, '/budget', { budgetUsd: 30 }, como('tk-gerente'));
    assert.equal(llamadas.length, 1);
  });
});

await serie('Desarrollo local: sin sesión se puede probar el chat con un cupo propio y ajustarlo', async () => {
  const store = createMemoryBudgetStore(1);
  const mw = createAiMiddleware({ provider: 'openai', openaiApiKey: 'sk-local', openaiModel: 'gpt-5-nano', geminiModel: 'g', requireSession: false, budget: store });
  const vista = await pedir(mw, '/budget');
  assert.deepEqual([vista.status, vista.json.canEdit, vista.json.budgetUsd], [200, true, 1]);
  await conOpenAi([conUso({ content: 'hola' }, 100, 50)], async () => {
    assert.equal((await pedir(mw, '/chat', HOLA_CRM)).status, 200);
  });
  assert.ok((await store.status('local')).spentUsd > 0);
  assert.equal((await pedir(mw, '/budget', { budgetUsd: 2 })).json.budgetUsd, 2);
});

await serie('Supabase: el presupuesto y el gasto se leen y se escriben solo con la clave del servidor', async () => {
  const llamadas: [string, unknown][] = [];
  let ajustes: { monthly_budget_usd: string } | null = { monthly_budget_usd: '45.50' };
  let gasto: { requests: number; cost_usd: string } | null = { requests: 3, cost_usd: '1.234567' };
  const admin = {
    from: (tabla: string) => ({
      select: () => ({
        eq: (campo: string, valor: string) => {
          llamadas.push([`${tabla}.${campo}`, valor]);
          const cadena = {
            eq: (campo2: string, valor2: string) => (llamadas.push([`${tabla}.${campo2}`, valor2]), cadena),
            maybeSingle: async () => ({ data: tabla === 'company_ai_settings' ? ajustes : gasto, error: null }),
          };
          return cadena;
        },
      }),
    }),
    rpc: async (nombre: string, args: unknown) => (llamadas.push([nombre, args]), { error: null }),
  } as never;
  const fecha = () => new Date('2026-10-15T12:00:00Z');
  const store = createSupabaseBudgetStore(admin, 30, fecha);
  assert.deepEqual(await store.status('crm-1'), { month: '2026-10', budgetUsd: 45.5, spentUsd: 1.234567, requests: 3 });
  assert.ok(llamadas.some(([k, v]) => k === 'ai_usage_monthly.month' && v === '2026-10-01'), 'pide el mes en curso');
  // Sin fila de presupuesto ni de gasto valen el predeterminado y cero
  ajustes = null;
  gasto = null;
  assert.deepEqual(await store.status('crm-2'), { month: '2026-10', budgetUsd: 30, spentUsd: 0, requests: 0 });

  await store.setBudget('crm-1', 60, 'u-gerente');
  assert.deepEqual(llamadas.find(([k]) => k === 'set_company_ai_budget')![1], { p_company_id: 'crm-1', p_user_id: 'u-gerente', p_budget_usd: 60 });
  await assert.rejects(() => store.setBudget('crm-1', 60, null), /falta la persona/);

  await store.record('crm-1', { inputTokens: 1000, cachedInputTokens: 200, outputTokens: 500, costUsd: 0.0002410004 });
  assert.deepEqual(llamadas.find(([k]) => k === 'record_ai_usage')![1], {
    p_company_id: 'crm-1', p_input_tokens: 1000, p_cached_input_tokens: 200, p_output_tokens: 500, p_cost_usd: 0.000241,
  });
  const caida = createSupabaseBudgetStore({ from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'x' } }) }), maybeSingle: async () => ({ data: null, error: { message: 'x' } }) }) }) }) } as never, 30);
  await assert.rejects(() => caida.status('crm-1'));
});

await serie('Configuración: el presupuesto predeterminado es US$30 y se puede cambiar con una variable', async () => {
  assert.equal((await budgetStoreFrom({}).status('local')).budgetUsd, 30);
  assert.equal((await budgetStoreFrom({ AI_DEFAULT_MONTHLY_BUDGET_USD: '12' }).status('local')).budgetUsd, 12);
  assert.equal((await budgetStoreFrom({ AI_DEFAULT_MONTHLY_BUDGET_USD: 'abc' }).status('local')).budgetUsd, 30);
});

await Promise.all(pending);
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.error ? `\n    ${r.error}` : ''}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} pruebas del asistente OK`);
process.exit(failed ? 1 : 0);
