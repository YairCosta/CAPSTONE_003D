# Autorrevisión del auditor

Revisión del propio trabajo de auditoría, según `checklists/auditor-self-review.md` de la skill
`compliance-chile-guardian`. Se conserva lo favorable y lo desfavorable.

## Checklist

| Punto | Estado | Detalle |
|---|---|---|
| Autoridad, repositorio, rama, ambiente y base confirmados | ✅ | Dueño del proyecto; repositorio local; rama `main`; **solo desarrollo**; sin base desplegada |
| Cambios preexistentes identificados y preservados | ✅ | Trabajo previo en commits `468dc0f`, `bfe0344` y `528898d`; nada reescrito |
| Hallazgo reproducido antes de remediar | ⚠️ Parcial | Los hallazgos se verificaron leyendo el código y probando la app; **no hay runtime desplegado** que observar |
| Reversa definida antes del cambio | ✅ | Git: cada bloque en su propio commit, revertible |
| Fixtures sintéticos; ningún secreto ni dato personal copiado | ✅ | Todos los datos del CRM son ficticios; el expediente no contiene datos personales |
| Diff revisado semánticamente, incluidos reemplazos automatizados | ⚠️ Parcial | Se detectó y corrigió un reemplazo automatizado que agregó props a tres componentes en vez de uno |
| Build limpio ejecutado desde la fuente modificada | ✅ | `npx tsc -b`, `npm run lint` y `npm run build` sin errores |
| Pruebas relevantes ejecutadas y fallos conservados | ✅ | 51 aislamiento · 7 exportación · 38 migraciones · 102 punta a punta. Fallos intermedios registrados abajo |
| Migración generada para el proveedor real después del build | ❌ **Pendiente** | Los campos nuevos existen solo en la aplicación; falta la migración SQL |
| Clon no productivo y reversa probados antes de producción | ❌ No aplica aún | No hay producción |
| Release desplegado identificado y configuración confirmada | ❌ No aplica aún | Sin despliegue |
| Runtime y caso E2E observados después del despliegue | ⚠️ Parcial | E2E observado en desarrollo, no sobre un release desplegado |
| Cambio, actor, aprobación, hashes y evidencia registrados | ✅ | Commits firmados por autor, manifiesto SHA-256 en `expedienteCumplimiento.json` |
| La remediación no creó filtraciones, falsos éxitos ni claims exagerados | ✅ | Verificado: el portal fiscalizador no expone datos personales y ningún control se declara probado |

## Hallazgo sobre el propio trabajo del auditor

**AC-01 · El flujo de derechos quedó fuera del alcance de quien atiende al titular.**
La primera versión puso el botón de solicitud en **Gerencia → Contactos**, un módulo que el usuario
base no ve (`src/lib/permissions.ts`: `agent: ['kanban', 'contact']`). En la práctica, quien habla
con la persona no podía registrar lo que ésta pedía.

**Corregido el 24-09-2026:** la solicitud se registra desde **Registro de contacto**, que es el
módulo del usuario base; la resolución sigue siendo exclusiva del gerente. Verificado con la
prueba punta a punta "El usuario base registra la solicitud del titular".

## Fallos intermedios conservados

1. **La tabla de Contactos desbordó el ancho a 1024 px** al agregar los botones nuevos
   (1059 px contra 974 disponibles). Corregido reduciendo relleno y ancho de la dirección.
2. **El lead bloqueado seguía apareciendo en el selector de Registro de contacto.** Detectado por
   la prueba punta a punta y corregido filtrando por `canContact`.
3. **La prueba de la contraseña dejó la sesión abierta** y rompió la sección siguiente; corregido
   con un cierre de sesión explícito.

Ninguno llegó a quedar en el producto: los tres se detectaron con las pruebas antes del commit.

## Limitaciones que persisten

- Sin ambiente productivo, **ningún control puede pasar a `PROBADO_CON_EVIDENCIA_VIGENTE`**.
- La consulta al texto oficial de la BCN falló el 23-09-2026 (`legal-status.md`); las afirmaciones
  marcadas `TEXTUAL_MANDATE` deben cotejarse antes de usarse ante un tercero.
- No hay snapshot con hash de las fuentes legales: no existe lock append-only de la norma.
- La decisión sobre bases de licitud, EIPD, geolocalización y contratos **requiere abogado**.

## Revisión del 25-09-2026: nuevos hallazgos sobre el propio trabajo

Esta sección se agrega; lo anterior se conserva tal como se escribió.

**AC-02 · El bloqueo del art. 8 ter se declaró implementado y solo existía en pantalla.**
La matriz lo marcó `CODIGO_NO_DESPLEGADO` con evidencia de pruebas, pero esas pruebas solo miraban
la interfaz. Una sonda directa contra los guards mostró que un lead bloqueado se podía editar y
registrar contactos con él, y en la app se lo pudo avanzar en el Pipeline. Es exactamente el error
que advierte la skill: filtrar una lista no reemplaza la regla del lado del servidor.
**Corregido:** regla en `tenantGuards.ts` y prueba unitaria contra el guard, no contra la pantalla.

**AC-03 · Anonimizar no alcanzaba al historial ni a la bitácora.**
La auditoría guardaba valores personales anteriores y el estado para revertir; la bitácora
conservaba con quién se habló y qué se dijo; el lead conservaba sus coordenadas exactas.
**Corregido** con la opción A, decidida por el responsable: el historial nunca guarda valores
personales.

**AC-04 · Revertir restauraba el consentimiento anterior.** Detectado por una prueba nueva al
corregir AC-03. **Corregido:** revertir conserva siempre el estado de privacidad actual.

**Lección:** una prueba que pasa por la pantalla no demuestra una regla. Cada control del expediente
debe tener al menos una prueba directa contra el guard.

## Aplicación en la base real (25-09-2026)

**Migración generada para el proveedor real y aplicada:** ✅ Las 14 migraciones quedaron aplicadas en
el proyecto de Supabase (región São Paulo). El punto que seguía pendiente de la checklist se cierra
para la base; la app todavía no la usa.

**Prueba operacional en destino no productivo:** la base es la futura productiva, pero al momento de
la prueba **no tenía datos ni usuarios reales**. Las 25 pruebas se ejecutan dentro de una transacción
que se deshace al final, y se verificó que la base quedó vacía (0 CRMs, 0 leads, 0 usuarios).

**AC-05 · Hallazgo sobre trabajo anterior:** el lint contra la base encontró que
`export_tenant_snapshot()` (0006) leía columnas eliminadas en 0007. Ninguna prueba local podía verlo.
Corregido en 0013, que además agrega `lead_contacts` y `lead_privacy_requests` a la exportación.

**Evidencia:** `evidence/prueba-base-supabase-2026-09-25.txt` (25/25). Antes de aplicar 0013 y 0014,
la misma prueba dio 23/25, y fallaron justamente los dos puntos que esas migraciones corrigen, lo que
demuestra que las pruebas detectan el problema.
