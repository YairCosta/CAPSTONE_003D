# 12. Manual técnico y de despliegue

## 12.1 Requisitos

| Herramienta | Versión | Para qué |
|---|---|---|
| Node.js | 22.x | Ejecutar y compilar la aplicación |
| npm | el que trae Node | Instalar dependencias |
| Google Chrome | reciente | Pruebas `test:e2e`, `test:vercel` y `test:rendimiento` |
| Docker (opcional) | Docker Desktop o Engine con Compose v2 | Correr Revela en un contenedor |
| Supabase CLI (opcional) | `npx supabase` | Aplicar migraciones y probar la base real |

## 12.2 Levantar el sistema

### Opción A · Local (desarrollo)

```bash
npm ci
npm run dev
```

Abre `http://localhost:5173/?demo`. Sin configurar nada arranca la **demo**: datos ficticios en memoria, sin base de datos ni
claves. La API (`/api/*`) corre dentro del servidor de desarrollo (Vite).

### Opción B · Docker

```bash
docker compose up --build
```

Abre `http://localhost:8080/?demo`. Sin configurar nada también arranca la demo.

Para conectar una base de Supabase propia, copia `.env.example` como `.env`, completa los valores y vuelve a correr el
comando: `docker-compose.yml` los toma solos.

| Archivo | Qué hace |
|---|---|
| `Dockerfile` | Dos etapas: compila la app (`npm run build`) y deja solo lo necesario para correr (`dist/`, `server/`, `src/` y las dependencias de producción) |
| `server/docker.ts` | Entrega los archivos compilados y atiende `/api/*` con el **mismo manejador que la función de Vercel** |
| `docker-compose.yml` | Un servicio, puerto 8080, variables de entorno sin valores secretos escritos |
| `.dockerignore` | Deja fuera secretos, `node_modules`, documentación y las carpetas de la asignatura |

Comandos útiles: `docker compose logs -f`, `docker compose down`. La imagen trae un `HEALTHCHECK` sobre `/api/ai/status`.

> **Estado de verificación del Docker.** El equipo de desarrollo no tiene Docker instalado, por lo que **la imagen no se
> construyó allí**. Sí se probó el servidor que contiene (`node server/docker.ts` sobre la app compilada): entrega la app y
> las rutas de la aplicación, atiende la API, rechaza métodos no permitidos y no sirve archivos fuera de `dist/`. La
> primera construcción de la imagen debe hacerse en una máquina con Docker.

## 12.3 Variables de entorno

Las que empiezan con `VITE_` quedan **dentro de la aplicación al compilar** y son públicas; las demás solo existen en
el servidor. Ninguna clave se escribe en el código. Plantilla completa: `.env.example`.

| Variable | Dónde | Para qué |
|---|---|---|
| `VITE_DATA_SOURCE` | Compilación | `demo` (en memoria, por defecto) o `supabase` (login y datos reales) |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Compilación y servidor | Conexión con Supabase (clave pública: los datos los protege RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo servidor | Clave secreta: verifica sesiones, invita usuarios, guarda presupuesto y claves. Nunca en el navegador |
| `APP_URL` | Solo servidor | Dirección a la que vuelve el enlace del correo de invitación |
| `OPENAI_MODEL`, `OPENAI_REASONING_EFFORT` | Solo servidor | Modelo (`gpt-5-nano` por defecto) y cuánto razona |
| `AI_DEFAULT_MONTHLY_BUDGET_USD` | Solo servidor | Presupuesto mensual de IA por empresa (30 por defecto) |
| `GOOGLE_PLACES_API_KEY` | Solo servidor | Opcional: búsqueda real de empresas (sin ella, datos de demostración) |
| `OPENAI_API_KEY` | Solo desarrollo local | Publicado se ignora: cada empresa trae su clave, cifrada en Vault |

## 12.4 Publicación (Vercel)

1. Conectar el repositorio a un proyecto de Vercel. `vercel.json` ya indica `npm ci` y `npm run build:vercel`.
2. Cargar en Vercel las variables de la tabla anterior (las secretas marcadas *Sensitive*).
3. Cada `push` a la rama principal publica. Antes de publicar: `npm run test:vercel` arma la salida de Vercel y la prueba
   tal como quedaría.
4. En Supabase → Authentication → URL Configuration, poner la dirección publicada (Site URL y Redirect URLs).

Detalle y decisiones: [`docs/DESPLIEGUE.md`](../../../docs/DESPLIEGUE.md).

## 12.5 Base de datos (Supabase)

```bash
npx supabase login
npx supabase link --project-ref <referencia-del-proyecto>
npm run test:db -- --con supabase/migrations/<nueva>.sql   # ensaya una migración SIN aplicarla
npx supabase db push                                       # la aplica
npx supabase db lint --linked --level error --schema public
npm run test:db                                            # verifica todo de nuevo
```

Reglas: nunca se edita una migración aplicada (siempre una nueva); un cambio destructivo va en migraciones separadas; toda
tabla de datos lleva `company_id`, RLS, índice, `COMMENT ON` y un trigger de coherencia. Procedimiento completo en
[`docs/BASE_DE_DATOS.md`](../../../docs/BASE_DE_DATOS.md).

## 12.6 Pruebas

Ver [11-Plan-de-pruebas.md](11-Plan-de-pruebas.md).

## 12.7 Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| El asistente dice "falta la clave de OpenAI de tu empresa" | La gerencia debe pegarla en el chat (ícono de la llave). `OPENAI_API_KEY` solo sirve en desarrollo |
| El asistente responde "presupuesto agotado" | La gerencia puede subir el presupuesto mensual desde la configuración del chat |
| Las invitaciones responden 503 | Falta `SUPABASE_SERVICE_ROLE_KEY` en el servidor |
| La búsqueda de empresas devuelve datos de demostración | Falta `GOOGLE_PLACES_API_KEY` (es opcional) |
| `test:e2e` falla con el servidor apagado | Levantar antes `npm run dev` (puerto 5173) o indicar otro con `APP_URL` |
| Al abrir `/` en la imagen Docker se ve el login pero no hay cuentas | Sin Supabase solo existe la demo: usar el enlace "Prueba la demo" o abrir `/?demo` (las cuentas de prueba solo existen en desarrollo) |
