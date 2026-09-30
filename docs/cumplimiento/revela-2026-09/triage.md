# Triage de indicadores automáticos

`scripts/audit_project.py` de la Skill revisó 93 archivos y levantó **1.035 indicadores**. Un
indicador es una hipótesis, no un hallazgo. Resultado del triage manual:

| Indicador | Cantidad | Veredicto | Motivo |
|---|---:|---|---|
| `cross_tenant_marker` | 383 | **Falso positivo, y además señal favorable** | Marca cada aparición de `companyId` / `tenant`. Es justamente el mecanismo de aislamiento, cubierto por 43 pruebas de aislamiento y 86 punta a punta |
| `personal_email_marker` | 235 | **Confirmado como dato personal, no como defecto** | Correos de contactos en datos ficticios y campos de email del modelo. Alimenta el RAT |
| `phone_marker` | 148 | Confirmado como dato personal | Igual que el anterior |
| `location_marker` | 108 | **Confirmado y relevante** | Geocodificación y mapa: ver art. 16 sexies en la matriz |
| `national_id_marker` | 48 | Parcial | Son RUT y RUC de **empresas** cliente, no de personas naturales. Si se capturara una persona natural con RUT, pasa a ser dato personal |
| `address_marker` | 46 | Confirmado como dato personal | Dirección del lead |
| `analytics_marker` | 24 | **Falso positivo** | Son métricas comerciales propias del CRM (KPI, rankings), no analítica de terceros ni publicidad |
| `possible_secret_marker` | 22 | **Falso positivo salvo un caso conocido** | Coinciden nombres de variables (`apiKey`, `password`). El único caso real son las contraseñas de demostración en `src/data/mockGeoData.ts`, que son públicas por diseño y no dan acceso a datos reales |
| `automated_decision_marker` | 8 | **Falso positivo como decisión automatizada** | Es la coincidencia difusa de nombres del asistente (`src/lib/aiLeadMatch.ts`), que propone y requiere confirmación humana |
| `minor_marker` | 5 | **Falso positivo** | Coincide con palabras del componente `ui.tsx`, no con datos de menores |
| `health_marker` | 5 | **Falso positivo** | Es el rubro "Salud" de empresas cliente ficticias, no datos de salud de personas |
| `commercial_assurance_claim_marker` | 2 | **Falso positivo** | Textos de estado del pipeline ("Pago Acreditado"), no promesas comerciales |
| `ai_prompt_personal_data_risk` | 1 | **Falso positivo** | Apunta a un mensaje de error de formulario, no a un prompt |

## Hallazgo real que sí surgió del escaneo

Durante la preparación del repositorio se encontró una **clave real de Gemini escrita en
`.env.example`**, un archivo pensado para publicarse. Se reemplazó por un valor de ejemplo antes
del primer commit y se recomendó rotar la clave. Queda registrado aquí porque es evidencia
desfavorable y el expediente debe conservarla.

## Limitaciones del escaneo

- Cubre solo el código del repositorio: no hay despliegue, base ni tráfico que observar.
- Un resultado limpio no descubre una tabla o un flujo que nadie declaró.
- Los indicadores no leen valores, así que no prueban la existencia de datos reales.
