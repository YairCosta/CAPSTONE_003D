# 14. Evidencia de retrospectivas

> Versión formal en Word, con plantilla de gestión de proyectos: [06_Retrospectivas.docx](../Archivos%20Word%20y%20PDF/06_Retrospectivas.docx)

Qué salió mal, por qué y qué se cambió en el proceso en cada iteración. Se registran solo hechos que quedaron documentados
en el repositorio (`docs/BASE_DE_DATOS.md`, `docs/SEGURIDAD.md`, `docs/ASISTENTE_IA.md` y el historial de Git). Cada mejora
se incorporó al proceso o al código.

> **Nota de transparencia.** Las retrospectivas de las iteraciones 2 a 4 se redactaron el 01-10-2026 a partir del historial
> de Git y de los documentos del proyecto: los hechos y las mejoras son reales, pero no se registraron en una reunión al
> cierre de cada iteración. La iteración 1 reúne el trabajo previo al primer commit y no tiene retrospectiva propia. La
> iteración 5 se completa al cerrarla (06-10-2026).

## Retrospectiva de la Iteración 2 · 26-09-2026 (base de datos real)

| Qué pasó | Causa | Qué mejoró |
|---|---|---|
| Las **invitaciones de usuarios fallaban** al conectar con Supabase | Faltaban permisos de las tablas para la clave de servicio (`service_role`); la revisión local no lo podía ver | Migración 0016 y **regla nueva**: toda tabla lleva permisos explícitos para `authenticated` y `service_role`; además, el lint contra la base real se volvió parte del procedimiento |
| Un lead con solicitud del titular (25-09) se podía seguir moviendo | El bloqueo existía solo en pantalla | El bloqueo pasó a los *guards* y, después, a la base |
| El lint contra la base encontró un error que la revisión local no veía (la exportación) | Una función con una columna inexistente | Migración 0013 y **hábito nuevo**: después de aplicar una migración se corre `db lint` y `test:db` |

## Retrospectiva de la Iteración 3 · 27-09-2026 (publicación y seguridad)

| Qué pasó | Causa | Qué mejoró |
|---|---|---|
| La revisión de seguridad de la app publicada encontró hallazgos (B1–B11), el más grave: el asistente **no pedía sesión** y cualquiera en internet podía usar las claves del servidor | La API se diseñó primero para el desarrollo local | El asistente exige sesión de un CRM publicado; se agregó la CSP y las reglas por perfil en la base (migración 0022) |
| El ataque simulado contra la base real tuvo **12 fallas** | Reglas solo en la pantalla, no en la base | Las reglas pasaron a la base; la prueba de ataques quedó en `test:db` y terminó en 0 de 37 fallas |

## Retrospectiva de la Iteración 4 · 30-09-2026 (asistente con control de costo)

| Qué pasó | Causa | Qué mejoró |
|---|---|---|
| El registro de cambios de la base **no anotaba** los cambios hechos por el servidor | El trigger ignoraba las escrituras sin sesión de persona | El cambio de presupuesto y de clave pasó por funciones de la base que escriben el registro a nombre de quien lo hizo |
| Un campo de presupuesto **vacío se leía como 0** y habría apagado el asistente sin que nadie lo pidiera | `Number('')` es 0 | Validación corregida y cubierta por una prueba |
| Una sola clave de OpenAI servía a todas las empresas: la gerencia de cualquiera podía gastar la cuenta de otra | Diseño inicial con clave de la plataforma | **Cada empresa trae su clave**, cifrada en Vault (migración 0032) |
| Dudas sobre si las pruebas de seguridad realmente detectaban fallas | Las pruebas nuevas pasaron a la primera | **Pruebas de mutación a mano**: se rompió a propósito la protección y se comprobó que las pruebas fallaban |

## Retrospectiva de la Iteración 5 · 30-09-2026 (preparar el repositorio para evaluar)

| Qué pasó | Causa | Qué mejoró |
|---|---|---|
| Un escaneo previo a publicar encontró **capturas de pantalla con nombres y correos reales** de personas de la empresa piloto | Las capturas se generaron con datos del piloto en una versión anterior | Se regeneraron con la **demo pública (datos ficticios)** y se anonimizó el historial antes de subirlo |
| La **demo pública mostraba nombres de personas reales y el catálogo real** de la empresa piloto | Los datos de demostración se construyeron a partir de la empresa con la que se pilotea | Se reemplazaron por datos ficticios (otra empresa, otros productos y servicios, mismos precios para no alterar ningún cálculo), se verificó sobre la app compilada y en producción, y se agregó a las pruebas de fuga de contraseñas las vigentes |
| El generador de capturas seguía usando la marca antigua y un panel que la demo pública no tiene | Nadie lo había corrido desde el cambio de nombre | Se corrigió el generador y se verificó cada imagen a ojo antes de aceptarla |
| El repositorio de evaluación no mostraba el trabajo real | El código vivía en otro repositorio | Este repositorio recibe el historial completo de desarrollo y la documentación que pide el instructivo |

**Regla que queda:** antes de publicar algo nuevo se buscan claves y datos de personas reales, también en el historial, y
se revisan a mano las imágenes.

## Retrospectiva de cierre de la Iteración 5 · a completar el 06-10-2026

| ¿Qué salió bien? | ¿Qué no salió bien? | ¿Qué cambiaremos? |
|---|---|---|
|  |  |  |
