# Hallazgos y plan de remediación

Expediente `revela-2026-09` · corte 2026-09-24 UTC · escenario 2.
Severidad según impacto en el titular y exigibilidad, **no** como cálculo de multa: sin decisión de
la Agencia, cualquier monto sería especulación.

## Resumen

| Severidad | Cantidad |
|---|---:|
| Alta | 6 |
| Media | 6 |
| Baja | 2 |

De las 93 disposiciones evaluadas: 33 aplican, 28 no aplican con justificación, 32 quedan en
monitoreo. **Ninguna disposición quedó sin evaluar.**

## Hallazgos

### H-01 · Alta · La captura de leads no informa nada ni registra una base
**Requisito:** arts. 12, 13 y 14 ter. **Hecho:** el formulario pide nombre, cargo, email, teléfono
y dirección sin informar finalidad, sin registrar de dónde salió el dato ni si la persona autorizó.
**Riesgo:** es el tratamiento principal del producto y hoy no puede acreditar licitud.
**Remediación:** campos de origen y consentimiento en la ficha, visibles y auditados.

### H-02 · Alta · No hay contrato de encargo con las empresas cliente
**Requisito:** art. 15 bis. **Hecho:** Revela trata datos por cuenta de sus clientes sin contrato,
sin instrucciones documentadas y sin autorización de subencargados.
**Remediación:** contrato de encargo firmado al contratar (abogado), más anexo de subencargados.

### H-03 · Alta · No existe supresión real
**Requisito:** art. 7. **Hecho:** descartar un lead conserva nombre, email, teléfono y dirección.
**Remediación:** solicitud de supresión con causal, aprobación del gerente y **anonimización**:
se borran los datos personales y se conserva la operación para las métricas.

### H-04 · Alta · No existe oposición ni "no contactar"
**Requisito:** art. 8. **Hecho:** un lead que pide no ser contactado sigue apareciendo en la agenda
y disponible para el asistente de IA.
**Remediación:** marca de oposición que lo saca de la agenda, del asistente y de la captura.

### H-05 · Alta · Transferencia internacional sin mecanismo
**Requisito:** arts. 27 y 28. **Hecho:** Supabase, Gemini, Places y Esri están fuera de Chile; no
hay región elegida, ni cláusulas, ni información al titular.
**Remediación:** elegir región, documentar el mecanismo y declararlo en la política. **Bloqueante
antes del despliegue.**

### H-06 · Alta · No hay canal ni procedimiento para ejercer derechos
**Requisito:** arts. 4, 10 y 11. **Hecho:** no existe dirección de contacto, ni plazos, ni
autenticación del solicitante, ni propagación a copias.
**Remediación:** canal publicado, registro de solicitudes con plazo y responsable.
**Nota:** la modalidad de autenticación depende de instrucciones de la Agencia
(`PENDING_AUTHORITY_RULE`); no inventar una.

### H-07 · Alta · No hay política de privacidad publicada
**Requisito:** art. 14 ter. **Hecho:** no existe información pública y permanente sobre
tratamientos, finalidades, derechos ni contacto.
**Remediación:** publicarla junto con la landing, antes de recibir el primer cliente real.

### H-08 · Media · Sin bloqueo temporal del tratamiento
**Requisito:** art. 8 ter. **Hecho:** mientras se resuelve una solicitud, el dato se sigue usando.
**Remediación:** el lead con solicitud pendiente queda bloqueado: visible, no utilizable.

### H-09 · Media · Soporte con acceso a datos, sin procedimiento
**Requisito:** arts. 14 bis y 15 bis. **Hecho:** el administrador de plataforma podría acceder a
datos de un cliente para dar soporte, sin instrucción escrita ni registro específico.
**Remediación:** procedimiento de acceso de soporte, con motivo, plazo y registro.

### H-10 · Media · Sin registro de incidentes ni canal de notificación
**Requisito:** art. 14 sexies. **Hecho:** el procedimiento está escrito en `docs/LEY_21719.md`,
pero no hay registro, responsable ni prueba.
**Remediación:** planilla de incidentes y ensayo del procedimiento antes del despliegue.

### H-11 · Media · Sin regla de conservación
**Requisito:** arts. 3 y 14. **Hecho:** nada define cuánto vive un lead descartado.
**Remediación:** decidir el plazo, escribirlo en la política y programar la anonimización.
**Avance 25-09-2026:** implementada la regla para **prospectos**: 30 días sin contacto y se
anonimizan solos (`CODIGO_NO_DESPLEGADO`). Falta decidir el plazo de los leads descartados.

### H-12 · Media · Geolocalización sin análisis
**Requisito:** art. 16 sexies. **Hecho:** el producto geocodifica direcciones y las muestra en un
mapa. Para una empresa es dato de contacto; para una persona natural puede ser geolocalización.
**Remediación:** decisión jurídica y, mientras tanto, informar la finalidad en la captura.

### H-13 · Baja · Contraseñas de demostración en el código
**Hecho:** `src/data/mockGeoData.ts` trae contraseñas de demo. Son públicas por diseño y no dan
acceso a datos reales. El administrador de plataforma ya quedó fuera del paquete publicado.
**Remediación:** al conectar Supabase Auth, eliminarlas.
**Evidencia desfavorable conservada:** durante la preparación del repositorio se encontró una clave
real de Gemini en `.env.example`; se reemplazó antes del primer commit y se pidió rotarla.

### H-14 · Baja · Sin decisión sobre MPI ni delegado
**Requisito:** arts. 48, 49 y 50, y DS 662. **Hecho:** el Modelo de Prevención de Infracciones es
voluntario y no se ha evaluado; no hay delegado designado.
**Remediación:** decidir antes del piloto con datos reales.

### AC-01 · Corregido · El flujo de derechos no alcanzaba a quien atiende al titular
**Hecho:** la primera versión dejó la solicitud solo en Gerencia, módulo que el usuario base no ve.
**Corregido el 24-09-2026:** el usuario base registra la solicitud desde Registro de contacto y el
gerente la resuelve. Ver [`autorrevision-auditor.md`](autorrevision-auditor.md).

### AC-02 · Corregido · El bloqueo existía solo en pantalla
**Hecho:** se declaró implementado, pero el guard aceptaba editar un lead bloqueado y el Pipeline lo
movía. **Corregido el 25-09-2026** en `tenantGuards.ts`. Ver [`autorrevision-auditor.md`](autorrevision-auditor.md).

### AC-03 · Corregido · La anonimización dejaba copias en el historial y la bitácora
**Corregido el 25-09-2026:** el historial ya no guarda valores personales (opción A), y anonimizar
borra también la bitácora de esa persona y sus coordenadas.

### AC-04 · Corregido · Revertir podía devolver un consentimiento revocado
**Corregido el 25-09-2026:** revertir conserva las decisiones actuales del titular.

## Plan de remediación

### 7 días — hecho el 24-09-2026
- H-01: origen y consentimiento en la captura y en la ficha del lead. ✅
- H-03: solicitud de supresión con causal, aprobación del gerente y anonimización. ✅
- H-04: marca de "no contactar" con efecto en agenda, asistente y captura. ✅
- H-08: bloqueo temporal mientras la solicitud está pendiente. ✅
- Informe por titular (arts. 5 y 9), descargable. ✅
- Separación de funciones: el usuario base pide, la gerencia resuelve. ✅
- Portal fiscalizador de solo lectura en el panel de administración. ✅
- Origen y base del dato obligatorios en la captura, sin opción por defecto. ✅ (25-09-2026)
- Prospectos: aviso en el primer contacto y anonimización a los 30 días. ✅ (25-09-2026)
- Asistente de IA limitado a datos de empresa. ✅ (25-09-2026)

Todo queda en estado `CODIGO_NO_DESPLEGADO`: falta la migración y el despliegue.

### 30 días — papeles y decisiones
- H-02 y H-07: contrato de encargo y política de privacidad, con abogado.
- H-11: plazo de conservación decidido y escrito.
- H-12: decisión jurídica sobre geolocalización.
- H-06: canal de derechos publicado con responsable y plazos.

### 60 días — condiciones para desplegar
- H-05: región de Supabase y mecanismo de transferencia.
- H-09: procedimiento de acceso de soporte con registro.
- H-10: registro de incidentes y ensayo del procedimiento.
- Supabase Auth en lugar del login de demostración.

### 90 días — operación
- H-14: decisión sobre MPI y delegado.
- Automatizar la anonimización por plazo de conservación.
- Repetir esta auditoría sobre el sistema ya desplegado: recién ahí un control puede pasar de
  `CODIGO_NO_DESPLEGADO` a probado.

## Limitación general

Nada en este expediente acredita cumplimiento. Sin ambiente productivo no hay release, ni
configuración, ni observación de runtime, y por eso **ningún control quedó en estado
`PROBADO_CON_EVIDENCIA_VIGENTE`**.
