# Productos y servicios

Permite saber **qué se vende más** y **dónde** (comuna, distrito…).

## Dónde está cada cosa

| Qué | Dónde | Quién |
|---|---|---|
| Crear, editar, activar/desactivar productos y servicios | **Gerencia → Catálogo** (filtro Todos / Productos / Servicios) | Gerente |
| Agregar productos o servicios a un lead | **Capturar Lead** y **Gerencia → Contactos → Editar** | Usuario base y gerente (captura) · gerente (edición) |
| Ver qué se vende más y dónde | **KPI y Mapa → Productos y servicios** | Gerente |
| Ver los ítems de un lead | Tarjeta expandida del **Pipeline** y tabla de leads del KPI | Todos |

## Valor del lead

- Con productos o servicios, el valor estimado **se calcula solo**: suma de cantidad × precio unitario.
- Se puede **editar manualmente** (ej. descuento negociado). Queda una marca discreta **`manual`** junto al valor.
- "Usar total de ítems" vuelve al valor calculado.
- Un lead sin ítems siempre tiene valor manual.
- El precio del catálogo es **sugerido por país** (CLP en Chile, S/ en Perú). Al agregar el ítem se puede ajustar. El precio queda guardado en el lead: si cambia el catálogo, la venta no cambia.

## Panel "Productos y servicios"

Usa los mismos filtros del KPI (búsqueda, empresa, zona, estado, fecha y países).

- **Tarjetas**: más vendido, ingresos ganados, ticket promedio y tasa de cierre.
- **Ranking**: leads, ganados, conversión (ganados / cerrados), unidades vendidas, ingresos ganados y pipeline abierto. Se ordena por ingresos, unidades o conversión.
- **¿Dónde se vende?**: buscador de producto, servicio o categoría. El mapa y el ranking muestran solo las zonas donde está, con tres vistas:
  - **Vendidos**: leads ganados (dónde ya se vende o se presta).
  - **En negociación**: leads abiertos (demanda en curso).
  - **Todos**: ganados y abiertos (sin perdidos).

Con varios países, los montos se muestran en la moneda de cada país. El orden y los totales se comparan en US$ con tasa referencial.

## Reglas

- Cada CRM tiene su propio catálogo. Un lead no puede incluir productos de otro CRM (`sanitizeLeadItems` en la app; trigger y RLS en la base de datos).
- Un producto que está en algún lead **no se elimina**: se desactiva y conserva el historial.
- Solo el gerente modifica el catálogo.

Base de datos: `supabase/migrations/20260923000005_catalog_products_services.sql` (tablas `catalog_items`, `catalog_item_prices`, `lead_items`; funciones `get_catalog_sales` y `get_item_distribution_by_territories`).
