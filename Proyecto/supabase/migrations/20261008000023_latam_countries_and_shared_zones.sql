-- ============================================================================
-- 0023 · América Latina: 17 países más, elegidos por la gerencia, con un solo catálogo de zonas
-- ============================================================================
-- Piloto pidió trabajar en toda América Latina. Tres cambios:
--
--   1. Países: se suman Argentina, Bolivia, Brasil, Colombia, Costa Rica, Cuba, República Dominicana,
--      Ecuador, El Salvador, Guatemala, Honduras, México, Nicaragua, Panamá, Paraguay, Uruguay y
--      Venezuela, cada uno con su moneda y el nombre de su zona (municipio, cantón, partido…). Sus zonas
--      llegan en las migraciones 0025 a 0027.
--   2. Quién elige los países: el administrador de la plataforma define el plan (Nacional o
--      Internacional) y el país base; con el plan Internacional, la GERENCIA del CRM activa y desactiva
--      países. Nunca el país base, nunca en el plan Nacional, nunca en otro CRM. Desactivar oculta los
--      datos del país (las políticas RLS ya lo hacen con is_country_enabled), no los borra.
--   3. Un solo catálogo de contornos: hasta ahora cada CRM guardaba su propia copia del contorno de
--      cada zona (12 MB con dos CRMs y dos países). Con 14.500 zonas eso no escala. Desde ahora el
--      contorno se lee de zone_catalog; territories guarda solo qué zonas tiene el CRM. Es el paso
--      "expandir": la columna territories.polygon deja de ser obligatoria y las zonas nuevas llegan sin
--      ella. La 0024 vacía las copias viejas.
-- ============================================================================

-- ------------------------------------------------------------------ 1. países
INSERT INTO public.countries
    (code, name, currency_code, locale, zone_label_singular, zone_label_plural, phone_prefix, tax_id_label,
     default_lat, default_lng, default_zoom, is_available)
VALUES
    ('AR', 'Argentina', 'ARS', 'es-AR', 'Partido o departamento', 'Partidos y departamentos', '+54 9', 'CUIT', -34.6, -58.44, 11, TRUE),
    ('BO', 'Bolivia', 'BOB', 'es-BO', 'Provincia', 'Provincias', '+591', 'NIT', -16.5, -68.13, 11, TRUE),
    ('BR', 'Brasil', 'BRL', 'pt-BR', 'Municipio', 'Municipios', '+55', 'CNPJ', -23.55, -46.63, 10, TRUE),
    ('CO', 'Colombia', 'COP', 'es-CO', 'Municipio', 'Municipios', '+57', 'NIT', 4.65, -74.08, 11, TRUE),
    ('CR', 'Costa Rica', 'CRC', 'es-CR', 'Cantón', 'Cantones', '+506', 'Cédula jurídica', 9.93, -84.08, 11, TRUE),
    ('CU', 'Cuba', 'CUP', 'es-CU', 'Municipio', 'Municipios', '+53', 'NIT', 23.11, -82.37, 11, TRUE),
    ('DO', 'República Dominicana', 'DOP', 'es-DO', 'Municipio', 'Municipios', '+1 809', 'RNC', 18.48, -69.93, 11, TRUE),
    ('EC', 'Ecuador', 'USD', 'es-EC', 'Cantón', 'Cantones', '+593', 'RUC', -0.18, -78.48, 11, TRUE),
    ('SV', 'El Salvador', 'USD', 'es-SV', 'Municipio', 'Municipios', '+503', 'NIT', 13.69, -89.22, 11, TRUE),
    ('GT', 'Guatemala', 'GTQ', 'es-GT', 'Municipio', 'Municipios', '+502', 'NIT', 14.62, -90.52, 11, TRUE),
    ('HN', 'Honduras', 'HNL', 'es-HN', 'Municipio', 'Municipios', '+504', 'RTN', 14.08, -87.2, 11, TRUE),
    ('MX', 'México', 'MXN', 'es-MX', 'Municipio', 'Municipios', '+52', 'RFC', 19.43, -99.13, 10, TRUE),
    ('NI', 'Nicaragua', 'NIO', 'es-NI', 'Municipio', 'Municipios', '+505', 'RUC', 12.13, -86.25, 11, TRUE),
    ('PA', 'Panamá', 'USD', 'es-PA', 'Distrito', 'Distritos', '+507', 'RUC', 8.98, -79.52, 11, TRUE),
    ('PY', 'Paraguay', 'PYG', 'es-PY', 'Distrito', 'Distritos', '+595', 'RUC', -25.29, -57.6, 11, TRUE),
    ('UY', 'Uruguay', 'UYU', 'es-UY', 'Municipio', 'Municipios', '+598', 'RUT', -34.88, -56.17, 11, TRUE),
    ('VE', 'Venezuela', 'VES', 'es-VE', 'Municipio', 'Municipios', '+58', 'RIF', 10.49, -66.88, 11, TRUE)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name, currency_code = EXCLUDED.currency_code, locale = EXCLUDED.locale,
    zone_label_singular = EXCLUDED.zone_label_singular, zone_label_plural = EXCLUDED.zone_label_plural,
    phone_prefix = EXCLUDED.phone_prefix, tax_id_label = EXCLUDED.tax_id_label,
    default_lat = EXCLUDED.default_lat, default_lng = EXCLUDED.default_lng, default_zoom = EXCLUDED.default_zoom,
    is_available = EXCLUDED.is_available;

-- ------------------------------------------------------------------ 2. la gerencia elige sus países
DROP POLICY IF EXISTS "Países del CRM: la gerencia activa países" ON public.company_countries;
CREATE POLICY "Países del CRM: la gerencia activa países" ON public.company_countries
    FOR INSERT TO authenticated
    WITH CHECK (
        company_id = public.get_current_user_company_id()
        AND public.get_current_user_role() = 'manager'
        AND EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.plan = 'international')
        AND EXISTS (SELECT 1 FROM public.countries co WHERE co.code = country_code AND co.is_available)
    );

DROP POLICY IF EXISTS "Países del CRM: la gerencia desactiva países" ON public.company_countries;
CREATE POLICY "Países del CRM: la gerencia desactiva países" ON public.company_countries
    FOR DELETE TO authenticated
    USING (
        company_id = public.get_current_user_company_id()
        AND public.get_current_user_role() = 'manager'
        AND EXISTS (
            SELECT 1 FROM public.companies c
            WHERE c.id = company_id AND c.plan = 'international' AND c.home_country <> country_code
        )
    );

-- ------------------------------------------------------------------ 3. contornos desde el catálogo
ALTER TABLE public.territories ALTER COLUMN polygon DROP NOT NULL;
COMMENT ON COLUMN public.territories.polygon IS
    'En desuso desde la 0023: el contorno se lee de zone_catalog (un solo catálogo para todos los CRMs). Las zonas nuevas llegan sin él y la 0024 vacía las copias; se elimina en una migración posterior.';

-- Copia al CRM las zonas de sus países habilitados, sin contorno
CREATE OR REPLACE FUNCTION public.seed_company_territories(p_company_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total INTEGER;
BEGIN
    INSERT INTO public.territories
        (company_id, country_code, name, code, category, color_hex, region_code, region_name, province_name, region_order)
    SELECT p_company_id, z.country_code, z.name, z.code, z.category, z.color_hex,
           z.region_code, z.region_name, z.province_name, z.region_order
    FROM public.zone_catalog z
    WHERE public.is_country_enabled(p_company_id, z.country_code)
      AND NOT EXISTS (
          SELECT 1 FROM public.territories t
          WHERE t.company_id = p_company_id AND t.country_code = z.country_code AND t.code = z.code
      )
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_total = ROW_COUNT;
    RETURN v_total;
END;
$$;

COMMENT ON FUNCTION public.seed_company_territories(UUID) IS
    'Copia a un CRM las zonas del catálogo de sus países habilitados (sin contorno: se lee de zone_catalog). La usan los triggers de companies y company_countries.';
REVOKE EXECUTE ON FUNCTION public.seed_company_territories(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE VIEW public.territories_geojson WITH (security_invoker = true) AS
SELECT t.id,
       t.company_id,
       t.country_code,
       t.name,
       t.code,
       t.color_hex,
       extensions.ST_AsGeoJSON(COALESCE(z.polygon, t.polygon))::jsonb AS polygon,
       t.region_code,
       t.region_name,
       t.province_name,
       t.region_order
FROM public.territories t
LEFT JOIN public.zone_catalog z ON z.country_code = t.country_code AND z.code = t.code;

COMMENT ON VIEW public.territories_geojson IS
    'Zonas del CRM con su contorno en GeoJSON, leído del catálogo común (zone_catalog). Hereda la RLS de territories (security_invoker).';

-- La distribución por zona devuelve el contorno del catálogo
CREATE OR REPLACE FUNCTION public.get_lead_distribution_by_territories(p_company_id UUID, p_countries CHAR(2)[] DEFAULT NULL)
RETURNS TABLE(
    territory_id UUID,
    country_code CHAR(2),
    territory_name VARCHAR,
    territory_code VARCHAR,
    color_hex VARCHAR,
    lead_count BIGINT,
    total_country_leads BIGINT,
    percentage NUMERIC,
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
        SELECT t.id, t.country_code, t.name, t.code, t.color_hex, COUNT(l.id)::BIGINT AS leads_in_territory
        FROM public.territories t
        LEFT JOIN public.leads l
            ON l.company_id = p_company_id
            AND l.country_code = t.country_code
            AND l.assigned_territory_id = t.id
        WHERE t.company_id = p_company_id
          AND t.country_code IN (SELECT code FROM visible_countries)
        GROUP BY t.id, t.country_code, t.name, t.code, t.color_hex
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
        ST_AsGeoJSON(COALESCE(z.polygon, t.polygon))::jsonb AS geojson_polygon
    FROM territory_counts tc
    JOIN public.territories t ON t.id = tc.id
    LEFT JOIN public.zone_catalog z ON z.country_code = tc.country_code AND z.code = tc.code
    LEFT JOIN country_totals ct ON ct.country_code = tc.country_code
    ORDER BY tc.leads_in_territory DESC;
END;
$$;

-- La exportación de un CRM lleva el contorno del catálogo
CREATE OR REPLACE FUNCTION public.export_tenant_snapshot(p_company_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
            -- El contorno viene del catálogo común (0023); la copia en territories queda vacía
            SELECT jsonb_agg(to_jsonb(t) - 'polygon' || jsonb_build_object('geojson', ST_AsGeoJSON(COALESCE(z.polygon, t.polygon))::jsonb))
            FROM public.territories t
            LEFT JOIN public.zone_catalog z ON z.country_code = t.country_code AND z.code = t.code
            WHERE t.company_id = p_company_id
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
$function$;
