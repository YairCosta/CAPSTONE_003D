# 2. Metodología de trabajo

> Versión formal en Word, con plantilla de gestión de proyectos: [01_Metodologia_Declarada_y_Justificada.docx](../Archivos%20Word%20y%20PDF/01_Metodologia_Declarada_y_Justificada.docx)

**Metodología declarada: marco ágil, en su variante Kanban/Scrumban, adaptada a un equipo de una persona.**

## 2.1 Por qué esta metodología y no cascada

| Situación del proyecto | Consecuencia |
|---|---|
| Los requisitos cambiaron durante el desarrollo (entró en juego la Ley 21.719, el cliente pidió más países y control del gasto de IA) | Un plan cerrado de requisitos habría quedado obsoleto; el backlog se repriorizó en cada iteración |
| Hay un cliente piloto que usa el producto en producción | Conviene entregar incrementos pequeños y verificados, no una sola entrega al final |
| Cada `push` a la rama principal publica la aplicación (Vercel) | Integración y entrega continuas: cada cambio debe dejar la app funcionando |
| Un solo desarrollador | Un tablero Kanban con límite de trabajo en curso basta; no hay equipo que coordinar con reuniones diarias |

## 2.1b Alternativas evaluadas

| Criterio | Cascada | Scrum | Kanban | Scrumban (elegida) |
|---|---|---|---|---|
| Admite requisitos que cambian | No | Sí | Sí | Sí |
| Funciona con una sola persona | Sí | No | Sí | Sí |
| Permite entregar incrementos al cliente piloto | No | Sí | Sí | Sí |
| Deja artefactos de trazabilidad (visión, backlog, DoD, retrospectivas) | Parcial | Sí | Parcial | Sí |
| Carga de ceremonias para una persona | Baja | Alta | Baja | Baja |

**Decisión.** Cascada exige cerrar los requisitos al inicio y los de este proyecto cambiaron. Scrum puro define tres roles y
varias reuniones pensados para un equipo; con una persona se vuelven un trámite. Kanban solo se queda corto en
trazabilidad. Scrumban toma el flujo y el límite de trabajo en curso de Kanban, y los artefactos y la mejora continua de Scrum.

## 2.2 Cómo se aplica

- **Roles (todos los ejerce el mismo integrante):** Product Owner (prioriza el backlog), desarrollador y responsable de
  calidad. Se declara así para no aparentar un equipo que no existe.
- **Iteraciones cortas (de 1 a 3 días)** que terminan con algo publicado. La historia de cada una está en
  [05-Sprint-Backlog.md](05-Sprint-Backlog.md), reconstruida desde los commits reales.
- **Product Backlog** priorizado con historias de usuario: [04-Product-Backlog.md](04-Product-Backlog.md).
- **Tablero:** el backlog marca cada historia como *Hecho*, *En curso* o *Pendiente*; se trabaja una cosa grande a la vez.
- **Definition of Done** explícita y verificable: [06-Definition-of-Done.md](06-Definition-of-Done.md).
- **Retrospectiva al cerrar cada iteración**, con las mejoras que se incorporaron al proceso:
  [14-Retrospectivas.md](14-Retrospectivas.md).
- **Pruebas en cada iteración**, no al final: [11-Plan-de-pruebas.md](11-Plan-de-pruebas.md).
- **Control de versiones:** Git en GitHub; un commit por bloque de trabajo terminado, con un mensaje que explica el
  cambio.

## 2.3 Qué se adaptó respecto de Scrum

No hay reunión diaria, revisión con el cliente por iteración ni estimación en puntos: con un solo integrante no
aportan. Se conservaron los artefactos que sí dan trazabilidad (visión, backlog, sprint backlog, definición de hecho y
retrospectivas) y las prácticas de calidad (pruebas automáticas y despliegue continuo).

## 2.4 Riesgos de la metodología y cómo se mitigan

| Riesgo | Mitigación |
|---|---|
| Sin pares, nadie revisa el código | Pruebas automáticas (727 comprobaciones entre todas las suites), revisión de seguridad por casos de uso y pruebas de ataque contra la base real |
| El alcance crece sin control | El backlog deja explícito lo que queda fuera del MVP |
| Decisiones sin respaldo | Cada decisión relevante queda escrita en `docs/` (base de datos, seguridad, asistente de IA, despliegue) |

## 2.5 Nota de transparencia

El Sprint Backlog se reconstruyó desde el historial real de Git y las retrospectivas de las iteraciones 2 a 4 se redactaron
el 01-10-2026 a partir de ese historial y de los documentos del proyecto: los hechos y las mejoras son reales, pero no se
registraron en una reunión al cierre de cada iteración. Desde la iteración 5 la retrospectiva se registra al cerrarla.
