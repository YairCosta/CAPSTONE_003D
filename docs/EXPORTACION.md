# Exportación de datos de un CRM (portabilidad)

Si una empresa quiere cambiarse de CRM, el administrador de la plataforma le entrega **todos sus datos en un Excel**, listo para importarlo en otro sistema a mano o con una IA (ej. Claude).

## Cómo se usa

1. Ingresar como **administrador**.
2. **Administración → CRMs por empresa → Exportar** en la fila de la empresa.
3. Revisar el resumen (filas por hoja) y la advertencia de datos personales.
4. **Descargar Excel** → `revela-export_<empresa>_<fecha>.xlsx`.
5. Entregarlo a la empresa por un canal seguro. Queda registrada la última exportación (quién y cuándo).

## Contenido del archivo

| Hoja | Qué contiene |
|---|---|
| **Léeme** | Empresa, plan, países, fecha, monedas, relaciones entre hojas, advertencias e instrucciones para importar |
| Empresas cliente | Empresas a las que pertenecen los leads (con país e ID tributario) |
| Leads | Contactos con etapa, valor, moneda, origen del valor (calculado/manual), ubicación y notas |
| Productos por lead | Una fila por producto o servicio de cada lead (cantidad, precio, subtotal) |
| Catálogo | Productos y servicios con precio por país |
| Actividades | Bitácora de contactos (canal, resultado, resumen, seguimiento) |
| Etapas pipeline | Etapas del embudo con probabilidad y SLA |
| Zonas | Comunas, distritos… usados para ubicar los leads |
| Usuarios | Nombre, email, rol y estado (**sin contraseñas**) |
| **Diccionario** | Descripción de cada columna de cada hoja |

Detalles del formato:
- **IDs estables**: las hojas se relacionan por ID (ej. `Leads."ID empresa cliente"` → `Empresas cliente."ID"`).
- **Fechas** en ISO 8601 UTC.
- **Montos** en la moneda en que se negoció cada lead (columna "Moneda"), sin conversiones: la vista en CLP o US$ del CRM no afecta la exportación.
- **Etapas, canales y resultados** con código y nombre.

## Seguridad

- Solo el **administrador de la plataforma** puede exportar.
- El archivo incluye **solo el CRM elegido**: todo se filtra por empresa, aunque la app tenga datos de varios CRMs.
- No incluye contraseñas, claves de API ni datos de otros CRMs.
- Incluye datos de países hoy no habilitados (si el plan Internacional se desactivó): son datos de la empresa y el Léeme lo indica.
- El modal advierte que contiene **datos personales** (Ley 21.719 en Chile): entregarlo solo a la empresa dueña de los datos.

Pruebas:

```bash
npm run test:export
```

Genera el Excel real con los datos de todos los CRMs, lo descomprime y verifica que solo contenga el CRM exportado, que no haya contraseñas y que las relaciones entre hojas sean válidas. El e2e (`npm run test:e2e`) descarga el archivo desde el panel de administración y revisa lo mismo.

## Con la base de Supabase

Con `VITE_DATA_SOURCE=supabase` el administrador de la plataforma no puede leer las tablas de un CRM (RLS). Por eso la exportación pide el CRM completo a `export_tenant_snapshot()` (formato v2, solo administrador o `service_role`; migraciones 0006 y 0013), lo traduce con las mismas funciones de la carga normal (`tenantRowsFromSnapshot` y `assembleTenantData`, `src/lib/db/crmMappers.ts`) y arma **el mismo Excel** que en la demo con `buildTenantExport()`. Los usuarios salen de los perfiles que el administrador ya tiene cargados, sin contraseñas.

Al abrir "Exportar" la ventana muestra "Preparando la exportación…" mientras llegan los datos; la descarga usa ese mismo resumen, sin pedirlo dos veces. Cada descarga queda en `data_exports` (quién, cuándo y cuántas filas por hoja) y en el historial del CRM; la última exportación de cada CRM se muestra en el panel. La gerencia de un CRM no puede exportarlo completo ni ver ese registro (`npm run test:db`).

## Importar con Claude

Adjuntar el Excel y pedir, por ejemplo:

> Importa estos datos en mi CRM [nombre]. Lee primero la hoja "Léeme" y el "Diccionario". Crea las empresas cliente, luego los leads (asociándolos por "ID empresa cliente"), después los productos por lead y las actividades. Mantén montos y monedas tal como están y avísame qué campos no tienen equivalente en mi CRM.
