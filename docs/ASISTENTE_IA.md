# Asistente IA de prospección (Gemini)

Widget flotante (abajo a la derecha) para buscar empresas por rubro y zona y registrarlas como leads con lenguaje natural.
Disponible para los perfiles **Usuario base** y **Gerente**.

## 1. Obtener la API key gratuita

1. Entra a <https://aistudio.google.com/apikey> con tu cuenta Google.
2. Pulsa **Create API key** (elige o crea un proyecto) y copia la clave.
3. El plan gratuito tiene límites por minuto y por día; si se superan, el chat mostrará un aviso para esperar.

## 2. Configurarla

Crea (o edita) el archivo `.env.local` en la raíz del proyecto:

```env
GEMINI_API_KEY=tu_clave_de_ai_studio
# Opcional: modelo a usar (por defecto gemini-2.5-flash)
GEMINI_MODEL=gemini-2.5-flash
# Opcional: resultados reales de empresas con Google Places (API de pago con cuota gratuita)
# GOOGLE_PLACES_API_KEY=tu_clave_de_google_cloud
```

Reinicia el servidor: `npm run dev`.

> Las variables **no** llevan el prefijo `VITE_`, así que nunca se incluyen en el código que descarga el navegador.
> `.env.local` está en `.gitignore`.

Alternativa rápida para pruebas: en el chat, botón de llave → pegar una API key personal.
Se guarda solo en esa pestaña (sessionStorage) y se envía únicamente al backend propio.

### Quién puede usar las claves del servidor

Publicada, la API del asistente está en internet. Las claves del servidor (IA y Google Places) solo las
usa quien tiene **sesión en un CRM** (usuario base o gerente, activo, con su CRM activo): el navegador
manda el token de Supabase y el servidor lo verifica con Supabase Auth y lee el perfil (`server/session.ts`).

| Quién llama | Claves del servidor | Google Places | Clave propia de Gemini |
|---|---|---|---|
| Usuario base o gerente con sesión | Sí, hasta 60 consultas cada 10 minutos | Sí | Sí (tiene prioridad) |
| Sin sesión (cuenta demo), administrador de plataforma, usuario o CRM desactivado | **No** (401) | No | Sí |
| Servidor local (`npm run dev`) | Sí, sin sesión (`requireSession: false`) | Sí | Sí |

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

## Usar GPT (OpenAI) en vez de Gemini

Desde el 25-09-2026 el asistente puede funcionar con **GPT**. Las herramientas, las reglas y los
límites son exactamente los mismos; solo cambia el modelo que conversa.

**Qué hace falta:** una clave de API de [platform.openai.com](https://platform.openai.com/api-keys)
con saldo cargado. **La suscripción de ChatGPT no sirve**: es una cuenta distinta que no da acceso a
la API.

**Cómo activarlo**, en `.env.local` (nunca en el chat ni en el código):

```
AI_PROVIDER=openai
OPENAI_API_KEY=la-clave
OPENAI_MODEL=gpt-5-mini
```

y reiniciar `npm run dev`. En el chat, la cabecera dice "GPT · gpt-5-mini".

**Cómo está hecho:**
- La conversación se guarda siempre en el formato de Gemini, así que el navegador no cambia. El
  servidor la traduce al formato de OpenAI en cada paso (`server/openaiChat.ts`) y devuelve la
  respuesta traducida. Se puede cambiar de proveedor sin perder nada.
- Agregar la clave de OpenAI **no cambia el proveedor**: hay que pedirlo con `AI_PROVIDER=openai`.
  Si OpenAI es la única clave configurada, se usa sola.
- La clave personal que se ingresa en el chat es de Gemini; si hay una, se usa Gemini.
- No se envía temperatura: los modelos de razonamiento de OpenAI solo aceptan el valor por defecto.

**Pruebas:** `npm run test:ai` simula a OpenAI y recorre la conversación completa por el servidor,
incluida una herramienta que ejecuta el navegador. **Falta la prueba con la clave real.**

**Ley 21.719:** OpenAI pasa a ser otro subencargado que recibe datos del CRM. Recibe lo mismo que
Gemini: la ficha mínima del lead, sin correo, teléfono ni monto. Queda en el registro de
tratamientos (`docs/cumplimiento/revela-2026-09/rat.csv`) y requiere el mismo análisis de
transferencia internacional.
