# Auditoría y reglas del pipeline

## Módulo de Auditoría (gerencia)

**Gerencia → pestaña Auditoría.** Historial de todo lo que pasa en el CRM: quién, qué, cuándo y qué cambió exactamente.

Cada registro tiene:

| Columna | Contenido |
|---|---|
| Fecha y hora | Momento exacto y "hace X min" |
| Persona | Nombre y rol de quien hizo el cambio |
| Acción | Creó, Editó, Eliminó, Activó, Desactivó, Cambió de etapa, Ubicó, Registró contacto, Exportó, Revirtió |
| Dato | Tipo (lead, empresa cliente, producto, etapa, usuario…) y su nombre |
| Detalle | Resumen y, al expandir, **campo por campo: valor anterior → valor nuevo** |

**Filtros:** búsqueda libre (incluye los valores antiguos y nuevos), tipo de dato, persona y "solo reversibles".

Qué se registra: captura y edición de leads, cambios de etapa, contactos registrados, empresas cliente, catálogo de productos y servicios, configuración de etapas, exportaciones de datos y las acciones del administrador sobre el CRM (activar, desactivar, plan Internacional, usuarios).

El historial **no se filtra por país**: es el registro completo del CRM. Por eso la barra de países no aparece en esta pestaña.

## Volver atrás

El gerente puede deshacer un cambio con **"Volver atrás"**. Se muestra qué se restaurará antes de confirmar.

| Se puede revertir | No se puede |
|---|---|
| Edición de un lead (incluidos etapa, zona y productos) | Creación de un lead, empresa o producto |
| Edición de una empresa cliente, activar/desactivar | Contactos registrados (la bitácora es un historial) |
| Edición del catálogo, activar/desactivar | Exportaciones de datos |
| Eliminación de una empresa cliente o de un producto (se recrea) | Acciones del administrador de la plataforma |
| Configuración de una etapa del pipeline | Un cambio ya revertido |

Reglas:
- **El historial nunca se borra.** Revertir agrega una entrada nueva y marca la original como "Revertido por …".
- Solo **gerencia** puede revertir. El usuario base no ve el módulo.
- Se restaura el estado que había **antes de ese cambio**: si hubo cambios posteriores, quedan sobrescritos. La confirmación lo advierte.

## Regla del pipeline: el usuario base no retrocede leads

Un lead avanza por el embudo: Nuevo → Contactado → Calificado → Propuesta → Pago pendiente → Ganado / Perdido.

- **Usuario base:** solo puede avanzar. No ve el botón "Retroceder", no puede arrastrar una tarjeta a una columna anterior (la columna no la acepta y aparece un aviso) y tampoco puede sacar un lead de "Ganado" o "Perdido".
- **Gerente:** puede mover leads en cualquier dirección y corregir errores.

La regla está en `canChangeStage()` (`src/lib/tenantGuards.ts`) y se aplica **también al guardar**, no solo en la interfaz: aunque alguien fuerce la acción desde fuera, el cambio se rechaza. También aplica al avance automático de etapa al registrar un contacto.

## Base de datos

`supabase/migrations/20260926000008_audit_log.sql` crea la tabla `audit_log`:

- Solo permite **insertar y leer**: no hay políticas de `UPDATE` ni `DELETE`, así que nadie puede alterar el historial.
- Lectura restringida a gerencia del mismo CRM.
- Marcar una entrada como revertida pasa por la función `mark_audit_entry_reverted()`, que verifica el rol, el CRM y que no se haya revertido antes.
- `revert_snapshot` guarda el estado anterior completo; si es `NULL`, el cambio no se puede deshacer.

## Pruebas

```bash
npm run test:tenant
```

Cubre `canChangeStage` (el usuario base solo avanza), que el historial de un CRM no incluya movimientos de otro, y qué entradas son reversibles.

El e2e verifica que el gerente vea los cambios con su autor, que el usuario base no tenga la pestaña ni el botón "Retroceder", y el ciclo completo de revertir: el dato vuelve atrás, la reversión queda registrada y el historial solo crece.
