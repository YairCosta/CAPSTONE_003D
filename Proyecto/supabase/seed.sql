-- ============================================================================
-- SEED DATA DE PRUEBA: CRM GEOESTRATÉGICO (SANTIAGO DE CHILE)
-- ============================================================================

DO $$
DECLARE
    v_company_id UUID;
    v_providencia_id UUID;
    v_las_condes_id UUID;
    v_santiago_centro_id UUID;
    v_vitacura_id UUID;
    v_nunoa_id UUID;
BEGIN
    -- 1. Crear Empresa Demo
    INSERT INTO public.companies (name, tax_id, slug, default_lat, default_lng, default_zoom)
    VALUES ('Inmobiliaria & Retail Demo SpA', '76.123.456-7', 'retail-demo', -33.4372, -70.6345, 13)
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_company_id;

    -- 2. Crear Territorios / Comunas con Polígonos Geoespaciales PostGIS
    -- Providencia
    INSERT INTO public.territories (company_id, name, code, category, color_hex, polygon)
    VALUES (
        v_company_id,
        'Providencia',
        'PROV-01',
        'comuna',
        '#3B82F6', -- Azul
        ST_SetSRID(ST_GeomFromGeoJSON('{
            "type": "MultiPolygon",
            "coordinates": [[[
                [-70.6300, -33.4200],
                [-70.5850, -33.4150],
                [-70.5900, -33.4450],
                [-70.6350, -33.4400],
                [-70.6300, -33.4200]
            ]]]
        }'), 4326)::geography
    )
    RETURNING id INTO v_providencia_id;

    -- Las Condes
    INSERT INTO public.territories (company_id, name, code, category, color_hex, polygon)
    VALUES (
        v_company_id,
        'Las Condes',
        'LC-02',
        'comuna',
        '#8B5CF6', -- Púrpura
        ST_SetSRID(ST_GeomFromGeoJSON('{
            "type": "MultiPolygon",
            "coordinates": [[[
                [-70.5850, -33.4150],
                [-70.5200, -33.3900],
                [-70.5100, -33.4300],
                [-70.5900, -33.4450],
                [-70.5850, -33.4150]
            ]]]
        }'), 4326)::geography
    )
    RETURNING id INTO v_las_condes_id;

    -- Santiago Centro
    INSERT INTO public.territories (company_id, name, code, category, color_hex, polygon)
    VALUES (
        v_company_id,
        'Santiago Centro',
        'STGO-03',
        'comuna',
        '#10B981', -- Esmeralda
        ST_SetSRID(ST_GeomFromGeoJSON('{
            "type": "MultiPolygon",
            "coordinates": [[[
                [-70.6800, -33.4300],
                [-70.6300, -33.4200],
                [-70.6350, -33.4600],
                [-70.6850, -33.4650],
                [-70.6800, -33.4300]
            ]]]
        }'), 4326)::geography
    )
    RETURNING id INTO v_santiago_centro_id;

    -- Vitacura
    INSERT INTO public.territories (company_id, name, code, category, color_hex, polygon)
    VALUES (
        v_company_id,
        'Vitacura',
        'VIT-04',
        'comuna',
        '#F59E0B', -- Ámbar
        ST_SetSRID(ST_GeomFromGeoJSON('{
            "type": "MultiPolygon",
            "coordinates": [[[
                [-70.6100, -33.3900],
                [-70.5400, -33.3600],
                [-70.5200, -33.3900],
                [-70.5850, -33.4150],
                [-70.6100, -33.3900]
            ]]]
        }'), 4326)::geography
    )
    RETURNING id INTO v_vitacura_id;

    -- Ñuñoa
    INSERT INTO public.territories (company_id, name, code, category, color_hex, polygon)
    VALUES (
        v_company_id,
        'Ñuñoa',
        'NUN-05',
        'comuna',
        '#EC4899', -- Rosa
        ST_SetSRID(ST_GeomFromGeoJSON('{
            "type": "MultiPolygon",
            "coordinates": [[[
                [-70.6350, -33.4400],
                [-70.5900, -33.4450],
                [-70.5800, -33.4750],
                [-70.6350, -33.4700],
                [-70.6350, -33.4400]
            ]]]
        }'), 4326)::geography
    )
    RETURNING id INTO v_nunoa_id;

    -- 3. Sembrar Leads de Prueba
    -- Leads en Providencia
    PERFORM public.rpc_update_lead_coordinates(
        (INSERT INTO public.leads (company_id, full_name, email, phone, commercial_status, estimated_deal_value, raw_address)
         VALUES (v_company_id, 'Camila Soto', 'camila.soto@empresa.cl', '+56987654321', 'qualified', 45000, 'Av. Providencia 1234, Providencia')
         RETURNING id),
        -33.4260, -70.6150, 'Av. Providencia 1234, Providencia, Región Metropolitana', 'hash_seed_1'
    );

    PERFORM public.rpc_update_lead_coordinates(
        (INSERT INTO public.leads (company_id, full_name, email, phone, commercial_status, estimated_deal_value, raw_address)
         VALUES (v_company_id, 'Matías Larraín', 'matias.l@retail.cl', '+56911223344', 'converted', 89000, 'Av. Pedro de Valdivia 900, Providencia')
         RETURNING id),
        -33.4310, -70.6080, 'Av. Pedro de Valdivia 900, Providencia, Región Metropolitana', 'hash_seed_2'
    );

    PERFORM public.rpc_update_lead_coordinates(
        (INSERT INTO public.leads (company_id, full_name, email, phone, commercial_status, estimated_deal_value, raw_address)
         VALUES (v_company_id, 'Fernanda Silva', 'fsilva@gmail.com', '+56944332211', 'proposal', 62000, 'Av. Andrés Bello 2777, Providencia')
         RETURNING id),
        -33.4180, -70.6050, 'Av. Andrés Bello 2777, Providencia, Región Metropolitana', 'hash_seed_3'
    );

    -- Leads en Las Condes
    PERFORM public.rpc_update_lead_coordinates(
        (INSERT INTO public.leads (company_id, full_name, email, phone, commercial_status, estimated_deal_value, raw_address)
         VALUES (v_company_id, 'Alejandro Valenzuela', 'avalenzuela@corp.cl', '+56977889900', 'converted', 125000, 'Av. Apoquindo 4500, Las Condes')
         RETURNING id),
        -33.4110, -70.5750, 'Av. Apoquindo 4500, Las Condes, Región Metropolitana', 'hash_seed_4'
    );

    PERFORM public.rpc_update_lead_coordinates(
        (INSERT INTO public.leads (company_id, full_name, email, phone, commercial_status, estimated_deal_value, raw_address)
         VALUES (v_company_id, 'Javiera Montes', 'jmontes@inversiones.cl', '+56955667788', 'qualified', 95000, 'Av. Manquehue Norte 160, Las Condes')
         RETURNING id),
        -33.4030, -70.5650, 'Av. Manquehue Norte 160, Las Condes, Región Metropolitana', 'hash_seed_5'
    );

    -- Leads en Santiago Centro
    PERFORM public.rpc_update_lead_coordinates(
        (INSERT INTO public.leads (company_id, full_name, email, phone, commercial_status, estimated_deal_value, raw_address)
         VALUES (v_company_id, 'Gonzalo Pardo', 'gpardo@logistica.cl', '+56922334455', 'contacted', 35000, 'Paseo Ahumada 250, Santiago Centro')
         RETURNING id),
        -33.4410, -70.6510, 'Paseo Ahumada 250, Santiago, Región Metropolitana', 'hash_seed_6'
    );

    -- Lead en Vitacura
    PERFORM public.rpc_update_lead_coordinates(
        (INSERT INTO public.leads (company_id, full_name, email, phone, commercial_status, estimated_deal_value, raw_address)
         VALUES (v_company_id, 'Rodrigo Echeverría', 'recheverria@holding.cl', '+56966778899', 'proposal', 180000, 'Av. Vitacura 3565, Vitacura')
         RETURNING id),
        -33.3980, -70.5890, 'Av. Vitacura 3565, Vitacura, Región Metropolitana', 'hash_seed_7'
    );

    RAISE NOTICE 'Seed geoestratégico ejecutado con éxito para company_id: %', v_company_id;
END $$;
