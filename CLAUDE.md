# Revela

CRM SaaS multi-tenant con inteligencia geográfica: captura leads, los ubica en un mapa por zona (comuna, distrito…), mide qué se vende y dónde, y opera en varios países. Tesis de Duoc UC; se pilotea con una empresa real.

**Stack:** React 19 + TypeScript + Vite + Tailwind v4 + Leaflet. Datos en memoria (`src/data/mockGeoData.ts`): la app carga solo la **cuenta demo** (`TENANT_DEMO_ID`, "Revela Demo"); GeoDemo, Norte y Sur son CRMs de prueba (`src/data/testTenants.ts`) que solo aparecen con `?pruebas` en desarrollo (los usa `npm run test:e2e`) y no quedan en la app compilada (`npm run test:bundle`), y el administrador de plataforma solo existe en desarrollo (`demoDataFor`); Supabase con PostGIS: **las migraciones 0001–0029 ya están aplicadas** en el proyecto `gacvtkzmqnrvzmidjdst` (São Paulo), y la app se conecta **por etapas** con `VITE_DATA_SOURCE=supabase` en `.env.local` (las 5 etapas conectadas: login con Supabase Auth, administración de CRMs y usuarios, equipos, todo el trabajo diario del CRM —leads, empresas, contactos, catálogo, zonas, derechos del titular y auditoría—, etapas del pipeline y exportación). Por defecto usa la demo. **`?demo` (o `/demo`) abre la demo pública**, también en la app publicada: entra sin contraseña como gerente (o usuario base), con datos ficticios que solo viven en esa pestaña, sin asistente de IA; es el botón "Probar la demo" de la landing. Las contraseñas de la demo solo existen en desarrollo (`testTenants.ts`). Ver `docs/BASE_DE_DATOS.md` §6.

## Antes de cambiar la base de datos

**Leer `docs/BASE_DE_DATOS.md`.** Contiene el glosario, el orden de las tablas, las reglas que nunca se rompen, las convenciones de nombres y tipos, y el procedimiento para cambios (expandir → copiar → convivir → contraer).

Reglas cortas:
- Nunca editar una migración ya aplicada: siempre una nueva, con fecha y nombre descriptivo.
- Un cambio destructivo (renombrar, cambiar tipo, borrar) va en migraciones separadas, nunca de golpe.
- Toda tabla de datos: `company_id`, RLS, índice, `COMMENT ON` y trigger que valide que sus referencias son del mismo CRM.
- Si la app y la base se contradicen, gana lo documentado en `docs/BASE_DE_DATOS.md`.
- Después de tocar una migración: `npm run test:sql` (revisa sintaxis, RLS, `COMMENT ON` y `search_path`).
- Las migraciones aplicadas **nunca se editan**. Para aplicar: `npx supabase db push`, y después `npx supabase db lint --linked --level error` y `npm run test:db`.

## Invariantes del producto

No se pueden debilitar sin decirlo explícitamente:

1. **Los CRMs nunca se mezclan.** Todo dato pertenece a un `companyId`; las escrituras pasan por `src/lib/tenantGuards.ts` y, en producción, por RLS y triggers.
2. **Países:** un lead o empresa cliente solo existe en un país habilitado del CRM; su zona y su empresa cliente son del mismo país. Revela cubre los 19 países de América Latina: el administrador define el plan y, con el plan Internacional, **la gerencia elige los países de su CRM** (nunca el país base; desactivar oculta, no borra). Cada país nombra su zona a su manera (comuna, distrito, municipio, cantón…): los textos salen de `src/data/countries.ts`, nunca escritos a mano. Ver `docs/MULTIPAIS.md`.
3. **Dinero:** cada lead se negocia en una moneda (la de un país habilitado del CRM o US$) y su monto se **guarda en esa moneda, sin convertir nunca**. La moneda de la vista (la del país base y US$ siempre, más las que sume la gerencia de sus países activos) convierte solo para mostrar y sumar, con tasas de `/api/rates` (Banco Central de Chile + open.er-api). Las pantallas muestran dinero con `useMoney()` (`src/lib/money.ts`), nunca convirtiendo por su cuenta. Ver `docs/MONEDAS.md`.
4. **Roles:** `agent` (captura y contacta; **solo avanza leads en el pipeline**; la base lo exige desde la 0022), `manager` (todo lo del agente + KPI, gerencia, catálogo, etapas, auditoría, revertir cambios, **administrar los usuarios de su propio CRM**, y elegir sus países con el plan Internacional y las divisas para verlo), `superadmin` (plataforma: CRMs, usuarios de cualquier CRM, exportación). Ver `src/lib/permissions.ts`.
5. **Auditoría:** todo cambio queda registrado (`src/lib/audit.ts`), y la base anota además quién cambió qué columnas en `change_log` (0022), aunque no pase por la app. El historial solo se agrega: nunca se edita ni se borra, y revertir genera una entrada nueva. **Nunca guarda valores personales** (campos `personal: true`): registra que cambiaron, no qué eran. Revertir restaura el negocio y deja los datos personales y las decisiones del titular como están hoy (`src/lib/privacy.ts`).
6. **Asistente de IA:** solo puede buscar, crear, actualizar y mover leads de etapa; **nunca borrar nada**, ni tocar usuarios, empresas, catálogo, etapas, auditoría ni exportación. Toda herramienta nueva que escriba en el CRM se documenta en `docs/SEGURIDAD.md` y pasa por los guards, nunca directo al estado.
7. **Secretos:** las claves (Gemini, OpenAI, Places, Supabase service_role) viven en `.env.local` (y en las variables de Vercel), nunca en el bundle ni en el repositorio. Publicada, las claves del servidor del asistente solo se usan con una sesión de CRM (`server/session.ts`). Nunca escribir en el código una clave que el usuario pegue en el chat.
8. **Datos personales:** el CRM guarda nombres, emails y teléfonos (Ley 21.719 en Chile, vigente el 01-12-2026). Nada de exponerlos fuera de su CRM ni en registros de log. Un lead se ubica por **zona** (comuna, distrito…), **nunca por coordenada**: el mapa muestra zonas con su cantidad de leads, y la base no tiene columnas para guardarlas (0019 y 0021). Ver `docs/LEY_21719.md`.
9. **Derechos del titular:** un lead con solicitud pendiente queda bloqueado **en los guards**, no solo en pantalla (no se edita, no se mueve de etapa, no se registra contacto); "no contactar", revocación y anonimización se respetan en agenda, registro de contacto y asistente (`src/lib/privacy.ts`). Anonimizar borra datos personales y conserva la operación; **nunca se re-identifica** desde la edición. La solicitud la registra cualquier perfil desde Registro de contacto; **solo el gerente la resuelve**. La captura exige origen y base del dato (sin opción por defecto); un **prospecto** se informa en el primer contacto y, si nadie lo contacta en `PROSPECT_RETENTION_DAYS` (30), se anonimiza solo. El asistente de IA registra **solo datos de la empresa**, nunca nombres ni correos de personas. El expediente de cumplimiento se muestra en el panel de administración como portal fiscalizador de solo lectura (`npm run expediente` lo regenera). Ver `docs/LEY_21719.md` y el expediente `docs/cumplimiento/`.
10. **Contraseñas:** solo su dueño la cambia (`src/lib/passwords.ts`); nunca aparecen en la auditoría, la exportación ni la interfaz, y en producción las guarda Supabase Auth con hash. Los pagos y el alta de clientes siguen `docs/PAGOS.md`: ni contraseñas ni datos de tarjeta pasan por Revela.

## Dónde está cada cosa

| Carpeta | Contenido |
|---|---|
| `src/components/` | Módulos de la interfaz (KPI y mapa, Pipeline, Contacto, Gerencia, Auditoría, Admin; `StageAdminModule` existe pero su pestaña está oculta, ver `src/lib/permissions.ts`) |
| `src/lib/` | Lógica pura y reutilizable: guards, monedas, catálogo, métricas, exportación. La capa de datos de Supabase va en `src/lib/db/` |
| `src/data/` | Registro de países (`countries.ts`), cuenta demo (`mockGeoData.ts`) y CRMs de prueba, solo en desarrollo (`testTenants.ts`) |
| `server/` | Proxy del asistente IA (Gemini u OpenAI según `AI_PROVIDER`), API de tipos de cambio e invitaciones de usuarios (`/api/admin`, única pieza que usa la clave secreta de Supabase). En desarrollo corre dentro de Vite; publicada, en una función de Vercel (`server/vercel.ts`). Las dos se arman igual desde `server/api.ts`. Ver `docs/DESPLIEGUE.md` |
| `supabase/migrations/` | Esquema de la base de datos |
| `docs/` | Procesos BPMN (`PROCESOS.md`, `bpmn/`), base de datos, multipaís, monedas, catálogo, contactos, agenda, exportación, auditoría, usuarios, asistente IA, seguridad, Ley 21.719, pagos, evidencia, diagramas y el expediente de cumplimiento (`docs/cumplimiento/`) |
| `scripts/` | Pruebas de aislamiento, exportación y punta a punta |

La lógica que se pueda probar sin navegador va en `src/lib/` como función pura, no dentro de un componente.

Los módulos que no se ven en la primera pantalla (mapa, pestañas, captura, asistente, administración) se cargan al abrirlos: se importan desde `src/lib/modulos.ts` y se muestran dentro de `<Seccion>`, nunca con un import directo en `App.tsx` (eso los volvería a meter en la carga inicial). Ver `docs/DESPLIEGUE.md`, "Carga por partes".

## Comandos

```bash
npm run dev          # servidor de desarrollo (incluye el proxy del asistente IA)
npm run test:tenant  # pruebas de aislamiento entre CRMs y reglas de negocio
npm run test:export  # pruebas de la exportación a Excel
npm run test:ai      # asistente IA con OpenAI simulado (sin clave real)
npm run test:sql     # sintaxis y convenciones de las migraciones (parser de PostgreSQL)
npm run test:db      # pruebas funcionales contra la base de Supabase enlazada, incluidos ataques desde dentro (lo deshace todo)
npm run test:db -- --con supabase/migrations/<nueva>.sql  # ensaya una migración con todas las pruebas sin aplicarla
npm run test:supabase # capa de datos e invitaciones con Supabase simulado (sin conexión)
npm run test:e2e     # punta a punta con Chrome (requiere npm run dev en marcha)
npm run test:bundle  # la app compilada no trae CRMs de prueba, cuentas de desarrollo ni claves de .env.local
npm run test:vercel  # arma .vercel/output y prueba la app y la API tal como quedarían en Vercel (antes de cada push)
npx tsc -b && npm run lint && npm run build
npm run diagramas   # regenera los diagramas de componentes y estados (docs/diagramas/)
npm run expediente  # regenera el expediente de cumplimiento que muestra el portal fiscalizador
npm run zonas       # procesa las zonas oficiales de los 19 países para una migración (fuentes: node scripts/descargar-zonas-geoboundaries.mjs; docs/MULTIPAIS.md)
npm run bpmn        # regenera los diagramas de procesos BPMN 2.0 (docs/bpmn/, ver docs/PROCESOS.md)
npm run evidencia   # capturas de código, salida de las pruebas y de la app (docs/evidencia/)
```

## Al terminar un cambio

1. `npx tsc -b`, `npm run lint` y las pruebas que correspondan; si tocaste reglas de negocio, agrega pruebas.
2. Verifícalo en el navegador cuando sea visible.
3. Actualiza el documento de `docs/` correspondiente si cambiaste comportamiento.

## Estilo

- **La interfaz y los comentarios van en español**, incluidos los mensajes de error y las etiquetas.
- Comentarios solo donde el *porqué* no se deduce del código; nada de comentarios obvios.
- Formularios con `label` asociado, `aria-label` en botones de solo icono y errores explícitos.
- Windows no dibuja los emojis de bandera: usar el componente `CountryFlag` (SVG), nunca 🇨🇱.
- Fechas y montos con `Intl`/los helpers de `src/lib/`, nunca formateados a mano.
