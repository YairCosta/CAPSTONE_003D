-- ============================================================================
-- CRM GEOESTRATÉGICO: ESQUEMA POSTGIS, KANBAN Y POLÍTICAS RLS MULTI-EMPRESA
-- ============================================================================

-- 1. Habilitación de extensiones necesarias
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Tabla de Empresas / Inquilinos (Tenants)
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    tax_id VARCHAR(50),
    slug VARCHAR(100) UNIQUE NOT NULL,
    default_lat DOUBLE PRECISION DEFAULT -33.4489,
    default_lng DOUBLE PRECISION DEFAULT -70.6693,
    default_zoom INT DEFAULT 12,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. Tabla de Perfiles vinculada a Supabase Auth
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role VARCHAR(50) DEFAULT 'agent' CHECK (role IN ('superadmin', 'admin', 'manager', 'agent')),
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 4. Tabla de Territorios / Zonas Comerciales (Polígonos PostGIS)
CREATE TABLE IF NOT EXISTS public.territories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    code VARCHAR(50),
    category VARCHAR(50) DEFAULT 'district',
    color_hex VARCHAR(7) DEFAULT '#3B82F6',
    polygon extensions.GEOGRAPHY(MultiPolygon, 4326) NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_territories_polygon ON public.territories USING GIST (polygon);
CREATE INDEX IF NOT EXISTS idx_territories_company ON public.territories (company_id);

-- 5. Tabla de Caché de Geocodificación
CREATE TABLE IF NOT EXISTS public.geocoding_cache (
    address_hash VARCHAR(64) PRIMARY KEY,
    raw_query TEXT NOT NULL,
    formatted_address TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    location extensions.GEOGRAPHY(Point, 4326) NOT NULL,
    provider VARCHAR(50) DEFAULT 'google_maps',
    response_payload JSONB,
    hit_count INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    last_hit_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_geocoding_cache_location ON public.geocoding_cache USING GIST (location);

-- 6. Tabla Principal de Leads (Estados de Pipeline Ampliados)
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    full_name VARCHAR(200) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    
    -- Estados del Pipeline Comercial: nuevo, contacto, calificado, propuesta, pendientes_pago, cerrado/ganado, perdido
    commercial_status VARCHAR(50) DEFAULT 'new' CHECK (
        commercial_status IN ('new', 'contacted', 'qualified', 'proposal', 'pending_payment', 'won', 'lost')
    ),
    estimated_deal_value NUMERIC(12, 2) DEFAULT 0.00,
    
    -- Datos de Ubicación y Georreferenciación
    raw_address TEXT NOT NULL,
    normalized_address TEXT,
    address_hash VARCHAR(64),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    location extensions.GEOGRAPHY(Point, 4326),
    geocoding_status VARCHAR(30) DEFAULT 'pending' CHECK (geocoding_status IN ('pending', 'processing', 'success', 'failed', 'manual_review')),
    geocoding_error TEXT,
    geocoded_at TIMESTAMPTZ,
    
    -- Asignación de territorio
    assigned_territory_id UUID REFERENCES public.territories(id) ON DELETE SET NULL,
    
    last_contacted_at TIMESTAMPTZ,
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_leads_company_id ON public.leads(company_id);
CREATE INDEX IF NOT EXISTS idx_leads_location ON public.leads USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_leads_commercial_status ON public.leads(commercial_status);
CREATE INDEX IF NOT EXISTS idx_leads_geocoding_status ON public.leads(geocoding_status) WHERE geocoding_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_leads_address_hash ON public.leads(address_hash);

-- 7. Tabla de Actividades y Toma de Contacto (Bitácora de Interacciones)
CREATE TABLE IF NOT EXISTS public.lead_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    channel VARCHAR(30) NOT NULL CHECK (channel IN ('call', 'whatsapp', 'email', 'meeting', 'video_call')),
    outcome VARCHAR(50) NOT NULL CHECK (outcome IN ('interested', 'no_answer', 'requested_quote', 'rescheduled', 'rejected', 'paid')),
    summary TEXT NOT NULL,
    next_follow_up_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON public.lead_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_company ON public.lead_activities(company_id);

-- ============================================================================
-- SEGURIDAD: ROW LEVEL SECURITY (RLS) MULTI-EMPRESA
-- ============================================================================

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.territories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geocoding_cache ENABLE ROW LEVEL SECURITY;

-- Helper tenant user
CREATE OR REPLACE FUNCTION public.get_current_user_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT company_id FROM public.profiles WHERE id = auth.uid();
$$;

-- Políticas 'companies', 'profiles', 'territories'
CREATE POLICY "Aislamiento de empresas" ON public.companies FOR ALL USING (id = public.get_current_user_company_id());
CREATE POLICY "Aislamiento de perfiles" ON public.profiles FOR ALL USING (company_id = public.get_current_user_company_id());
CREATE POLICY "Aislamiento de territorios" ON public.territories FOR ALL USING (company_id = public.get_current_user_company_id());

-- Políticas 'leads'
CREATE POLICY "Aislamiento de leads (SELECT)" ON public.leads FOR SELECT USING (company_id = public.get_current_user_company_id());
CREATE POLICY "Creación de leads (INSERT)" ON public.leads FOR INSERT WITH CHECK (company_id = public.get_current_user_company_id());
CREATE POLICY "Actualización de leads (UPDATE)" ON public.leads FOR UPDATE USING (company_id = public.get_current_user_company_id());
CREATE POLICY "Eliminación de leads (DELETE)" ON public.leads FOR DELETE USING (company_id = public.get_current_user_company_id());

-- Políticas 'lead_activities'
CREATE POLICY "Aislamiento de actividades (SELECT)" ON public.lead_activities FOR SELECT USING (company_id = public.get_current_user_company_id());
CREATE POLICY "Registro de actividades (INSERT)" ON public.lead_activities FOR INSERT WITH CHECK (company_id = public.get_current_user_company_id());

CREATE POLICY "Lectura de cache de geocodificación" ON public.geocoding_cache FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- PROCEDIMIENTOS ALMACENADOS (RPC)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rpc_update_lead_coordinates(
    p_lead_id UUID,
    p_latitude DOUBLE PRECISION,
    p_longitude DOUBLE PRECISION,
    p_formatted_address TEXT,
    p_address_hash VARCHAR(64)
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_location GEOGRAPHY(Point, 4326);
    v_territory_id UUID;
    v_company_id UUID;
BEGIN
    SELECT company_id INTO v_company_id FROM public.leads WHERE id = p_lead_id;
    v_location := ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography;
    
    SELECT id INTO v_territory_id
    FROM public.territories
    WHERE company_id = v_company_id
      AND ST_Intersects(polygon, v_location)
    LIMIT 1;

    UPDATE public.leads
    SET 
        latitude = p_latitude,
        longitude = p_longitude,
        location = v_location,
        normalized_address = p_formatted_address,
        address_hash = p_address_hash,
        geocoding_status = 'success',
        geocoded_at = NOW(),
        assigned_territory_id = v_territory_id,
        updated_at = NOW()
    WHERE id = p_lead_id;
END;
$$;

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
