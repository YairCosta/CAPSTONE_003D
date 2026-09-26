# Usuarios del CRM

Quién puede crear, editar y desactivar a las personas que usan Revela.

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

En la demo (datos en memoria) el usuario se crea con una contraseña temporal. Con Supabase no hay contraseña temporal: ver la sección siguiente.

## Con Supabase: invitaciones, nadie conoce la contraseña de otro

Con `VITE_DATA_SOURCE=supabase` el login y la administración de la plataforma usan la base real:

1. **Iniciar sesión**: el email y la contraseña van directo a Supabase Auth, que guarda la contraseña con hash. La app carga el perfil (`profiles`) y, con RLS, solo los CRMs y usuarios que esa persona puede ver. Si el usuario o su CRM están desactivados, la sesión se cierra en el acto.
2. **Invitar** (Admin → Usuarios → *Invitar usuario*): se ingresa nombre, email, perfil y CRM, **sin contraseña**. El servidor (`server/adminUsers.ts`, ruta `/api/admin/invite`):
   - identifica a quien invita con **su** sesión (no con lo que diga la solicitud) y lee su rol y CRM desde la base;
   - aplica `authorizeInvite()` (`src/lib/userAdmin.ts`): el administrador invita a cualquier CRM; el gerente, solo al suyo y nunca administradores; el usuario base no invita;
   - rechaza emails repetidos y CRMs desactivados;
   - pide a Supabase que envíe el correo y crea el perfil con su CRM y rol. Si el perfil falla, borra la cuenta recién creada: no quedan cuentas a medias.
3. **Elegir contraseña**: la persona abre el correo, vuelve a Revela y ve la pantalla *Bienvenido a Revela* (`SetPasswordScreen`), donde escribe su contraseña. Solo ella la conoce.
4. **¿Olvidaste tu contraseña?**: en el login, envía un enlace para elegir una nueva. La respuesta es la misma exista o no la cuenta, para no revelar qué emails están registrados.
5. **Cambiar la propia contraseña**: se comprueba la actual iniciando sesión con ella y después se guarda la nueva en Supabase Auth.

Invitar exige la clave secreta de Supabase (`SUPABASE_SERVICE_ROLE_KEY`), que salta RLS. Por eso vive **solo en el servidor**: en `.env.local` sin prefijo `VITE_`, nunca en el navegador ni en el repositorio. En producción la ruta pasa a una Edge Function con la clave como secreto de Supabase. Los registros del servidor no llevan emails ni nombres.

**Límites de hoy:**
- El correo de prueba de Supabase solo envía unos pocos correos por hora y **solo a miembros del equipo del proyecto**. Para invitar a personas de un cliente (por ejemplo la empresa piloto) hay que configurar un SMTP propio en Supabase (Authentication → Emails → SMTP).
- En Supabase, **Authentication → URL Configuration** debe tener como *Site URL* y *Redirect URLs* la dirección de la app (`http://localhost:5173` en desarrollo; el dominio real al publicar). Si no, el enlace del correo no vuelve a Revela.
- **Gerencia → Usuarios** todavía trabaja en memoria: la base solo deja escribir `profiles` al administrador. Se conecta con la etapa de Gerencia, con una política nueva para el gerente.

Las pruebas están en `npm run test:supabase` (traducción de filas, reglas de invitación y el endpoint con un Supabase simulado).

## Queda en la auditoría

Crear, editar, activar y desactivar usuarios queda registrado en **Gerencia → Auditoría** con la persona, la acción y la hora, igual que cualquier otro cambio del CRM. Ver `docs/AUDITORIA.md`.

## Cargo del contacto

Al capturar un lead se puede anotar el **cargo** de la persona (`lead.jobTitle`, columna `leads.job_title`). No es obligatorio, pero permite saber si se está hablando con quien decide la compra o con alguien que solo consulta. El campo tiene sugerencias frecuentes y acepta cualquier texto. Aparece en la ficha del pipeline, en la tabla de contactos, en la ficha del mapa y en la exportación a Excel.
