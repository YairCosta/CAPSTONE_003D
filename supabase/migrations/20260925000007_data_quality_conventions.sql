-- ============================================================================
-- CALIDAD DE DATOS Y CONVENCIONES
-- Ajustes previos al primer despliegue: un solo nombre por persona, moneda explícita en los montos,
-- fechas de modificación automáticas, restricciones que impiden datos imposibles, índices para las
-- consultas del CRM y documentación dentro de la propia base (COMMENT ON).
--
-- NOTA: esta migración elimina y renombra columnas porque TODAVÍA NO HAY DATOS EN PRODUCCIÓN.
-- Con el sistema en uso, cada uno de esos cambios debe dividirse en dos migraciones
-- (expandir → copiar → convivir → contraer). Ver docs/BASE_DE_DATOS.md.
--
-- Requiere: 20260924000006_data_exports.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. updated_at automático en todas las tablas que lo tienen
--    Antes la columna existía pero nadie la actualizaba.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$;

DO $$
DECLARE
    v_table TEXT;
BEGIN
    FOR v_table IN
        SELECT c.table_name
        FROM information_schema.columns c
        JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE c.table_schema = 'public' AND c.column_name = 'updated_at' AND t.table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I', v_table, v_table);
        EXECUTE format(
            'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
            v_table, v_table
        );
    END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Nombre de las personas: UN solo campo canónico (full_name)
--    Dividir el nombre en partes falla con apellidos compuestos y nombres de otros países.
--    La aplicación siempre usó un solo campo; la base tenía dos.
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name VARCHAR(200);

UPDATE public.profiles
SET full_name = COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', first_name, last_name)), ''), email, 'Usuario')
WHERE full_name IS NULL;

ALTER TABLE public.profiles ALTER COLUMN full_name SET NOT NULL;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS first_name;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS last_name;

-- El email del perfil es una copia de auth.users para poder listarlo sin consultar el esquema auth
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_email_key;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_email_key UNIQUE (email);

-- ----------------------------------------------------------------------------
-- 3. Bitácora: se guarda el nombre del agente tal como se mostró
--    created_by puede quedar en NULL si el usuario se elimina; el historial no debe perder quién atendió.
-- ----------------------------------------------------------------------------
ALTER TABLE public.lead_activities ADD COLUMN IF NOT EXISTS agent_name VARCHAR(200);

UPDATE public.lead_activities a
SET agent_name = COALESCE(p.full_name, 'Equipo comercial')
FROM public.profiles p
WHERE a.created_by = p.id AND a.agent_name IS NULL;

UPDATE public.lead_activities SET agent_name = 'Equipo comercial' WHERE agent_name IS NULL;
ALTER TABLE public.lead_activities ALTER COLUMN agent_name SET NOT NULL;

-- ----------------------------------------------------------------------------
-- 4. Dinero: la moneda se guarda junto al monto
--    Antes se deducía del país del lead: si el lead cambiaba de país, su historial cambiaba de moneda.
-- ----------------------------------------------------------------------------
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS currency_code CHAR(3);

UPDATE public.leads l
SET currency_code = c.currency_code
FROM public.countries c
WHERE c.code = l.country_code AND l.currency_code IS NULL;

-- Al crear un lead, si no se indica moneda se toma la de su país
CREATE OR REPLACE FUNCTION public.set_lead_currency()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.currency_code IS NULL THEN
        SELECT c.currency_code INTO NEW.currency_code FROM public.countries c WHERE c.code = NEW.country_code;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_currency ON public.leads;
CREATE TRIGGER trg_leads_currency
    BEFORE INSERT OR UPDATE OF country_code, currency_code ON public.leads
    FOR EACH ROW EXECUTE FUNCTION public.set_lead_currency();

UPDATE public.leads SET currency_code = 'CLP' WHERE currency_code IS NULL;
ALTER TABLE public.leads ALTER COLUMN currency_code SET NOT NULL;
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_currency_format;
ALTER TABLE public.leads ADD CONSTRAINT leads_currency_format CHECK (currency_code ~ '^[A-Z]{3}$');

-- ----------------------------------------------------------------------------
-- 5. Restricciones: datos que nunca deberían poder guardarse
--    Con datos en producción estas restricciones se agregan como NOT VALID y luego se validan
--    (ALTER TABLE ... VALIDATE CONSTRAINT), para no bloquear la tabla.
-- ----------------------------------------------------------------------------
-- Textos vacíos → NULL (un email "" no es un email)
UPDATE public.leads SET email = NULL WHERE BTRIM(email) = '';
UPDATE public.client_accounts SET email = NULL WHERE BTRIM(email) = '';
UPDATE public.profiles SET email = NULL WHERE BTRIM(email) = '';

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_email_format;
ALTER TABLE public.leads ADD CONSTRAINT leads_email_format
    CHECK (email IS NULL OR email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');
ALTER TABLE public.client_accounts DROP CONSTRAINT IF EXISTS client_accounts_email_format;
ALTER TABLE public.client_accounts ADD CONSTRAINT client_accounts_email_format
    CHECK (email IS NULL OR email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

-- Nombres sin espacios en blanco al inicio/fin y nunca vacíos
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_full_name_not_blank;
ALTER TABLE public.leads ADD CONSTRAINT leads_full_name_not_blank CHECK (LENGTH(BTRIM(full_name)) > 0);
ALTER TABLE public.client_accounts DROP CONSTRAINT IF EXISTS client_accounts_name_not_blank;
ALTER TABLE public.client_accounts ADD CONSTRAINT client_accounts_name_not_blank CHECK (LENGTH(BTRIM(name)) > 0);
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_name_not_blank;
ALTER TABLE public.companies ADD CONSTRAINT companies_name_not_blank CHECK (LENGTH(BTRIM(name)) > 0);
ALTER TABLE public.catalog_items DROP CONSTRAINT IF EXISTS catalog_items_name_not_blank;
ALTER TABLE public.catalog_items ADD CONSTRAINT catalog_items_name_not_blank CHECK (LENGTH(BTRIM(name)) > 0);

-- Montos nunca negativos
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_value_not_negative;
ALTER TABLE public.leads ADD CONSTRAINT leads_value_not_negative CHECK (estimated_deal_value >= 0);

-- Coordenadas dentro del planeta
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_coordinates_range;
ALTER TABLE public.leads ADD CONSTRAINT leads_coordinates_range CHECK (
    (latitude IS NULL AND longitude IS NULL)
    OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
);

-- Colores en formato hexadecimal
ALTER TABLE public.territories DROP CONSTRAINT IF EXISTS territories_color_format;
ALTER TABLE public.territories ADD CONSTRAINT territories_color_format CHECK (color_hex ~* '^#[0-9A-F]{6}$');
ALTER TABLE public.pipeline_stage_configs DROP CONSTRAINT IF EXISTS pipeline_stage_configs_color_format;
ALTER TABLE public.pipeline_stage_configs ADD CONSTRAINT pipeline_stage_configs_color_format CHECK (color_hex ~* '^#[0-9A-F]{6}$');

-- Identificador del CRM en minúsculas y con guiones (se usa en URLs)
ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_slug_format;
ALTER TABLE public.companies ADD CONSTRAINT companies_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

-- ----------------------------------------------------------------------------
-- 6. Unicidad: evitar duplicados dentro de cada CRM
-- ----------------------------------------------------------------------------
-- Una zona no puede repetirse dentro del mismo país de un CRM
ALTER TABLE public.territories DROP CONSTRAINT IF EXISTS territories_company_country_name_key;
ALTER TABLE public.territories ADD CONSTRAINT territories_company_country_name_key UNIQUE (company_id, country_code, name);
CREATE UNIQUE INDEX IF NOT EXISTS uq_territories_company_code ON public.territories (company_id, code) WHERE code IS NOT NULL;

-- Un SKU no puede repetirse dentro del catálogo de un CRM
CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_items_company_sku ON public.catalog_items (company_id, sku) WHERE sku IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 7. Índices para las consultas reales del CRM
--    (listados por etapa, bitácora por fecha, mapa por zona). En producción, sobre tablas grandes,
--    conviene crearlos con CREATE INDEX CONCURRENTLY fuera de una transacción.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_leads_company_status ON public.leads (company_id, commercial_status);
CREATE INDEX IF NOT EXISTS idx_leads_company_created ON public.leads (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_company_territory ON public.leads (company_id, assigned_territory_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_company_created ON public.lead_activities (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_created ON public.lead_activities (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_activities_follow_up ON public.lead_activities (company_id, next_follow_up_date)
    WHERE next_follow_up_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_accounts_company_active ON public.client_accounts (company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_catalog_items_company_active ON public.catalog_items (company_id, is_active);

-- ----------------------------------------------------------------------------
-- 8. Documentación dentro de la base
--    Cualquier persona (o herramienta) que inspeccione la base entiende qué es cada cosa.
-- ----------------------------------------------------------------------------
COMMENT ON TABLE public.companies IS 'CRM de cada empresa cliente del SaaS (tenant). Es la raíz del aislamiento: casi todas las tablas tienen company_id.';
COMMENT ON COLUMN public.companies.slug IS 'Identificador corto y único del CRM, usado en URLs.';
COMMENT ON COLUMN public.companies.plan IS 'national = solo el país base; international = varios países habilitados.';
COMMENT ON COLUMN public.companies.is_active IS 'FALSE = CRM suspendido: sus usuarios no pueden iniciar sesión, pero los datos se conservan.';

COMMENT ON TABLE public.profiles IS 'Usuario del sistema, vinculado 1 a 1 con auth.users. Las contraseñas viven en auth, nunca aquí.';
COMMENT ON COLUMN public.profiles.full_name IS 'Nombre completo tal como se muestra. Un solo campo: no se divide en nombre y apellido.';
COMMENT ON COLUMN public.profiles.company_id IS 'CRM al que pertenece. NULL solo para el rol superadmin (administrador de la plataforma).';
COMMENT ON COLUMN public.profiles.email IS 'Copia del email de auth.users para poder listar usuarios sin consultar el esquema auth.';

COMMENT ON TABLE public.client_accounts IS 'Empresa cliente del CRM: agrupa los leads de una misma organización.';
COMMENT ON COLUMN public.client_accounts.is_active IS 'FALSE = no recibe nuevos leads, pero conserva su historial. Preferir desactivar antes que borrar.';

COMMENT ON TABLE public.leads IS 'Oportunidad comercial: una persona de contacto con su etapa, valor y ubicación.';
COMMENT ON COLUMN public.leads.full_name IS 'Nombre completo del contacto. Un solo campo.';
COMMENT ON COLUMN public.leads.estimated_deal_value IS 'Monto del negocio, en la moneda de currency_code. Nunca se guarda convertido.';
COMMENT ON COLUMN public.leads.currency_code IS 'Moneda del monto (ISO 4217). Se toma del país al crear el lead y queda fija en el historial.';
COMMENT ON COLUMN public.leads.value_source IS 'items = suma de sus productos/servicios (la calcula la base); manual = monto ingresado a mano.';
COMMENT ON COLUMN public.leads.country_code IS 'País del lead: define su moneda y el tipo de zona (comuna, distrito…).';
COMMENT ON COLUMN public.leads.assigned_territory_id IS 'Zona donde se ubicó el lead. NULL = pendiente de asignar (cola de gerencia).';
COMMENT ON COLUMN public.leads.location IS 'Punto PostGIS (WGS84) derivado de latitude/longitude; se usa para cruzar con los polígonos de las zonas.';

COMMENT ON TABLE public.lead_activities IS 'Bitácora de contactos con un lead (llamada, WhatsApp, reunión…). Es un historial: no se edita ni se borra.';
COMMENT ON COLUMN public.lead_activities.agent_name IS 'Nombre del agente tal como se registró, aunque después se elimine su usuario.';

COMMENT ON TABLE public.territories IS 'Zona geográfica de trabajo (comuna en Chile, distrito en Perú, provincia en Argentina) con su polígono.';
COMMENT ON TABLE public.catalog_items IS 'Producto o servicio que vende la empresa. Si está en algún lead se desactiva, no se borra.';
COMMENT ON TABLE public.catalog_item_prices IS 'Precio sugerido de un ítem por país, en la moneda de ese país.';
COMMENT ON TABLE public.lead_items IS 'Producto o servicio incluido en un lead, con el precio acordado (queda fijo aunque cambie el catálogo).';
COMMENT ON TABLE public.pipeline_stage_configs IS 'Configuración de las etapas del embudo de cada CRM (nombre, probabilidad, SLA).';
COMMENT ON TABLE public.countries IS 'Países soportados por la plataforma: moneda, nombre de la zona y vista del mapa.';
COMMENT ON TABLE public.company_countries IS 'Países habilitados por CRM (plan Internacional). Solo cuentan si el plan está activo.';
COMMENT ON TABLE public.data_exports IS 'Auditoría de exportaciones de datos: quién descargó qué CRM y cuándo.';
COMMENT ON TABLE public.geocoding_cache IS 'Caché global de direcciones ya geocodificadas. No pertenece a ningún CRM: solo la usa el servidor.';
