# 5. Sprint Backlog (iteraciones)

Qué se desarrolló en cada iteración, reconstruido desde el historial real de Git (`git log`). Cada fila es un commit.

> **Nota de trazabilidad.** El repositorio de código se inició el 23-09-2026 con un primer commit que trae el producto
> ya desarrollado en local (entonces llamado GeoCRM). Por eso la Iteración 1 concentra ese trabajo previo. Desde ahí, el
> historial refleja el desarrollo día a día.

## Iteración 1 · 23-09-2026 · Producto base, marca y cumplimiento

**Meta:** tener un CRM multiempresa funcionando con demo y con la base legal resuelta.

| Fecha | Commit | Historias |
|---|---|---|
| 23-09 | GeoCRM: CRM multi-tenant con inteligencia geográfica | HU-01…HU-08, HU-10 |
| 23-09 | Renombra el producto de GeoCRM a Revela | — |
| 23-09 | Cuenta demo pública, logo propio y cambio de contraseña | HU-15 |
| 23-09 | Derechos del titular en el producto y expediente de cumplimiento (Ley 21.719) | HU-09 |
| 23-09 | Separación de funciones en derechos y portal fiscalizador | HU-09 |

## Iteración 2 · 25-26-09-2026 · Base de datos real y conexión por etapas

**Meta:** pasar de datos en memoria a una base PostgreSQL real con seguridad por empresa.

| Fecha | Commit | Historias |
|---|---|---|
| 25-09 | Base del dato obligatoria, plazo de prospectos y asistente limitado a empresas | HU-01, HU-12 |
| 25-09 | Bloqueo en los guards y auditoría sin datos personales | HU-08, HU-09 |
| 25-09 | Asistente de IA con GPT (OpenAI) como proveedor alternativo | HU-12 |
| 25-09 | Base de datos en Supabase: migraciones aplicadas y reglas de privacidad en la base | HU-05 |
| 25-09 | Conexión con Supabase, etapa 1: login real, CRMs e invitaciones | HU-07, HU-10 |
| 26-09 | Conexión con Supabase, etapa 2: equipo del gerente y auditoría en la base | HU-07, HU-08 |
| 26-09 | Permisos de tablas para service_role: las invitaciones fallaban (migración 0016) | HU-07 |
| 26-09 | Conexión con Supabase, etapa 3: el trabajo diario del CRM en la base | HU-01…HU-06 |
| 26-09 | Conexión con Supabase, etapas 4 y 5: etapas del pipeline y exportación | HU-02, HU-10 |
| 26-09 | Mapa por zonas y sin coordenadas de los leads (minimización, H-12) | HU-04 |

## Iteración 3 · 27-09-2026 · Zonas oficiales, publicación, seguridad y región

**Meta:** publicar la aplicación y abrirla a los 19 países de América Latina.

| Fecha | Commit | Historias |
|---|---|---|
| 27-09 | Zonas oficiales de Chile y Perú, agrupadas por región | HU-04 |
| 27-09 | Limpieza antes de publicar: sin coordenadas en la base, mapa liviano y sin CRMs de prueba | HU-04 |
| 27-09 | Publicación en Vercel: la API como función empaquetada y pruebas del despliegue | HU-16 |
| 27-09 | Revisión de seguridad de la app publicada: reglas por perfil en la base, asistente con sesión y CSP | HU-05, HU-12 |
| 27-09 | Procesos de Revela en BPMN 2.0: cinco diagramas editables y su explicación | (documentación) |
| 27-09 | América Latina: la gerencia elige sus países y cada uno trae sus zonas oficiales | HU-11 |
| 27-09 | Divisas para ver el CRM: la gerencia suma las monedas de sus países activos | HU-11 |
| 27-09 | Demo pública sin contraseñas (?demo) y diagramas BPMN sin textos tapados | HU-15 |

## Iteración 4 · 28-30-09-2026 · Rendimiento, soporte y asistente de IA con control de costo

**Meta:** dejar la aplicación liviana, con soporte para la plataforma y con el costo de la IA bajo control.

| Fecha | Commit | Historias |
|---|---|---|
| 28-09 | BPMN en PNG a 4x, con títulos claros y versión para diapositivas | (documentación) |
| 28-09 | Carga por partes: la app baja al entrar 190 KB de código propio en vez de 1 MB | RNF de rendimiento |
| 28-09 | Catálogo: precio sugerido en gris, convertido desde el primer país con precio | HU-06, HU-11 |
| 29-09 | Uso y soporte: panel del administrador, encuesta de satisfacción y reporte de errores | HU-14 |
| 30-09 | Asistente con GPT: modelo más barato y presupuesto mensual por CRM (US$30) que ajusta la gerencia | HU-13 |
| 30-09 | Gemini apagado: el asistente usa solo GPT | HU-12 |
| 30-09 | La clave de OpenAI es de cada CRM: la gerencia la pega en el chat y se guarda cifrada en Vault | HU-13 |
| 30-09 | Demo pública genérica: sin nombres, productos ni servicios de la empresa piloto | HU-15 |
| 30-09 | Pruebas de fuga de contraseñas: incluyen las contraseñas de desarrollo vigentes | (calidad) |
| 30-09 | Evidencias regeneradas con la demo pública de Revela | (documentación) |

## Iteración 5 · 30-09 al 06-10-2026 · Evidencias para la evaluación

**Meta:** dejar el repositorio listo para evaluar (este repositorio): README, documentación del instructivo, Docker y
prueba de rendimiento.

| Entregable | Estado |
|---|---|
| README con los 7 elementos y estructura de carpetas de la asignatura | Hecho |
| Documentación obligatoria (arquitectura, modelo de datos, UML, requisitos no funcionales, pruebas, innovación) | Hecho |
| `Dockerfile` y `docker-compose.yml` | Hecho (la imagen no se construyó en el equipo de desarrollo: ver Manual técnico) |
| Prueba de rendimiento (`npm run test:rendimiento`) | Hecho |
| Evidencias individuales y grupales de la Fase 1 | En curso |
