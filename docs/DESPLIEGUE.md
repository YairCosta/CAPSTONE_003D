# Publicación en Vercel

La app se publica en Vercel desde GitHub: **cada push a `main` publica una versión nueva** en uno o
dos minutos, y una rama distinta de `main` genera una versión de prueba con su propio enlace, sin
tocar la real. Si algo sale mal, en Vercel se vuelve a la versión anterior con un clic
(**Deployments**, sobre la versión anterior: **⋯ → Instant Rollback**).

## Cómo se arma

`npm run build:vercel` deja todo en `.vercel/output` (Build Output API de Vercel):

| Parte | Qué es |
|---|---|
| `static/` | La app compilada (`vite build`) |
| `functions/api.func/` | Una sola función de Node para toda la API: asistente IA (`/api/ai`), tipos de cambio (`/api/rates`) e invitaciones (`/api/admin`). Se empaqueta en JavaScript con todas sus dependencias (`scripts/build-vercel.mjs`) |
| `config.json` | Rutas: los archivos se sirven tal cual, `/api/*` va a la función y cualquier otra ruta abre la app. Encabezados de seguridad (entre ellos la política de contenido, CSP) y caché larga para `/assets` |

En desarrollo la misma API corre dentro de Vite. Las dos arman la API igual, desde las variables de
entorno (`server/api.ts`): lo que se prueba en local es lo que se publica.

`vercel.json` le dice a Vercel que use `npm run build:vercel` (Framework Preset: **Other**).

## Variables de entorno (en Vercel: Settings → Environment Variables)

| Variable | Valor | Dónde se usa |
|---|---|---|
| `VITE_SUPABASE_URL` | La misma de `.env.local` | App y función (pública) |
| `VITE_SUPABASE_ANON_KEY` | La misma de `.env.local` | App (pública: RLS protege los datos) |
| `VITE_DATA_SOURCE` | `supabase` | App |
| `SUPABASE_SERVICE_ROLE_KEY` | La clave secreta de Supabase, marcada **Sensitive** | Solo la función de invitaciones |
| `APP_URL` | La dirección publicada, ej. `https://revela.vercel.app` | Enlace de los correos de invitación |
| `AI_PROVIDER`, `GEMINI_API_KEY` u `OPENAI_API_KEY`, `GOOGLE_PLACES_API_KEY` | Opcionales | Asistente IA |

Las `VITE_` se meten en la app al compilar: si se cambian, hay que volver a publicar (**Redeploy**).
Las demás solo existen en la función. Ninguna clave se escribe en el código ni se pega en el chat.

## Supabase

**Authentication → URL Configuration**:

- **Site URL**: la dirección publicada.
- **Redirect URLs**: la dirección publicada con `/**` al final, y `http://localhost:5173/**` para
  seguir probando en local.

Sin esto, los enlaces de invitación y de cambio de contraseña llevan a localhost.

## Antes de cada push

```bash
npm run test:vercel
```

Arma `.vercel/output`, levanta un servidor local con las mismas rutas y prueba la función
empaquetada: que la app abra, que las tres APIs respondan, que una ruta inexistente dé 404, que
ninguna clave de `.env.local` quede en lo que se sube, que el asistente rechace a quien no inició
sesión y, en Chrome, que la política de contenido deje abrir la app sin violaciones, hablar con
Supabase y **no** mandar datos a otros sitios (20 revisiones). `npm run test:bundle` revisa además
que la app no traiga los CRMs de prueba.

## Política de contenido (CSP)

`scripts/build-vercel.mjs` la arma en cada publicación: scripts solo de la app (el del tema oscuro de
`index.html`, por su huella sha256), conexiones solo a la app y a Supabase (la dirección sale de
`VITE_SUPABASE_URL`), imágenes de los mapas de Esri y fuentes de Google. Si se agrega un servicio
externo (otro mapa, analítica, un widget), hay que sumarlo ahí o el navegador lo bloqueará.

## Plan y límites

- **Hobby (gratis)**: para la tesis y el piloto sin cobro. Su uso es personal, no comercial: al
  empezar a cobrar, pasar a Pro (~US$20/mes) o mover la app a otro proveedor (ver
  `docs/PAGOS.md`).
- La función puede durar hasta 60 segundos (el asistente encadena varias llamadas).
- Las funciones corren por defecto en Washington (iad1); la base está en São Paulo. Para la API
  la diferencia es mínima; se puede cambiar en **Settings → Functions → Function Region**.
