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

## 3. Arquitectura

```
Navegador (AiChatWidget)                  Servidor Vite / Node (server/aiChat.ts)          Google
───────────────────────                  ───────────────────────────────────────          ──────
POST /api/ai/chat  {contents, context} ─► valida y llama a Gemini con las tools   ───────► Gemini
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
| `save_lead_to_crm` | `company_name`*, `status`*, `phone` (de la empresa), `address`, `commune`, `notes`, `estimated_value` | Navegador |

`status`: `nuevo`, `contactado`, `calificado`, `propuesta`, `pago_pendiente`, `ganado`, `perdido`.
`commune`: una de las comunas con zona en el mapa; si falta, el lead queda en **Gerencia → Leads sin comuna**.

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

