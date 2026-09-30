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
| **Zona** | `territories` | Unidad territorial: comuna (Chile), distrito (Perú), provincia (Argentina). Se identifica por su código oficial (`CL-13123`, `PE-150122`), no por su nombre: Perú tiene 4 distritos Miraflores. |
| **Región** | `territories.region_code` | Agrupa las zonas: región (Chile), departamento (Perú). Con su provincia y su orden (`region_order`). |
| **Ítem** | `catalog_items` | Producto o servicio que vende el tenant. |
| **Usuario** | `profiles` | Persona que entra al sistema (`auth.users` guarda su contraseña). |

`company_id` **siempre** significa "a qué CRM pertenece esta fila", nunca "empresa cliente".

## 2. Orden de las tablas

De la raíz hacia las hojas. Este es el orden para crear, poblar (seed) e importar datos:

```
1. countries ── zone_catalog     (catálogos globales: 19 países de América Latina y sus 14.489 zonas con contorno)
2. companies                    (CRM / tenant)  ── company_countries, company_view_currencies
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
13. audit_log                   (historial de cambios del CRM, lo escribe la app)
14. change_log                  (registro de cambios que escribe la base, 0022)
15. login_events                (ingresos de las personas a su CRM, 0030)
    satisfaction_surveys        (encuesta de satisfacción, 0030)
    bug_reports                 (errores que reportan las personas, 0030)
16. company_ai_settings         (presupuesto mensual de IA de cada CRM, 0031)
    ai_usage_monthly            (gasto de IA por CRM y mes, solo números, 0031)
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
| `Company` | `companies` (+ `company_countries` y `company_view_currencies`) |
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
- **Zonas:** la demo conserva 10 zonas con polígonos esquemáticos (con códigos y regiones oficiales); la base tiene las oficiales: 345 comunas y 1.893 distritos (0020, ver `docs/MULTIPAIS.md`).

Las reglas de la app (`src/lib/tenantGuards.ts`) son una **segunda capa**: dan buena experiencia de usuario, pero la garantía real la da la base con RLS y triggers. Un cambio no puede quitar la regla de la base y dejar solo la de la app.

### Conexión de la app, por etapas

La app elige de dónde salen los datos con `VITE_DATA_SOURCE` en `.env.local` (`src/lib/dataSource.ts`):

- `demo` (por defecto): datos de ejemplo en memoria, como siempre.
- `supabase`: la base real. `?demo` en la URL abre la demo pública (también publicada, sin contraseña y sin base) y, en desarrollo, `?pruebas` carga los CRMs de prueba: así `npm run test:e2e` nunca toca la base.

| Etapa | Qué usa la base | Estado |
|---|---|---|
| 1. Sesión y plataforma | Login con Supabase Auth, perfil y CRM de la sesión, Admin → CRMs (crear, editar, activar, plan y países) y Admin → Usuarios (invitar, perfil, activar) | **Conectada** |
| 2. Gerencia → Usuarios y auditoría | Equipo del CRM administrado por el gerente; historial de CRMs y usuarios en `audit_log` | **Conectada** (0015) |
| 3. El trabajo diario del CRM | Leads (con sus contactos y productos), empresas cliente, bitácora de contactos, catálogo, zonas del mapa, derechos del titular y "Volver atrás" del historial | **Conectada** (0017, 0018) |
| 4. Etapas del pipeline | Configuración de etapas por CRM (`pipeline_stage_configs`): las guardadas reemplazan a las por defecto (`mergeStageConfigs`). La pestaña sigue oculta por decisión de producto; al mostrarla, lo que edite gerencia ya se guarda | **Conectada** |
| 5. Exportación | El administrador exporta un CRM con `export_tenant_snapshot()` (el mismo Excel de la demo) y cada exportación queda en `data_exports` | **Conectada** |

**Cómo se guarda el trabajo diario (etapa 3).** Al entrar, la app carga todo el CRM desde la base (`loadTenantData`, `src/lib/db/crm.ts`). Desde ahí cada módulo sigue trabajando como en la demo, con los mismos guards, y un solo efecto compara el estado con lo último guardado (`diffTenantData`, `src/lib/db/sync.ts`) y manda **solo la diferencia**, en orden: catálogo → empresas → leads → sus contactos y productos → bitácora → bajas. Los leads se actualizan columna por columna, así dos personas que editan campos distintos no se pisan. Si la base rechaza algo (RLS, un trigger de privacidad, un país no habilitado), la app muestra el motivo y vuelve a cargar lo que de verdad quedó. Los derechos del titular no pasan por la comparación: la solicitud se inserta en `lead_privacy_requests` y aprobarla la resuelve `resolve_lead_privacy_request()`, la única que anonimiza. Los ids nuevos son UUID (`newUuid`, `src/lib/ids.ts`).

Con la etapa 5, **toda la app usa la base** cuando `VITE_DATA_SOURCE=supabase`: la demo en memoria queda solo para la cuenta de demostración y las pruebas automáticas.

Límites de hoy: los cambios de otra persona se ven al recargar la página (no hay tiempo real) y la carga pide los datos en páginas de 1.000 filas. De las zonas se baja la lista completa (nombre, código, región: unos 650 KB) y el contorno solo de las que están en uso; el de una zona nueva llega cuando recibe su primer lead (`loadZonePolygons`).

La capa de datos vive en `src/lib/db/`: `mappers.ts` y `crmMappers.ts` (filas ↔ tipos de la app, funciones puras), `sync.ts` (qué cambió, función pura), `crm.ts` (carga y escritura del CRM), `errors.ts` (mensajes sin el texto crudo de la base), `auth.ts` (sesión y contraseñas), `platform.ts` (CRMs y usuarios) y `audit.ts` (historial). Qué entradas del historial van ya a la base lo dice `CONNECTED_AUDIT_ENTITIES` (`mappers.ts`): crece con cada etapa. Invitar usuarios pasa por el servidor (`server/adminUsers.ts`), porque crear una cuenta en Auth exige la clave secreta; ver `docs/USUARIOS.md`. Pruebas: `npm run test:supabase`.

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
| 0015 | Gerencia edita a su equipo (`Perfiles: gestión gerente` + `trg_profiles_guard_update`); el administrador registra sus acciones en el historial del CRM y la base firma cada entrada (`trg_audit_log_set_actor`) |
| 0016 | Permisos de tablas para `service_role` (el servidor que invita usuarios): faltaban desde la 0012 y toda invitación se rechazaba |
| 0017 | Etapa 3: `zone_catalog` (zonas de referencia por país) copiadas solas a cada CRM, vista `territories_geojson` para el mapa, `leads.location` desde latitud y longitud, espejo del contacto principal en `lead_contacts` y eliminación de empresas cliente sin leads por gerencia |
| 0018 | Corrige la 0017: los triggers que copian las zonas pasan a `SECURITY DEFINER` (crear un CRM fallaba) |
| 0019 | Minimización: los leads se ubican por zona, nunca por coordenada. Borra las coordenadas y la caché de geocodificación, agrega `leads_sin_coordenadas` y retira `rpc_update_lead_coordinates()` de la API. Paso "la base lo rechaza": las columnas `latitude`, `longitude` y `location` se eliminan en una migración posterior (contraer) |
| 0020 | Zonas oficiales: carga en `zone_catalog` las 345 comunas de Chile (BCN) y los 1.893 distritos de Perú (INEI) con su región, provincia y orden (columnas nuevas también en `territories` y en la vista `territories_geojson`). Convierte las 10 zonas de ejemplo de cada CRM en sus equivalentes oficiales **conservando los leads**, suelta la unicidad del nombre (la identidad es el código) y completa las zonas de todos los CRMs. 3,2 MB: se genera con `npm run zonas` |
| 0021 | Contraer la minimización de la 0019: elimina `leads.latitude`, `longitude`, `location` y `address_hash`, la tabla `geocoding_cache`, el trigger que calculaba `location` y `rpc_update_lead_coordinates()`. Reescribe sin ellas la anonimización y el trigger de privacidad; `get_lead_distribution_by_territories()` cuenta por zona asignada. Estaban vacías en todos los CRMs |
| 0022 | Revisión de seguridad (27-09-2026): las reglas del usuario base pasan a la base (solo avanza etapas; no cambia monto, moneda, zona, empresa cliente, país, origen ni autor; productos y personas solo de los leads que capturó), `created_by` lo firma la base, `recalculate_lead_value()` sale de la API, `lead_is_blocked()` solo responde por el propio CRM, gerencia ya no edita las zonas oficiales y nace `change_log` (quién cambió qué columnas, sin valores). Ver `docs/SEGURIDAD.md` §5 |
| 0023 | América Latina: los 17 países que faltaban en `countries` (con su moneda). La gerencia activa y desactiva países de su CRM con el plan Internacional (políticas de `company_countries`: su CRM, su perfil, su plan y nunca el país base). **Catálogo común de contornos**: `territories.polygon` deja de ser obligatoria, al activar un país se copian sus zonas **sin contorno** y la vista `territories_geojson`, `get_lead_distribution_by_territories()` y la exportación leen el contorno de `zone_catalog`. Ver `docs/MULTIPAIS.md` |
| 0024 | Contraer la copia de contornos: vacía `territories.polygon` de las zonas que están en el catálogo (la base bajó de 64 a 48 MB). La columna se elimina en una migración posterior |
| 0025 | Zonas de Sudamérica desde geoBoundaries: Argentina, Bolivia, Colombia, Ecuador, Paraguay, Uruguay y Venezuela (2.687 zonas, 4,9 MB) |
| 0026 | Zonas de Brasil: 5.570 municipios |
| 0027 | Zonas de México, Centroamérica y el Caribe: México, Guatemala, El Salvador, Honduras, Nicaragua, Costa Rica, Panamá, Cuba y República Dominicana (4.004 zonas) |
| 0028 | Nombres de zona corregidos: tildes (Costa Rica, Ecuador, Honduras, distritos de Perú), El Salvador y Paraguay desde la edición humanitaria (sin zonas "Null" ni nombres cortados), lagos fuera y traducciones de la fuente. Actualiza también el nombre en las copias de cada CRM; se detiene si un CRM usa una zona que sale del catálogo |
| 0029 | Divisas para ver el CRM: `company_view_currencies` guarda las monedas que la gerencia suma al selector del encabezado (la del país base y el dólar están siempre). RLS como `company_countries` (la gerencia agrega y quita solo en su CRM, el administrador en cualquiera), trigger que rechaza la moneda de un país que no está activo y registro en `change_log`. Solo cambia cómo se ven los montos. Ver `docs/MONEDAS.md` |
| 0030 | Uso y soporte: `login_events` (ingresos; solo el administrador los lee, los escribe `record_login()` y se borran a los 13 meses), `satisfaction_surveys` (encuesta de 0 a 10; cada persona ve las suyas, una por día) y `bug_reports` (cada persona ve los suyos; el administrador los marca; hasta 10 por hora). `admin_usage_by_company()` y `admin_user_activity()`: conteos solo para el administrador, que no puede leer los leads. Ver `docs/USO_Y_SOPORTE.md` |
| 0031 | Presupuesto mensual del asistente de IA: `company_ai_settings` (presupuesto en dólares por CRM, 30 por defecto, de 0 a 1.000) y `ai_usage_monthly` (llamadas, tokens y dólares por CRM y mes; solo números). Las dos las lee la gente del CRM (y el administrador) y **solo las escribe el servidor** con la clave secreta: `record_ai_usage()` suma cada llamada de forma atómica y `set_company_ai_budget()` cambia el tope a nombre de un gerente activo del CRM y lo deja en `change_log` (el trigger `log_row_change` no sirve con la clave secreta, que no tiene sesión de persona). Ver `docs/ASISTENTE_IA.md` |

## 8. Revisión automática

```bash
npm run test:sql
```

Analiza las migraciones con el parser oficial de PostgreSQL (`libpg-query`) y verifica: sintaxis SQL y PL/pgSQL, numeración sin repetidos, que ninguna tabla se cree dos veces, que los cambios destructivos vengan advertidos, que toda tabla con `company_id` tenga RLS, que todas las tablas tengan `COMMENT ON` y que las funciones `SECURITY DEFINER` fijen `search_path`.

No reemplaza aplicarlas en una base real: no valida que una columna exista o que un tipo calce.

**Contra la base real** (requiere `npx supabase login` y `npx supabase link` del dueño del proyecto):

```bash
npx supabase db lint --linked --level error --schema public   # funciones con columnas o tipos inexistentes (sin --schema también revisa las internas de PostGIS, que traen avisos propios)
npx supabase db advisors --linked             # revisión de seguridad y rendimiento de Supabase
npm run test:db                               # 223 pruebas funcionales: privacidad, aislamiento, administración, equipos, trabajo diario, zonas oficiales, etapas, exportación, ataques desde dentro, países y divisas elegidos por la gerencia, uso y soporte, y presupuesto de IA
npm run test:db -- --con supabase/migrations/<nueva>.sql   # ensaya una migración con todas las pruebas SIN aplicarla
```

El ensayo corre la migración y cada prueba en la misma transacción, que el error forzado deshace entera:
así se aplica a la base real solo lo que ya pasó todas las pruebas.

`npm run test:db` crea datos ficticios, actúa como usuarios con sesión y sin sesión, y termina con un
error forzado que deshace todo: la base queda exactamente como estaba.

**Aplicadas el 25-09-2026** (0001 a 0014) en el proyecto de Supabase; **0015 a 0019 el 26-09-2026**; **0020 a 0029 el 27-09-2026**; **0030 el 29-09-2026**; **0031 el 30-09-2026**. Regla nueva: toda tabla lleva permisos explícitos para `authenticated` **y** `service_role` (la 0016 deja los futuros por defecto). Desde ahora **ninguna migración
aplicada se edita**: cada cambio va en una nueva. El lint contra la base encontró un error que la revisión
local no podía ver (la exportación, corregida en 0013).

Avisos de seguridad aceptados: 15 funciones `SECURITY DEFINER` ejecutables por `authenticated`. Son la
API de la app o las usan las políticas RLS, y cada una valida dentro quién la llama (por ejemplo,
exportar exige superadmin y resolver una solicitud exige gerencia). Los avisos de rendimiento
(`auth_rls_initplan`, políticas permisivas múltiples) quedan para cuando el volumen lo justifique.
