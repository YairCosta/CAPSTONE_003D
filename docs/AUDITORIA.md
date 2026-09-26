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

**Filtros:** búsqueda libre (incluye los valores antiguos y nuevos que no son personales), tipo de dato, persona y "solo reversibles".

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
- `revert_snapshot` guarda el estado anterior **sin datos personales**; si es `NULL`, el cambio no se puede deshacer.
- **La base firma cada entrada** (trigger `trg_audit_log_set_actor`, 0015): pone el nombre y el rol del perfil de la sesión, la hora de la base y la deja sin revertir. La app no puede atribuirle un cambio a otra persona ni fecharlo en el pasado.
- **El administrador de la plataforma** registra sus acciones (crear un CRM, activarlo, cambiar el plan, invitar o editar usuarios) en el historial del CRM afectado (política `Auditoría: registro plataforma`, 0015). No puede leer ese historial: es de la gerencia del CRM.

Con `VITE_DATA_SOURCE=supabase`, van a la base las entradas de **CRMs, usuarios, leads, empresas cliente, catálogo y registros de contacto** (`CONNECTED_AUDIT_ENTITIES` en `src/lib/db/mappers.ts`); la configuración de etapas y la exportación se suman con su etapa. El estado anterior para **"Volver atrás"** se guarda en `revert_snapshot` (sin datos personales) y el tipo de reversión se deduce del dato y la acción (`revertKindFor`). Revertir restaura el dato con la misma sincronización del resto de la app y marca la entrada original con `mark_audit_entry_reverted()`. La gerencia ve al entrar las 500 entradas más recientes. Si una entrada no alcanza a llegar a la base, la app avisa que el cambio se guardó pero no quedó registrado.

## Pruebas

```bash
npm run test:tenant
```

Cubre `canChangeStage` (el usuario base solo avanza), que el historial de un CRM no incluya movimientos de otro, y qué entradas son reversibles.

El e2e verifica que el gerente vea los cambios con su autor, que el usuario base no tenga la pestaña ni el botón "Retroceder", y el ciclo completo de revertir: el dato vuelve atrás, la reversión queda registrada y el historial solo crece.

## El historial no guarda datos personales

Desde el 25-09-2026 (Ley 21.719, derecho de supresión, opción A):

- Cuando cambia un dato que identifica a una persona (nombre, cargo, correo, teléfono, dirección,
  notas, otros contactos del lead; contacto, correo, teléfono y notas de una empresa cliente), el
  historial registra **que cambió**, nunca el valor anterior ni el nuevo. En pantalla se lee
  "modificado · dato personal, el valor no se guarda".
- El lead se nombra por su **empresa**; si es persona natural, como "Persona natural · ref. XXXX".
- Un registro de contacto se anota como "Contacto por Llamada", sin la persona ni lo conversado.
- El estado guardado para revertir (`revert_snapshot`) tampoco lleva datos personales.
- **Revertir restaura los datos del negocio** (etapa, monto, zona, productos) y deja los datos
  personales **y lo que decidió el titular** (autorización, oposición, anonimización) como están hoy.
  Revertir nunca revive a quien pidió su eliminación ni vuelve a dejar "autorizado" a quien revocó.

Así el historial puede seguir sin editarse ni borrarse y, a la vez, anonimizar un lead no deja
copias de sus datos en ningún lado. La regla está en `src/lib/audit.ts` (`personal: true`) y en
`src/lib/privacy.ts`.
