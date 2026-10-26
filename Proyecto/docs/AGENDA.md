# Agenda de seguimientos

**Registro de contacto → pestaña Agenda.** Reúne en un solo lugar todos los "próximo contacto agendado" del CRM.

## Por qué

La fecha de seguimiento se anota al guardar una interacción, pero quedaba **dentro** de esa bitácora. Para saber a quién llamar mañana había que abrir lead por lead y buscar la línea naranja. Con 9 leads se aguanta; con 200 no.

## Cómo funciona

- Cada lead tiene **un solo compromiso vigente**: la fecha de seguimiento de su **última** interacción. Si se registra un contacto nuevo, el compromiso anterior se considera atendido y desaparece de la agenda, aunque nadie lo marque como hecho.
- Los leads **ganados y perdidos** no aparecen: no hay nada que seguir.
- Los compromisos se agrupan por urgencia: **Atrasados, Hoy, Mañana, Esta semana, Más adelante**. Los atrasados salen en rojo y arriba.
- Cada fila muestra el lead, la empresa, el canal, con quién se acordó, el agente responsable y el resumen de lo último conversado. El botón **"Registrar este contacto"** selecciona ese lead en el formulario de la izquierda.
- La vista **Mes** es un calendario: los días con compromisos llevan un punto (rojo si están atrasados) y al hacer clic se filtra la lista a ese día.
- La pestaña muestra un contador con los pendientes, en rojo si hay atrasados.

La lógica vive en `src/lib/agenda.ts` como funciones puras (`pendingFollowUps`, `countsByDay`, `monthGrid`) y se prueba en `npm run test:tenant`; la interfaz está en `src/components/AgendaPanel.tsx`.

## Lo que no hace todavía

- No hay un "marcar como hecho" explícito: un compromiso se cierra registrando el contacto siguiente.
- No distingue por agente responsable: el gerente y el usuario base ven la misma agenda del CRM.
- No avisa fuera de la aplicación (sin correo ni notificación).

## Relación con el detector de leads estancados

Son cosas distintas y conviene no confundirlas. La agenda muestra lo que **alguien se comprometió a hacer**. El detector de estancados —pendiente— marcará los leads que llevan demasiado tiempo en una etapa **según el SLA de esa etapa**, incluidos los que nadie agendó nunca. Un lead sin ningún seguimiento agendado no aparece en la agenda, y es justo el que más riesgo tiene.
