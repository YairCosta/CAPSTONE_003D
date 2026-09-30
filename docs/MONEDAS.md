# Monedas

## Dos monedas distintas

| | Qué es | Quién la elige | Opciones |
|---|---|---|---|
| **Moneda del lead** | En la que se **negoció** ese negocio. El monto se guarda en ella. | Quien crea o edita el lead | La de cada país habilitado del CRM **más US$** |
| **Moneda de la vista** | Con la que se **muestra** todo el CRM. Solo para mirar. | Cada usuario, en la barra superior, entre las divisas que ofrece su CRM | La del país base y **US$** siempre, más las que sume la gerencia (de sus países activos) |

Ejemplo con la empresa piloto (Chile + Perú): los leads pueden negociarse en **CLP, PEN o US$**. Con el selector de arriba
en CLP, un contrato de S/ 14.000 aparece como $3.969.783; en US$, como US$4.142. El dato guardado sigue
siendo S/ 14.000.

Un CRM de plan Nacional en Chile ofrece CLP y US$. Cada país que la gerencia activa con el plan Internacional
suma su moneda automáticamente (`leadCurrenciesFor` en `src/lib/currency.ts`). Ecuador, El Salvador y Panamá usan
el dólar. Cada moneda tiene su propio símbolo (AR$, MX$, R$, COL$, S/…), para que AR$ 1.000 no se confunda con
MX$ 1.000, y sus decimales: el peso chileno y el guaraní se redondean sin decimales; el resto, con dos.

## Divisas para ver el CRM

El selector de moneda de la barra superior ofrece siempre la moneda del país base y el dólar (en un CRM
chileno, **CLP** y **US$**). La gerencia puede sumar la de otros países activos del CRM, de dos formas:

- con el botón **"+ $"** junto al selector, que abre la lista de divisas;
- en **Gerencia → Países y divisas**, en la sección "Divisas para ver el CRM".

Todo el equipo ve los botones que sume la gerencia. Cada persona elige cuál mirar, y esa elección queda en
su navegador.

- **Qué se puede sumar:** solo la moneda de un país activo. Para ver el CRM en MXN, primero se activa México.
  Si después se desactiva el país, su divisa deja de ofrecerse y vuelve con él.
- **Qué no se puede quitar:** la moneda del país base y el dólar.
- **Qué cambia:** nada del dato. Sumar o quitar una divisa solo cambia los botones del selector: los montos siguen
  guardados en la moneda en que se negociaron.
- **Por defecto:** un CRM con base en Chile se ve en CLP; el resto, en US$.
- **Auditoría:** sumar o quitar una divisa queda registrado ("Sumó PEN a las divisas para ver el CRM").

En la app: `viewCurrenciesFor` (`src/lib/currency.ts`) arma la lista y `setViewCurrencyByManager`
(`src/lib/tenantGuards.ts`) aplica las reglas. En la base, la tabla `company_view_currencies` (migración 0029)
tiene RLS: la gerencia agrega y quita solo en su CRM. Un trigger rechaza la moneda de un país que no está
activo.

## Por qué el monto nunca se guarda convertido

El tipo de cambio se mueve todos los días. Si se guardara convertido, un negocio cerrado en septiembre
"cambiaría de valor" cada mes, y no habría forma de saber qué se cobró de verdad. Por eso:

- El **dato** es el monto en su moneda original, tal como se negoció.
- La **vista** lo convierte en el momento, con la tasa del día.
- La exportación a Excel entrega el monto original y su moneda, sin convertir.

## De dónde salen las tasas

`GET /api/rates` (en `server/exchangeRates.ts`, dentro del servidor de Vite):

- **CLP**: dólar observado del **Banco Central de Chile**, publicado por mindicador.cl.
- **Resto** (PEN, MXN, BRL… las 15 monedas de América Latina que no son CLP ni US$): open.er-api.com, que cubre todas las monedas ISO 4217.

Ambas son gratuitas y sin API key. El servidor guarda la respuesta 12 horas. Si una fuente falla se usa la
última tasa buena; si nunca hubo una, una **tasa de respaldo** fija (`FALLBACK_RATES`). En ese caso aparece
un aviso ⚠ junto al selector de moneda, y al pasar el mouse se ven la tasa, la fuente y la fecha.

La API oficial del Banco Central (SIETE) requiere registrarse y guardar usuario y contraseña: sería otro
secreto en `.env.local`. mindicador.cl publica el mismo dato oficial sin eso.

## Cómo se muestra en cada pantalla

Todas las pantallas usan `useMoney()` (`src/lib/money.ts`), que entrega los montos ya convertidos y
formateados en la moneda de la vista. Ninguna pantalla convierte por su cuenta, así que cualquier moneda
de la lista sirve como moneda de la vista sin tocar las pantallas.

- **Totales** (KPI, columnas del pipeline, empresas cliente, ranking de zonas, productos): en la moneda de la
  vista. Si incluyen montos de otras monedas lo dicen: *"Incluye PEN convertido a CLP"*.
- **Un lead negociado en otra moneda**: se ve convertido y con su moneda original al lado
  (en el pipeline, una etiqueta "USD" con el monto original al pasar el mouse; en la tabla y en el mapa,
  *"negociado en US$2.700"*).
- **Al crear o editar un lead**: se ve y se escribe en **su** moneda. Los precios del catálogo están por país;
  si el lead va en otra moneda, el precio sugerido se convierte con la tasa del día. Cambiar la moneda de un
  lead convierte lo ya ingresado y queda en la auditoría como "Moneda del lead".

## Reglas

- La moneda de un lead solo puede ser la de un país habilitado del CRM o US$. Lo valida `sanitizeLeadUpdate`
  en la app y, en la base, el trigger de la migración `0011` (`lead_allowed_currencies`).
- Los leads antiguos sin moneda usan la de su país (`leadCurrency`).
- El asistente de IA guarda los leads en la moneda del país del lead.
