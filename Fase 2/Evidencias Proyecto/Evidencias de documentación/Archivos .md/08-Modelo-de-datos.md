# 8. Modelo de datos

Base relacional: **PostgreSQL 17 con PostGIS** en Supabase. 25 tablas en el esquema `public` (más el almacén de
secretos Vault de Supabase), definidas por **32 migraciones** versionadas en `supabase/migrations/`.
El glosario completo, el orden de las tablas y las reglas están en [`docs/BASE_DE_DATOS.md`](../../../../docs/BASE_DE_DATOS.md).

## 8.1 Diagrama entidad-relación

Relaciones extraídas de las llaves foráneas de las migraciones (se muestran las tablas y columnas principales).

```mermaid
erDiagram
    COUNTRIES ||--o{ COMPANY_COUNTRIES : "se habilita en"
    COMPANIES ||--o{ COMPANY_COUNTRIES : "activa"
    COMPANIES ||--o{ PROFILES : "tiene personas"
    COMPANIES ||--o{ LEADS : "posee"
    COMPANIES ||--o{ CLIENT_ACCOUNTS : "posee"
    COMPANIES ||--o{ CATALOG_ITEMS : "ofrece"
    COMPANIES ||--o{ TERRITORIES : "usa zonas"
    COMPANIES ||--o{ PIPELINE_STAGE_CONFIGS : "define etapas"
    COUNTRIES ||--o{ LEADS : "país del lead"
    COUNTRIES ||--o{ TERRITORIES : "zonas de"
    COUNTRIES ||--o{ ZONE_CATALOG : "catálogo oficial"
    TERRITORIES }o..|| ZONE_CATALOG : "se toma de (lógica)"
    CLIENT_ACCOUNTS ||--o{ LEADS : "agrupa"
    TERRITORIES ||--o{ LEADS : "ubica por zona"
    PROFILES ||--o{ LEADS : "crea"
    LEADS ||--o{ LEAD_CONTACTS : "otras personas"
    LEADS ||--o{ LEAD_ACTIVITIES : "bitácora"
    LEADS ||--o{ LEAD_ITEMS : "interés en"
    LEADS ||--o{ LEAD_PRIVACY_REQUESTS : "solicitudes del titular"
    CATALOG_ITEMS ||--o{ LEAD_ITEMS : "se cotiza en"
    CATALOG_ITEMS ||--o{ CATALOG_ITEM_PRICES : "precio por país"
    COMPANIES ||--o{ AUDIT_LOG : "historial de la app"
    COMPANIES ||--o{ CHANGE_LOG : "cambios de la base"
    COMPANIES ||--o| COMPANY_AI_SETTINGS : "presupuesto de IA"
    COMPANIES ||--o{ AI_USAGE_MONTHLY : "gasto de IA por mes"
    COMPANIES ||--o| COMPANY_AI_KEYS : "clave de OpenAI (Vault)"
    PROFILES ||--o{ LOGIN_EVENTS : "ingresos"

    COMPANIES {
        uuid id PK
        text name
        text slug
        char home_country FK
        text plan
        bool is_active
    }
    PROFILES {
        uuid id PK
        uuid company_id FK
        text role "agent, manager o superadmin"
        text email
        bool is_active
    }
    LEADS {
        uuid id PK
        uuid company_id FK
        char country_code FK
        uuid client_account_id FK
        uuid assigned_territory_id FK
        uuid created_by FK
        text full_name
        text commercial_status
        numeric estimated_deal_value
        text currency_code
        text data_origin
        text consent_status
        bool no_contact
        timestamptz anonymized_at
    }
    CLIENT_ACCOUNTS {
        uuid id PK
        uuid company_id FK
        char country_code FK
        text name
        text tax_id
    }
    TERRITORIES {
        uuid id PK
        uuid company_id FK
        char country_code FK
        text name
        text code
        text region_code
    }
    CATALOG_ITEMS {
        uuid id PK
        uuid company_id FK
        text item_type "product o service"
        text name
        text billing_type
    }
    LEAD_ITEMS {
        uuid id PK
        uuid lead_id FK
        uuid catalog_item_id FK
        numeric quantity
        numeric unit_price
    }
    LEAD_ACTIVITIES {
        uuid id PK
        uuid lead_id FK
        text channel
        text outcome
        date next_follow_up_date
    }
    LEAD_PRIVACY_REQUESTS {
        uuid id PK
        uuid lead_id FK
        text reason
        text status
        uuid decided_by FK
    }
    AUDIT_LOG {
        uuid id PK
        uuid company_id FK
        uuid actor_id FK
        text action
        text entity
        jsonb changes
    }
    COUNTRIES {
        char code PK
        text name
        char currency_code
        text zone_label_singular
    }
```

## 8.2 Convenciones y reglas de la base

| Regla | Cómo se cumple |
|---|---|
| **Todo dato pertenece a una empresa** | Toda tabla de datos lleva `company_id` |
| **Las empresas nunca se mezclan** | RLS habilitado en todas las tablas con `company_id` (25 al 30-09-2026; verificado por `npm run test:sql`) y un trigger que valida que las referencias sean del mismo CRM |
| **País coherente** | Un lead y su empresa cliente solo existen en un país habilitado del CRM; su zona es de ese mismo país (trigger) |
| **Sin ubicación exacta** | Las columnas de coordenadas se eliminaron (migraciones 0019 y 0021); el lead se ubica por `assigned_territory_id` |
| **Dinero en su moneda** | `estimated_deal_value` y los precios se guardan en `currency_code`, sin convertir |
| **Auditoría inalterable** | `audit_log` y `change_log` no tienen políticas de `UPDATE` ni `DELETE`; nunca guardan valores personales |
| **Documentada** | Cada tabla y columna tiene `COMMENT ON` (verificado por `test:sql`) |
| **Cambios seguros** | Nunca se edita una migración aplicada; un cambio destructivo se hace en pasos: expandir → copiar → convivir → contraer |

## 8.3 Seguridad de los secretos en la base

La clave de OpenAI de cada empresa **no está en ninguna tabla en claro**: `company_ai_keys` guarda solo un puntero al
secreto en Vault y los últimos 4 caracteres, y las personas con sesión no pueden leerla ni escribirla. Ver
[`docs/SEGURIDAD.md`](../../../../docs/SEGURIDAD.md) §7.
