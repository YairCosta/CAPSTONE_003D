# Uso de la plataforma, encuestas y reportes de errores

Para que el administrador de Revela sepa si sus clientes usan el CRM y cómo les va, sin entrar a sus datos. Vive en
**Administración → Uso y soporte** (migración 0030).

| Qué | Para qué | Quién lo ve |
|---|---|---|
| **Leads por CRM** | Cuántos leads crea cada empresa y cuántos están ganados, perdidos o estancados | Administrador |
| **Ingresos** | Cuántas veces entra cada persona, y en rojo quien dejó de ingresar | Administrador |
| **Satisfacción** | Encuesta de recomendación (0 a 10) y comentarios | Administrador; cada persona ve solo sus respuestas |
| **Errores reportados** | Lo que las personas reportan con el botón del bicho | Administrador; cada persona ve solo los suyos |

Arriba del panel hay cuatro tarjetas de resumen (estancados, personas en rojo, NPS y errores sin revisar) que llevan a cada
sección. En rojo aparece lo que pide atención. La pestaña "Uso y soporte" muestra un número cuando hay errores sin revisar.

## El administrador ve números, nunca datos de leads

Por RLS el administrador **no puede leer los leads** de un CRM (invariante 1). Por eso no los cuenta él: lo hacen dos funciones de
la base que solo responde al administrador y devuelven números.

- `admin_usage_by_company(días, plazo)`: por CRM, sus leads.
- `admin_user_activity(días)`: por persona, sus ingresos.

Otro perfil que las llame recibe un error de permiso; sin sesión, tampoco. Ninguna devuelve un nombre, correo o dato de un lead.

## Leads por CRM

- **Creados:** los que nacieron en el período elegido (por defecto, 30 días).
- **Abiertos, ganados y perdidos:** el estado de hoy de todos los leads del CRM. Abierto es todo lo que no está ganado ni perdido.
- **Estancado:** un lead abierto **sin ningún movimiento** en el plazo elegido (por defecto, 14 días). Cuenta como movimiento su
  creación, una edición, un contacto registrado o una actividad. Un lead antiguo con una llamada de hace dos días no está
  estancado.
- El período (7, 14, 30 o 90 días) y el plazo de estancado (7, 14 o 30) se eligen arriba y se recalculan al tiro.

Un lead anonimizado sigue contando: la anonimización conserva la operación (invariante 9).

## Ingresos

Cada ingreso queda en `login_events` (quién y cuándo, nada de lo que hizo). La app lo anota al entrar, con contraseña o al retomar
una sesión abierta.

- **Una visita, un ingreso:** si la persona ya ingresó en los últimos 30 minutos, no se suma otro.
- **El administrador no cuenta:** no trabaja dentro de un CRM.
- **Último ingreso:** el más reciente entre `login_events` y el último inicio de sesión que anotó Supabase Auth. Así quien entró
  antes de que existiera este registro no aparece como "nunca ingresó".
- **Se borra a los 13 meses:** una tarea diaria de la base (`purge_old_login_events`).

Estado de cada persona (el plazo, 7 días por defecto, se elige arriba: 7, 14 o 30):

| Estado | Cuándo | Color |
|---|---|---|
| Al día | Ingresó hace menos del plazo | Verde |
| **Dejó de ingresar** | No ingresa hace el plazo o más | **Rojo** |
| **Nunca ingresó** | Fue invitada hace más del plazo y nunca entró | **Rojo** |
| Recién invitado | Invitada hace menos del plazo: todavía no cuenta | Gris |
| Desactivado | Su usuario está desactivado: no se espera que ingrese | Gris |

La tabla pone primero a quienes están en rojo, y la casilla "Solo los que están en rojo" deja solo esas filas.

## Encuestas de satisfacción

Es la pregunta estándar de recomendación: *¿qué tan probable es que recomiendes Revela a otra empresa?*, de 0 a 10, con un
comentario opcional.

- **Cuándo aparece:** una tarjeta abajo, sin tapar el trabajo, a los 8 segundos de entrar. Solo si la persona lleva más de una
  semana en su CRM y no respondió en los últimos 30 días. Con "Ahora no" se vuelve a preguntar en 7 días.
- **Quién responde:** usuario base y gerente. No el administrador, ni la demo pública.
- **Una por día como máximo** (lo exige la base).
- **NPS:** el % de notas 9 y 10 (promotores) menos el % de notas 0 a 6 (detractores), de −100 a 100. Los 7 y 8 son pasivos.
  Verde desde 50, ámbar desde 0 y rojo bajo 0. Se puede filtrar por CRM.
- **Privacidad:** la gerencia **no** ve lo que responde su equipo. Solo la propia persona y el administrador.

## Errores reportados

El **botón del bicho** del encabezado abre un formulario: la persona cuenta qué pasó (de 10 a 2.000 caracteres) y el reporte llega
al panel del administrador. Junto al texto se adjunta la **pestaña** en que estaba (por ejemplo, "Pipeline") y su **navegador**.
Nunca la dirección completa ni datos de leads.

- **Estados:** nuevo → visto → resuelto. El administrador los cambia con botones; resuelto se puede reabrir. La base anota
  cuándo se resolvió.
- **Los resueltos se ocultan** por defecto; una casilla los muestra.
- **Sin envío en masa:** hasta 10 reportes por persona por hora.
- **Quién queda anotado:** cada cambio de estado deja su rastro en `change_log` con quién lo hizo.

## Datos personales (Ley 21.719)

Son datos de las **personas que usan Revela** (usuarios de los CRMs), no de los leads. Entran al registro de actividades de
tratamiento (`docs/LEY_21719.md` §7).

| Tabla | Datos | Finalidad | Conservación |
|---|---|---|---|
| `login_events` | Persona y fecha del ingreso | Saber si el cliente usa el producto y ayudarlo | 13 meses |
| `satisfaction_surveys` | Persona, nota y comentario | Mejorar el producto | Mientras dure el contrato |
| `bug_reports` | Persona, texto, pestaña y navegador | Corregir errores y dar soporte | Mientras dure el contrato |

La encuesta y el reporte piden **no escribir datos de clientes** en el texto. Si alguien lo hace igual, es un dato de un
tercero dentro de un comentario; conviene borrarlo al ver el reporte. La base legal prevista es el interés legítimo de operar y
mejorar el servicio (ver los pendientes legales: política de privacidad y contrato de encargo).

## En la demo y en desarrollo

- **Demo pública (`?demo`):** sin botón de errores ni encuesta; no guarda nada.
- **Desarrollo y pruebas (sin Supabase):** todo vive en memoria y el panel usa las **mismas reglas** que la base
  (`src/lib/usage.ts`). Con `?encuesta` en la dirección, la encuesta aparece al entrar (publicada, solo con Supabase).

## Dónde está en el código

| Pieza | Archivo |
|---|---|
| Reglas: estancado, ingresos, en rojo, NPS, cuándo preguntar | `src/lib/usage.ts` |
| Base de datos: tablas, funciones y RLS | `supabase/migrations/20261009000030_usage_surveys_bug_reports.sql` |
| Capa de datos de Supabase | `src/lib/db/usage.ts` |
| Panel del administrador | `src/components/UsageModule.tsx`, `src/lib/useUsageData.ts` |
| Encuesta y botón de errores | `src/components/SurveyPrompt.tsx`, `src/components/BugReportModal.tsx` |

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

- **`test:tenant`:** las reglas puras, con los mismos casos que la prueba de la base (deben dar los mismos números).
- **`test:supabase`:** traducción de filas, llamadas a la base y mensajes de error.
- **`test:db`:** contra la base real, deshaciéndolo todo:
  - el administrador ve los conteos por CRM y por persona; el gerente y quien no tiene sesión, no;
  - un ingreso se anota una vez por visita; nadie escribe ingresos a mano;
  - cada persona responde y reporta por sí misma, y no por otra ni en otro CRM;
  - la gerencia no ve las encuestas de su equipo, y quien reporta no marca su propio reporte;
  - el envío en masa se frena, y los ingresos de más de 13 meses se borran.
- **`test:e2e`:** la encuesta, el reporte, y el panel del administrador con sus números, sus filas en rojo y el cambio de estado.
