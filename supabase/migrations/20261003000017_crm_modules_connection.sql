-- ============================================================================
-- 0017 · Etapa 3: la base lista para leads, empresas cliente, contactos, catálogo y zonas
-- ============================================================================
-- La app pasa a guardar el trabajo diario del CRM en la base (docs/BASE_DE_DATOS.md §6). Lo que
-- la base necesitaba para recibirlo:
--
-- 1. Zonas. Cada CRM tiene sus propias zonas (territories, con polígono y company_id), pero nadie
--    las creaba: un CRM nuevo quedaba sin comunas ni distritos y ningún lead podía ubicarse. Se
--    agrega `zone_catalog`, dato de referencia como `countries` (sin company_id), y la base copia
--    sola las zonas de cada país habilitado a cada CRM: al crearlo, al habilitar un país o al
--    cambiar de plan. Los CRMs que ya existen reciben las suyas en esta misma migración.
-- 2. `territories_geojson`: la misma tabla de zonas con el polígono en GeoJSON, que es lo que
--    dibuja el mapa. Respeta RLS (security_invoker): cada CRM ve solo sus zonas.
-- 3. `leads.location` se calcula sola desde latitud y longitud (el mapa y las funciones
--    espaciales usan la misma ubicación que la app muestra).
-- 4. El contacto principal se copia solo a `lead_contacts` (is_primary). Mientras dure la etapa
--    "convivir" de la 0010, leads.full_name sigue siendo la fuente de verdad y lead_contacts, su
--    espejo; antes el espejo solo existía para los leads copiados en la 0010.
-- 5. Gerencia elimina empresas cliente sin leads, como ya hacía la app en memoria. Con leads no:
--    se desactivan (la clave foránea las dejaría huérfanas).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Catálogo de zonas y copia a cada CRM
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.zone_catalog (
    country_code CHAR(2) NOT NULL REFERENCES public.countries(code),
    code VARCHAR(50) NOT NULL,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'district',
    color_hex VARCHAR(7) NOT NULL DEFAULT '#3B82F6',
    polygon extensions.GEOGRAPHY(MultiPolygon, 4326) NOT NULL,
    PRIMARY KEY (country_code, code),
    CONSTRAINT zone_catalog_name_not_blank CHECK (LENGTH(BTRIM(name)) > 0)
);

COMMENT ON TABLE public.zone_catalog IS
    'Zonas de referencia por país (comunas, distritos…), con su polígono. Se copian a territories de cada CRM que habilita el país. Dato de referencia, sin company_id.';

ALTER TABLE public.zone_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Catálogo de zonas: lectura" ON public.zone_catalog;
CREATE POLICY "Catálogo de zonas: lectura" ON public.zone_catalog FOR SELECT TO authenticated USING (TRUE);
GRANT SELECT ON public.zone_catalog TO authenticated;

-- Polígonos de la primera versión (los mismos de la demo). Los oficiales reemplazan estos más adelante.
INSERT INTO public.zone_catalog (country_code, code, name, category, color_hex, polygon)
SELECT v.country_code, v.code, v.name, v.category, v.color_hex, extensions.ST_GeogFromText(v.wkt)
FROM (VALUES
    ('CL', 'PROV-01', 'Providencia', 'commune', '#3B82F6', 'SRID=4326;MULTIPOLYGON(((-70.63 -33.42, -70.585 -33.415, -70.59 -33.445, -70.635 -33.44, -70.63 -33.42)))'),
    ('CL', 'LC-02', 'Las Condes', 'commune', '#8B5CF6', 'SRID=4326;MULTIPOLYGON(((-70.585 -33.415, -70.52 -33.39, -70.51 -33.43, -70.59 -33.445, -70.585 -33.415)))'),
    ('CL', 'STGO-03', 'Santiago Centro', 'commune', '#10B981', 'SRID=4326;MULTIPOLYGON(((-70.68 -33.43, -70.63 -33.42, -70.635 -33.46, -70.685 -33.465, -70.68 -33.43)))'),
    ('CL', 'VIT-04', 'Vitacura', 'commune', '#F59E0B', 'SRID=4326;MULTIPOLYGON(((-70.61 -33.39, -70.54 -33.36, -70.52 -33.39, -70.585 -33.415, -70.61 -33.39)))'),
    ('CL', 'NUN-05', 'Ñuñoa', 'commune', '#EC4899', 'SRID=4326;MULTIPOLYGON(((-70.635 -33.44, -70.59 -33.445, -70.58 -33.475, -70.635 -33.47, -70.635 -33.44)))'),
    ('PE', 'LIM-SI', 'San Isidro', 'district', '#0EA5E9', 'SRID=4326;MULTIPOLYGON(((-77.0475 -12.0865, -77.0255 -12.0885, -77.0275 -12.1085, -77.0455 -12.1065, -77.0475 -12.0865)))'),
    ('PE', 'LIM-MF', 'Miraflores', 'district', '#F97316', 'SRID=4326;MULTIPOLYGON(((-77.041 -12.1115, -77.019 -12.1135, -77.021 -12.1335, -77.039 -12.1315, -77.041 -12.1115)))'),
    ('PE', 'LIM-SU', 'Santiago de Surco', 'district', '#22C55E', 'SRID=4326;MULTIPOLYGON(((-77.007 -12.1315, -76.977 -12.1335, -76.979 -12.1595, -77.005 -12.1575, -77.007 -12.1315)))'),
    ('PE', 'LIM-SB', 'San Borja', 'district', '#A855F7', 'SRID=4326;MULTIPOLYGON(((-77.01 -12.095, -76.988 -12.097, -76.99 -12.117, -77.008 -12.115, -77.01 -12.095)))'),
    ('PE', 'LIM-LM', 'La Molina', 'district', '#E11D48', 'SRID=4326;MULTIPOLYGON(((-76.944 -12.064, -76.912 -12.066, -76.914 -12.094, -76.942 -12.092, -76.944 -12.064)))')
) AS v(country_code, code, name, category, color_hex, wkt)
ON CONFLICT (country_code, code) DO NOTHING;

-- Copia las zonas de los países habilitados que al CRM le falten. Idempotente.
CREATE OR REPLACE FUNCTION public.seed_company_territories(p_company_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total INTEGER;
BEGIN
    INSERT INTO public.territories (company_id, country_code, name, code, category, color_hex, polygon)
    SELECT p_company_id, z.country_code, z.name, z.code, z.category, z.color_hex, z.polygon
    FROM public.zone_catalog z
    WHERE public.is_country_enabled(p_company_id, z.country_code)
      AND NOT EXISTS (
          SELECT 1 FROM public.territories t WHERE t.company_id = p_company_id AND t.code = z.code
      )
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_total = ROW_COUNT;
    RETURN v_total;
END;
$$;

COMMENT ON FUNCTION public.seed_company_territories(UUID) IS
    'Copia a un CRM las zonas del catálogo de sus países habilitados que todavía no tiene. La llaman los triggers de companies y company_countries.';

CREATE OR REPLACE FUNCTION public.companies_seed_territories()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    PERFORM public.seed_company_territories(NEW.id);
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.company_countries_seed_territories()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    PERFORM public.seed_company_territories(NEW.company_id);
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_companies_seed_territories ON public.companies;
CREATE TRIGGER trg_companies_seed_territories
    AFTER INSERT OR UPDATE OF plan, home_country ON public.companies
    FOR EACH ROW EXECUTE FUNCTION public.companies_seed_territories();

DROP TRIGGER IF EXISTS trg_company_countries_seed_territories ON public.company_countries;
CREATE TRIGGER trg_company_countries_seed_territories
    AFTER INSERT ON public.company_countries
    FOR EACH ROW EXECUTE FUNCTION public.company_countries_seed_territories();

-- Los CRMs que ya existen (Empresa Piloto, Revela Pruebas) reciben sus zonas ahora
SELECT public.seed_company_territories(c.id) FROM public.companies c;

-- ----------------------------------------------------------------------------
-- 2. Zonas con su polígono en GeoJSON, para el mapa
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.territories_geojson
WITH (security_invoker = true) AS
SELECT
    t.id,
    t.company_id,
    t.country_code,
    t.name,
    t.code,
    t.color_hex,
    extensions.ST_AsGeoJSON(t.polygon)::jsonb AS polygon
FROM public.territories t;

COMMENT ON VIEW public.territories_geojson IS
    'Zonas del CRM con el polígono en GeoJSON para el mapa de la app. security_invoker: aplica el RLS de territories.';
GRANT SELECT ON public.territories_geojson TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. Ubicación espacial del lead desde su latitud y longitud
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leads_sync_location()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.latitude IS NULL OR NEW.longitude IS NULL THEN
        NEW.location := NULL;
    ELSE
        NEW.location := extensions.ST_SetSRID(extensions.ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::extensions.geography;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_sync_location ON public.leads;
CREATE TRIGGER trg_leads_sync_location
    BEFORE INSERT OR UPDATE OF latitude, longitude ON public.leads
    FOR EACH ROW EXECUTE FUNCTION public.leads_sync_location();

COMMENT ON FUNCTION public.leads_sync_location() IS
    'Mantiene leads.location igual a (longitude, latitude). Sin coordenadas, sin ubicación.';

-- ----------------------------------------------------------------------------
-- 4. Espejo del contacto principal en lead_contacts
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leads_sync_primary_contact()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    -- La anonimización actualiza el contacto principal por su cuenta
    IF public.privacy_bypass_active() THEN
        RETURN NULL;
    END IF;
    IF TG_OP = 'UPDATE'
       AND NEW.full_name IS NOT DISTINCT FROM OLD.full_name
       AND NEW.job_title IS NOT DISTINCT FROM OLD.job_title
       AND NEW.email IS NOT DISTINCT FROM OLD.email
       AND NEW.phone IS NOT DISTINCT FROM OLD.phone THEN
        RETURN NULL;
    END IF;

    UPDATE public.lead_contacts
    SET full_name = NEW.full_name, job_title = NEW.job_title, email = NEW.email, phone = NEW.phone
    WHERE lead_id = NEW.id AND is_primary;

    IF NOT FOUND THEN
        INSERT INTO public.lead_contacts (company_id, lead_id, full_name, job_title, email, phone, is_primary)
        VALUES (NEW.company_id, NEW.id, NEW.full_name, NEW.job_title, NEW.email, NEW.phone, TRUE);
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_sync_primary_contact ON public.leads;
CREATE TRIGGER trg_leads_sync_primary_contact
    AFTER INSERT OR UPDATE OF full_name, job_title, email, phone ON public.leads
    FOR EACH ROW EXECUTE FUNCTION public.leads_sync_primary_contact();

COMMENT ON FUNCTION public.leads_sync_primary_contact() IS
    'Copia el contacto principal del lead (full_name, job_title, email, phone) a lead_contacts con is_primary = TRUE.';

-- ----------------------------------------------------------------------------
-- 5. Gerencia elimina empresas cliente sin leads
-- ----------------------------------------------------------------------------
-- SECURITY DEFINER para ver también los leads de países que el plan hoy oculta: una empresa con
-- leads en Perú no se puede borrar aunque el CRM haya vuelto al plan Nacional.
CREATE OR REPLACE FUNCTION public.client_account_has_leads(p_account_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.leads l
        WHERE l.client_account_id = p_account_id
          AND l.company_id = public.get_current_user_company_id()
    );
$$;

COMMENT ON FUNCTION public.client_account_has_leads(UUID) IS
    'TRUE si la empresa cliente tiene leads en el CRM de la sesión (en cualquier país). La usa la política de eliminación.';

DROP POLICY IF EXISTS "Empresas cliente: eliminación gerencia" ON public.client_accounts;
CREATE POLICY "Empresas cliente: eliminación gerencia" ON public.client_accounts
    FOR DELETE TO authenticated
    USING (
        company_id = public.get_current_user_company_id()
        AND public.get_current_user_role() = 'manager'
        AND NOT public.client_account_has_leads(id)
    );

COMMENT ON POLICY "Empresas cliente: eliminación gerencia" ON public.client_accounts IS
    'El gerente elimina empresas cliente de su CRM que no tienen ningún lead. Las que tienen leads se desactivan.';

-- ----------------------------------------------------------------------------
-- 6. Permisos de las funciones nuevas (criterio de la 0014)
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.seed_company_territories(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.companies_seed_territories() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.company_countries_seed_territories() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.leads_sync_location() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.leads_sync_primary_contact() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.client_account_has_leads(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_account_has_leads(UUID) TO authenticated, service_role;
