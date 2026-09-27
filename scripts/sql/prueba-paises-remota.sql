-- Países de América Latina elegidos por la gerencia (0023 a 0028), contra la base real (npm run test:db).
--
-- El administrador define el plan; con el plan Internacional la gerencia activa y desactiva países de
-- su CRM. Se prueba quién puede, qué llega al activar (las zonas del país, sin copiar su contorno) y
-- que desactivar oculta los datos sin borrarlos. CRMs, usuarios y leads ficticios; termina con un
-- error forzado que lo deshace todo.
DO $prueba$
DECLARE
    res JSONB := '[]'::jsonb;
    co_i UUID := gen_random_uuid();
    co_n UUID := gen_random_uuid();
    co_x UUID := gen_random_uuid();
    u_mgr_i UUID := gen_random_uuid();
    u_agent_i UUID := gen_random_uuid();
    u_mgr_n UUID := gen_random_uuid();
    u_mgr_x UUID := gen_random_uuid();
    lead_pe UUID := gen_random_uuid();
    v_count INTEGER;
    v_num INTEGER;
    v_bool BOOLEAN;
    v_text TEXT;
BEGIN
    -- ------------------------------------------------------------ catálogo común
    SELECT count(*) INTO v_count FROM public.zone_catalog;
    SELECT count(DISTINCT country_code) INTO v_num FROM public.zone_catalog;
    res := res || jsonb_build_object('prueba', 'El catálogo trae las zonas de 19 países de América Latina (14.489)',
        'ok', v_count = 14489 AND v_num = 19, 'detalle', jsonb_build_object('zonas', v_count, 'paises', v_num));

    SELECT string_agg(country_code || '=' || n, ' ' ORDER BY country_code) INTO v_text
    FROM (SELECT country_code, count(*) n FROM public.zone_catalog WHERE country_code IN ('AR', 'BR', 'CO', 'MX') GROUP BY 1) x;
    res := res || jsonb_build_object('prueba', 'Cada país trae su nivel municipal completo (Brasil 5.570, México 2.457, Colombia 1.122, Argentina 525)',
        'ok', v_text = 'AR=525 BR=5570 CO=1122 MX=2457', 'detalle', v_text);

    SELECT count(*) INTO v_count FROM public.zone_catalog WHERE region_code IS NULL OR region_name IS NULL;
    res := res || jsonb_build_object('prueba', 'Toda zona del catálogo tiene su región', 'ok', v_count = 0, 'detalle', v_count);

    SELECT string_agg(country_code || ' ' || name, ', ') INTO v_text FROM public.zone_catalog
    WHERE name ~* '^(null|none)$' OR name ~ '  ' OR name ~ '^Municipality' OR name = 'Isle of Youth'
       OR (country_code IN ('GT', 'HN', 'SV') AND name ~ '^(Lago|Embalse) ');
    res := res || jsonb_build_object('prueba', 'Ninguna zona se llama "Null", está en inglés o es un lago (0028)',
        'ok', v_text IS NULL, 'detalle', v_text);

    SELECT count(*) FILTER (WHERE category = 'district'), count(*) INTO v_num, v_count FROM public.zone_catalog WHERE country_code = 'SV';
    res := res || jsonb_build_object('prueba', 'El Salvador: sus 262 distritos (los antiguos municipios, reforma de 2024)',
        'ok', v_count = 262 AND v_num = 262, 'detalle', jsonb_build_object('zonas', v_count, 'distritos', v_num));

    SELECT string_agg(name, ' | ' ORDER BY country_code) INTO v_text FROM public.zone_catalog
    WHERE (country_code, code) IN (('CR', 'CR-SJ-SAN-JOSE'), ('PY', 'PY-ASU-ASUNCION'), ('HN', 'HN-FM-DISTRITO-CENTRAL'),
                                   ('CO', 'CO-DC-BOGOTA-D-C'), ('UY', 'UY-MO-MUNICIPIO-B'), ('PE', 'PE-150113'));
    res := res || jsonb_build_object('prueba', 'Nombres oficiales con tildes (San José, Asunción, Jesús María, Bogotá, D.C.)',
        'ok', v_text = 'Bogotá, D.C. | San José | Distrito Central | Jesús María | Asunción | Municipio B', 'detalle', v_text);

    SELECT count(*) INTO v_count FROM public.countries WHERE is_available;
    res := res || jsonb_build_object('prueba', 'Los 19 países están disponibles, cada uno con su moneda', 'ok', v_count = 19, 'detalle', v_count);

    -- ------------------------------------------------------------ datos de prueba (rol privilegiado)
    INSERT INTO auth.users (id, email, aud, role)
    VALUES (u_mgr_i, 'gerente.paises@prueba.invalid', 'authenticated', 'authenticated'),
           (u_agent_i, 'vendedor.paises@prueba.invalid', 'authenticated', 'authenticated'),
           (u_mgr_n, 'gerente.nacional@prueba.invalid', 'authenticated', 'authenticated'),
           (u_mgr_x, 'gerente.ajeno@prueba.invalid', 'authenticated', 'authenticated');
    INSERT INTO public.companies (id, name, slug, plan, home_country) VALUES
        (co_i, 'CRM Países Internacional', 'paises-i-' || left(co_i::text, 8), 'international', 'CL'),
        (co_n, 'CRM Países Nacional', 'paises-n-' || left(co_n::text, 8), 'national', 'CL'),
        (co_x, 'CRM Países Ajeno', 'paises-x-' || left(co_x::text, 8), 'international', 'CL');
    INSERT INTO public.company_countries (company_id, country_code) VALUES (co_i, 'CL'), (co_i, 'PE'), (co_n, 'CL'), (co_x, 'CL')
    ON CONFLICT DO NOTHING;
    INSERT INTO public.profiles (id, company_id, full_name, email, role) VALUES
        (u_mgr_i, co_i, 'Gerente Países', 'gerente.paises@prueba.invalid', 'manager'),
        (u_agent_i, co_i, 'Vendedor Países', 'vendedor.paises@prueba.invalid', 'agent'),
        (u_mgr_n, co_n, 'Gerente Nacional', 'gerente.nacional@prueba.invalid', 'manager'),
        (u_mgr_x, co_x, 'Gerente Ajeno', 'gerente.ajeno@prueba.invalid', 'manager');
    INSERT INTO public.leads (id, company_id, full_name, commercial_status, currency_code, raw_address, country_code,
                              value_source, data_origin, consent_status, consent_at)
    VALUES (lead_pe, co_i, 'Lead en Lima', 'new', 'PEN', 'Av. Larco 1150', 'PE', 'manual', 'form', 'inquiry', NOW());

    SELECT count(*), count(polygon) INTO v_count, v_num FROM public.territories WHERE company_id = co_i;
    res := res || jsonb_build_object('prueba', 'Un CRM nuevo recibe las zonas de sus países sin copiar su contorno (0023)',
        'ok', v_count = 2238 AND v_num = 0, 'detalle', jsonb_build_object('zonas', v_count, 'con_copia', v_num));

    SELECT name || ' (' || province_name || ')' INTO v_text FROM public.territories WHERE company_id = co_i AND code = 'PE-150113';
    res := res || jsonb_build_object('prueba', 'Las zonas copiadas al CRM llevan el nombre corregido',
        'ok', v_text = 'Jesús María (Lima)', 'detalle', v_text);

    SELECT count(*) INTO v_count FROM public.territories t JOIN public.zone_catalog z USING (country_code, code)
    WHERE t.name <> z.name OR t.province_name IS DISTINCT FROM z.province_name;
    res := res || jsonb_build_object('prueba', 'Ningún CRM quedó con el nombre viejo de una zona del catálogo',
        'ok', v_count = 0, 'detalle', v_count);

    EXECUTE 'SET LOCAL ROLE authenticated';

    -- ------------------------------------------------------------ GERENTE con plan Internacional
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_mgr_i, 'role', 'authenticated')::text, TRUE);

    BEGIN
        INSERT INTO public.company_countries (company_id, country_code) VALUES (co_i, 'MX');
        SELECT count(*), count(polygon) INTO v_count, v_num FROM public.territories WHERE company_id = co_i AND country_code = 'MX';
        res := res || jsonb_build_object('prueba', 'La gerencia activa México y llegan sus 2.457 municipios, sin copia de contorno',
            'ok', v_count = 2457 AND v_num = 0, 'detalle', jsonb_build_object('zonas', v_count, 'con_copia', v_num));
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'La gerencia activa México y llegan sus 2.457 municipios, sin copia de contorno', 'ok', FALSE, 'detalle', SQLERRM);
    END;

    SELECT count(*), bool_and(polygon ->> 'type' = 'MultiPolygon') INTO v_count, v_bool
    FROM public.territories_geojson WHERE company_id = co_i AND country_code = 'MX' AND region_code = 'MX-JAL';
    res := res || jsonb_build_object('prueba', 'El mapa dibuja las zonas nuevas con el contorno del catálogo (Jalisco: 125 municipios)',
        'ok', v_count = 125 AND v_bool, 'detalle', v_count);

    SELECT 'MXN' = ANY (public.lead_allowed_currencies(co_i)) INTO v_bool;
    res := res || jsonb_build_object('prueba', 'Al activar México, sus leads se pueden negociar en pesos mexicanos', 'ok', v_bool, 'detalle', v_bool);

    DELETE FROM public.company_countries WHERE company_id = co_i AND country_code = 'CL';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    res := res || jsonb_build_object('prueba', 'La gerencia no desactiva el país base', 'ok', v_count = 0, 'detalle', v_count);

    DELETE FROM public.company_countries WHERE company_id = co_i AND country_code = 'PE';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    SELECT count(*) INTO v_num FROM public.leads WHERE id = lead_pe;
    res := res || jsonb_build_object('prueba', 'Al desactivar Perú, sus leads dejan de verse', 'ok', v_count = 1 AND v_num = 0,
        'detalle', jsonb_build_object('desactivado', v_count, 'leads_visibles', v_num));

    INSERT INTO public.company_countries (company_id, country_code) VALUES (co_i, 'PE');
    SELECT count(*) INTO v_num FROM public.leads WHERE id = lead_pe;
    res := res || jsonb_build_object('prueba', 'Al reactivar Perú, sus leads vuelven (desactivar no borra)', 'ok', v_num = 1, 'detalle', v_num);

    -- ------------------------------------------------------------ quién NO puede
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_agent_i, 'role', 'authenticated')::text, TRUE);
    BEGIN
        INSERT INTO public.company_countries (company_id, country_code) VALUES (co_i, 'AR');
        res := res || jsonb_build_object('prueba', 'El usuario base no activa países', 'ok', FALSE, 'detalle', 'lo activó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'El usuario base no activa países', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;
    DELETE FROM public.company_countries WHERE company_id = co_i AND country_code = 'MX';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    res := res || jsonb_build_object('prueba', 'El usuario base no desactiva países', 'ok', v_count = 0, 'detalle', v_count);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_mgr_n, 'role', 'authenticated')::text, TRUE);
    BEGIN
        INSERT INTO public.company_countries (company_id, country_code) VALUES (co_n, 'MX');
        res := res || jsonb_build_object('prueba', 'Con el plan Nacional la gerencia no suma países (lo decide el administrador)', 'ok', FALSE, 'detalle', 'lo sumó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Con el plan Nacional la gerencia no suma países (lo decide el administrador)', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_mgr_x, 'role', 'authenticated')::text, TRUE);
    BEGIN
        INSERT INTO public.company_countries (company_id, country_code) VALUES (co_i, 'BR');
        res := res || jsonb_build_object('prueba', 'El gerente de otro CRM no activa países en uno ajeno', 'ok', FALSE, 'detalle', 'lo activó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'El gerente de otro CRM no activa países en uno ajeno', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;
    DELETE FROM public.company_countries WHERE company_id = co_i AND country_code = 'MX';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    res := res || jsonb_build_object('prueba', 'El gerente de otro CRM no desactiva países en uno ajeno', 'ok', v_count = 0, 'detalle', v_count);

    EXECUTE 'RESET ROLE';
    RAISE EXCEPTION 'RESULTADOS:%', res::text;
END
$prueba$;
