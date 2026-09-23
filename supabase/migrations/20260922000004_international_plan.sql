-- ============================================================================
-- PLAN INTERNACIONAL: VARIOS PAÍSES POR CRM
-- Cada CRM tiene un país base (plan Nacional) y puede habilitar más países (plan Internacional).
-- Leads, empresas cliente y zonas pertenecen a un país; la zona de trabajo cambia según el país:
--   Chile → comuna, Perú → distrito, Argentina (futuro) → provincia.
-- Para sumar un país basta con insertarlo en public.countries y cargar sus zonas; no requiere
-- cambios de esquema.
-- Requiere: 20260921000003_tenant_isolation_hardening.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Catálogo de países soportados por la plataforma
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.countries (
    code CHAR(2) PRIMARY KEY CHECK (code ~ '^[A-Z]{2}$'),          -- ISO 3166-1 alfa-2
    name VARCHAR(100) NOT NULL,
    currency_code CHAR(3) NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'), -- ISO 4217
    locale VARCHAR(10) NOT NULL,
    zone_label_singular VARCHAR(50) NOT NULL,                        -- Comuna, Distrito, Provincia…
    zone_label_plural VARCHAR(50) NOT NULL,
    phone_prefix VARCHAR(10) NOT NULL,
    tax_id_label VARCHAR(20) NOT NULL,                               -- RUT, RUC, CUIT…
    default_lat DOUBLE PRECISION NOT NULL,
    default_lng DOUBLE PRECISION NOT NULL,
    default_zoom INT NOT NULL DEFAULT 12,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,                      -- el admin solo puede habilitar países disponibles
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

INSERT INTO public.countries
    (code, name, currency_code, locale, zone_label_singular, zone_label_plural, phone_prefix, tax_id_label, default_lat, default_lng, default_zoom)
VALUES
    ('CL', 'Chile', 'CLP', 'es-CL', 'Comuna', 'Comunas', '+56', 'RUT', -33.43, -70.60, 12),
    ('PE', 'Perú', 'PEN', 'es-PE', 'Distrito', 'Distritos', '+51', 'RUC', -12.11, -77.00, 12)
ON CONFLICT (code) DO NOTHING;
-- Ejemplo para sumar Argentina más adelante:
-- INSERT INTO public.countries
--     (code, name, currency_code, locale, zone_label_singular, zone_label_plural, phone_prefix, tax_id_label, default_lat, default_lng, default_zoom)
-- VALUES ('AR', 'Argentina', 'ARS', 'es-AR', 'Provincia', 'Provincias', '+54', 'CUIT', -34.60, -58.38, 5);

ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Países: lectura" ON public.countries;
CREATE POLICY "Países: lectura" ON public.countries FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS "Países: gestión superadmin" ON public.countries;
CREATE POLICY "Países: gestión superadmin" ON public.countries
    FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- ----------------------------------------------------------------------------
-- 2. Plan y país base de cada CRM + países habilitados
-- ----------------------------------------------------------------------------
ALTER TABLE public.companies
    ADD COLUMN IF NOT EXISTS plan VARCHAR(20) NOT NULL DEFAULT 'national' CHECK (plan IN ('national', 'international')),
    ADD COLUMN IF NOT EXISTS home_country CHAR(2) NOT NULL DEFAULT 'CL' REFERENCES public.countries(code);

CREATE TABLE IF NOT EXISTS public.company_countries (
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    country_code CHAR(2) NOT NULL REFERENCES public.countries(code),
    enabled_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    PRIMARY KEY (company_id, country_code)
);

ALTER TABLE public.company_countries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Países del CRM: lectura" ON public.company_countries;
CREATE POLICY "Países del CRM: lectura" ON public.company_countries
    FOR SELECT USING (company_id = public.get_current_user_company_id() OR public.is_superadmin());
-- Solo el administrador de la plataforma activa o desactiva países (botón "Plan Internacional")
DROP POLICY IF EXISTS "Países del CRM: gestión superadmin" ON public.company_countries;
CREATE POLICY "Países del CRM: gestión superadmin" ON public.company_countries
    FOR ALL USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- Todo CRM existente queda con su país base habilitado
INSERT INTO public.company_countries (company_id, country_code)
SELECT id, home_country FROM public.companies
ON CONFLICT DO NOTHING;

-- Países habilitados efectivos: en plan Nacional solo cuenta el país base, aunque queden filas guardadas
-- (así desactivar el plan oculta los otros países sin borrar datos, y reactivarlo los recupera)
CREATE OR REPLACE FUNCTION public.is_country_enabled(p_company_id UUID, p_country_code CHAR(2))
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.companies c
        WHERE c.id = p_company_id
          AND (
              c.home_country = p_country_code
              OR (
                  c.plan = 'international'
                  AND EXISTS (
                      SELECT 1 FROM public.company_countries cc
                      WHERE cc.company_id = c.id AND cc.country_code = p_country_code
                  )
              )
          )
    );
$$;

-- ----------------------------------------------------------------------------
-- 3. País en zonas, empresas cliente y leads (los datos existentes quedan en Chile)
-- ----------------------------------------------------------------------------
ALTER TABLE public.territories
    ADD COLUMN IF NOT EXISTS country_code CHAR(2) NOT NULL DEFAULT 'CL' REFERENCES public.countries(code);
ALTER TABLE public.client_accounts
    ADD COLUMN IF NOT EXISTS country_code CHAR(2) NOT NULL DEFAULT 'CL' REFERENCES public.countries(code);
ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS country_code CHAR(2) NOT NULL DEFAULT 'CL' REFERENCES public.countries(code);

CREATE INDEX IF NOT EXISTS idx_territories_company_country ON public.territories (company_id, country_code);
CREATE INDEX IF NOT EXISTS idx_client_accounts_company_country ON public.client_accounts (company_id, country_code);
CREATE INDEX IF NOT EXISTS idx_leads_company_country ON public.leads (company_id, country_code);

-- La misma marca puede existir como empresa cliente en distintos países del CRM
ALTER TABLE public.client_accounts DROP CONSTRAINT IF EXISTS client_accounts_company_id_name_key;
ALTER TABLE public.client_accounts DROP CONSTRAINT IF EXISTS client_accounts_company_country_name_key;
ALTER TABLE public.client_accounts
    ADD CONSTRAINT client_accounts_company_country_name_key UNIQUE (company_id, country_code, name);

-- ----------------------------------------------------------------------------
-- 4. Reglas de integridad por país (además del aislamiento por tenant de la migración 0003)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_country_enabled()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_country_enabled(NEW.company_id, NEW.country_code) THEN
        RAISE EXCEPTION 'El país % no está habilitado para este CRM', NEW.country_code USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_client_accounts_country_enabled ON public.client_accounts;
CREATE TRIGGER trg_client_accounts_country_enabled
    BEFORE INSERT OR UPDATE OF company_id, country_code ON public.client_accounts
    FOR EACH ROW EXECUTE FUNCTION public.enforce_country_enabled();

DROP TRIGGER IF EXISTS trg_territories_country_enabled ON public.territories;
CREATE TRIGGER trg_territories_country_enabled
    BEFORE INSERT OR UPDATE OF company_id, country_code ON public.territories
    FOR EACH ROW EXECUTE FUNCTION public.enforce_country_enabled();

-- Un lead: país habilitado, y su zona y empresa cliente deben ser del mismo país
CREATE OR REPLACE FUNCTION public.enforce_lead_country_references()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_country_enabled(NEW.company_id, NEW.country_code) THEN
        RAISE EXCEPTION 'El país % no está habilitado para este CRM', NEW.country_code USING ERRCODE = '42501';
    END IF;

    IF NEW.assigned_territory_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.territories t
        WHERE t.id = NEW.assigned_territory_id AND t.country_code = NEW.country_code
    ) THEN
        RAISE EXCEPTION 'La zona asignada pertenece a otro país' USING ERRCODE = '23514';
    END IF;

    IF NEW.client_account_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.client_accounts ca
        WHERE ca.id = NEW.client_account_id AND ca.country_code = NEW.country_code
    ) THEN
        RAISE EXCEPTION 'La empresa cliente pertenece a otro país' USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_country_references ON public.leads;
CREATE TRIGGER trg_leads_country_references
    BEFORE INSERT OR UPDATE OF company_id, country_code, client_account_id, assigned_territory_id
    ON public.leads
    FOR EACH ROW EXECUTE FUNCTION public.enforce_lead_country_references();

-- ----------------------------------------------------------------------------
-- 5. Lectura: los usuarios del CRM solo ven filas de países habilitados
--    (políticas RESTRICTIVE: se suman a las de aislamiento por tenant, no las reemplazan)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "País habilitado: leads" ON public.leads;
CREATE POLICY "País habilitado: leads" ON public.leads
    AS RESTRICTIVE FOR ALL
    USING (public.is_superadmin() OR public.is_country_enabled(company_id, country_code))
    WITH CHECK (public.is_superadmin() OR public.is_country_enabled(company_id, country_code));

DROP POLICY IF EXISTS "País habilitado: empresas cliente" ON public.client_accounts;
CREATE POLICY "País habilitado: empresas cliente" ON public.client_accounts
    AS RESTRICTIVE FOR ALL
    USING (public.is_superadmin() OR public.is_country_enabled(company_id, country_code))
    WITH CHECK (public.is_superadmin() OR public.is_country_enabled(company_id, country_code));

DROP POLICY IF EXISTS "País habilitado: zonas" ON public.territories;
CREATE POLICY "País habilitado: zonas" ON public.territories
    AS RESTRICTIVE FOR ALL
    USING (public.is_superadmin() OR public.is_country_enabled(company_id, country_code))
    WITH CHECK (public.is_superadmin() OR public.is_country_enabled(company_id, country_code));

-- ----------------------------------------------------------------------------
-- 6. Distribución por zonas con país: el porcentaje se calcula dentro de cada país
--    (cambia el tipo de retorno, por eso se elimina y se vuelve a crear)
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_lead_distribution_by_territories(UUID);

CREATE OR REPLACE FUNCTION public.get_lead_distribution_by_territories(
    p_company_id UUID,
    p_countries CHAR(2)[] DEFAULT NULL   -- NULL = todos los países habilitados
)
RETURNS TABLE (
    territory_id UUID,
    country_code CHAR(2),
    territory_name VARCHAR(150),
    territory_code VARCHAR(50),
    color_hex VARCHAR(7),
    lead_count BIGINT,
    total_country_leads BIGINT,
    percentage NUMERIC(5, 2),
    geojson_polygon JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role'
       AND p_company_id IS DISTINCT FROM public.get_current_user_company_id()
       AND NOT public.is_superadmin() THEN
        RAISE EXCEPTION 'Acceso denegado: los datos pertenecen a otro CRM' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    WITH visible_countries AS (
        SELECT co.code
        FROM public.countries co
        WHERE public.is_country_enabled(p_company_id, co.code)
          AND (p_countries IS NULL OR co.code = ANY (p_countries))
    ),
    country_totals AS (
        SELECT l.country_code, COUNT(*)::BIGINT AS total_leads
        FROM public.leads l
        WHERE l.company_id = p_company_id
          AND l.country_code IN (SELECT code FROM visible_countries)
        GROUP BY l.country_code
    ),
    territory_counts AS (
        SELECT
            t.id,
            t.country_code,
            t.name,
            t.code,
            t.color_hex,
            t.polygon,
            COUNT(l.id)::BIGINT AS leads_in_territory
        FROM public.territories t
        LEFT JOIN public.leads l
            ON l.company_id = p_company_id
            AND l.country_code = t.country_code
            AND l.location IS NOT NULL
            AND ST_Intersects(t.polygon, l.location)
        WHERE t.company_id = p_company_id
          AND t.country_code IN (SELECT code FROM visible_countries)
        GROUP BY t.id, t.country_code, t.name, t.code, t.color_hex, t.polygon
    )
    SELECT
        tc.id AS territory_id,
        tc.country_code,
        tc.name AS territory_name,
        tc.code AS territory_code,
        tc.color_hex,
        tc.leads_in_territory AS lead_count,
        COALESCE(ct.total_leads, 0) AS total_country_leads,
        CASE
            WHEN COALESCE(ct.total_leads, 0) = 0 THEN 0.00
            ELSE ROUND((tc.leads_in_territory::NUMERIC / ct.total_leads::NUMERIC) * 100.0, 2)
        END AS percentage,
        ST_AsGeoJSON(tc.polygon)::jsonb AS geojson_polygon
    FROM territory_counts tc
    LEFT JOIN country_totals ct ON ct.country_code = tc.country_code
    ORDER BY tc.leads_in_territory DESC;
END;
$$;
