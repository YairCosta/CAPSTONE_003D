-- Prueba funcional del trabajo diario del CRM contra la base de Supabase (npm run test:db).
--
-- Lo que hace la app con VITE_DATA_SOURCE=supabase en la etapa 3 (src/lib/db/crm.ts): zonas de
-- cada CRM, empresas cliente, leads con su ubicación, contactos, productos y actividades, y el
-- flujo de derechos del titular de punta a punta. Igual que las otras pruebas, termina con un
-- error forzado: todo se deshace y la base queda como estaba. Datos ficticios.
DO $prueba$
DECLARE
    res JSONB := '[]'::jsonb;
    co_a UUID := gen_random_uuid();
    co_b UUID := gen_random_uuid();
    u_mgr_a UUID := gen_random_uuid();
    u_agent_a UUID := gen_random_uuid();
    u_mgr_b UUID := gen_random_uuid();
    acc_a UUID := gen_random_uuid();
    acc_libre UUID := gen_random_uuid();
    lead_1 UUID := gen_random_uuid();
    item_1 UUID := gen_random_uuid();
    zona_cl UUID;
    zona_pe UUID;
    zona_b UUID;
    req_1 UUID;
    v_count INTEGER;
    v_text TEXT;
    v_num NUMERIC;
    v_bool BOOLEAN;
BEGIN
    -- ------------------------------------------------------------ datos de prueba (rol privilegiado)
    INSERT INTO auth.users (id, email, aud, role)
    VALUES (u_mgr_a, 'gerente.crm@prueba.invalid', 'authenticated', 'authenticated'),
           (u_agent_a, 'vendedor.crm@prueba.invalid', 'authenticated', 'authenticated'),
           (u_mgr_b, 'gerente.otro@prueba.invalid', 'authenticated', 'authenticated');

    -- A: plan Internacional (Chile y Perú). B: plan Nacional (Chile)
    INSERT INTO public.companies (id, name, slug, plan, home_country) VALUES
        (co_a, 'CRM Etapa 3 A', 'etapa3-a-' || left(co_a::text, 8), 'international', 'CL'),
        (co_b, 'CRM Etapa 3 B', 'etapa3-b-' || left(co_b::text, 8), 'national', 'CL');
    INSERT INTO public.company_countries (company_id, country_code) VALUES (co_a, 'CL'), (co_a, 'PE'), (co_b, 'CL')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.profiles (id, company_id, full_name, email, role) VALUES
        (u_mgr_a, co_a, 'Gerente Etapa 3', 'gerente.crm@prueba.invalid', 'manager'),
        (u_agent_a, co_a, 'Vendedor Etapa 3', 'vendedor.crm@prueba.invalid', 'agent'),
        (u_mgr_b, co_b, 'Gerente Otro', 'gerente.otro@prueba.invalid', 'manager');

    -- ------------------------------------------------------------ zonas copiadas solas (0017)
    SELECT count(*) INTO v_count FROM public.territories WHERE company_id = co_a;
    res := res || jsonb_build_object('prueba', 'Un CRM nuevo recibe solo las zonas de sus países (10: Chile y Perú)', 'ok', v_count = 10, 'detalle', v_count);

    SELECT count(*) INTO v_count FROM public.territories WHERE company_id = co_b;
    res := res || jsonb_build_object('prueba', 'Un CRM de plan Nacional recibe solo las de su país (5)', 'ok', v_count = 5, 'detalle', v_count);

    INSERT INTO public.company_countries (company_id, country_code) VALUES (co_b, 'PE') ON CONFLICT DO NOTHING;
    UPDATE public.companies SET plan = 'international' WHERE id = co_b;
    SELECT count(*) INTO v_count FROM public.territories WHERE company_id = co_b AND country_code = 'PE';
    res := res || jsonb_build_object('prueba', 'Al activar el plan Internacional llegan las zonas del país nuevo', 'ok', v_count = 5, 'detalle', v_count);
    UPDATE public.companies SET plan = 'national' WHERE id = co_b;

    SELECT id INTO zona_cl FROM public.territories WHERE company_id = co_a AND country_code = 'CL' ORDER BY name LIMIT 1;
    SELECT id INTO zona_pe FROM public.territories WHERE company_id = co_a AND country_code = 'PE' ORDER BY name LIMIT 1;
    SELECT id INTO zona_b FROM public.territories WHERE company_id = co_b AND country_code = 'CL' ORDER BY name LIMIT 1;

    -- ------------------------------------------------------------ como GERENTE del CRM A: catálogo
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_mgr_a, 'role', 'authenticated')::text, TRUE);
    EXECUTE 'SET LOCAL ROLE authenticated';

    SELECT count(*), bool_and(polygon ->> 'type' = 'MultiPolygon') INTO v_count, v_bool FROM public.territories_geojson;
    res := res || jsonb_build_object('prueba', 'El mapa lee las zonas del CRM con su polígono en GeoJSON', 'ok', v_count = 10 AND v_bool, 'detalle', v_count);

    INSERT INTO public.catalog_items (id, company_id, item_type, name, billing_type, is_active)
    VALUES (item_1, co_a, 'service', 'Soporte mensual', 'monthly', TRUE);
    INSERT INTO public.catalog_item_prices (catalog_item_id, country_code, price) VALUES (item_1, 'CL', 50000);
    res := res || jsonb_build_object('prueba', 'Gerencia crea un servicio con su precio por país', 'ok', TRUE, 'detalle', NULL);

    INSERT INTO public.client_accounts (id, company_id, country_code, name) VALUES (acc_libre, co_a, 'CL', 'Empresa Sin Leads');

    -- ------------------------------------------------------------ como USUARIO BASE del CRM A: captura
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_agent_a, 'role', 'authenticated')::text, TRUE);

    INSERT INTO public.client_accounts (id, company_id, country_code, name) VALUES (acc_a, co_a, 'CL', 'Minera Etapa 3');

    INSERT INTO public.leads (id, company_id, created_by, full_name, job_title, email, commercial_status, estimated_deal_value,
                              currency_code, raw_address, latitude, longitude, geocoding_status, assigned_territory_id,
                              client_account_id, country_code, value_source, data_origin, consent_status, consent_at)
    VALUES (lead_1, co_a, u_agent_a, 'Ana Contacto', 'Jefa de TI', 'ana@prueba.invalid', 'new', 0,
            'CLP', 'Av. Prueba 123', -33.43, -70.61, 'success', zona_cl,
            acc_a, 'CL', 'items', 'form', 'inquiry', NOW());

    SELECT extensions.ST_Y(location::extensions.geometry) INTO v_num FROM public.leads WHERE id = lead_1;
    res := res || jsonb_build_object('prueba', 'La ubicación espacial del lead se calcula desde latitud y longitud (0017)', 'ok', v_num = -33.43, 'detalle', v_num);

    SELECT full_name INTO v_text FROM public.lead_contacts WHERE lead_id = lead_1 AND is_primary;
    res := res || jsonb_build_object('prueba', 'El contacto principal se copia solo a lead_contacts (0017)', 'ok', v_text = 'Ana Contacto', 'detalle', v_text);

    UPDATE public.leads SET full_name = 'Ana Contacto Pérez' WHERE id = lead_1;
    SELECT full_name INTO v_text FROM public.lead_contacts WHERE lead_id = lead_1 AND is_primary;
    res := res || jsonb_build_object('prueba', 'Editar el contacto del lead actualiza su copia', 'ok', v_text = 'Ana Contacto Pérez', 'detalle', v_text);

    INSERT INTO public.lead_items (company_id, lead_id, catalog_item_id, quantity, unit_price)
    VALUES (co_a, lead_1, item_1, 3, 50000)
    ON CONFLICT (lead_id, catalog_item_id) DO UPDATE SET quantity = EXCLUDED.quantity, unit_price = EXCLUDED.unit_price;
    SELECT estimated_deal_value INTO v_num FROM public.leads WHERE id = lead_1;
    res := res || jsonb_build_object('prueba', 'Con productos, el valor del lead se calcula en la base (3 × 50.000)', 'ok', v_num = 150000, 'detalle', v_num);

    INSERT INTO public.lead_contacts (company_id, lead_id, full_name, job_title, is_primary)
    VALUES (co_a, lead_1, 'Juan Firma', 'Gerente general', FALSE);
    SELECT count(*) INTO v_count FROM public.lead_contacts WHERE lead_id = lead_1;
    res := res || jsonb_build_object('prueba', 'Un lead guarda más de una persona de contacto', 'ok', v_count = 2, 'detalle', v_count);

    INSERT INTO public.lead_activities (lead_id, company_id, created_by, channel, outcome, summary, agent_name, contact_name)
    VALUES (lead_1, co_a, u_agent_a, 'call', 'interested', 'Pidió propuesta', 'Vendedor Etapa 3', 'Ana Contacto Pérez');
    UPDATE public.leads SET last_contacted_at = NOW(), commercial_status = 'contacted' WHERE id = lead_1;
    SELECT commercial_status INTO v_text FROM public.leads WHERE id = lead_1;
    res := res || jsonb_build_object('prueba', 'El usuario base registra un contacto y avanza la etapa', 'ok', v_text = 'contacted', 'detalle', v_text);

    BEGIN
        UPDATE public.lead_activities SET summary = 'editado' WHERE lead_id = lead_1;
        res := res || jsonb_build_object('prueba', 'La bitácora de contactos no se edita', 'ok', FALSE, 'detalle', 'se editó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'La bitácora de contactos no se edita', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;

    BEGIN
        UPDATE public.leads SET assigned_territory_id = zona_b WHERE id = lead_1;
        res := res || jsonb_build_object('prueba', 'Un lead no usa zonas de otro CRM', 'ok', FALSE, 'detalle', 'se guardó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Un lead no usa zonas de otro CRM', 'ok', TRUE, 'detalle', SQLERRM);
    END;

    BEGIN
        UPDATE public.leads SET assigned_territory_id = zona_pe WHERE id = lead_1;
        res := res || jsonb_build_object('prueba', 'Un lead de Chile no queda en una zona de Perú', 'ok', FALSE, 'detalle', 'se guardó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Un lead de Chile no queda en una zona de Perú', 'ok', SQLERRM ILIKE '%otro país%', 'detalle', SQLERRM);
    END;

    DELETE FROM public.client_accounts WHERE id = acc_libre;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    res := res || jsonb_build_object('prueba', 'El usuario base no elimina empresas cliente', 'ok', v_count = 0, 'detalle', v_count);

    -- ------------------------------------------------------------ GERENTE del CRM B no ve nada del A
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_mgr_b, 'role', 'authenticated')::text, TRUE);
    SELECT (SELECT count(*) FROM public.leads WHERE company_id = co_a)
         + (SELECT count(*) FROM public.lead_contacts WHERE company_id = co_a)
         + (SELECT count(*) FROM public.lead_items WHERE company_id = co_a)
         + (SELECT count(*) FROM public.territories_geojson WHERE company_id = co_a)
         + (SELECT count(*) FROM public.catalog_items WHERE company_id = co_a)
    INTO v_count;
    res := res || jsonb_build_object('prueba', 'Otro CRM no ve leads, contactos, productos, zonas ni catálogo ajenos', 'ok', v_count = 0, 'detalle', v_count);

    -- ------------------------------------------------------------ GERENTE del CRM A: empresas y privacidad
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_mgr_a, 'role', 'authenticated')::text, TRUE);

    DELETE FROM public.client_accounts WHERE id IN (acc_libre, acc_a);
    GET DIAGNOSTICS v_count = ROW_COUNT;
    SELECT count(*) INTO v_text FROM public.client_accounts WHERE id = acc_a;
    res := res || jsonb_build_object('prueba', 'Gerencia elimina empresas sin leads; las que tienen leads se quedan (0017)',
        'ok', v_count = 1 AND v_text = '1', 'detalle', jsonb_build_object('eliminadas', v_count, 'con_leads_sigue', v_text));

    INSERT INTO public.lead_privacy_requests (company_id, lead_id, reason, detail, requested_by, requested_by_name)
    VALUES (co_a, lead_1, 'erasure', 'Pidió borrar sus datos', u_mgr_a, 'x')
    RETURNING id INTO req_1;
    BEGIN
        UPDATE public.leads SET commercial_status = 'qualified' WHERE id = lead_1;
        res := res || jsonb_build_object('prueba', 'Con una solicitud pendiente el lead no se mueve', 'ok', FALSE, 'detalle', 'se movió');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Con una solicitud pendiente el lead no se mueve', 'ok', SQLERRM ILIKE '%bloqueado%', 'detalle', SQLERRM);
    END;

    PERFORM public.resolve_lead_privacy_request(req_1, TRUE, 'Aprobada en la prueba');
    SELECT full_name || '|' || COALESCE(email, '') || '|' || (location IS NULL)::text || '|' || estimated_deal_value::text
    INTO v_text FROM public.leads WHERE id = lead_1;
    res := res || jsonb_build_object('prueba', 'Aprobar borra los datos personales y conserva el negocio (valor 150.000)',
        'ok', v_text = 'Titular eliminado||true|150000.00', 'detalle', v_text);

    SELECT string_agg(full_name, ',' ORDER BY is_primary DESC) INTO v_text FROM public.lead_contacts WHERE lead_id = lead_1;
    res := res || jsonb_build_object('prueba', 'Anonimizar deja solo el contacto principal, sin nombre', 'ok', v_text = 'Titular eliminado', 'detalle', v_text);

    EXECUTE 'RESET ROLE';
    RAISE EXCEPTION 'RESULTADOS:%', res::text;
END
$prueba$;
