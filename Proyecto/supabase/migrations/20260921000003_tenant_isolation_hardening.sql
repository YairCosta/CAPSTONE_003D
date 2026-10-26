-- ============================================================================
-- ENDURECIMIENTO DEL AISLAMIENTO MULTI-TENANT (SaaS)
-- Objetivo: los datos de un CRM (company) nunca pueden leerse, modificarse ni referenciarse desde otro.
-- Requiere: 20260920000002_roles_tenants_client_accounts.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. RPC de distribución por zonas: antes aceptaba cualquier p_company_id (SECURITY DEFINER)
--    y permitía leer métricas y polígonos de otras empresas.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_lead_distribution_by_territories(p_company_id UUID)
RETURNS TABLE (
    territory_id UUID,
    territory_name VARCHAR(150),
    territory_code VARCHAR(50),
    color_hex VARCHAR(7),
    lead_count BIGINT,
    total_company_leads BIGINT,
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
    WITH company_total AS (
        SELECT COUNT(*)::BIGINT AS total_leads
        FROM public.leads
        WHERE company_id = p_company_id
          AND location IS NOT NULL
    ),
    territory_counts AS (
        SELECT
            t.id,
            t.name,
            t.code,
            t.color_hex,
            t.polygon,
            COUNT(l.id)::BIGINT AS leads_in_territory
        FROM public.territories t
        LEFT JOIN public.leads l
            ON l.company_id = p_company_id
            AND l.location IS NOT NULL
            AND ST_Intersects(t.polygon, l.location)
        WHERE t.company_id = p_company_id
        GROUP BY t.id, t.name, t.code, t.color_hex, t.polygon
    )
    SELECT
        tc.id AS territory_id,
        tc.name AS territory_name,
        tc.code AS territory_code,
        tc.color_hex,
        tc.leads_in_territory AS lead_count,
        ct.total_leads AS total_company_leads,
        CASE
            WHEN ct.total_leads = 0 THEN 0.00
            ELSE ROUND((tc.leads_in_territory::NUMERIC / ct.total_leads::NUMERIC) * 100.0, 2)
        END AS percentage,
        ST_AsGeoJSON(tc.polygon)::jsonb AS geojson_polygon
    FROM territory_counts tc
    CROSS JOIN company_total ct
    ORDER BY tc.leads_in_territory DESC;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. RPC de coordenadas: SECURITY DEFINER sin validar empresa. Solo debe usarla la Edge Function
--    (service_role); ningún usuario debe poder modificar leads de otro CRM a través de ella.
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.rpc_update_lead_coordinates(UUID, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, VARCHAR)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_update_lead_coordinates(UUID, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, VARCHAR)
    TO service_role;

-- ----------------------------------------------------------------------------
-- 3. Caché de geocodificación: es global (direcciones buscadas por todas las empresas).
--    Se elimina la lectura para usuarios; solo la usa la Edge Function con service_role.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Lectura de cache de geocodificación" ON public.geocoding_cache;

-- ----------------------------------------------------------------------------
-- 4. Referencias entre tablas: las FK no validan el tenant. Un lead no puede apuntar a una empresa
--    cliente, zona o usuario de otro CRM, ni una actividad a un lead ajeno.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_lead_tenant_references()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.client_account_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.client_accounts ca
        WHERE ca.id = NEW.client_account_id AND ca.company_id = NEW.company_id
    ) THEN
        RAISE EXCEPTION 'La empresa cliente pertenece a otro CRM' USING ERRCODE = '42501';
    END IF;

    IF NEW.assigned_territory_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.territories t
        WHERE t.id = NEW.assigned_territory_id AND t.company_id = NEW.company_id
    ) THEN
        RAISE EXCEPTION 'La zona pertenece a otro CRM' USING ERRCODE = '42501';
    END IF;

    IF NEW.created_by IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = NEW.created_by AND p.company_id = NEW.company_id
    ) THEN
        RAISE EXCEPTION 'El usuario creador pertenece a otro CRM' USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_tenant_references ON public.leads;
CREATE TRIGGER trg_leads_tenant_references
    BEFORE INSERT OR UPDATE OF company_id, client_account_id, assigned_territory_id, created_by
    ON public.leads
    FOR EACH ROW EXECUTE FUNCTION public.enforce_lead_tenant_references();

CREATE OR REPLACE FUNCTION public.enforce_activity_tenant_references()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.id = NEW.lead_id AND l.company_id = NEW.company_id
    ) THEN
        RAISE EXCEPTION 'La actividad apunta a un lead de otro CRM' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activities_tenant_references ON public.lead_activities;
CREATE TRIGGER trg_activities_tenant_references
    BEFORE INSERT OR UPDATE OF company_id, lead_id
    ON public.lead_activities
    FOR EACH ROW EXECUTE FUNCTION public.enforce_activity_tenant_references();

-- ----------------------------------------------------------------------------
-- 5. Políticas explícitas (WITH CHECK) para que ninguna actualización mueva filas a otro tenant
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Actualización de leads (UPDATE)" ON public.leads;
CREATE POLICY "Actualización de leads (UPDATE)" ON public.leads
    FOR UPDATE
    USING (company_id = public.get_current_user_company_id())
    WITH CHECK (company_id = public.get_current_user_company_id());

DROP POLICY IF EXISTS "Empresas cliente: edición gerencia" ON public.client_accounts;
CREATE POLICY "Empresas cliente: edición gerencia" ON public.client_accounts
    FOR UPDATE
    USING (company_id = public.get_current_user_company_id() AND public.get_current_user_role() = 'manager')
    WITH CHECK (company_id = public.get_current_user_company_id() AND public.get_current_user_role() = 'manager');

-- Territorios: lectura para el tenant; escritura solo gerencia del mismo tenant (antes: FOR ALL para cualquier usuario)
DROP POLICY IF EXISTS "Aislamiento de territorios" ON public.territories;
CREATE POLICY "Territorios: lectura" ON public.territories
    FOR SELECT USING (company_id = public.get_current_user_company_id());
CREATE POLICY "Territorios: gestión gerencia" ON public.territories
    FOR ALL
    USING (company_id = public.get_current_user_company_id() AND public.get_current_user_role() = 'manager')
    WITH CHECK (company_id = public.get_current_user_company_id() AND public.get_current_user_role() = 'manager');

-- ----------------------------------------------------------------------------
-- 6. Configuración del pipeline por tenant (antes era global en la aplicación)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pipeline_stage_configs (
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    stage VARCHAR(50) NOT NULL CHECK (
        stage IN ('new', 'contacted', 'qualified', 'proposal', 'pending_payment', 'won', 'lost')
    ),
    label VARCHAR(120) NOT NULL,
    short_code VARCHAR(30) NOT NULL,
    color_hex VARCHAR(7) NOT NULL,
    description TEXT,
    win_probability SMALLINT NOT NULL DEFAULT 0 CHECK (win_probability BETWEEN 0 AND 100),
    sla_days SMALLINT NOT NULL DEFAULT 0 CHECK (sla_days >= 0),
    order_index SMALLINT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    PRIMARY KEY (company_id, stage)
);

ALTER TABLE public.pipeline_stage_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Etapas: lectura" ON public.pipeline_stage_configs
    FOR SELECT USING (company_id = public.get_current_user_company_id());
CREATE POLICY "Etapas: gestión gerencia" ON public.pipeline_stage_configs
    FOR ALL
    USING (company_id = public.get_current_user_company_id() AND public.get_current_user_role() = 'manager')
    WITH CHECK (company_id = public.get_current_user_company_id() AND public.get_current_user_role() = 'manager');
