# Plan Internacional (multipaís)

Un CRM puede trabajar en **un país** (plan Nacional) o en **varios** (plan Internacional). Revela cubre los **19 países de América Latina**:

- El administrador de la plataforma define el plan en **Administración → CRMs por empresa → Plan Internacional**.
- Con el plan Internacional, la **gerencia de cada CRM elige sus países** en **Gerencia → Países y divisas**.
- Un CRM parte solo con su país base (Chile por defecto) y suma los demás cuando los necesita. Así no se cargan miles de zonas que nadie usa.

## Cómo funciona

| Concepto | Detalle |
|---|---|
| País base | Todo CRM tiene uno (`homeCountry`). Siempre está activo y no se puede desactivar. En plan Nacional es el único que cuenta. |
| Países activos | Con el plan Internacional: el país base más los que active la gerencia (o el administrador). Al activar un país, el CRM recibe sus zonas, su moneda y su forma de nombrar las zonas. |
| Desactivar | **Oculta, no borra.** Los leads, empresas y zonas del país dejan de verse en todo el CRM y vuelven al activarlo de nuevo. Si el país tiene leads, la app pide confirmación. |
| Plan Nacional | Cuenta solo el país base, pero **la lista de países se guarda**: al reactivar el plan vuelven los países que el CRM ya usaba, con sus datos. |
| Zona por país | Cada país nombra su zona a su manera (tabla de abajo). Los textos de la app se adaptan solos: "Selecciona el municipio", "el cantón", "la comuna"… Con varios países, la app dice "la zona". |
| Moneda | Cada país activo suma su moneda a las que se pueden usar en los leads (más US$, siempre). Todo el CRM se ve en una sola moneda, con tasas del día: la del país base, US$ o la de otro país activo que la gerencia sume al selector (botón "+ $" o Gerencia → Países y divisas). Ver `docs/MONEDAS.md`. |
| Porcentajes por zona | Se calculan **dentro de cada país** (el % de Miraflores es sobre los leads de Perú). |
| Filtro de países | Barra "Plan Internacional" bajo el menú: filtra KPI, mapa, pipeline, registro de contacto, gerencia y estados. Solo aparece si el CRM tiene más de un país. |
| Mapa | Hasta 3 países, botones **Todos / Chile / Perú…** para encuadrar cada uno; con más, un selector. En barras, las zonas se agrupan por país. Solo se dibujan las zonas con leads (una zona aparece con su primer lead) y el ranking solo lista esas. De lejos, una burbuja por región; al acercarse (zoom 9 o más), una por zona. |
| Elegir la zona | Primero la región y después la zona. Sin región, la lista trae todas las zonas agrupadas por región. En los países con más de 1.000 zonas (Brasil, México, Perú y Colombia) hay que elegir la región primero: una lista de 5.570 municipios no se puede recorrer. |
| Auditoría | Activar o desactivar un país queda registrado ("Activó Argentina"), con su autor. |

### División territorial usada

La zona es el nivel municipal de cada país (en Bolivia, la provincia). No en todos lados hay comunas:

| País | Zona | Región | Zonas | Regiones | Moneda |
|---|---|---|---:|---:|---|
| Chile | Comuna | Región | 345 | 16 | CLP |
| Perú | Distrito | Departamento | 1.893 | 25 | PEN |
| Argentina | Partido o departamento | Provincia | 525 | 24 | ARS |
| Bolivia | Provincia | Departamento | 110 | 9 | BOB |
| Brasil | Municipio | Estado | 5.570 | 27 | BRL |
| Colombia | Municipio | Departamento | 1.122 | 33 | COP |
| Costa Rica | Cantón | Provincia | 83 | 7 | CRC |
| Cuba | Municipio | Provincia | 168 | 16 | CUP |
| República Dominicana | Municipio | Provincia | 155 | 32 | DOP |
| Ecuador | Cantón | Provincia | 224 | 25 | USD |
| El Salvador | Distrito | Departamento | 262 | 14 | USD |
| Guatemala | Municipio | Departamento | 340 | 22 | GTQ |
| Honduras | Municipio | Departamento | 297 | 18 | HNL |
| México | Municipio | Estado | 2.457 | 32 | MXN |
| Nicaragua | Municipio | Departamento | 153 | 17 | NIO |
| Panamá | Distrito | Provincia | 76 | 13 | USD |
| Paraguay | Distrito | Departamento | 250 | 18 | PYG |
| Uruguay | Municipio | Departamento | 124 | 18 | UYU |
| Venezuela | Municipio | Estado | 335 | 24 | VES |
| **Total** | | | **14.489** | | |

- **Chile y Perú** traen además la provincia de cada zona: con la región elegida, la lista se agrupa por provincia.
- **Argentina**: en la provincia de Buenos Aires la zona es el partido; en el resto, el departamento. La Ciudad de Buenos Aires se divide en sus 15 comunas.
- **El Salvador**: desde la reforma de 2024, los 262 antiguos municipios son **distritos** de 44 municipios nuevos. El lead se ubica en el distrito, que es como la gente sigue nombrando el lugar (Santa Tecla, Soyapango).
- La configuración de cada país (nombres, moneda, prefijo telefónico, identificador tributario, vista del mapa) está en `src/data/countries.ts`.

## Zonas oficiales

### Un catálogo común (migración 0023)

Los contornos viven **una sola vez** en `zone_catalog`, no copiados en cada CRM:

- Al activar un país, un trigger copia a `territories` las zonas de ese país **sin contorno**: código, nombre, región y provincia, para ubicar leads y ver el ranking.
- La vista `territories_geojson`, la distribución por zona y la exportación leen el contorno del catálogo.
- La 0024 vació las copias que ya existían.
- Activar Brasil agrega 5.570 filas livianas al CRM, no 5.570 contornos.
- La app baja la lista de zonas sin contorno (para elegirlas al capturar) y el contorno solo de las zonas con leads.

**La identidad de una zona es su código, no su nombre**: Perú tiene 4 distritos Miraflores y México varios Cuauhtémoc. Por eso los selectores agrupan por región o provincia.

### Fuentes y licencias

| País | Zonas | Código de zona |
|---|---|---|
| Chile | Biblioteca del Congreso Nacional, *División comunal* ([mapas vectoriales](https://www.bcn.cl/siit/mapas_vectoriales/index_html), `comunas_final.zip`) | `CL-` + código comunal, ej. `CL-13123` Providencia |
| Perú | Límites distritales del INEI, en [Rodasluis/Peru-maps](https://github.com/Rodasluis/Peru-maps) | `PE-` + ubigeo, ej. `PE-150122` Miraflores |
| Resto de América Latina | [geoBoundaries](https://www.geoboundaries.org) (nivel ADM2 para la zona y ADM1 para la región), con la versión fijada en `datos/zonas/fuentes/geoboundaries/fuentes.json` | región ISO 3166-2 + nombre, ej. `MX-JAL-GUADALAJARA` |

Fuente y licencia de cada país en geoBoundaries:

| País | Zonas (ADM2) | Licencia |
|---|---|---|
| Argentina | Instituto Geográfico Nacional, OCHA | CC BY 3.0 IGO |
| Bolivia | GeoBolivia | Dominio público |
| Brasil | IBGE, OCHA | CC BY 3.0 IGO |
| Colombia | DANE | CC BY 4.0 |
| Costa Rica | Wikimedia Commons | CC0 |
| Cuba, Nicaragua | OpenStreetMap | ODbL |
| República Dominicana | Caribbean GeoPortal | CC BY 4.0 |
| Ecuador | INEC, OCHA | CC BY 3.0 IGO |
| El Salvador | GADM vía HDX (edición humanitaria) | CC BY 3.0 IGO |
| Guatemala | CONRED, OCHA | CC BY 3.0 IGO |
| Honduras | ICF | CC BY 4.0 |
| México | Banco Mundial (regiones: INEGI) | CC BY 4.0 |
| Panamá | Smithsonian Tropical Research Institute | CC BY 4.0 |
| Paraguay | DGEEC vía HDX (edición humanitaria) | CC BY 3.0 IGO |
| Uruguay | Wikimedia Commons | CC BY-SA 3.0 |
| Venezuela | Efraín Porto Tapiquén | ODbL |

- **Edición:** por defecto se usa la abierta (gbOpen). Se usa la humanitaria (gbHumanitarian) en dos casos:
  - las **regiones** de Argentina, Brasil, Colombia, Ecuador y Guatemala, que vienen del mismo organismo que sus zonas y así calzan;
  - las **zonas** de Paraguay y El Salvador, porque la edición abierta traía nombres abreviados y diez zonas llamadas "Null".
- **Cita obligatoria:** CC BY y ODbL piden citar la fuente. El mapa dice "Zonas: BCN, INEI y geoBoundaries" junto a la atribución de los mapas base, y esta tabla da el detalle.
- **Compartir igual:** ODbL y CC BY-SA piden además compartir con la misma licencia si se redistribuye el catálogo (no se redistribuye: se usa dentro de la app).
- Cada migración de zonas cita en su encabezado la fuente y licencia de cada país (0025 a 0028).

### Cómo se procesan

- **Región de cada zona:** mapshaper le asigna la región que más la cubre (`-join largest-overlap`), no la que contiene su centro, que puede caer en el mar o en la región vecina.
- **Nombres y códigos de las regiones:** los nombres oficiales y los códigos ISO 3166-2 están revisados a mano en `scripts/regiones-latam.mjs`. Por ejemplo "Distrito Federal" pasa a Ciudad de México (`MX-CMX`) y "La Estrelleta" a Elías Piña (`DO-07`).
- **Nombres de las zonas:**
  - sin prefijos ("Municipio de…") y sin mayúsculas sostenidas;
  - siglas corregidas ("Bogotá, D.C.");
  - traducciones de la fuente ("Isle of Youth" → Isla de la Juventud, "Municipality A" → Municipio A de Montevideo);
  - los lagos que la fuente dibujaba como zona (Yojoa, Atitlán, Amatitlán) quedan fuera.
- **Tildes:** Costa Rica, Ecuador, Honduras y los distritos de Perú vienen de fuentes sin tildes. `scripts/tildes-zonas.mjs` corrige solo palabras que en español se escriben siempre igual (San José, María, Concepción, Martín, Unión…) y las terminadas en -ción/-sión. La ñ no se adivina: "Canas" (Cusco) y "Cañas" (Guanacaste) existen las dos. Tampoco "César": el departamento colombiano es Cesar, sin tilde. Una palabra que no está en la lista queda como viene: mejor sin tilde que con una equivocada.
- **Simplificación:** según el tamaño de cada zona, para que las urbanas chicas conserven su forma y las rurales grandes pesen menos.

### Límites conocidos

- **Uruguay:** sus municipios no cubren todo el territorio. Flores no tiene municipios, así que el país tiene zonas en 18 de sus 19 departamentos.
- **Venezuela:** las Dependencias Federales (islas) no tienen zonas.
- **Ecuador:** las "zonas no delimitadas" (en disputa entre provincias) forman su propia región (`EC-ZND`).
- **Bolivia:** la zona es la provincia (110), no el municipio.
- **Tildes:** quedan nombres sin tilde que la lista no cubre, sobre todo en Ecuador y Honduras (Pujili, Saquisili).
- **Fechas de las fuentes:** van de 2012 (México, Panamá) a 2021. Un municipio creado después no está; se agrega regenerando con una versión nueva.
- **Chile:** la capa de la BCN no trae la comuna Antártica y omite los islotes de menos de 1 km² de la costa sur.

### Demo

La cuenta demo trae sus 10 zonas de ejemplo de Chile y Perú. Suma además una zona por cada otro país, su capital (`src/data/demoLatamZones.ts`), para que activar un país en Gerencia → Países y divisas funcione también en la demo. Las cuentas reales usan el catálogo completo de la base.

### Regenerar o agregar zonas

```bash
node scripts/descargar-zonas-geoboundaries.mjs
```

```bash
npm run zonas
```

- **Descarga:** deja las fuentes de geoBoundaries en `datos/zonas/fuentes/`, que no se versiona. Vuelve a descargar si cambia la edición elegida para un país; `--forzar` baja todo de nuevo.
- **Procesamiento:** `npm run zonas -- MX BR` procesa solo algunos países. Deja dos archivos por país:
  - `datos/zonas/zonas-<país>.geojson` (se versionan los de Chile y Perú, que usan las pruebas);
  - `datos/zonas/sql/zone_catalog_<país>.sql`, con los `INSERT` del catálogo.
- **Carga:** ese SQL va en una **migración nueva**; nunca se edita una aplicada. Si solo cambian nombres, la migración actualiza el catálogo y las copias de cada CRM, como la 0028. Las zonas que salen del catálogo no pueden estar en uso: si un CRM ya las tiene, la migración se detiene.

## Reglas de seguridad

Se suman al aislamiento entre CRMs (tenants), no lo reemplazan:

- **País habilitado:** un lead, empresa cliente o zona solo puede pertenecer a un país habilitado del CRM. Uno que no es el país base cuenta solo con el plan Internacional (`is_country_enabled`).
- **Mismo país:** la zona y la empresa cliente de un lead deben ser del mismo país que el lead.
- **Empresa con leads:** una empresa cliente con leads no puede cambiar de país.
- **Quién cambia qué:**
  - el **administrador** de la plataforma define el plan y puede elegir países de cualquier CRM;
  - la **gerencia** activa y desactiva países **solo de su CRM**, **solo con el plan Internacional** y **nunca el país base**;
  - el usuario base no cambia países.

En la app: `src/lib/tenantGuards.ts` (`enabledCountriesOf`, `setCountryByManager`, `sanitizeLeadUpdate`, `sanitizeAccountUpdate`).

En la base:

- **0004** crea `countries`, `company_countries` y los triggers.
- **0023** agrega las políticas "Países del CRM: la gerencia activa países" (INSERT) y "… desactiva países" (DELETE). Exigen gerente del mismo CRM, plan Internacional y país disponible, y el DELETE excluye el país base.

## Agregar un país

1. **Registro** — `src/data/countries.ts`:
   - sumar el código a `CountryCode`;
   - agregar su configuración en `COUNTRIES`: nombre, moneda, `zoneLabel`, `regionLabel`, jerarquía, prefijo telefónico, identificador tributario y vista del mapa.
2. **Moneda** — `src/lib/currency.ts`: agregarla en `CURRENCIES`, con símbolo propio y decimales, y una tasa de respaldo en `FALLBACK_RATES`. La tasa del día llega sola desde `/api/rates`.
3. **Bandera** — `src/components/CountryFlag.tsx`, en SVG (Windows no dibuja los emojis de bandera).
4. **Zonas** — según la fuente:
   - si está en geoBoundaries: sumarlo a `PAISES_GEOBOUNDARIES` (descarga) y `GEOBOUNDARIES` (proceso), y sus regiones a `scripts/regiones-latam.mjs`;
   - si tiene fuente propia: una entrada en `PAISES` de `scripts/importar-zonas.mjs`.

   Después, `npm run zonas` y el SQL generado a una migración nueva.
5. **Base de datos** — `INSERT INTO public.countries …` en esa migración (ver la 0023).
6. **Activar** — la gerencia del CRM, desde Gerencia → Países y divisas.

No hay que tocar los módulos: KPI, mapa, ranking, formularios y asistente IA leen el registro de países.

## Pruebas

```bash
npm run test:tenant
```

```bash
npm run test:supabase
```

```bash
npm run test:db
```

```bash
npm run test:e2e
```

- **`test:tenant`**:
  - la regla de la gerencia: activa y desactiva en su CRM; nunca el país base, nunca en plan Nacional, nunca otro perfil ni otro CRM;
  - el plan Nacional guarda la lista;
  - los 19 países completos: moneda, tasa, nombres de zona y región, teléfono y mapa;
  - cada país nombra su zona a su manera;
  - redondeo por moneda.
- **`test:supabase`**:
  - activar y desactivar en la base con un Supabase simulado;
  - el plan Nacional conserva las filas;
  - el corrector de tildes: lo que corrige y lo que respeta;
  - las zonas oficiales de Chile y Perú.
- **`test:db`**, contra la base real y deshaciendo todo al final:
  - el catálogo trae 14.489 zonas de 19 países, todas con su región;
  - no hay zonas "Null", en inglés ni lagos, y los nombres llevan tildes;
  - un CRM nuevo recibe 2.238 zonas sin copiar su contorno;
  - al activar México llegan sus 2.457 municipios y el mapa los dibuja desde el catálogo;
  - activar México suma el peso mexicano;
  - el país base no se desactiva;
  - desactivar Perú oculta su lead y reactivarlo lo devuelve;
  - el usuario base, un gerente con plan Nacional y el gerente de otro CRM no pueden cambiar países.
- **`test:e2e`**:
  - en la demo: Gerencia → Países y divisas muestra los 19 países con Chile fijo;
  - la gerencia activa Argentina y aparece en el filtro;
  - la captura ofrece su "Partido o departamento";
  - el lead de Argentina se guarda, desactivar lo oculta (con confirmación) y reactivar lo devuelve;
  - todo queda en la auditoría;
  - además, el flujo previo: filtro solo Perú, una sola moneda, y el plan Nacional oculta Perú y lo recupera al reactivarlo.
