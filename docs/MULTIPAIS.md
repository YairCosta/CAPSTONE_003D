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
| Mapa | Botones **Todos / Chile / Perú** para encuadrar cada país; en barras, las zonas se agrupan por país. |

### División territorial usada

- **Chile**: Región → Provincia → **Comuna** (unidad municipal; ej. Providencia).
- **Perú**: Departamento → Provincia → **Distrito** (unidad municipal; ej. Miraflores, San Isidro en Lima).
- **Argentina**: **Provincia** → Departamento / Partido (en CABA existen 15 comunas). Para un CRM nacional argentino conviene trabajar por provincia.

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
4. **Zonas** — cargar los polígonos con `countryCode: 'AR'` (mock: `mockTerritories`; producción: tabla `territories`).
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
