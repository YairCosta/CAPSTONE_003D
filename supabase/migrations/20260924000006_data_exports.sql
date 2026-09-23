-- ============================================================================
-- PORTABILIDAD DE DATOS: EXPORTACIÓN DE UN CRM COMPLETO
-- El administrador de la plataforma descarga los datos de un CRM (Excel) para que la empresa los lleve a
-- otro sistema. Cada exportación queda registrada (quién, cuándo, cuántas filas).
-- En producción, una Edge Function con service_role llama a export_tenant_snapshot() y arma el Excel.
-- Requiere: 20260923000005_catalog_products_services.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Registro de exportaciones (auditoría)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.data_exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    exported_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    format VARCHAR(10) NOT NULL DEFAULT 'xlsx' CHECK (format IN ('xlsx', 'json')),
    format_version VARCHAR(20) NOT NULL DEFAULT 'v1',
    row_counts JSONB NOT NULL DEFAULT '{}'::jsonb,          -- ej. {"leads": 21, "client_accounts": 16}
    exported_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_data_exports_company ON public.data_exports (company_id, exported_at DESC);

ALTER TABLE public.data_exports ENABLE ROW LEVEL SECURITY;

-- Solo el administrador de la plataforma consulta y registra exportaciones; el registro no se edita ni se borra
DROP POLICY IF EXISTS "Exportaciones: lectura superadmin" ON public.data_exports;
CREATE POLICY "Exportaciones: lectura superadmin" ON public.data_exports
    FOR SELECT USING (public.is_superadmin());
DROP POLICY IF EXISTS "Exportaciones: registro superadmin" ON public.data_exports;
CREATE POLICY "Exportaciones: registro superadmin" ON public.data_exports
    FOR INSERT WITH CHECK (public.is_superadmin() AND exported_by = auth.uid());

-- ----------------------------------------------------------------------------
-- 2. Instantánea de todos los datos de UN CRM (sin contraseñas ni datos de otros CRMs)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.export_tenant_snapshot(p_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_snapshot JSONB;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_superadmin() THEN
        RAISE EXCEPTION 'Solo el administrador de la plataforma puede exportar un CRM' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id) THEN
        RAISE EXCEPTION 'CRM no encontrado' USING ERRCODE = 'P0002';
    END IF;

    SELECT jsonb_build_object(
        'format_version', 'v1',
        'exported_at', TIMEZONE('utc'::text, NOW()),
        'company', (
            SELECT jsonb_build_object(
                'id', c.id, 'name', c.name, 'slug', c.slug, 'tax_id', c.tax_id, 'plan', c.plan,
                'home_country', c.home_country,
                'enabled_countries', COALESCE((SELECT jsonb_agg(cc.country_code) FROM public.company_countries cc WHERE cc.company_id = c.id), '[]'::jsonb)
            )
            FROM public.companies c WHERE c.id = p_company_id
        ),
        'client_accounts', COALESCE((
            SELECT jsonb_agg(to_jsonb(ca) ORDER BY ca.name) FROM public.client_accounts ca WHERE ca.company_id = p_company_id
        ), '[]'::jsonb),
        'leads', COALESCE((
            SELECT jsonb_agg((to_jsonb(l) - 'location' - 'address_hash' - 'metadata') ORDER BY l.created_at)
            FROM public.leads l WHERE l.company_id = p_company_id
        ), '[]'::jsonb),
        'lead_items', COALESCE((
            SELECT jsonb_agg(to_jsonb(li)) FROM public.lead_items li WHERE li.company_id = p_company_id
        ), '[]'::jsonb),
        'catalog_items', COALESCE((
            SELECT jsonb_agg(to_jsonb(ci) || jsonb_build_object(
                'prices', COALESCE((SELECT jsonb_object_agg(p.country_code, p.price) FROM public.catalog_item_prices p WHERE p.catalog_item_id = ci.id), '{}'::jsonb)
            ))
            FROM public.catalog_items ci WHERE ci.company_id = p_company_id
        ), '[]'::jsonb),
        'lead_activities', COALESCE((
            SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at) FROM public.lead_activities a WHERE a.company_id = p_company_id
        ), '[]'::jsonb),
        'pipeline_stage_configs', COALESCE((
            SELECT jsonb_agg(to_jsonb(s)) FROM public.pipeline_stage_configs s WHERE s.company_id = p_company_id
        ), '[]'::jsonb),
        'territories', COALESCE((
            SELECT jsonb_agg(to_jsonb(t) - 'polygon' || jsonb_build_object('geojson', ST_AsGeoJSON(t.polygon)::jsonb))
            FROM public.territories t WHERE t.company_id = p_company_id
        ), '[]'::jsonb),
        -- Usuarios: solo datos de perfil. Las contraseñas viven en auth.users y nunca se exportan.
        'users', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'first_name', p.first_name, 'last_name', p.last_name, 'email', p.email, 'role', p.role, 'is_active', p.is_active, 'created_at', p.created_at
            ))
            FROM public.profiles p WHERE p.company_id = p_company_id
        ), '[]'::jsonb)
    ) INTO v_snapshot;

    RETURN v_snapshot;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.export_tenant_snapshot(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_tenant_snapshot(UUID) TO authenticated, service_role;
