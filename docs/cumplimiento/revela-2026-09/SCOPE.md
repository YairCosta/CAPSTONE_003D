# Alcance

Expediente `revela-2026-09` · Escenario 2 (plataforma usada por empresas clientes) · Fecha de corte
**2026-09-24 UTC**.

## Autorización

| Punto | Detalle |
|---|---|
| Solicitante | Yair Costa, dueño y desarrollador de Revela |
| Autoridad sobre el repositorio | Sí: autorizó revisar e implementar cambios en `C:\Users\USUARIO\Desktop\Tesis\GeoCRM` |
| Ambiente | **Solo desarrollo local.** No existe ambiente productivo ni base desplegada al corte |
| Datos | **Ninguno real.** Los datos del CRM son ficticios (`src/data/mockGeoData.ts`) |
| Custodio del expediente | Yair Costa |
| Legal hold | No aplica: no hay reclamo, fiscalización ni litigio conocido |

## Incluido

- Código de la aplicación (`src/`, `server/`), migraciones (`supabase/migrations/`), pruebas
  (`scripts/`) y documentación (`docs/`).
- Flujos de producto: captura de leads, registro de contactos, agenda, gerencia, auditoría,
  administración de la plataforma, exportación y asistente de IA.
- Diseño del alta de clientes y del cobro (`docs/PAGOS.md`), aún no implementado.

## Excluido

- **Ambiente productivo, base de datos real y despliegue:** no existen. Todo hallazgo de runtime
  queda `NO_VERIFICABLE`.
- **Landing page y política de privacidad publicadas:** no existen al corte.
- **Ley peruana de protección de datos:** el CRM opera con datos de Perú, pero este expediente
  cubre solo la ley chilena.
- **Asesoría jurídica:** la decisión final sobre bases de licitud, contratos y EIPD queda para un
  abogado.
- **RR.HH. de Revela:** no hay trabajadores al corte.

## Restricciones probatorias

1. No se ejecutaron pruebas activas contra producción porque no existe producción.
2. La consulta a la fuente oficial (BCN) **falló por tiempo de espera** en la sesión del
   2026-09-23; ver `legal-status.md`. La línea base se apoya en el paquete de la Skill y en fuentes
   secundarias, marcadas como tales.
3. Los indicadores del escaneo automático son hipótesis, no hallazgos; su triage está en
   `triage.md`.
4. Ningún control se declara `PROBADO_CON_EVIDENCIA_VIGENTE`: sin despliegue no hay release ni
   observación de runtime que lo respalde.
