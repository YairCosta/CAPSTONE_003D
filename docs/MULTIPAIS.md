# Plan Internacional (multipaís)

Un CRM puede trabajar en **un país** (plan Nacional) o en **varios** (plan Internacional). El administrador de la plataforma lo activa desde **Administración → CRMs por empresa → Plan Internacional**.

## Cómo funciona

| Concepto | Detalle |
|---|---|
| País base | Todo CRM tiene uno (`homeCountry`). En plan Nacional es el único visible. |
| Países habilitados | En plan Internacional: país base + países activados. Al desactivar el plan, los datos de otros países **no se borran**: se ocultan y vuelven si se reactiva. |
| Zona por país | Chile → **Comuna** · Perú → **Distrito** · Argentina (futuro) → **Provincia**. Los textos de la app se adaptan solos. |
| Moneda | Cada país habilitado suma su moneda a las que se pueden usar en los leads (más US$, siempre). Todo el CRM se ve en una sola moneda (CLP o US$) con tasas del día. Ver `docs/MONEDAS.md`. |
| Porcentajes por zona | Se calculan **dentro de cada país** (el % de Miraflores es sobre los leads de Perú). |
| Filtro de países | Barra "Plan Internacional" bajo el menú: filtra KPI, mapa, pipeline, registro de contacto, gerencia y estados. Solo aparece si el CRM tiene más de un país. |
| Mapa | Botones **Todos / Chile / Perú** para encuadrar cada país; en barras, las zonas se agrupan por país. De lejos, una burbuja por región; al acercarse (zoom 9 o más), una por zona con leads. |
| Elegir la zona | Primero la región (o departamento) y después la zona, agrupada por provincia. Sin elegir región, la lista trae todas las zonas agrupadas por región. |

### División territorial usada

- **Chile**: Región → Provincia → **Comuna** (unidad municipal; ej. Providencia).
- **Perú**: Departamento → Provincia → **Distrito** (unidad municipal; ej. Miraflores, San Isidro en Lima).
- **Argentina**: **Provincia** → Departamento / Partido (en CABA existen 15 comunas). Para un CRM nacional argentino conviene trabajar por provincia.

## Zonas oficiales

Cada CRM recibe **todas** las zonas oficiales de sus países habilitados (migración 0020): 345 comunas de Chile en 16 regiones y 1.893 distritos de Perú en 25 departamentos. Cada zona trae su región, su provincia y el orden de su región (Chile de norte a sur, Perú alfabético).

| País | Fuente | Código de la zona | Código de la región |
|---|---|---|---|
| Chile | Biblioteca del Congreso Nacional, *División comunal* ([mapas vectoriales](https://www.bcn.cl/siit/mapas_vectoriales/index_html), `comunas_final.zip`) | `CL-` + código comunal (CUT), ej. `CL-13123` Providencia | `CL-13` |
| Perú | Límites distritales del INEI, en [Rodasluis/Peru-maps](https://github.com/Rodasluis/Peru-maps) (`salida/distrito_simplificado.geojson`) | `PE-` + ubigeo, ej. `PE-150122` Miraflores | `PE-15` |

- **La identidad de una zona es su código, no su nombre**: Perú tiene 4 distritos Miraflores y 10 Santa Rosa. Por eso la base ya no exige nombres únicos y los selectores agrupan por provincia.
- **Cómo se llega a la base:** `zone_catalog` (catálogo de referencia) → un trigger copia a `territories` las zonas de cada país que se habilita en un CRM → la vista `territories_geojson` las entrega al mapa. La app las carga por páginas de 1.000.
- **Simplificación:** `npm run zonas` las pasa a WGS84 y las simplifica con mapshaper según su tamaño: las comunas urbanas chicas conservan su forma y las zonas rurales grandes se recortan más. Quedan unos 3,4 MB de GeoJSON por CRM con ambos países (comprimidos al viajar).
- **Límites conocidos:** la capa de la BCN no trae la comuna Antártica (sin población ni clientes); los distritos de Perú usan los nombres del INEI sin tildes (los departamentos sí las llevan); los islotes de menos de 1 km² de la costa sur de Chile se omiten.
- **Demo:** la cuenta demo conserva sus 10 zonas de ejemplo con polígonos esquemáticos, pero con los códigos y regiones oficiales.

### Regenerar o agregar zonas

Las fuentes descargadas van en `datos/zonas/fuentes/` (no se versionan). Después:

```bash
npm run zonas
```

Deja `datos/zonas/zonas-<país>.geojson` (versionado; lo usan las pruebas) y `datos/zonas/zone_catalog.sql` (no versionado), con los `INSERT … ON CONFLICT (country_code, code) DO UPDATE` del catálogo. Ese SQL se copia a una **migración nueva**: nunca se edita la 0020.

## Reglas de seguridad

Se suman al aislamiento entre CRMs (tenants), no lo reemplazan:

- Un lead, empresa cliente o zona solo puede pertenecer a un país habilitado del CRM.
- La zona y la empresa cliente de un lead deben ser del mismo país que el lead.
- Una empresa cliente con leads no puede cambiar de país.
- Solo el administrador de la plataforma activa o desactiva países.

Aplicación: `src/lib/tenantGuards.ts` (`enabledCountriesOf`, `sanitizeLeadUpdate`, `sanitizeAccountUpdate`).
Base de datos: `supabase/migrations/20260922000004_international_plan.sql` (tabla `countries`, `company_countries`, triggers y políticas RLS restrictivas).

## Agregar un país (ej. Argentina)

1. **Registro** — `src/data/countries.ts`: sumar `'AR'` a `CountryCode` y su configuración en `COUNTRIES` (nombre, moneda `ARS`, `zoneLabel: { singular: 'Provincia', plural: 'Provincias', gender: 'f' }`, prefijo `+54`, `taxIdLabel: 'CUIT'`, vista del mapa).
2. **Moneda** — `src/lib/currency.ts`: agregar `ARS` en `CURRENCIES` y una tasa de respaldo en `FALLBACK_RATES`. La tasa del día llega sola desde `/api/rates` (open.er-api cubre todas las monedas), y la moneda aparece como opción en los leads del CRM apenas se habilita el país.
3. **Bandera** — `src/components/CountryFlag.tsx` (opcional; sin dibujo se muestra el código "AR").
4. **Zonas** — descargar la fuente oficial a `datos/zonas/fuentes/`, sumar el país en `PAISES` de `scripts/importar-zonas.mjs` (dónde leer código, nombre, región y provincia, y el orden de sus regiones), correr `npm run zonas` y cargar el SQL generado en una migración nueva. Los CRMs que habiliten el país reciben sus zonas solos. En `countries.ts`, `regionLabel` dice cómo se llama su región (Argentina: Provincia).
5. **Base de datos** — `INSERT INTO public.countries …` (ejemplo comentado en la migración 0004).
6. **Activar** — desde Administración, en el CRM que lo necesite.

No hay que tocar los módulos: KPI, mapa, ranking, formularios y asistente IA leen el registro de países.

## Pruebas

```bash
npm run test:tenant
```

```bash
npm run test:e2e
```

El e2e verifica, además del aislamiento entre CRMs: filtro solo Perú, captura de un lead en un distrito de Lima, vista del CRM en una sola moneda y cambio a US$, que un CRM Nacional no ve el selector ni datos de Perú, y que desactivar/reactivar el plan oculta/recupera los datos.

Las zonas oficiales se prueban en `npm run test:supabase` (cantidades, códigos únicos, orden de regiones, agrupación por provincia y búsqueda por nombre con ambigüedad) y en `npm run test:db` (un CRM nuevo recibe 2.238 zonas con su región; uno Nacional, 345; al activar Perú llegan 1.893).
