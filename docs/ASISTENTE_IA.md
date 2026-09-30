# Asistente IA de prospección (GPT)

Widget flotante (abajo a la derecha) para buscar empresas por rubro y zona y registrarlas como leads con lenguaje natural.
Disponible para los perfiles **Usuario base** y **Gerente**.

> **Desde el 30-09-2026 el asistente usa solo GPT (OpenAI).** Para usarlo basta `OPENAI_API_KEY` (ver la sección
> "GPT (OpenAI)" más abajo). **Gemini está apagado**: solo se enciende escribiendo `AI_PROVIDER=gemini` a propósito;
> tener una `GEMINI_API_KEY` en el entorno no lo activa, y la clave personal del chat se ignora y ya no se ofrece.
> Las secciones 1 y 2 explican cómo encender Gemini, por si algún día se quiere volver a él.

## 1. (Solo Gemini) Obtener la API key gratuita

1. Entra a <https://aistudio.google.com/apikey> con tu cuenta Google.
2. Pulsa **Create API key** (elige o crea un proyecto) y copia la clave.
3. El plan gratuito tiene límites por minuto y por día; si se superan, el chat mostrará un aviso para esperar.

## 2. (Solo Gemini) Configurarla

Crea (o edita) el archivo `.env.local` en la raíz del proyecto:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=tu_clave_de_ai_studio
# Opcional: modelo a usar (por defecto gemini-2.5-flash)
GEMINI_MODEL=gemini-2.5-flash
# Opcional: resultados reales de empresas con Google Places (API de pago con cuota gratuita)
# GOOGLE_PLACES_API_KEY=tu_clave_de_google_cloud
```

Reinicia el servidor: `npm run dev`.

> Las variables **no** llevan el prefijo `VITE_`, así que nunca se incluyen en el código que descarga el navegador.
> `.env.local` está en `.gitignore`.

Con Gemini encendido hay una alternativa rápida para pruebas: en el chat, botón de llave → pegar una API key personal.
Se guarda solo en esa pestaña (sessionStorage) y se envía únicamente al backend propio. **Con GPT el chat no la ofrece
y el servidor la ignora**: así nadie esquiva la sesión ni el presupuesto con una clave propia.

### Quién puede usar las claves del servidor

Publicada, la API del asistente está en internet. Las claves del servidor (IA y Google Places) solo las
usa quien tiene **sesión en un CRM** (usuario base o gerente, activo, con su CRM activo): el navegador
manda el token de Supabase y el servidor lo verifica con Supabase Auth y lee el perfil (`server/session.ts`).

| Quién llama | Claves del servidor | Google Places | Clave propia de Gemini (solo con Gemini encendido) |
|---|---|---|---|
| Usuario base o gerente con sesión | Sí, hasta 60 consultas cada 10 minutos | Sí | Sí (tiene prioridad) |
| Sin sesión (cuenta demo), administrador de plataforma, usuario o CRM desactivado | **No** (401) | No | Sí |
| Servidor local (`npm run dev`) | Sí, sin sesión (`requireSession: false`) | Sí | Sí |

Con GPT (lo normal) la columna de la clave propia no existe: sin sesión en un CRM no se entra, y la demo pública no
tiene asistente.

Además, la conversación solo puede traer texto y llamadas a herramientas (nada de imágenes ni archivos) y
tiene un tope de 60.000 caracteres en total, para que una sola consulta no dispare el costo.
Pruebas: `npm run test:ai` (sin sesión, token falso, administrador, desactivado, Supabase caído, límite y
formato) y `npm run test:vercel` (la versión publicada rechaza a quien no inició sesión).

## 3. Arquitectura

```
Navegador (AiChatWidget)                  Servidor (server/aiChat.ts)                     Google
───────────────────────                  ───────────────────────────────────────          ──────
POST /api/ai/chat  {contents, context} ─► verifica la sesión, valida y llama       ───────► Gemini
  + Authorization: Bearer <token>          a Gemini con las tools
                                          ◄── functionCall: search_potential_leads
                                          ejecuta búsqueda (Places o demo)         ───────► Places (opcional)
                                          ◄── functionCall: save_lead_to_crm
◄── {type:"tool_calls", calls}            (se delega al navegador)
guarda el lead en el CRM (tenant actual)
POST /api/ai/chat  {contents + respuesta} ─► continúa el loop                       ───────► Gemini
◄── {type:"message", text}
```

- `server/aiChat.ts`: endpoint `POST /api/ai/chat`, `GET /api/ai/status`, esquemas de las tools y loop de function calling.
- `server/leadSearch.ts`: búsqueda de empresas (Google Places o datos de demostración ficticios).
- `src/components/AiChatWidget.tsx`: widget flotante.
- `src/App.tsx` → `handleAiSaveLead`, `handleAiFindLeads` y `handleAiUpdateLeadStage`: ejecutan las tools sobre el CRM de la empresa en sesión.
- `src/lib/aiLeadMatch.ts`: emparejamiento difuso de leads existentes (función pura, probada en `npm run test:tenant`).

Las tools que tocan el CRM se ejecutan en el navegador porque hoy los leads viven en el estado de la app.
Al conectar Supabase, puede moverse al servidor (insert en `leads` con RLS) sin cambiar su esquema.

## 4. Tools declaradas

| Tool | Parámetros | Dónde se ejecuta |
|---|---|---|
| `search_potential_leads` | `query`, `location`, `industry`, `country` | Servidor (Google Places) |
| `find_leads_in_crm` | `query`*, `country` | Navegador |
| `update_lead_stage` | `lead_id`*, `status`* | Navegador |
| `save_lead_to_crm` | `company_name`*, `status`*, `phone` (de la empresa), `address`, `commune`, `region`, `notes`, `estimated_value` | Navegador |

`status`: `nuevo`, `contactado`, `calificado`, `propuesta`, `pago_pendiente`, `ganado`, `perdido`.
`commune`: nombre oficial de la zona (comuna, distrito); `region`: su región o departamento. El asistente ya no recibe la lista
de zonas (son 345 comunas y 1.893 distritos): recibe las **regiones** de cada país y la app busca la zona por nombre, sin
importar tildes ni mayúsculas (`findZonesByName`, `src/lib/zones.ts`). Si el nombre se repite (Perú tiene 4 Miraflores y 10
Santa Rosa), la región lo resuelve; si aun así hay varias o ninguna, **no se adivina**: el lead queda en
**Gerencia → Leads sin zona** y la respuesta le dice al asistente cuántas hay y en qué regiones, para que lo explique.

### Buscar antes de modificar

`search_potential_leads` busca empresas **en internet**; `find_leads_in_crm` busca leads **que ya están en el CRM**.
Son cosas distintas y confundirlas fue un error real: cuando el asistente solo tenía "buscar en internet" y "guardar",
pedirle *"mueve a Carolina Peña a descartado"* terminaba **creando un lead duplicado**, porque guardar era la única
acción disponible y el nombre escrito a mano ("bancoandes") no calzaba exacto con el del CRM ("Banco Andes Sucursales").

Ahora:

- Mover un lead existente es `find_leads_in_crm` → `update_lead_stage` con el `lead_id` devuelto. El cambio de etapa
  respeta la regla de roles (`canChangeStage`): el usuario base no puede retroceder un lead, tampoco pidiéndoselo a la IA.
- `save_lead_to_crm` es solo para leads **nuevos**. Si encuentra uno suficientemente parecido devuelve
  `needs_confirmation` con los candidatos en vez de crear un duplicado, y el asistente pregunta a cuál se refería.
- El emparejamiento tolera nombres incompletos, sin tildes o pegados, y también busca por teléfono, correo e ID.
  Si hay varias coincidencias, el asistente muestra la lista y pregunta: no adivina.

## 5. Ejemplo

- «Búscame maestranzas y talleres de contenedores en San Bernardo»
- «Llamé a Maestranza San Bernardo, les interesó. Guárdalo como lead calificado»
- «Mueve a Carolina Peña a descartado» → busca el lead, encuentra Banco Andes Sucursales y cambia su etapa

## Limitaciones actuales

- El endpoint corre en el servidor de Vite (`npm run dev` / `npm run preview`). Para producción hay que desplegarlo
  en un backend (por ejemplo, una Supabase Edge Function o un servidor Node) y agregar autenticación y límite de uso.
- El asistente puede mover leads de etapa, pero todavía no editar montos, zonas ni contactos: eso se hace a mano.
- Sin `GOOGLE_PLACES_API_KEY` las empresas encontradas son ficticias (teléfonos `+56 9 5555 01xx`, dominios `.demo`).

## Datos de personas: el asistente registra empresas, no personas

Desde el 25-09-2026 el asistente **solo registra datos de la empresa**. La herramienta
`save_lead_to_crm` ya no acepta nombre ni correo de una persona, y aunque el modelo los envíe, la
aplicación los descarta (`src/App.tsx`, `handleAiSaveLead`).

**Por qué:** que un dato de una persona sea público no autoriza a guardarlo. La Ley 21.719 exige una
base legal y avisarle a la persona. Los datos de una **empresa** (nombre, dirección, rubro, teléfono
de la oficina) no son datos personales. La búsqueda de Google Places ya devolvía solo eso.

**Cómo queda el lead:** con el origen "Búsqueda del asistente", la persona como "Contacto por
identificar" y la base "Prospecto: se le preguntará en el primer contacto". El vendedor agrega a la
persona cuando habla con ella, y si nadie la contacta en 30 días, sus datos se eliminan solos
(ver `docs/LEY_21719.md`).

## GPT (OpenAI): el proveedor del asistente

Desde el 25-09-2026 el asistente puede funcionar con **GPT** y desde el 30-09-2026 es el único proveedor encendido.
Las herramientas, las reglas y los límites son los mismos que tenía con Gemini; solo cambia el modelo que conversa.

**Qué hace falta:** una clave de API de [platform.openai.com](https://platform.openai.com/api-keys)
con saldo cargado. **La suscripción de ChatGPT no sirve**: es una cuenta distinta que no da acceso a
la API.

**Cómo activarlo**, en `.env.local` (nunca en el chat ni en el código):

```
OPENAI_API_KEY=la-clave
# Opcionales (los valores de abajo son los predeterminados):
# AI_PROVIDER=openai
# OPENAI_MODEL=gpt-5-nano
# OPENAI_REASONING_EFFORT=minimal
# AI_DEFAULT_MONTHLY_BUDGET_USD=30
```

y reiniciar `npm run dev`. En el chat, la cabecera dice "GPT · gpt-5-nano". Publicada, las mismas variables
van en Vercel (ver `docs/DESPLIEGUE.md`).

**Modelo:** `gpt-5-nano`, el más barato de la tabla de abajo y suficiente para buscar, crear y mover leads.
Los modelos GPT-5 razonan antes de responder y ese razonamiento se cobra como salida, así que se pide el
razonamiento mínimo (`OPENAI_REASONING_EFFORT=minimal`) y cada respuesta tiene un tope de 1.500 tokens.

**Cómo está hecho:**
- La conversación se guarda siempre en el formato de Gemini, así que el navegador no cambia. El
  servidor la traduce al formato de OpenAI en cada paso (`server/openaiChat.ts`) y devuelve la
  respuesta traducida. Se puede cambiar de proveedor sin perder nada.
- GPT es el proveedor por defecto: basta `OPENAI_API_KEY`, no hace falta `AI_PROVIDER`. Gemini solo se enciende con
  `AI_PROVIDER=gemini` escrito a propósito (`resolveProvider` en `server/aiChat.ts`).
- La clave personal del chat (de Gemini) se ignora con GPT: el servidor no la lee y el chat no la muestra.
- No se envía temperatura: los modelos de razonamiento de OpenAI solo aceptan el valor por defecto.
- Si OpenAI rechaza el nivel de razonamiento pedido (un modelo que no lo admite), se reintenta una vez sin él.

### Presupuesto mensual de IA

Cada consulta a OpenAI cuesta dinero (fracciones de centavo con `gpt-5-nano`, pero se acumulan). Cada CRM tiene un
**presupuesto mensual en dólares, US$ 30 por defecto**, que **la gerencia ajusta desde el chat**: ícono de la llave →
"Presupuesto mensual de IA". Lo mide y lo aplica el **servidor** (`server/aiBudget.ts`, `server/aiPricing.ts`):
el navegador solo lo muestra y pide cambiarlo, nunca decide.

| Qué | Cómo |
|---|---|
| Medición | En cada paso, OpenAI informa los tokens usados (`usage`); con el precio del modelo se calcula el costo exacto y se suma al gasto del mes del CRM (`ai_usage_monthly`, función `record_ai_usage`, atómica). Si por alguna razón no informa el uso, se estima por el tamaño del texto, por encima de lo real |
| Tope | Antes de cada consulta se lee el gasto. Si alcanzó el presupuesto responde **402** con un mensaje claro y **no llama a OpenAI**. Una consulta de varias vueltas se corta a la mitad si se acaba en el camino |
| Falla cerrado | Si no se puede leer el presupuesto (base caída), no se llama al modelo: mejor un error que un gasto sin tope |
| Avisos | Desde el 80% el chat muestra un aviso ámbar; al llegar al tope, rojo, con el campo de mensaje deshabilitado. Con el presupuesto en **0** el asistente queda apagado |
| Quién lo cambia | Solo la gerencia de ese CRM (`POST /api/ai/budget`, que llama a `set_company_ai_budget`: la base misma exige que sea gerente activo del CRM). Cualquier persona del CRM lo ve. El administrador de la plataforma no lo cambia: es decisión de cada cliente |
| Renovación | El gasto se reinicia el día 1 de cada mes (UTC, como cobra OpenAI) |
| Registro | El cambio queda en la auditoría del CRM ("Ajustó el presupuesto mensual del asistente de IA a US$ X") y en `change_log` con su autor |
| Datos | `ai_usage_monthly` guarda solo números (llamadas, tokens y dólares): nada de lo conversado. Se escribe únicamente con la clave del servidor; ninguna persona con sesión puede borrar su gasto ni subirse el tope directo contra la base |

**Por qué ninguna herramienta de la IA puede cambiarlo:** el asistente no tiene herramientas sobre
configuración, y no debe tenerlas (invariante 6). Si pudiera subirse el tope, una instrucción maliciosa dentro
de un dato (inyección indirecta, ver `docs/SEGURIDAD.md`) podría vaciar el presupuesto. El presupuesto se
ajusta solo desde la pantalla, con la sesión de la gerencia.

**Precios** (por millón de tokens, revisados el 30-09-2026 en developers.openai.com/api/docs/pricing; si OpenAI los
cambia, se actualizan en `server/aiPricing.ts`):

| Modelo | Entrada | Entrada en caché | Salida |
|---|---|---|---|
| `gpt-5-nano` (predeterminado) | US$ 0,05 | US$ 0,005 | US$ 0,40 |
| `gpt-5-mini` | US$ 0,25 | US$ 0,025 | US$ 2,00 |
| `gpt-4.1-nano` | US$ 0,10 | US$ 0,025 | US$ 0,40 |
| `gpt-4.1-mini` | US$ 0,40 | US$ 0,10 | US$ 1,60 |
| `gpt-4o-mini` | US$ 0,15 | US$ 0,075 | US$ 0,60 |

Un modelo que no está en la tabla se cobra como uno caro (US$ 2,50 / 10,00): el tope protege de más, nunca de menos.

**Lo que el presupuesto NO cubre:**
- **Una sola clave de OpenAI sirve a todos los CRMs** del servidor. El tope es por CRM, pero la factura es una:
  si hay varios CRMs activos (por ejemplo, de prueba), todos gastan de la misma cuenta. Para un cliente real conviene
  su propia clave y su propio despliegue, o un tope de la cuenta en platform.openai.com (Limits), que es el último
  resguardo y está fuera de Revela.
- **Google Places** (búsqueda real de empresas) tiene su propio cobro y no se cuenta aquí.
- **Gemini** está apagado: como la clave personal del chat se ignora, no hay gasto de IA que escape del presupuesto por ahí.

**Pruebas:** `npm run test:ai` simula a OpenAI y recorre la conversación completa por el servidor, incluida una
herramienta que ejecuta el navegador, y cubre los precios, el tope, el aislamiento entre CRMs, quién puede cambiar
el presupuesto y la caída de la base. `npm run test:db` prueba las tablas y funciones de la 0031 (quién escribe,
quién lee, el registro de cambios).

**Prueba con la clave real (30-09-2026, `gpt-5-nano`, CRM "Revela Pruebas", con sesión):** el asistente respondió, buscó
(sin `GOOGLE_PLACES_API_KEY` la búsqueda devuelve datos de demostración) y el gasto quedó anotado: 5 llamadas,
12.797 tokens de entrada (9.216 en caché) y 469 de salida = US$ 0,000413, igual al cálculo a mano con la tabla de
precios. Falta probar el tope agotándolo con la clave real; el corte está cubierto por `npm run test:ai`.

**Ley 21.719:** con Gemini apagado, OpenAI es el único subencargado de IA que recibe datos del CRM (Google ya no
recibe nada por este camino). Recibe lo mismo que recibía Gemini: la ficha mínima del lead, sin correo, teléfono ni
monto. Figura en el registro de tratamientos (`docs/cumplimiento/revela-2026-09/rat.csv`, que lista "Gemini (Google) u
OpenAI" porque es de antes de esta decisión) y requiere el análisis de transferencia internacional.
