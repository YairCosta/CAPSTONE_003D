# Contactos de un lead

## Lead, contactos y bitácora

Son tres cosas distintas y conviene no confundirlas:

| Concepto | Qué es | Dónde vive |
|---|---|---|
| **Lead** | La oportunidad comercial: una empresa, un monto, una etapa del pipeline y una ubicación | `leads` |
| **Contactos** | Las personas con las que se habla dentro de ese lead | `lead_contacts` |
| **Bitácora** | Cada conversación que ocurrió: canal, resultado, con quién y qué se acordó | `lead_activities` |

El lead responde *qué* se está vendiendo y en qué va. Los contactos responden *con quién* se habla. La bitácora responde *qué pasó* y *cuándo*.

## Por qué varios contactos

En una empresa casi nunca se cierra con una sola persona: quien pide la cotización no suele ser quien firma. Registrar solo a uno obliga a escribir a los demás en las notas, donde no se pueden buscar ni filtrar, y hace que la bitácora no distinga si la reunión fue con el jefe de compras o con el gerente.

## Cómo funciona

- El lead tiene un **contacto principal**: el que se ingresó al capturarlo (nombre, cargo, email, teléfono).
- Se agregan los demás desde dos lugares, con nombre, cargo, email y teléfono. Máximo 10 adicionales por lead (`MAX_LEAD_CONTACTS` en `src/lib/contacts.ts`):
  - **Registro de contacto**, con el botón *"Agregar contacto de esta empresa"* en la ficha del lead. Es el camino rápido: si en plena llamada aparece otro nombre, se anota sin salir del módulo y la persona queda elegida en *"¿Con quién hablaste?"* para esa misma interacción.
  - **Gerencia → Contactos → Editar**, para mantenerlos después (corregir, completar datos o quitar).
- Un contacto sin nombre no se guarda; los emails se normalizan a minúsculas y los textos se recortan (`sanitizeLeadContacts` en `src/lib/tenantGuards.ts`).
- Al **registrar una toma de contacto**, si el lead tiene más de una persona aparece el selector *"¿Con quién hablaste?"*, y el nombre queda guardado en esa entrada de la bitácora.
- Los contactos adicionales se ven en la tarjeta del pipeline, en la tabla de contactos de Gerencia, en la ficha del mapa y en la exportación (hoja **"Contactos por lead"**, una fila por persona).
- Agregar, editar o quitar contactos queda en la **auditoría** como un cambio del lead, y se puede **volver atrás**.

## En la base de datos

La migración `0010` crea `lead_contacts` con `company_id`, RLS, trigger de mismo CRM y un índice único que garantiza **un solo contacto principal por lead**. Sigue el procedimiento de `docs/BASE_DE_DATOS.md`: por ahora *expande y copia* (el contacto de la ficha del lead se duplica en la tabla nueva marcado como principal) y las columnas `full_name`, `job_title`, `email` y `phone` de `leads` siguen siendo la fuente de verdad. **Contraerlas — quitarlas de `leads` — es una migración posterior**, cuando la aplicación lea siempre desde `lead_contacts`.

En la bitácora se guarda el **nombre** de la persona (`lead_activities.contact_name`), no su id: así el historial no cambia si después ese contacto se edita o se elimina. Un registro de lo que pasó no se reescribe.
