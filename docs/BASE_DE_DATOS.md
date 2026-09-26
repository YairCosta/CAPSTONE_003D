# Base de datos de Revela

Este documento es la **fuente de verdad** del modelo de datos: qué significa cada tabla, qué reglas nunca se rompen y cómo hacer cambios sin dañar datos. Antes de modificar la base (persona o IA), leer esto.

Motor: **PostgreSQL 17.6 + PostGIS 3.3 + pg_cron** (Supabase, proyecto `gacvtkzmqnrvzmidjdst`, región São Paulo `sa-east-1`). Migraciones en `supabase/migrations/`.

## 1. Glosario

Los nombres pueden confundir, así que se fijan aquí:

| Término | En la base | Qué es |
|---|---|---|
| **CRM / tenant** | `companies` | La empresa que **contrata** el SaaS. Es la frontera de aislamiento. |
| **Empresa cliente** | `client_accounts` | Una empresa **a la que le vende** el tenant. Agrupa leads. |
| **Lead** | `leads` | Persona de contacto y oportunidad comercial. |
| **Zona** | `territories` | Unidad territorial: comuna (Chile), distrito (Perú), provincia (Argentina). |
| **Ítem** | `catalog_items` | Producto o servicio que vende el tenant. |
| **Usuario** | `profiles` | Persona que entra al sistema (`auth.users` guarda su contraseña). |

`company_id` **siempre** significa "a qué CRM pertenece esta fila", nunca "empresa cliente".

## 2. Orden de las tablas

De la raíz hacia las hojas. Este es el orden para crear, poblar (seed) e importar datos:

```
1. countries                    (catálogo global: CL, PE…)
2. companies                    (CRM / tenant)  ── company_countries
3. profiles                     (usuarios del CRM)
4. territories                  (zonas del CRM, por país)
5. pipeline_stage_configs       (etapas del embudo del CRM)
6. client_accounts              (empresas cliente)
7. catalog_items ── catalog_item_prices
8. leads                        (→ client_accounts, territories, profiles)
9. lead_contacts                (→ leads; personas del lead, una principal)
10. lead_items                  (→ leads, catalog_items)
11. lead_activities             (→ leads)
    lead_privacy_requests       (→ leads; solicitudes del titular)
12. data_exports                (auditoría de exportaciones)
13. audit_log                   (historial de cambios del CRM)
    geocoding_cache             (global, sin tenant)
```

Relaciones principales:

```
countries ──< company_countries >── companies ──< profiles
                                        │
         ┌──────────────┬───────────────┼────────────────┬─────────────────┐
   client_accounts   territories   catalog_items   pipeline_stage_configs  data_exports
         │               │              │
         └──────────► leads ◄───────────┘ (vía lead_items)
                        │
                 lead_activities
```

## 3. Reglas que nunca se rompen (invariantes)

Estas reglas están **en la base de datos**, no solo en la aplicación. Si un cambio futuro las debilita, el cambio está mal.

1. **Aislamiento entre CRMs.** Toda fila de datos tiene `company_id`. RLS filtra por el CRM del usuario. Ninguna fila puede referenciar filas de otro CRM (triggers de la migración 0003).
2. **Países.** Un lead, empresa cliente o zona solo existe en un país habilitado para su CRM. La zona y la empresa cliente de un lead son del mismo país que el lead (migración 0004).
3. **Catálogo.** Un `lead_item` apunta a un ítem del mismo CRM que el lead (migración 0005).
4. **Dinero.** Los montos se guardan en su moneda (`currency_code`) y **nunca convertidos**. La conversión a US$ es solo para mostrar, con tasa referencial.
5. **Historial.** `lead_activities` y `audit_log` no se editan ni se borran (los usuarios no tienen `UPDATE` ni `DELETE`); guardan el nombre de quien actuó aunque su usuario se elimine. **Única excepción:** `anonymize_lead_internal()` borra lo conversado en la bitácora de un titular anonimizado (Ley 21.719, art. 7). `audit_log` **nunca guarda valores personales**: un trigger los quita de `changes` y `revert_snapshot` aunque la app los envíe.
6. **Contraseñas.** Solo en `auth.users`. Nunca en tablas propias ni en exportaciones.
7. **Desactivar en vez de borrar.** Empresas cliente, ítems del catálogo, usuarios y CRMs usan `is_active`. Si tiene historial, se desactiva.
8. **Un solo nombre por persona.** `full_name`, no `first_name` + `last_name`: los apellidos compuestos y los nombres de otros países no se dividen bien.
9. **Derechos del titular (0012).** Con una solicitud pendiente, el lead no se edita ni admite contactos; un titular anonimizado no se re-identifica; los prospectos sin contactar en 30 días se anonimizan solos (pg_cron, 03:15 UTC). Solo `resolve_lead_privacy_request()` resuelve, y solo gerencia.
10. **Permisos explícitos (0012, 0014).** Sin sesión (`anon`) no se lee ninguna tabla ni se ejecuta ninguna función. Con sesión (`authenticated`) se accede siempre a través de RLS. Las funciones de trigger y las internas no se exponen como RPC.

## 4. Convenciones

**Nombres**
- Tablas en `snake_case` y **plural**: `client_accounts`, `lead_items`.
- Columnas en `snake_case` y singular. Claves foráneas: `<tabla_singular>_id` (`company_id`, `lead_id`).
- Booleanos: `is_*` (`is_active`). Fechas: `*_at` (`created_at`, `last_contacted_at`).
- Índices: `idx_<tabla>_<columnas>`. Únicos: `uq_<tabla>_<columnas>`. Restricciones: `<tabla>_<regla>`.

**Tipos**
- Identificadores: `UUID` con `gen_random_uuid()`.
- Fechas: siempre `TIMESTAMPTZ` en UTC. Nunca `TIMESTAMP` sin zona.
- Dinero: `NUMERIC(12,2)` (nunca `FLOAT`) + `currency_code CHAR(3)`.
- Códigos de país: `CHAR(2)` ISO 3166-1. Monedas: `CHAR(3)` ISO 4217.
- Listas cerradas (etapas, canales, roles): `VARCHAR` con `CHECK`, no `ENUM` (agregar un valor a un ENUM es más engorroso).
- `JSONB` solo para datos sin estructura fija (`metadata`). **Nunca** para algo que se filtre o se muestre en la app.

**Obligatorio en cada tabla nueva**
1. `id`, `company_id` (si son datos de un CRM), `created_at`, `updated_at`.
2. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + políticas de lectura y escritura.
3. Índice por `company_id` (o compuesto con lo que se filtre).
4. `COMMENT ON TABLE` explicando qué es.
5. Trigger que valide que sus referencias son del mismo CRM.
6. **`GRANT` explícito a `authenticated`** con solo las operaciones que correspondan: el proyecto no expone tablas automáticamente y las funciones nuevas nacen sin permisos (0014).
7. Si guarda datos personales: agregarla a `anonymize_lead_internal()` y a `export_tenant_snapshot()`.

## 5. Cómo hacer cambios

**Nunca** editar una migración ya aplicada: siempre una nueva, con fecha y nombre descriptivo.

Clasificar el cambio antes de escribirlo:

| Cambio | Cómo |
|---|---|
| Tabla nueva, columna opcional, índice | Directo, en una migración |
| Columna obligatoria nueva | Con `DEFAULT`, o rellenar y después `SET NOT NULL` |
| Restricción nueva sobre datos existentes | `ADD CONSTRAINT ... NOT VALID` y luego `VALIDATE CONSTRAINT` |
| Índice en tabla grande (producción) | `CREATE INDEX CONCURRENTLY`, fuera de transacción |
| **Renombrar, cambiar tipo o borrar** | Expandir → copiar → convivir → contraer, en migraciones separadas y con semanas de diferencia |

**Expandir y contraer**, en concreto:
1. Migración A: crear lo nuevo (la app vieja lo ignora).
2. Migración B: copiar los datos.
3. Publicar la app que escribe en lo viejo y lo nuevo, y lee de lo nuevo.
4. Migración C, más adelante: borrar lo viejo.

**Antes de aplicar en producción:** respaldo (`npx supabase db dump`), probar sobre una copia de los datos reales, aplicar en horario de bajo uso y tener escrito cómo volver atrás.

## 6. La base y la aplicación

La app usa `camelCase` y la base `snake_case`. La conversión va en un solo lugar (la capa de datos), no repartida por los componentes.

| App (`src/types/crm.ts`) | Base de datos |
|---|---|
| `Company` | `companies` (+ `company_countries`) |
| `AppUser` | `profiles` (+ `auth.users`) |
| `ClientAccount` | `client_accounts` |
| `Lead` | `leads` |
| `Lead.contacts` | `lead_contacts` (los adicionales; el principal es `is_primary`) |
| `Lead.items` | `lead_items` |
| `LeadActivity` | `lead_activities` |
| `CatalogItem` | `catalog_items` + `catalog_item_prices` |
| `TerritoryMetric` | `territories` (+ métricas calculadas) |
| `StageConfig` | `pipeline_stage_configs` |

Diferencias a resolver al conectar la base:
- **Moneda del lead:** la app la guarda en `Lead.currency` (vacía = la del país) y la base en `currency_code`. Al conectar, se lee y escribe directo; ver `docs/MONEDAS.md`.
- **Contraseñas:** `mockUsers` las tiene en texto plano (solo demo). Con Supabase, las gestiona Auth.
- **Zonas:** los polígonos de ejemplo están dibujados a mano; en producción se cargan los oficiales.

Las reglas de la app (`src/lib/tenantGuards.ts`) son una **segunda capa**: dan buena experiencia de usuario, pero la garantía real la da la base con RLS y triggers. Un cambio no puede quitar la regla de la base y dejar solo la de la app.

### Conexión de la app, por etapas

La app elige de dónde salen los datos con `VITE_DATA_SOURCE` en `.env.local` (`src/lib/dataSource.ts`):

- `demo` (por defecto): datos de ejemplo en memoria, como siempre.
- `supabase`: la base real. En desarrollo, `?demo` o `?pruebas` en la URL fuerzan la demo, así `npm run test:e2e` nunca toca la base.

| Etapa | Qué usa la base | Estado |
|---|---|---|
| 1. Sesión y plataforma | Login con Supabase Auth, perfil y CRM de la sesión, Admin → CRMs (crear, editar, activar, plan y países) y Admin → Usuarios (invitar, perfil, activar) | **Conectada** |
| 2. Gerencia → Usuarios | Equipo del CRM administrado por el gerente | Pendiente: requiere una política nueva, hoy solo el administrador escribe `profiles` |
| 3. Leads, empresas cliente, contactos y actividades | Pipeline, captura, registro de contacto, derechos del titular | Pendiente |
| 4. Catálogo, etapas y auditoría | Gerencia → Catálogo, historial y reversión | Pendiente |
| 5. Exportación | `export_tenant_snapshot()` | Pendiente (el botón queda desactivado con Supabase) |

Mientras una etapa no esté conectada, el usuario de un CRM ve un aviso: lo que cambie en esos módulos no se guarda al recargar.

La capa de datos vive en `src/lib/db/`: `mappers.ts` (filas ↔ tipos de la app, funciones puras), `errors.ts` (mensajes sin el texto crudo de la base), `auth.ts` (sesión y contraseñas) y `platform.ts` (CRMs y usuarios). Invitar usuarios pasa por el servidor (`server/adminUsers.ts`), porque crear una cuenta en Auth exige la clave secreta; ver `docs/USUARIOS.md`. Pruebas: `npm run test:supabase`.

## 7. Estado actual

| Migración | Contenido |
|---|---|
| 0001 | Esquema inicial: empresas, perfiles, zonas, leads, actividades, PostGIS y RLS |
| 0002 | Roles, activar/desactivar, empresas cliente |
| 0003 | Endurecimiento del aislamiento, etapas por CRM |
| 0004 | Plan Internacional: países, planes, monedas |
| 0005 | Catálogo de productos y servicios, ítems por lead |
| 0006 | Auditoría de exportaciones y `export_tenant_snapshot()` |
| 0007 | Calidad: `full_name`, `agent_name`, `currency_code`, `updated_at` automático, restricciones, índices y `COMMENT ON` |
| 0008 | Auditoría: historial de cambios por CRM (solo agregar) |
| 0009 | `leads.job_title`: cargo del contacto (opcional, nunca en blanco) |
| 0010 | `lead_contacts`: varias personas por lead (expandir + copiar; contraer queda para después) y `lead_activities.contact_name` |
| 0011 | Moneda elegida por lead: `lead_allowed_currencies()` y el trigger valida que sea de un país del CRM o USD |
| 0012 | Derechos del titular: origen y base del dato, `lead_privacy_requests`, bloqueo, anonimización, borrado automático de prospectos (pg_cron), auditoría sin valores personales y permisos explícitos |
| 0013 | Corrige `export_tenant_snapshot()`: usaba `first_name`/`last_name` (borradas en 0007); agrega `lead_contacts` y `lead_privacy_requests` al formato v2 |
| 0014 | Permisos de funciones: nada para `anon`, funciones de trigger e internas fuera de la API, `search_path` fijo en `set_updated_at()` |

## 8. Revisión automática

```bash
npm run test:sql
```

Analiza las migraciones con el parser oficial de PostgreSQL (`libpg-query`) y verifica: sintaxis SQL y PL/pgSQL, numeración sin repetidos, que ninguna tabla se cree dos veces, que los cambios destructivos vengan advertidos, que toda tabla con `company_id` tenga RLS, que todas las tablas tengan `COMMENT ON` y que las funciones `SECURITY DEFINER` fijen `search_path`.

No reemplaza aplicarlas en una base real: no valida que una columna exista o que un tipo calce.

**Contra la base real** (requiere `npx supabase login` y `npx supabase link` del dueño del proyecto):

```bash
npx supabase db lint --linked --level error   # funciones con columnas o tipos inexistentes
npx supabase db advisors --linked             # revisión de seguridad y rendimiento de Supabase
npm run test:db                               # 42 pruebas funcionales: privacidad, aislamiento y administración
```

`npm run test:db` crea datos ficticios, actúa como usuarios con sesión y sin sesión, y termina con un
error forzado que deshace todo: la base queda exactamente como estaba.

**Aplicadas el 25-09-2026** (0001 a 0014) en el proyecto de Supabase. Desde ahora **ninguna migración
aplicada se edita**: cada cambio va en una nueva. El lint contra la base encontró un error que la revisión
local no podía ver (la exportación, corregida en 0013).

Avisos de seguridad aceptados: 15 funciones `SECURITY DEFINER` ejecutables por `authenticated`. Son la
API de la app o las usan las políticas RLS, y cada una valida dentro quién la llama (por ejemplo,
exportar exige superadmin y resolver una solicitud exige gerencia). Los avisos de rendimiento
(`auth_rls_initplan`, políticas permisivas múltiples) quedan para cuando el volumen lo justifique.
