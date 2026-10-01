# 4. Product Backlog priorizado

> Versión formal en Word, con plantilla de gestión de proyectos: [03_Product_Backlog.docx](../Archivos%20Word/03_Product_Backlog.docx)

Historias de usuario ordenadas por prioridad (P1 = imprescindible para el MVP). **Estado** a la fecha de la entrega
(30-09-2026). La columna *Evidencia* dice dónde comprobarlo.

| ID | Historia de usuario | Prio. | Estado | Evidencia |
|---|---|---|---|---|
| HU-01 | Como **vendedor** quiero capturar un lead con su origen y la base del dato, para registrarlo sin infringir la ley | P1 | Hecho | Módulo *Capturar lead*; `docs/LEY_21719.md` |
| HU-02 | Como **vendedor** quiero mover un lead por las etapas del pipeline (solo avanzar), para reflejar cómo va el negocio | P1 | Hecho | *Pipeline*; `test:tenant`, `test:db` (regla en la base) |
| HU-03 | Como **vendedor** quiero registrar cada contacto y programar el siguiente seguimiento, para no perder oportunidades | P1 | Hecho | *Registro de contacto* y agenda; `docs/CONTACTOS.md`, `docs/AGENDA.md` |
| HU-04 | Como **gerente** quiero ver en un mapa qué zonas rinden más, para decidir dónde invertir | P1 | Hecho | *KPI y mapa*; `docs/MULTIPAIS.md` |
| HU-05 | Como **empresa** quiero que mis datos nunca se mezclen con los de otra, para confiar en el sistema | P1 | Hecho | RLS y triggers; 257 pruebas `test:db` |
| HU-06 | Como **gerente** quiero administrar el catálogo de productos y servicios con precios por país, para medir qué se vende | P1 | Hecho | *Gerencia → Catálogo*; `docs/CATALOGO.md` |
| HU-07 | Como **gerente** quiero administrar los usuarios de mi empresa, para dar y quitar accesos | P1 | Hecho | *Gerencia → Usuarios*; `docs/USUARIOS.md` |
| HU-08 | Como **gerente** quiero ver el historial de cambios y revertir uno, para corregir errores con trazabilidad | P1 | Hecho | *Auditoría*; `docs/AUDITORIA.md` |
| HU-09 | Como **titular de datos** quiero pedir acceso, rectificación, supresión u oposición, para ejercer mis derechos | P1 | Hecho | Solicitudes del titular; bloqueo del lead en los guards; `docs/LEY_21719.md` |
| HU-10 | Como **administrador de la plataforma** quiero crear, suspender y exportar CRMs, para operar varios clientes | P1 | Hecho | *Administración*; `docs/EXPORTACION.md` |
| HU-11 | Como **gerente** quiero activar los países donde trabaja mi empresa y ver montos en varias monedas, para operar en la región | P2 | Hecho | *Países y divisas*; `docs/MULTIPAIS.md`, `docs/MONEDAS.md` |
| HU-12 | Como **vendedor** quiero que un asistente busque empresas y registre leads por mí, para ahorrar tiempo | P2 | Hecho | Chat del asistente; `docs/ASISTENTE_IA.md` |
| HU-13 | Como **gerente** quiero limitar el gasto mensual del asistente y usar la clave de OpenAI de mi empresa, para controlar el costo | P2 | Hecho | Configuración del chat; `docs/SEGURIDAD.md` §6–7 |
| HU-14 | Como **administrador de la plataforma** quiero ver el uso por empresa, las encuestas de satisfacción y los errores reportados, para dar soporte | P2 | Hecho | *Administración → Uso y soporte*; `docs/USO_Y_SOPORTE.md` |
| HU-15 | Como **visitante** quiero probar la aplicación sin crear cuenta, para evaluarla | P2 | Hecho | `https://revela-henna.vercel.app/?demo` |
| HU-16 | Como **operador** quiero levantar el sistema con un solo comando, para desplegarlo en cualquier máquina | P2 | Hecho* | `docker compose up --build`; Manual técnico. *El servidor de la imagen está probado; falta construir la imagen en una máquina con Docker |
| HU-17 | Como **vendedor** quiero búsqueda de empresas reales (Google Places), para prospectar con datos reales | P3 | Pendiente | Hoy devuelve datos de demostración hasta cargar la clave |
| HU-18 | Como **cliente** quiero contratar y pagar en línea, para incorporarme sin intervención manual | P3 | Pendiente | Diseño en `docs/PAGOS.md` |
| HU-19 | Como **cliente** quiero una política de privacidad y un contrato de encargo revisados por un abogado | P3 | Pendiente | Requiere asesoría legal; riesgos en `docs/cumplimiento/` |
| HU-20 | Como **vendedor** quiero usar Revela desde el teléfono | P4 | Fuera del MVP | La interfaz es responsiva; no hay aplicación móvil nativa |

**Criterio de priorización:** primero lo que el producto necesita para ser utilizable y legal (P1), luego lo que lo
hace competitivo (P2), luego lo que depende de terceros o de decisiones del negocio (P3).
