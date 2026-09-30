# Gate normativo

Registro de las fuentes consultadas y de su estado. **No reemplaza el texto oficial**: si hay
diferencia, manda el texto consolidado vigente a la fecha de los hechos.

## Consultas realizadas

| Fecha y hora (UTC) | Fuente | Resultado | Estado |
|---|---|---|---|
| 2026-09-23 | Búsqueda web sobre vigencia y obligaciones de la Ley 21.719 | Publicación 13-12-2024; vigencia general 01-12-2026; multas hasta 20.000 UTM o 4 % de los ingresos anuales | Consultado |
| 2026-09-23 | [BCN, Ley 21.719](https://www.bcn.cl/leychile/navegar?idNorma=1209272) (texto oficial) | **La página no cargó: tiempo de espera agotado** | `NO_VERIFICABLE` |
| 2026-09-23 | Búsqueda sobre el proyecto que posterga la vigencia | Boletín 18.623-07, ingresado a comienzos de septiembre de 2026, propone postergar al 01-12-2027; en primer trámite en el Senado | `proposed` |
| 2026-09-24 | Paquete de la Skill `compliance-chile-guardian` (`references/legal-status.md`, corte 2026-09-23) | Coincide con lo anterior y agrega: Ley 21.755 (11-07-2025) art. 31; Ley 21.806 (05-02-2026) art. 54; **DS 662 publicado el 09-09-2026** sobre Modelos de Prevención de Infracciones | Baseline empaquetado |

## Estado de cada norma al corte

| Norma | Estado | Efecto para Revela |
|---|---|---|
| Ley 19.628 (texto vigente hoy) | `effective` | Obligaciones actualmente exigibles |
| Ley 21.719 (modifica la 19.628) | `enacted_not_effective` | Vigencia general **01-12-2026**: se planifica para esa fecha |
| Ley 21.755 art. 31 | `effective` | Plazo especial del reglamento del art. 26 |
| Ley 21.806 art. 54 | `effective` | Reglas de la primera designación del Consejo de la Agencia |
| DS 662 (09-09-2026) | `effective` | Regula el MPI, que es voluntario; Revela no lo ha adoptado |
| Boletín 18.623-07 | `proposed` | **No se activa.** La planificación sigue con el 01-12-2026 |

## Limitaciones declaradas

1. **No se pudo abrir el texto oficial consolidado** en la sesión del 2026-09-23. Toda afirmación
   sobre el contenido literal de un artículo queda como `DERIVED_CONTROL` o
   `PENDING_AUTHORITY_RULE`, salvo las marcadas `TEXTUAL_MANDATE`, que deben cotejarse con la BCN
   antes de usarse en una presentación o ante un tercero.
2. **No se conservaron los bytes** de las fuentes (sin snapshot con hash), así que no hay lock
   append-only. Es una limitación del expediente, no un cumplimiento acreditado.
3. **La Agencia aún no dicta instrucciones** conocidas sobre modalidades de autenticación del
   artículo 11. Ese punto queda `PENDING_AUTHORITY_RULE`.
4. La antigüedad operacional máxima que recomienda la Skill es de 168 horas: **repetir este gate
   antes de cualquier conclusión material posterior al 2026-10-01**.

## Regla de transición aplicada

- Lo exigible **hoy** se mide contra la Ley 19.628 vigente.
- Lo que entra en vigencia el 01-12-2026 se trata como preparación, no como incumplimiento actual.
- El Boletín 18.623-07 no se considera derecho vigente.
- Ninguna obligación futura se describe en este expediente como sancionable hoy.
