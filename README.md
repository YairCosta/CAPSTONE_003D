# Revela

**CRM SaaS multiempresa con inteligencia geográfica.** Captura leads, los ubica en un mapa por zona oficial (comuna,
distrito, municipio, cantón…), mide qué se vende y dónde, y opera en los 19 países de América Latina cumpliendo la Ley
21.719 de protección de datos personales.

Proyecto CAPSTONE (APT122), Ingeniería en Informática, Duoc UC, sección PTY4614-003 (003D).

- **Aplicación publicada:** <https://revela-henna.vercel.app>
- **Demo pública, sin cuenta ni contraseña** (datos ficticios que se borran al recargar): <https://revela-henna.vercel.app/?demo>

## Descripción

**Qué hace.** Cada empresa tiene su propio CRM, y los datos nunca se mezclan entre empresas.

- **KPI y mapa:** leads ubicados por su zona oficial (14.489 zonas de 19 países), zonas coloreadas por dinero ganado o por
  cierres, y ranking de zonas y de productos. El mapa muestra zonas, nunca la ubicación exacta de un lead.
- **Pipeline:** tablero por etapas, del lead nuevo hasta ganado o descartado.
- **Registro de contacto y agenda:** bitácora de cada interacción y calendario de seguimientos.
- **Gerencia:** empresas cliente, contactos, catálogo de productos y servicios (con precios por país), usuarios, países y divisas.
- **Auditoría:** historial de cambios que solo se agrega, con reversión.
- **Derechos del titular:** solicitudes de acceso, rectificación, supresión y oposición, con el lead bloqueado mientras se resuelven.
- **Administración de la plataforma:** crear y suspender empresas, exportar sus datos y ver el uso solo como números.
- **Asistente de IA:** busca empresas y registra leads con lenguaje natural, sin poder borrar nada; con presupuesto mensual y la clave de OpenAI de cada empresa.

**A quién va dirigido.** A equipos comerciales de empresas B2B que venden en uno o varios países de América Latina: vendedores,
gerentes comerciales y quienes operan la plataforma.

**Qué problema resuelve.** Las empresas no saben *dónde* cierran sus negocios ni qué productos rinden en cada zona, y llevar los
datos personales de sus leads en planillas es incompatible con la Ley 21.719 (vigente desde el 01-12-2026). Ver
[`Fase 2/…/01-Documento-de-inicio-de-proyecto.md`](Fase%202/Evidencias%20Proyecto/Evidencias%20de%20documentación/Archivos%20.md/01-Documento-de-inicio-de-proyecto.md).

## Tecnologías

| Capa | Herramientas |
|---|---|
| Lenguajes | TypeScript, SQL (PostgreSQL / PL/pgSQL), JavaScript (scripts), HTML y CSS |
| Interfaz | React 19, Vite, Tailwind CSS v4, Leaflet (mapa), Lucide (íconos) |
| Servidor (API) | Node.js 22, función serverless de Vercel; el mismo manejador corre en Vite (desarrollo) y en Docker |
| Base de datos | PostgreSQL 17 + PostGIS en Supabase: RLS, triggers, funciones, tareas programadas y Vault (secretos cifrados) |
| Autenticación | Supabase Auth |
| Cloud y despliegue | Vercel (publicación continua desde GitHub), Supabase (São Paulo), Docker y Docker Compose |
| Servicios externos | OpenAI GPT (asistente de IA), Google Places (opcional), Banco Central de Chile y open.er-api (tipos de cambio), mapas base de Esri, límites oficiales de BCN (Chile), INEI (Perú) y geoBoundaries |
| Pruebas | Scripts de Node con `--experimental-strip-types`, Puppeteer y Chrome, parser de PostgreSQL (`libpg-query`), Supabase CLI |

## Cómo ejecutarlo localmente

### Con Node (desarrollo)

```bash
npm ci
npm run dev
```

Abre <http://localhost:5173/?demo>. Sin configurar nada arranca la **demo**: datos ficticios en memoria, sin base de datos
ni claves. Requiere Node.js 22.

### Con Docker

```bash
docker compose up --build
```

Abre <http://localhost:8080/?demo>. Para conectar una base de Supabase propia, copia `.env.example` como `.env` y completa los
valores. Detalle, variables de entorno, publicación en Vercel y procedimiento de la base de datos en el
[Manual técnico](Fase%202/Evidencias%20Proyecto/Evidencias%20de%20documentación/Archivos%20.md/12-Manual-tecnico-y-despliegue.md).

### Pruebas

```bash
npx tsc -b && npm run lint
npm run test:tenant && npm run test:export && npm run test:ai && npm run test:supabase && npm run test:sql
npm run build && npm run test:bundle && npm run test:vercel
npm run dev            # en otra terminal
npm run test:e2e
npm run test:rendimiento
```

Son 727 comprobaciones automáticas más 6 mediciones de rendimiento; `npm run test:db` además prueba la base real de Supabase
(requiere acceso al proyecto). Ver el [Plan de pruebas](Fase%202/Evidencias%20Proyecto/Evidencias%20de%20documentación/Archivos%20.md/11-Plan-de-pruebas.md).

## Integrantes y roles

| Integrante | Rol |
|---|---|
| **Yair Hamir Costa Pérez** | Único integrante del equipo: Product Owner, desarrollo full-stack, base de datos, seguridad, pruebas y documentación |

Ingresó a la sección cuando los equipos ya estaban conformados, por lo que desarrolla el proyecto de forma individual. El
proyecto se pilotea con una empresa de servicios de Chile y Perú, que participa como usuaria (no es integrante del equipo).

## Metodología de trabajo

**Ágil, en su variante Kanban/Scrumban, adaptada a un equipo de una persona:** iteraciones cortas (1 a 3 días) que terminan con algo
publicado, Product Backlog priorizado con historias de usuario, Definition of Done verificable, retrospectiva al cerrar cada
iteración y pruebas automáticas en cada una. Cada `push` a la rama principal publica la aplicación. Justificación y
artefactos en [02-Metodologia.md](Fase%202/Evidencias%20Proyecto/Evidencias%20de%20documentación/Archivos%20.md/02-Metodologia.md).

## Arquitectura de la solución

Una aplicación React (archivos estáticos en Vercel) que habla **directo con Supabase** con la sesión de cada persona —la
seguridad la imponen RLS y triggers en la base— y con una **única función `/api`** para lo que no puede hacer el navegador:
verificar sesiones, invitar usuarios, hacer de proxy del asistente de IA (con la clave de OpenAI de cada empresa, cifrada en
Vault) y consultar tipos de cambio. La clave secreta de Supabase vive solo en ese servidor.

![Arquitectura de Revela](docs/diagramas/arquitectura-revela.png)

Componentes, comunicación entre servicios y decisiones de arquitectura en
[07-Arquitectura.md](Fase%202/Evidencias%20Proyecto/Evidencias%20de%20documentación/Archivos%20.md/07-Arquitectura.md).

## Estructura del repositorio

```text
.
├─ src/                  Interfaz (React + TypeScript) y lógica de negocio pura (src/lib)
├─ server/               API: asistente de IA, tipos de cambio, invitaciones (Vercel y Docker)
├─ supabase/migrations/  Esquema de la base de datos (32 migraciones)
├─ scripts/              Pruebas automáticas y generadores de evidencia
├─ datos/zonas/          Zonas oficiales procesadas
├─ docs/                 Documentación técnica (base de datos, seguridad, IA, Ley 21.719, BPMN, despliegue…)
├─ Dockerfile, docker-compose.yml
├─ Fase 1/               Evidencias de la Fase 1 (individuales y grupales)
└─ Fase 2/               Evidencias del proyecto: documentación y evidencias de sistema
```

## Documentación

La documentación de la asignatura está en [`Fase 2/Evidencias Proyecto/Evidencias de documentación`](Fase%202/Evidencias%20Proyecto/Evidencias%20de%20documentación/LEEME.md), en dos carpetas según el formato:

- **[Archivos Word](Fase%202/Evidencias%20Proyecto/Evidencias%20de%20documentación/Archivos%20Word/):** los entregables formales, con plantilla de gestión de proyectos (acta de inicio, metodología, Product Vision, Product Backlog, Sprint Backlog, Definition of Done y retrospectivas). Se van agregando a medida que se piden.
- **[Archivos .md](Fase%202/Evidencias%20Proyecto/Evidencias%20de%20documentación/Archivos%20.md/):** la fuente en Markdown, legible directo en GitHub: inicio de proyecto, metodología, backlog, arquitectura, modelo de datos, UML, requisitos no funcionales, pruebas, manual técnico, innovación y retrospectivas ([índice](Fase%202/Evidencias%20Proyecto/Evidencias%20de%20documentación/Archivos%20.md/00-Indice.md)).
- Documentación técnica de fondo: [`docs/`](docs/) (base de datos, seguridad, asistente de IA, Ley 21.719, procesos BPMN, despliegue).

## Estado

Publicada en Vercel y conectada a Supabase, en piloto con una empresa real. Pasó una revisión de seguridad por casos de uso el
27-09-2026 ([`docs/SEGURIDAD.md`](docs/SEGURIDAD.md) §5). La demo pública se abre sin contraseña con `?demo`.

> Este repositorio es la copia de evaluación del proyecto: incluye el historial de desarrollo, con los datos de la empresa
> piloto reemplazados por datos de demostración.
