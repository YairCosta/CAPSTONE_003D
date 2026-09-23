# Revela

CRM SaaS multi-tenant con inteligencia geográfica: captura leads, los ubica en un mapa por zona (comuna, distrito…), mide qué se vende y dónde, y opera en varios países. Tesis de Duoc UC; se pilotea con una empresa real.

**Stack:** React 19 + TypeScript + Vite + Tailwind v4 + Leaflet. Datos en memoria (`src/data/mockGeoData.ts`): la app carga solo el CRM de Empresa Piloto; GeoDemo, Norte y Sur son CRMs de prueba que solo aparecen con `?pruebas` en desarrollo (los usa `npm run test:e2e`); Supabase con PostGIS preparado en `supabase/migrations/` pero **todavía no conectado**.

## Antes de cambiar la base de datos

**Leer `docs/BASE_DE_DATOS.md`.** Contiene el glosario, el orden de las tablas, las reglas que nunca se rompen, las convenciones de nombres y tipos, y el procedimiento para cambios (expandir → copiar → convivir → contraer).

Reglas cortas:
- Nunca editar una migración ya aplicada: siempre una nueva, con fecha y nombre descriptivo.
- Un cambio destructivo (renombrar, cambiar tipo, borrar) va en migraciones separadas, nunca de golpe.
- Toda tabla de datos: `company_id`, RLS, índice, `COMMENT ON` y trigger que valide que sus referencias son del mismo CRM.
- Si la app y la base se contradicen, gana lo documentado en `docs/BASE_DE_DATOS.md`.
- Después de tocar una migración: `npm run test:sql` (revisa sintaxis, RLS, `COMMENT ON` y `search_path`).

## Invariantes del producto

No se pueden debilitar sin decirlo explícitamente:

1. **Los CRMs nunca se mezclan.** Todo dato pertenece a un `companyId`; las escrituras pasan por `src/lib/tenantGuards.ts` y, en producción, por RLS y triggers.
2. **Países:** un lead o empresa cliente solo existe en un país habilitado del CRM; su zona y su empresa cliente son del mismo país.
3. **Dinero:** cada lead se negocia en una moneda (la de un país habilitado del CRM o US$) y su monto se **guarda en esa moneda, sin convertir nunca**. La moneda de la vista (hoy CLP o US$) convierte solo para mostrar y sumar, con tasas de `/api/rates` (Banco Central de Chile + open.er-api). Las pantallas muestran dinero con `useMoney()` (`src/lib/money.ts`), nunca convirtiendo por su cuenta. Ver `docs/MONEDAS.md`.
4. **Roles:** `agent` (captura y contacta; **solo avanza leads en el pipeline**), `manager` (todo lo del agente + KPI, gerencia, catálogo, etapas, auditoría, revertir cambios y **administrar los usuarios de su propio CRM**), `superadmin` (plataforma: CRMs, usuarios de cualquier CRM, exportación). Ver `src/lib/permissions.ts`.
5. **Auditoría:** todo cambio queda registrado (`src/lib/audit.ts`). El historial solo se agrega: nunca se edita ni se borra, y revertir genera una entrada nueva.
6. **Asistente de IA:** solo puede buscar, crear, actualizar y mover leads de etapa; **nunca borrar nada**, ni tocar usuarios, empresas, catálogo, etapas, auditoría ni exportación. Toda herramienta nueva que escriba en el CRM se documenta en `docs/SEGURIDAD.md` y pasa por los guards, nunca directo al estado.
7. **Secretos:** las claves (Gemini, Places, Supabase service_role) viven en `.env.local`, nunca en el bundle ni en el repositorio. Nunca escribir en el código una clave que el usuario pegue en el chat.
8. **Datos personales:** el CRM guarda nombres, emails y teléfonos (Ley 21.719 en Chile). Nada de exponerlos fuera de su CRM ni en registros de log.

## Dónde está cada cosa

| Carpeta | Contenido |
|---|---|
| `src/components/` | Módulos de la interfaz (KPI y mapa, Pipeline, Contacto, Gerencia, Auditoría, Admin; `StageAdminModule` existe pero su pestaña está oculta, ver `src/lib/permissions.ts`) |
| `src/lib/` | Lógica pura y reutilizable: guards, monedas, catálogo, métricas, exportación |
| `src/data/` | Registro de países (`countries.ts`) y datos de ejemplo (`mockGeoData.ts`) |
| `server/` | Proxy del asistente IA (Gemini) y API de tipos de cambio, dentro de Vite |
| `supabase/migrations/` | Esquema de la base de datos |
| `docs/` | Base de datos, multipaís, monedas, catálogo, contactos, agenda, exportación, auditoría, usuarios, asistente IA, seguridad, evidencia y diagramas |
| `scripts/` | Pruebas de aislamiento, exportación y punta a punta |

La lógica que se pueda probar sin navegador va en `src/lib/` como función pura, no dentro de un componente.

## Comandos

```bash
npm run dev          # servidor de desarrollo (incluye el proxy del asistente IA)
npm run test:tenant  # pruebas de aislamiento entre CRMs y reglas de negocio
npm run test:export  # pruebas de la exportación a Excel
npm run test:sql     # sintaxis y convenciones de las migraciones (parser de PostgreSQL)
npm run test:e2e     # punta a punta con Chrome (requiere npm run dev en marcha)
npx tsc -b && npm run lint && npm run build
npm run diagramas   # regenera los diagramas de componentes y estados (docs/diagramas/)
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
