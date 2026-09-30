# 1. Documento de inicio de proyecto

**Proyecto:** Revela · **Autor:** Yair Hamir Costa Pérez · **Asignatura:** CAPSTONE (APT122), sección 003D, Duoc UC

## 1.1 Problema u oportunidad

Las empresas que venden a otras empresas en más de un país (por ejemplo, una empresa de servicios que opera en
Chile y en Perú) suelen llevar sus oportunidades de venta (*leads*) en planillas o en CRMs genéricos. Eso les deja
tres problemas concretos:

1. **No saben dónde se vende.** Un CRM genérico dice cuántos leads hay, pero no en qué comuna, distrito o municipio se
   cierran los negocios ni qué productos se venden en cada zona. Sin eso, el gerente decide dónde invertir a ojo.
2. **Operar en varios países es incómodo.** Cada país nombra sus zonas de otra manera (comuna, distrito, municipio,
   cantón…), usa su moneda y tiene su propio formato de datos; las planillas lo mezclan todo.
3. **Los datos personales son un riesgo legal.** En Chile, la Ley 21.719 (vigente desde el 01-12-2026) obliga a saber
   de dónde salió cada dato, respetar los derechos del titular (acceso, rectificación, supresión, oposición) y
   minimizar lo que se guarda. Una planilla no puede bloquear un lead mientras el titular reclama ni anonimizarlo.

**Oportunidad:** un CRM multiempresa que capture leads, los ubique en un mapa **por zona oficial** (sin guardar la
ubicación exacta de nadie), mida qué se vende y dónde, funcione en los 19 países de América Latina y cumpla la ley
de datos personales desde el diseño.

## 1.2 Objetivos del proyecto

**Objetivo general.** Desarrollar y publicar Revela, un CRM SaaS multiempresa con inteligencia geográfica, que permita a
equipos comerciales de América Latina capturar leads, ubicarlos por zona y medir qué se vende y dónde, cumpliendo la
normativa de protección de datos personales.

**Objetivos específicos.**

| # | Objetivo | Cómo se comprueba |
|---|---|---|
| OE1 | Gestionar el ciclo del lead (captura, pipeline de 7 etapas, bitácora de contactos, agenda) | Módulos Pipeline y Registro de contacto; pruebas `test:tenant` y `test:e2e` |
| OE2 | Ubicar cada lead en su zona oficial (14.489 zonas de 19 países) y mostrar KPI por zona | Módulo KPI y mapa; migraciones de zonas 0020, 0023–0028 |
| OE3 | Aislar por completo los datos de cada empresa (multiempresa) | RLS y triggers en la base; 257 pruebas `test:db`, incluidos ataques desde dentro |
| OE4 | Cumplir la Ley 21.719: origen del dato, derechos del titular, anonimización, portal fiscalizador | `docs/LEY_21719.md`, expediente en `docs/cumplimiento/` |
| OE5 | Incorporar un asistente de IA útil pero acotado (no borra; presupuesto mensual; clave de cada empresa) | `docs/ASISTENTE_IA.md`, `test:ai` (48 pruebas) |
| OE6 | Publicar la aplicación, medir su calidad y dejarla portable | Vercel, Docker, `test:vercel`, `test:rendimiento` |

## 1.3 Usuarios y stakeholders

| Perfil | Qué hace |
|---|---|
| **Usuario base** (vendedor) | Captura y contacta leads; solo puede avanzar un lead en el pipeline |
| **Gerente** | Todo lo anterior, más KPI, catálogo, usuarios de su empresa, países y divisas, auditoría (con reversión) y resolución de solicitudes del titular |
| **Administrador de plataforma** | Crea y suspende empresas (CRMs), administra sus usuarios, exporta datos y ve el uso de la plataforma solo como números, nunca datos de leads |
| **Empresa piloto** | Empresa de servicios de Chile y Perú que usa Revela en producción (stakeholder; no integrante del equipo) |
| **Docente CAPSTONE** | Evalúa el proyecto |

## 1.4 Alcance del MVP

**Incluido (construido y desplegado):** captura de leads con origen y base del dato; pipeline; registro de contacto y
agenda; KPI y mapa por zonas; catálogo de productos y servicios con precios por país; multipaís y multimoneda;
usuarios y roles; auditoría con reversión; derechos del titular; exportación a Excel; panel de uso y soporte para la
plataforma; asistente de IA con presupuesto y clave por empresa; demo pública con datos ficticios.

**Fuera del MVP (decisión consciente):** pasarela de pago y alta de clientes en línea (diseño en `docs/PAGOS.md`),
página de aterrizaje comercial, aplicación móvil y política de privacidad revisada por un abogado.

## 1.5 Restricciones

- **Equipo:** un solo desarrollador, con el tiempo de un semestre.
- **Legales:** Ley 19.628 modificada por la Ley 21.719; un lead se ubica por zona y **nunca por coordenada**.
- **Costos:** servicios en planes gratuitos o de bajo costo (Supabase, Vercel); el gasto del asistente de IA lo paga cada
  empresa con su propia clave de OpenAI y se limita con un presupuesto mensual.
- **Técnicas:** la base de datos vive en Supabase (PostgreSQL con PostGIS); los cambios en ella siguen un procedimiento
  estricto (migraciones nuevas, nunca editar las aplicadas).

## 1.6 Justificación de la solución

La solución se justifica por (a) el problema real de una empresa que hoy opera en dos países, (b) la obligación legal
que entra en vigencia el 01-12-2026 y que un CRM genérico no resuelve, y (c) el aporte diferencial descrito en
[13-Innovacion.md](13-Innovacion.md). Las decisiones técnicas (React + Supabase + funciones serverless) y sus
alternativas están en [07-Arquitectura.md](07-Arquitectura.md).
