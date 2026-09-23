# Usuarios del CRM

Quién puede crear, editar y desactivar a las personas que usan GeoCRM.

## Dos niveles distintos

| Quién | Dónde | Qué administra |
|---|---|---|
| **Administrador de plataforma** (`superadmin`) | Módulo **Admin → Usuarios** | Usuarios de **cualquier** CRM, incluidos otros administradores. Es quien crea el primer gerente de un CRM nuevo. |
| **Gerente** (`manager`) | **Gerencia → Usuarios** | Solo los usuarios de **su propio** CRM, y solo con perfil *Usuario base* o *Gerente*. |

El gerente es quien conoce a su equipo; obligar a pedirle cada alta al administrador de la plataforma frenaba la operación. Por eso gerencia tiene su propia administración, acotada a su CRM.

## Qué puede y qué no puede hacer el gerente

Puede:
- Crear un usuario de su CRM con nombre, email, contraseña temporal y perfil.
- Cambiar el nombre y el perfil de cualquier usuario de su CRM.
- Desactivar y reactivar usuarios. Un usuario desactivado no puede iniciar sesión, pero **su historial se conserva**: nunca se borra a una persona.

No puede:
- Tocar usuarios de otro CRM.
- Crear administradores de plataforma.
- Cambiar el email de alguien: es la identidad de la cuenta.
- Desactivarse a sí mismo ni quitarse el perfil de gerente (así un CRM nunca queda sin gerencia).

Las reglas viven en `src/lib/tenantGuards.ts` (`validateNewTeamUser`, `sanitizeTeamUserUpdate`) como funciones puras, y se comprueban en `npm run test:tenant` y `npm run test:e2e`. La interfaz está en `src/components/TeamUsersSection.tsx`.

En producción, las contraseñas las gestiona Supabase Auth: la contraseña temporal se entrega por un canal seguro y la persona la cambia al entrar.

## Queda en la auditoría

Crear, editar, activar y desactivar usuarios queda registrado en **Gerencia → Auditoría** con la persona, la acción y la hora, igual que cualquier otro cambio del CRM. Ver `docs/AUDITORIA.md`.

## Cargo del contacto

Al capturar un lead se puede anotar el **cargo** de la persona (`lead.jobTitle`, columna `leads.job_title`). No es obligatorio, pero permite saber si se está hablando con quien decide la compra o con alguien que solo consulta. El campo tiene sugerencias frecuentes y acepta cualquier texto. Aparece en la ficha del pipeline, en la tabla de contactos, en la ficha del mapa y en la exportación a Excel.
