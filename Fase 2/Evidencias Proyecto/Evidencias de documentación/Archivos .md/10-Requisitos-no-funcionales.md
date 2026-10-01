# 10. Requisitos no funcionales

Cada requisito dice **qué se exige**, **cómo se cumple** y **cómo se verifica**. Las cifras de rendimiento se midieron el
30-09-2026 con `npm run test:rendimiento` sobre el servidor de la imagen Docker, en local (sin latencia de red real):
son una línea base para detectar empeoramientos, no una promesa de tiempos en producción.

| ID | Categoría | Requisito | Cómo se cumple | Verificación |
|---|---|---|---|---|
| RNF-01 | **Seguridad** · aislamiento | Ninguna empresa puede ver ni escribir datos de otra | RLS en las 25 tablas con `company_id`; triggers que validan que las referencias sean del mismo CRM; escrituras de la app por guards (`src/lib/tenantGuards.ts`) | `test:tenant` (78), `test:db` (257, con ataques desde dentro contra un CRM de pruebas), `test:sql` (RLS en todas las tablas) |
| RNF-02 | **Seguridad** · acceso | Los permisos dependen del rol (usuario base, gerente, administrador) y los exige también la base | `src/lib/permissions.ts`; reglas por perfil en la base desde la migración 0022 | `test:db`, `test:e2e` |
| RNF-03 | **Seguridad** · secretos | Ninguna clave en el repositorio ni en lo que se publica; la clave de OpenAI de cada empresa cifrada | Variables de entorno; Supabase Vault (migración 0032); mensajes de error fijos y registros con claves tapadas | `test:bundle` y `test:vercel` buscan los valores de `.env.local` en lo publicado; pruebas de mutación en `test:ai` |
| RNF-04 | **Seguridad** · transporte y navegador | Política de contenido (CSP) y cabeceras de seguridad | Configuración generada por `scripts/build-vercel.mjs` | `test:vercel`: la app abre sin violaciones de CSP y no puede enviar datos a otros sitios |
| RNF-05 | **Privacidad** | Cumplir la Ley 21.719: origen y base del dato, derechos del titular, anonimización, minimización | Captura exige origen y base; lead bloqueado con solicitud pendiente (en los guards y la base); sin coordenadas; prospectos se anonimizan a los 30 días; auditoría sin datos personales | `docs/LEY_21719.md`, expediente `docs/cumplimiento/`, `test:tenant`, `test:db` |
| RNF-06 | **Rendimiento** · carga | La primera pantalla carga rápido | Módulos pesados (mapa, administración, asistente) se cargan al abrirlos (`src/lib/modulos.ts`) | `test:rendimiento`: **LCP 204 ms** (mediana de 5 cargas en frío, umbral 2.500 ms); primera pantalla de la demo: **961 KB de JavaScript sin comprimir (278 KB con gzip)** en 17 archivos |
| RNF-07 | **Rendimiento** · API | La API responde sin demora perceptible | Un solo manejador ligero; las consultas pesadas van directo a la base | `test:rendimiento`: mediana **0,6 ms** y percentil 95 de **0,9 ms** en 50 peticiones (sin base de datos; mide el servidor, no la red) |
| RNF-08 | **Escalabilidad** | Sumar empresas y países sin rehacer el sistema | Multiempresa por `company_id` con índices; catálogo común de zonas (la base bajó de 64 a 48 MB al no duplicar contornos); función serverless que escala con la demanda | Diseño en [08-Modelo-de-datos.md](08-Modelo-de-datos.md); 19 países y 14.489 zonas cargados |
| RNF-09 | **Disponibilidad** | La app sigue sirviendo aunque falle un servicio externo | Demo en memoria sin backend; tipos de cambio con valores de respaldo; el asistente **falla cerrado** (si no puede verificar el presupuesto o la clave, no consulta) | `test:ai` (caída de la base), `test:vercel` |
| RNF-10 | **Portabilidad** | Correr igual en Vercel, en local y en un contenedor | Configuración solo por variables de entorno; `Dockerfile` y `docker-compose.yml`; el mismo manejador de API en Vite, Vercel y Docker | `test:vercel`; servidor de la imagen probado en local (ver [12-Manual-tecnico-y-despliegue.md](12-Manual-tecnico-y-despliegue.md)) |
| RNF-11 | **Mantenibilidad** | Cambiar sin romper | Lógica pura en `src/lib/` con pruebas; migraciones versionadas y nunca editadas; invariantes documentados en `CLAUDE.md`; [Definition of Done](../Archivos%20Word/05_Definition_of_Done.docx) | 727 comprobaciones automáticas; `npx tsc -b` y `npm run lint` sin errores |
| RNF-12 | **Usabilidad y accesibilidad** | Interfaz clara, en español y usable con teclado y lector de pantalla | `label` asociado a cada campo, `aria-label` en botones de solo ícono, errores explícitos, modo claro y oscuro | Revisión en el navegador en cada cambio visible (Definition of Done) |
| RNF-13 | **Internacionalización** | Operar en 19 países sin textos escritos a mano | Nombres de zona, monedas y formatos salen de `src/data/countries.ts` y de `Intl` | `test:tenant`, `test:e2e` |
| RNF-14 | **Trazabilidad** | Saber quién cambió qué y poder revertir | `audit_log` de la app (con reversión) y `change_log` de la base; ambos solo se agregan | `test:db`, `test:supabase` |

## Límites conocidos (honestidad)

- Las cifras de rendimiento son **locales**: no incluyen latencia de red ni la base de datos real, y no hay una prueba de
  carga con muchos usuarios simultáneos.
- El límite de consultas del asistente (60 cada 10 minutos por persona) vive en la memoria de cada instancia del
  servidor; no es un límite global.
- La disponibilidad depende de los planes de Vercel y Supabase que se usan; no hay un compromiso de nivel de servicio.
