-- ============================================================================
-- 0021 · Contraer: se eliminan las coordenadas de los leads y la caché de geocodificación
-- ============================================================================
-- Último paso del procedimiento de docs/BASE_DE_DATOS.md (expandir → copiar → convivir → contraer)
-- para la minimización de la 0019. Desde la 0019 la app no lee ni escribe coordenadas y la base las
-- rechaza (leads_sin_coordenadas); ahora las columnas desaparecen:
--   · leads.latitude, leads.longitude, leads.location (con su índice, sus CHECK y el trigger que
--     calculaba location);
--   · leads.address_hash y la tabla geocoding_cache: solo servían para no geocodificar dos veces la
--     misma dirección, y Revela ya no geocodifica;
--   · rpc_update_lead_coordinates(), retirada de la API en la 0019.
-- Las funciones que las nombraban se reescriben sin ellas. get_lead_distribution_by_territories()
-- contaba los leads de una zona por coordenada: ahora cuenta por zona asignada, como la app.
--
-- Datos existentes: al aplicarla, las tres columnas, address_hash y la caché estaban vacías en todos
-- los CRMs (verificado). No se pierde información: la zona del lead (assigned_territory_id) queda.
-- ============================================================================

-- 1. Lo que escribía coordenadas
DROP FUNCTION IF EXISTS public.rpc_update_lead_coordinates(UUID, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, VARCHAR);
DROP TRIGGER IF EXISTS trg_leads_sync_location ON public.leads;
DROP FUNCTION IF EXISTS public.leads_sync_location();

-- 2. Anonimizar ya no tiene coordenadas ni caché que limpiar
CREATE OR REPLACE FUNCTION public.anonymize_lead_internal(p_lead_id UUID, p_reason VARCHAR)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_reason NOT IN ('request', 'retention') THEN
        RAISE EXCEPTION 'Motivo de anonimización no válido.';
    END IF;

    PERFORM set_config('revela.privacy_bypass', 'on', TRUE);

    UPDATE public.leads SET
        full_name = 'Titular eliminado',
        job_title = NULL,
        email = NULL,
        phone = NULL,
        notes = NULL,
        raw_address = 'Dirección eliminada',
        normalized_address = NULL,
        no_contact = TRUE,
        consent_status = 'withdrawn',
        consent_at = TIMEZONE('utc'::text, NOW()),
        anonymized_at = TIMEZONE('utc'::text, NOW()),
        anonymized_reason = p_reason
    WHERE id = p_lead_id AND anonymized_at IS NULL;
    IF NOT FOUND THEN
        PERFORM set_config('revela.privacy_bypass', '', TRUE);
        RETURN; -- ya anonimizado o inexistente: nada que hacer
    END IF;
    -- Se conservan zona, etapa, monto, moneda e ítems: la operación comercial sigue cuadrando

    DELETE FROM public.lead_contacts WHERE lead_id = p_lead_id AND NOT is_primary;
    UPDATE public.lead_contacts SET full_name = 'Titular eliminado', job_title = NULL, email = NULL, phone = NULL
    WHERE lead_id = p_lead_id AND is_primary;

    UPDATE public.lead_activities
    SET contact_name = NULL, summary = 'Contenido eliminado junto con los datos del titular'
    WHERE lead_id = p_lead_id;

    PERFORM set_config('revela.privacy_bypass', '', TRUE);
END;
$$;

-- 3. Un titular anonimizado no se re-identifica (ya sin columnas de coordenadas que vigilar)
CREATE OR REPLACE FUNCTION public.leads_enforce_privacy()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF public.privacy_bypass_active() THEN
        RETURN NEW;
    END IF;

    -- Art. 8 ter: con una solicitud pendiente, el lead no se toca
    IF public.lead_is_blocked(OLD.id) THEN
        RAISE EXCEPTION 'Lead bloqueado: hay una solicitud del titular pendiente de resolver.' USING ERRCODE = '42501';
    END IF;

    -- La anonimización solo la fijan las funciones de privacidad
    IF NEW.anonymized_at IS DISTINCT FROM OLD.anonymized_at
        OR NEW.anonymized_reason IS DISTINCT FROM OLD.anonymized_reason THEN
        RAISE EXCEPTION 'La anonimización no se edita directamente.' USING ERRCODE = '42501';
    END IF;

    IF OLD.anonymized_at IS NOT NULL AND (
        NEW.full_name IS DISTINCT FROM OLD.full_name
        OR NEW.email IS DISTINCT FROM OLD.email
        OR NEW.phone IS DISTINCT FROM OLD.phone
        OR NEW.job_title IS DISTINCT FROM OLD.job_title
        OR NEW.notes IS DISTINCT FROM OLD.notes
        OR NEW.raw_address IS DISTINCT FROM OLD.raw_address
        OR NEW.normalized_address IS DISTINCT FROM OLD.normalized_address
        OR NEW.consent_status IS DISTINCT FROM OLD.consent_status
        OR NEW.no_contact IS DISTINCT FROM OLD.no_contact
    ) THEN
        RAISE EXCEPTION 'Los datos de este titular fueron eliminados y no se pueden volver a cargar.' USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

-- 4. Distribución de leads por zona: por la zona asignada (antes, por coordenada dentro del polígono)
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
        SELECT t.id, t.country_code, t.name, t.code, t.color_hex, t.polygon, COUNT(l.id)::BIGINT AS leads_in_territory
        FROM public.territories t
        LEFT JOIN public.leads l
            ON l.company_id = p_company_id
            AND l.country_code = t.country_code
            AND l.assigned_territory_id = t.id
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

-- 5. Las columnas y la caché
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_sin_coordenadas;
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_coordinates_range;
DROP INDEX IF EXISTS public.idx_leads_location;
ALTER TABLE public.leads
    DROP COLUMN IF EXISTS latitude,
    DROP COLUMN IF EXISTS longitude,
    DROP COLUMN IF EXISTS location,
    DROP COLUMN IF EXISTS address_hash;

DROP TABLE IF EXISTS public.geocoding_cache;

COMMENT ON TABLE public.leads IS
    'Oportunidad comercial: una persona de contacto con su etapa, valor y zona (assigned_territory_id). Nunca guarda coordenadas (minimización, Ley 21.719; 0019 y 0021).';
