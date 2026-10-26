-- Ataques desde dentro contra el CRM de prueba "Revela Pruebas" (npm run test:db).
--
-- La app oculta botones según el perfil, pero con Supabase el navegador habla directo con la base:
-- quien sepa usar la consola del navegador puede saltarse la pantalla. Esta prueba hace eso mismo,
-- como cada tipo de usuario, y revisa que la BASE lo impida:
--   · una cuenta creada por registro abierto, sin invitación ni perfil;
--   · un usuario base del CRM de prueba;
--   · un gerente del CRM de prueba;
--   · el gerente de otro CRM.
-- Cada fila dice qué debería pasar si la app es segura. Usa el CRM "Revela Pruebas" (si no existe,
-- crea uno ficticio) con usuarios, leads y productos ficticios, y termina con un error forzado:
-- todo se deshace y la base queda como estaba. Nunca toca el CRM de un cliente.
DO $prueba$
DECLARE
    res JSONB := '[]'::jsonb;
    co_rp UUID;
    co_x UUID := gen_random_uuid();
    u_sin UUID := gen_random_uuid();
    u_agent UUID := gen_random_uuid();
    u_mgr UUID := gen_random_uuid();
    u_mgr_x UUID := gen_random_uuid();
    acc_1 UUID := gen_random_uuid();
    cat_1 UUID := gen_random_uuid();
    cat_2 UUID := gen_random_uuid();
    lead_1 UUID := gen_random_uuid();
    lead_2 UUID := gen_random_uuid();
    lead_3 UUID := gen_random_uuid();
    contacto_1 UUID := gen_random_uuid();
    zona_1 UUID;
    zona_2 UUID;
    req_3 UUID;
    v_count INTEGER;
    v_text TEXT;
    v_num NUMERIC;
    v_bool BOOLEAN;
    v_uuid UUID;
    v_bitacora BOOLEAN := to_regclass('public.change_log') IS NOT NULL;
BEGIN
    -- ------------------------------------------------------------ datos de prueba (rol privilegiado)
    SELECT id INTO co_rp FROM public.companies WHERE name = 'Revela Pruebas' LIMIT 1;
    IF co_rp IS NULL THEN
        co_rp := gen_random_uuid();
        INSERT INTO public.companies (id, name, slug, plan, home_country)
        VALUES (co_rp, 'CRM de prueba (ataques)', 'ataques-' || left(co_rp::text, 8), 'national', 'CL');
    END IF;
    INSERT INTO public.companies (id, name, slug, plan, home_country)
    VALUES (co_x, 'CRM Atacante', 'atacante-' || left(co_x::text, 8), 'national', 'CL');

    INSERT INTO auth.users (id, email, aud, role)
    VALUES (u_sin, 'registro.abierto@prueba.invalid', 'authenticated', 'authenticated'),
           (u_agent, 'vendedor.ataques@prueba.invalid', 'authenticated', 'authenticated'),
           (u_mgr, 'gerente.ataques@prueba.invalid', 'authenticated', 'authenticated'),
           (u_mgr_x, 'gerente.atacante@prueba.invalid', 'authenticated', 'authenticated');
    INSERT INTO public.profiles (id, company_id, full_name, email, role) VALUES
        (u_agent, co_rp, 'Vendedor Ataques', 'vendedor.ataques@prueba.invalid', 'agent'),
        (u_mgr, co_rp, 'Gerente Ataques', 'gerente.ataques@prueba.invalid', 'manager'),
        (u_mgr_x, co_x, 'Gerente Atacante', 'gerente.atacante@prueba.invalid', 'manager');

    SELECT id INTO zona_1 FROM public.territories WHERE company_id = co_rp AND country_code = 'CL' ORDER BY code LIMIT 1;
    SELECT id INTO zona_2 FROM public.territories WHERE company_id = co_rp AND country_code = 'CL' ORDER BY code DESC LIMIT 1;

    INSERT INTO public.client_accounts (id, company_id, country_code, name) VALUES (acc_1, co_rp, 'CL', 'Empresa Ataques SpA');
    INSERT INTO public.catalog_items (id, company_id, item_type, name, billing_type, is_active) VALUES
        (cat_1, co_rp, 'service', 'Servicio Ataques', 'monthly', TRUE),
        (cat_2, co_rp, 'product', 'Producto Ataques', NULL, TRUE);
    INSERT INTO public.catalog_item_prices (catalog_item_id, country_code, price) VALUES (cat_1, 'CL', 50000), (cat_2, 'CL', 10000);

    -- Lead 1: lo capturó gerencia, está en propuesta y su valor sale de sus productos
    INSERT INTO public.leads (id, company_id, created_by, full_name, email, commercial_status, estimated_deal_value,
                              currency_code, raw_address, geocoding_status, assigned_territory_id, client_account_id,
                              country_code, value_source, data_origin, consent_status, consent_at)
    VALUES (lead_1, co_rp, u_mgr, 'Ana Ataques', 'ana.ataques@prueba.invalid', 'proposal', 0, 'CLP', 'Calle Uno 1',
            'success', zona_1, acc_1, 'CL', 'manual', 'form', 'inquiry', NOW());
    INSERT INTO public.lead_items (company_id, lead_id, catalog_item_id, quantity, unit_price) VALUES (co_rp, lead_1, cat_1, 2, 50000);
    UPDATE public.leads SET value_source = 'items' WHERE id = lead_1;
    INSERT INTO public.lead_contacts (id, company_id, lead_id, full_name, email, is_primary)
    VALUES (contacto_1, co_rp, lead_1, 'Colega Ataques', 'colega.ataques@prueba.invalid', FALSE);

    -- Lead 3: tiene una solicitud del titular pendiente
    INSERT INTO public.leads (id, company_id, created_by, full_name, commercial_status, currency_code, raw_address,
                              country_code, value_source, data_origin, consent_status, consent_at)
    VALUES (lead_3, co_rp, u_mgr, 'Titular Pendiente', 'contacted', 'CLP', 'Calle Tres 3', 'CL', 'manual', 'form', 'inquiry', NOW());
    INSERT INTO public.lead_privacy_requests (company_id, lead_id, reason, detail, requested_by, requested_by_name)
    VALUES (co_rp, lead_3, 'erasure', 'Pidió borrar sus datos', u_mgr, 'x')
    RETURNING id INTO req_3;

    EXECUTE 'SET LOCAL ROLE authenticated';

    -- ================================================================ CUENTA SIN INVITACIÓN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_sin, 'role', 'authenticated')::text, TRUE);

    SELECT (SELECT count(*) FROM public.leads) + (SELECT count(*) FROM public.client_accounts)
         + (SELECT count(*) FROM public.profiles) + (SELECT count(*) FROM public.lead_contacts)
         + (SELECT count(*) FROM public.audit_log) + (SELECT count(*) FROM public.territories)
         + (SELECT count(*) FROM public.companies)
    INTO v_count;
    res := res || jsonb_build_object('prueba', 'Sin invitación: una cuenta de registro abierto no ve nada de ningún CRM', 'ok', v_count = 0, 'detalle', v_count);

    BEGIN
        PERFORM public.recalculate_lead_value(lead_1);
        res := res || jsonb_build_object('prueba', 'Sin invitación: no puede tocar el valor de un lead ajeno (recalculate_lead_value)', 'ok', FALSE, 'detalle', 'se ejecutó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Sin invitación: no puede tocar el valor de un lead ajeno (recalculate_lead_value)', 'ok', TRUE, 'detalle', SQLSTATE);
    END;

    v_bool := public.lead_is_blocked(lead_3);
    res := res || jsonb_build_object('prueba', 'Sin invitación: no averigua si un lead ajeno tiene una solicitud del titular', 'ok', NOT v_bool, 'detalle', v_bool);

    BEGIN
        INSERT INTO public.client_accounts (company_id, country_code, name) VALUES (co_rp, 'CL', 'Intrusa SpA');
        res := res || jsonb_build_object('prueba', 'Sin invitación: no crea empresas cliente en un CRM', 'ok', FALSE, 'detalle', 'se creó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Sin invitación: no crea empresas cliente en un CRM', 'ok', TRUE, 'detalle', SQLSTATE);
    END;

    BEGIN
        INSERT INTO public.profiles (id, company_id, full_name, email, role)
        VALUES (u_sin, co_rp, 'Intruso', 'registro.abierto@prueba.invalid', 'manager');
        res := res || jsonb_build_object('prueba', 'Sin invitación: no se crea un perfil de gerente para sí misma', 'ok', FALSE, 'detalle', 'se creó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Sin invitación: no se crea un perfil de gerente para sí misma', 'ok', TRUE, 'detalle', SQLSTATE);
    END;

    -- ================================================================ USUARIO BASE DEL CRM DE PRUEBA
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_agent, 'role', 'authenticated')::text, TRUE);

    BEGIN
        UPDATE public.leads SET commercial_status = 'pending_payment', last_contacted_at = NOW() WHERE id = lead_1;
        SELECT commercial_status INTO v_text FROM public.leads WHERE id = lead_1;
        res := res || jsonb_build_object('prueba', 'Usuario base: avanza un lead en el pipeline', 'ok', v_text = 'pending_payment', 'detalle', v_text);
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Usuario base: avanza un lead en el pipeline', 'ok', FALSE, 'detalle', SQLERRM);
    END;

    BEGIN
        UPDATE public.leads SET commercial_status = 'contacted' WHERE id = lead_1;
        res := res || jsonb_build_object('prueba', 'Usuario base: no retrocede un lead (la regla del pipeline está en la base)', 'ok', FALSE, 'detalle', 'retrocedió');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Usuario base: no retrocede un lead (la regla del pipeline está en la base)', 'ok', SQLSTATE = '42501', 'detalle', SQLERRM);
    END;

    BEGIN
        UPDATE public.leads SET value_source = 'manual', estimated_deal_value = 1 WHERE id = lead_1;
        res := res || jsonb_build_object('prueba', 'Usuario base: no cambia el monto de un lead', 'ok', FALSE, 'detalle', 'cambió el monto');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Usuario base: no cambia el monto de un lead', 'ok', SQLSTATE = '42501', 'detalle', SQLERRM);
    END;

    BEGIN
        UPDATE public.leads SET assigned_territory_id = zona_2 WHERE id = lead_1;
        res := res || jsonb_build_object('prueba', 'Usuario base: no mueve un lead a otra zona', 'ok', zona_1 = zona_2, 'detalle', 'lo movió');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Usuario base: no mueve un lead a otra zona', 'ok', SQLSTATE = '42501', 'detalle', SQLERRM);
    END;

    BEGIN
        INSERT INTO public.lead_items (company_id, lead_id, catalog_item_id, quantity, unit_price) VALUES (co_rp, lead_1, cat_2, 50, 10000);
        res := res || jsonb_build_object('prueba', 'Usuario base: no agrega productos a un lead que no capturó (inflar su valor)', 'ok', FALSE, 'detalle', 'los agregó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Usuario base: no agrega productos a un lead que no capturó (inflar su valor)', 'ok', SQLSTATE = '42501', 'detalle', SQLERRM);
    END;

    BEGIN
        DELETE FROM public.lead_contacts WHERE id = contacto_1;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        res := res || jsonb_build_object('prueba', 'Usuario base: no borra personas de un lead que no capturó', 'ok', v_count = 0, 'detalle', v_count || ' borradas');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Usuario base: no borra personas de un lead que no capturó', 'ok', SQLSTATE = '42501', 'detalle', SQLERRM);
    END;

    BEGIN
        INSERT INTO public.lead_contacts (company_id, lead_id, full_name, is_primary) VALUES (co_rp, lead_1, 'Persona Nueva', FALSE);
        res := res || jsonb_build_object('prueba', 'Usuario base: agrega una persona al lead desde el registro de contacto', 'ok', TRUE, 'detalle', NULL);
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Usuario base: agrega una persona al lead desde el registro de contacto', 'ok', FALSE, 'detalle', SQLERRM);
    END;

    BEGIN
        INSERT INTO public.lead_activities (lead_id, company_id, created_by, channel, outcome, summary, agent_name)
        VALUES (lead_1, co_rp, u_agent, 'call', 'interested', 'Llamada de prueba', 'Vendedor Ataques');
        res := res || jsonb_build_object('prueba', 'Usuario base: registra un contacto en la bitácora', 'ok', TRUE, 'detalle', NULL);
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Usuario base: registra un contacto en la bitácora', 'ok', FALSE, 'detalle', SQLERRM);
    END;

    -- Captura: dice que lo creó el gerente, pero la base firma con quien de verdad lo crea
    BEGIN
        INSERT INTO public.leads (id, company_id, created_by, full_name, commercial_status, currency_code, raw_address,
                                  country_code, value_source, data_origin, consent_status, consent_at, assigned_territory_id)
        VALUES (lead_2, co_rp, u_mgr, 'Lead Capturado', 'new', 'CLP', 'Calle Dos 2', 'CL', 'items', 'form', 'inquiry', NOW(), zona_1);
        INSERT INTO public.lead_items (company_id, lead_id, catalog_item_id, quantity, unit_price) VALUES (co_rp, lead_2, cat_2, 3, 10000);
        SELECT estimated_deal_value INTO v_num FROM public.leads WHERE id = lead_2;
        res := res || jsonb_build_object('prueba', 'Usuario base: captura un lead con sus productos y el valor se calcula solo', 'ok', v_num = 30000, 'detalle', v_num);
        SELECT created_by INTO v_uuid FROM public.leads WHERE id = lead_2;
        res := res || jsonb_build_object('prueba', 'Usuario base: el lead queda a nombre de quien lo capturó, aunque diga otro autor', 'ok', v_uuid = u_agent, 'detalle', CASE WHEN v_uuid = u_agent THEN 'el vendedor' ELSE 'otro usuario' END);
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Usuario base: captura un lead con sus productos y el valor se calcula solo', 'ok', FALSE, 'detalle', SQLERRM);
    END;

    DELETE FROM public.leads WHERE id = lead_1;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    res := res || jsonb_build_object('prueba', 'Usuario base: no borra leads', 'ok', v_count = 0, 'detalle', v_count);

    SELECT count(*) INTO v_count FROM public.audit_log;
    res := res || jsonb_build_object('prueba', 'Usuario base: no lee el historial de cambios', 'ok', v_count = 0, 'detalle', v_count);

    BEGIN
        INSERT INTO public.audit_log (company_id, actor_id, actor_name, actor_role, action, entity, entity_id, entity_label, summary)
        VALUES (co_rp, u_mgr, 'Gerente Ataques', 'manager', 'update', 'lead', lead_1::text, 'Lead', 'Lo hizo el gerente')
        RETURNING actor_id INTO v_uuid;
        res := res || jsonb_build_object('prueba', 'Usuario base: lo que escribe en el historial queda a su nombre, no al de otro', 'ok', v_uuid = u_agent, 'detalle', CASE WHEN v_uuid = u_agent THEN 'a su nombre' ELSE 'suplantó a otro' END);
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Usuario base: lo que escribe en el historial queda a su nombre, no al de otro', 'ok', TRUE, 'detalle', SQLSTATE);
    END;

    UPDATE public.profiles SET role = 'manager' WHERE id = u_agent;
    SELECT role INTO v_text FROM public.profiles WHERE id = u_agent;
    res := res || jsonb_build_object('prueba', 'Usuario base: no se sube a gerente', 'ok', v_text = 'agent', 'detalle', v_text);

    BEGIN
        UPDATE public.territories SET name = 'Zona hackeada' WHERE id = zona_1;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        res := res || jsonb_build_object('prueba', 'Usuario base: no edita zonas', 'ok', v_count = 0, 'detalle', v_count);
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Usuario base: no edita zonas', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;

    BEGIN
        PERFORM public.resolve_lead_privacy_request(req_3, TRUE, 'Aprobada por el vendedor');
        res := res || jsonb_build_object('prueba', 'Usuario base: no resuelve solicitudes del titular', 'ok', FALSE, 'detalle', 'la resolvió');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Usuario base: no resuelve solicitudes del titular', 'ok', TRUE, 'detalle', SQLSTATE);
    END;

    -- ================================================================ GERENTE DEL CRM DE PRUEBA
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_mgr, 'role', 'authenticated')::text, TRUE);

    BEGIN
        UPDATE public.leads SET commercial_status = 'contacted', value_source = 'manual', estimated_deal_value = 95000 WHERE id = lead_1;
        SELECT commercial_status || '|' || estimated_deal_value::text INTO v_text FROM public.leads WHERE id = lead_1;
        res := res || jsonb_build_object('prueba', 'Gerencia: retrocede leads y corrige montos (es su facultad)', 'ok', v_text = 'contacted|95000.00', 'detalle', v_text);
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Gerencia: retrocede leads y corrige montos (es su facultad)', 'ok', FALSE, 'detalle', SQLERRM);
    END;

    BEGIN
        UPDATE public.territories SET name = 'Zona renombrada' WHERE id = zona_1;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        DELETE FROM public.territories WHERE id = zona_2;
        GET DIAGNOSTICS v_num = ROW_COUNT;
        res := res || jsonb_build_object('prueba', 'Gerencia: no renombra ni borra las zonas oficiales', 'ok', v_count = 0 AND v_num = 0, 'detalle', jsonb_build_object('renombradas', v_count, 'borradas', v_num));
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Gerencia: no renombra ni borra las zonas oficiales', 'ok', TRUE, 'detalle', SQLSTATE);
    END;

    BEGIN
        UPDATE public.profiles SET role = 'superadmin' WHERE id = u_agent;
        res := res || jsonb_build_object('prueba', 'Gerencia: no crea administradores de plataforma', 'ok', FALSE, 'detalle', 'lo creó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Gerencia: no crea administradores de plataforma', 'ok', TRUE, 'detalle', SQLSTATE);
    END;

    BEGIN
        UPDATE public.profiles SET company_id = co_x WHERE id = u_agent;
        res := res || jsonb_build_object('prueba', 'Gerencia: no mueve a un usuario a otro CRM', 'ok', FALSE, 'detalle', 'lo movió');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Gerencia: no mueve a un usuario a otro CRM', 'ok', TRUE, 'detalle', SQLSTATE);
    END;

    BEGIN
        PERFORM public.export_tenant_snapshot(co_rp);
        res := res || jsonb_build_object('prueba', 'Gerencia: no exporta el CRM completo (es del administrador)', 'ok', FALSE, 'detalle', 'exportó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Gerencia: no exporta el CRM completo (es del administrador)', 'ok', TRUE, 'detalle', SQLSTATE);
    END;

    -- ================================================================ GERENTE DE OTRO CRM
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_mgr_x, 'role', 'authenticated')::text, TRUE);

    SELECT (SELECT count(*) FROM public.leads WHERE company_id = co_rp)
         + (SELECT count(*) FROM public.lead_contacts WHERE company_id = co_rp)
         + (SELECT count(*) FROM public.lead_activities WHERE company_id = co_rp)
         + (SELECT count(*) FROM public.audit_log WHERE company_id = co_rp)
         + (SELECT count(*) FROM public.profiles WHERE company_id = co_rp)
    INTO v_count;
    res := res || jsonb_build_object('prueba', 'Otro CRM: no ve leads, personas, bitácora, historial ni usuarios del CRM de prueba', 'ok', v_count = 0, 'detalle', v_count);

    BEGIN
        INSERT INTO public.lead_items (company_id, lead_id, catalog_item_id, quantity, unit_price) VALUES (co_x, lead_1, cat_1, 1, 1);
        res := res || jsonb_build_object('prueba', 'Otro CRM: no mete productos en un lead ajeno', 'ok', FALSE, 'detalle', 'los metió');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Otro CRM: no mete productos en un lead ajeno', 'ok', TRUE, 'detalle', SQLSTATE);
    END;

    BEGIN
        INSERT INTO public.lead_activities (lead_id, company_id, created_by, channel, outcome, summary, agent_name)
        VALUES (lead_1, co_x, u_mgr_x, 'call', 'interested', 'Intromisión', 'Gerente Atacante');
        res := res || jsonb_build_object('prueba', 'Otro CRM: no registra contactos en un lead ajeno', 'ok', FALSE, 'detalle', 'lo registró');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Otro CRM: no registra contactos en un lead ajeno', 'ok', TRUE, 'detalle', SQLSTATE);
    END;

    BEGIN
        PERFORM public.resolve_lead_privacy_request(req_3, TRUE, 'Aprobada desde otro CRM');
        res := res || jsonb_build_object('prueba', 'Otro CRM: no resuelve solicitudes del titular ajenas', 'ok', FALSE, 'detalle', 'la resolvió');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Otro CRM: no resuelve solicitudes del titular ajenas', 'ok', TRUE, 'detalle', SQLSTATE);
    END;

    BEGIN
        PERFORM public.get_catalog_sales(co_rp);
        res := res || jsonb_build_object('prueba', 'Otro CRM: no consulta las ventas del CRM de prueba', 'ok', FALSE, 'detalle', 'las consultó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Otro CRM: no consulta las ventas del CRM de prueba', 'ok', TRUE, 'detalle', SQLSTATE);
    END;

    BEGIN
        PERFORM public.recalculate_lead_value(lead_1);
        res := res || jsonb_build_object('prueba', 'Otro CRM: no toca el valor de un lead ajeno por su ID', 'ok', FALSE, 'detalle', 'se ejecutó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Otro CRM: no toca el valor de un lead ajeno por su ID', 'ok', TRUE, 'detalle', SQLSTATE);
    END;

    v_bool := public.lead_is_blocked(lead_3);
    res := res || jsonb_build_object('prueba', 'Otro CRM: no averigua si un lead ajeno tiene una solicitud del titular', 'ok', NOT v_bool, 'detalle', v_bool);

    -- ================================================================ BITÁCORA DE LA BASE
    -- Lo que cada usuario cambió queda firmado por la base aunque no pase por la app (no guarda valores)
    EXECUTE 'RESET ROLE';
    IF NOT v_bitacora THEN
        res := res || jsonb_build_object('prueba', 'La base registra quién cambió qué columna, aunque se salte la app', 'ok', FALSE, 'detalle', 'no existe la bitácora de la base');
    ELSE
        EXECUTE format(
            'SELECT count(*) FROM public.change_log WHERE row_id = %L AND actor_id = %L AND %L = ANY (changed_columns)',
            lead_1, u_agent, 'commercial_status') INTO v_count;
        res := res || jsonb_build_object('prueba', 'La base registra quién cambió qué columna, aunque se salte la app', 'ok', v_count >= 1, 'detalle', v_count);

        EXECUTE 'SET LOCAL ROLE authenticated';
        PERFORM set_config('request.jwt.claims', json_build_object('sub', u_agent, 'role', 'authenticated')::text, TRUE);
        EXECUTE 'SELECT count(*) FROM public.change_log' INTO v_count;
        res := res || jsonb_build_object('prueba', 'La bitácora de la base no la lee el usuario base', 'ok', v_count = 0, 'detalle', v_count);

        PERFORM set_config('request.jwt.claims', json_build_object('sub', u_mgr, 'role', 'authenticated')::text, TRUE);
        EXECUTE format('SELECT count(*) FROM public.change_log WHERE company_id = %L', co_rp) INTO v_count;
        res := res || jsonb_build_object('prueba', 'Gerencia lee la bitácora de la base de su CRM', 'ok', v_count > 0, 'detalle', v_count);

        BEGIN
            EXECUTE format('DELETE FROM public.change_log WHERE company_id = %L', co_rp);
            GET DIAGNOSTICS v_count = ROW_COUNT;
            EXECUTE format('UPDATE public.change_log SET changed_columns = ARRAY[''nada''] WHERE company_id = %L', co_rp);
            GET DIAGNOSTICS v_num = ROW_COUNT;
            res := res || jsonb_build_object('prueba', 'Nadie borra ni edita la bitácora de la base', 'ok', v_count = 0 AND v_num = 0, 'detalle', jsonb_build_object('borradas', v_count, 'editadas', v_num));
        EXCEPTION WHEN OTHERS THEN
            res := res || jsonb_build_object('prueba', 'Nadie borra ni edita la bitácora de la base', 'ok', TRUE, 'detalle', SQLSTATE);
        END;
        EXECUTE 'RESET ROLE';
    END IF;

    RAISE EXCEPTION 'RESULTADOS:%', res::text;
END
$prueba$;
