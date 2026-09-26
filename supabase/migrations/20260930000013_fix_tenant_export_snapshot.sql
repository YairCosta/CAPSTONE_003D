-- ============================================================================
-- 0013 · Corrige la exportación del CRM (export_tenant_snapshot)
-- ============================================================================
-- Hallazgo de `supabase db lint` contra la base real (25-09-2026): la función de la 0006
-- seguía leyendo profiles.first_name y profiles.last_name, que la 0007 reemplazó por
-- full_name. Cualquier exportación desde la base habría fallado.
--
-- Además la exportación no traía lead_contacts (0010), así que la portabilidad de los
-- datos del cliente quedaba incompleta, ni las solicitudes del titular (0012).
-- Formato v2: agrega lead_contacts y lead_privacy_requests; users.full_name reemplaza a
-- first_name + last_name. CREATE OR REPLACE conserva los permisos de la 0006.
-- ============================================================================

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
        'format_version', 'v2',
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
        -- Otras personas de cada lead (0010): sin ellas la portabilidad queda incompleta
        'lead_contacts', COALESCE((
            SELECT jsonb_agg(to_jsonb(lc) ORDER BY lc.lead_id, lc.is_primary DESC, lc.created_at)
            FROM public.lead_contacts lc WHERE lc.company_id = p_company_id
        ), '[]'::jsonb),
        -- Solicitudes del titular (0012): parte del historial de cumplimiento del CRM
        'lead_privacy_requests', COALESCE((
            SELECT jsonb_agg(to_jsonb(r) ORDER BY r.requested_at)
            FROM public.lead_privacy_requests r WHERE r.company_id = p_company_id
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
                'full_name', p.full_name, 'email', p.email, 'role', p.role, 'is_active', p.is_active, 'created_at', p.created_at
            ))
            FROM public.profiles p WHERE p.company_id = p_company_id
        ), '[]'::jsonb)
    ) INTO v_snapshot;

    RETURN v_snapshot;
END;
$$;
