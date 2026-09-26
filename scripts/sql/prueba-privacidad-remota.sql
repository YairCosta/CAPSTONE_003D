-- Prueba funcional de las reglas de privacidad contra la base de Supabase (npm run test:db).
--
-- Todo ocurre dentro de un único bloque que termina con un error forzado: PostgreSQL deshace
-- cada fila creada y los resultados viajan en el mensaje del error. La base queda como estaba,
-- incluso si una prueba falla a mitad de camino. No usa datos reales: todo es ficticio.
--
-- Actúa como usuarios con sesión (rol authenticated + claims JWT), igual que la app.
DO $prueba$
DECLARE
    res JSONB := '[]'::jsonb;
    co_a UUID := gen_random_uuid();
    co_b UUID := gen_random_uuid();
    u_mgr_a UUID := gen_random_uuid();
    u_agent_a UUID := gen_random_uuid();
    u_mgr_b UUID := gen_random_uuid();
    acc_a UUID := gen_random_uuid();
    lead_1 UUID := gen_random_uuid();   -- titular que pide borrar sus datos
    lead_2 UUID := gen_random_uuid();   -- prospecto vencido (40 días)
    lead_3 UUID := gen_random_uuid();   -- prospecto reciente (5 días)
    lead_b UUID := gen_random_uuid();   -- lead de otro CRM
    req_1 UUID;
    v_count INTEGER;
    v_text TEXT;
    v_json JSONB;
    v_lead RECORD;
BEGIN
    -- ------------------------------------------------------------ datos de prueba (rol privilegiado)
    INSERT INTO auth.users (id, email, aud, role)
    VALUES (u_mgr_a, 'gerente.a@prueba.invalid', 'authenticated', 'authenticated'),
           (u_agent_a, 'vendedor.a@prueba.invalid', 'authenticated', 'authenticated'),
           (u_mgr_b, 'gerente.b@prueba.invalid', 'authenticated', 'authenticated');

    INSERT INTO public.companies (id, name, slug) VALUES (co_a, 'CRM Prueba A', 'prueba-a-' || left(co_a::text, 8)),
                                                        (co_b, 'CRM Prueba B', 'prueba-b-' || left(co_b::text, 8));
    INSERT INTO public.company_countries (company_id, country_code) VALUES (co_a, 'CL'), (co_b, 'CL')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.profiles (id, company_id, full_name, role) VALUES
        (u_mgr_a, co_a, 'Gerente A', 'manager'),
        (u_agent_a, co_a, 'Vendedor A', 'agent'),
        (u_mgr_b, co_b, 'Gerente B', 'manager');

    INSERT INTO public.client_accounts (id, company_id, name) VALUES (acc_a, co_a, 'Minera Prueba');

    INSERT INTO public.leads (id, company_id, full_name, email, phone, notes, raw_address, address_hash,
                              latitude, longitude, currency_code, consent_status, consent_at, client_account_id)
    VALUES
        (lead_1, co_a, 'Ana Titular', 'ana@prueba.invalid', '+56 9 1111 1111', 'Prefiere la tarde',
         'Los Aromos 123', 'hash-prueba-1', -33.4, -70.6, 'CLP', 'inquiry', NOW(), acc_a),
        (lead_2, co_a, 'Pedro Prospecto', 'pedro@prueba.invalid', NULL, NULL, 'Calle 2', NULL, NULL, NULL,
         'CLP', 'not_requested', NOW() - INTERVAL '40 days', acc_a),
        (lead_3, co_a, 'Rosa Reciente', NULL, NULL, NULL, 'Calle 3', NULL, NULL, NULL,
         'CLP', 'not_requested', NOW() - INTERVAL '5 days', NULL),
        (lead_b, co_b, 'Luis Otro CRM', NULL, NULL, NULL, 'Calle B', NULL, NULL, NULL, 'CLP', 'inquiry', NOW(), NULL);

    INSERT INTO public.lead_contacts (company_id, lead_id, full_name, email, is_primary) VALUES
        (co_a, lead_1, 'Ana Titular', 'ana@prueba.invalid', TRUE),
        (co_a, lead_1, 'Juan Colega', 'juan@prueba.invalid', FALSE);

    INSERT INTO public.lead_activities (lead_id, company_id, channel, outcome, summary, agent_name, contact_name)
    VALUES (lead_1, co_a, 'call', 'interested', 'Habló de su casa en Los Aromos', 'Vendedor A', 'Ana Titular');

    INSERT INTO public.geocoding_cache (address_hash, raw_query, formatted_address, latitude, longitude, location)
    VALUES ('hash-prueba-1', 'Los Aromos 123', 'Los Aromos 123', -33.4, -70.6,
            extensions.ST_SetSRID(extensions.ST_MakePoint(-70.6, -33.4), 4326)::extensions.geography);

    -- ------------------------------------------------------------ como USUARIO BASE del CRM A
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_agent_a, 'role', 'authenticated')::text, TRUE);
    EXECUTE 'SET LOCAL ROLE authenticated';

    SELECT count(*) INTO v_count FROM public.leads;
    res := res || jsonb_build_object('prueba', 'Aislamiento: el usuario del CRM A ve solo sus 3 leads', 'ok', v_count = 3, 'detalle', v_count);

    INSERT INTO public.lead_privacy_requests (company_id, lead_id, reason, detail, requested_by, requested_by_name)
    VALUES (co_a, lead_1, 'erasure', 'Pidió borrar sus datos por correo', u_agent_a, 'nombre falso')
    RETURNING id, requested_by_name INTO req_1, v_text;
    res := res || jsonb_build_object('prueba', 'El usuario base registra la solicitud y la base fija su nombre real', 'ok', v_text = 'Vendedor A', 'detalle', v_text);

    BEGIN
        INSERT INTO public.lead_privacy_requests (company_id, lead_id, reason, requested_by, requested_by_name)
        VALUES (co_a, lead_1, 'erasure', u_agent_a, 'x');
        res := res || jsonb_build_object('prueba', 'Una sola solicitud pendiente por lead', 'ok', FALSE, 'detalle', 'se aceptó una segunda');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Una sola solicitud pendiente por lead', 'ok', TRUE, 'detalle', SQLERRM);
    END;

    BEGIN
        UPDATE public.leads SET commercial_status = 'qualified' WHERE id = lead_1;
        res := res || jsonb_build_object('prueba', 'Bloqueo: un lead con solicitud pendiente no se mueve de etapa', 'ok', FALSE, 'detalle', 'se movió');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Bloqueo: un lead con solicitud pendiente no se mueve de etapa', 'ok', SQLERRM ILIKE '%bloqueado%', 'detalle', SQLERRM);
    END;

    BEGIN
        INSERT INTO public.lead_activities (lead_id, company_id, channel, outcome, summary, agent_name)
        VALUES (lead_1, co_a, 'call', 'interested', 'Otro llamado', 'Vendedor A');
        res := res || jsonb_build_object('prueba', 'Bloqueo: no se registra contacto con un lead bloqueado', 'ok', FALSE, 'detalle', 'se registró');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Bloqueo: no se registra contacto con un lead bloqueado', 'ok', SQLERRM ILIKE '%derechos%', 'detalle', SQLERRM);
    END;

    BEGIN
        PERFORM public.resolve_lead_privacy_request(req_1, TRUE, 'intento del vendedor');
        res := res || jsonb_build_object('prueba', 'Solo gerencia resuelve: el usuario base no puede', 'ok', FALSE, 'detalle', 'resolvió');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Solo gerencia resuelve: el usuario base no puede', 'ok', SQLERRM ILIKE '%gerencia%', 'detalle', SQLERRM);
    END;

    BEGIN
        UPDATE public.lead_activities SET summary = 'editado' WHERE lead_id = lead_1;
        res := res || jsonb_build_object('prueba', 'La bitácora no se edita por la API', 'ok', FALSE, 'detalle', 'se editó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'La bitácora no se edita por la API', 'ok', SQLSTATE = '42501', 'detalle', SQLERRM);
    END;

    BEGIN
        PERFORM public.anonymize_lead_internal(lead_2, 'retention');
        res := res || jsonb_build_object('prueba', 'La anonimización interna no se puede llamar por la API', 'ok', FALSE, 'detalle', 'se ejecutó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'La anonimización interna no se puede llamar por la API', 'ok', SQLSTATE = '42501', 'detalle', SQLERRM);
    END;

    -- ------------------------------------------------------------ como GERENTE del CRM B (otro CRM)
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_mgr_b, 'role', 'authenticated')::text, TRUE);
    BEGIN
        PERFORM public.resolve_lead_privacy_request(req_1, TRUE, 'intento desde otro CRM');
        res := res || jsonb_build_object('prueba', 'Un gerente de otro CRM no resuelve la solicitud', 'ok', FALSE, 'detalle', 'resolvió');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Un gerente de otro CRM no resuelve la solicitud', 'ok', SQLERRM ILIKE '%no pertenece%', 'detalle', SQLERRM);
    END;
    SELECT count(*) INTO v_count FROM public.leads WHERE company_id = co_a;
    res := res || jsonb_build_object('prueba', 'Aislamiento: el gerente del CRM B no ve leads del CRM A', 'ok', v_count = 0, 'detalle', v_count);

    -- ------------------------------------------------------------ como GERENTE del CRM A
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_mgr_a, 'role', 'authenticated')::text, TRUE);
    PERFORM public.resolve_lead_privacy_request(req_1, TRUE, 'Identidad verificada');

    SELECT * INTO v_lead FROM public.leads WHERE id = lead_1;
    res := res || jsonb_build_object('prueba', 'Aprobar anonimiza: sin nombre, correo, teléfono, notas ni coordenadas',
        'ok', v_lead.full_name = 'Titular eliminado' AND v_lead.email IS NULL AND v_lead.phone IS NULL AND v_lead.notes IS NULL
              AND v_lead.latitude IS NULL AND v_lead.raw_address = 'Dirección eliminada' AND v_lead.anonymized_reason = 'request'
              AND v_lead.no_contact,
        'detalle', jsonb_build_object('nombre', v_lead.full_name, 'correo', v_lead.email, 'motivo', v_lead.anonymized_reason));
    res := res || jsonb_build_object('prueba', 'Aprobar conserva la operación: empresa cliente del lead',
        'ok', v_lead.client_account_id = acc_a, 'detalle', v_lead.client_account_id);

    SELECT count(*) INTO v_count FROM public.lead_contacts WHERE lead_id = lead_1 AND (full_name <> 'Titular eliminado' OR email IS NOT NULL);
    res := res || jsonb_build_object('prueba', 'Aprobar borra también los otros contactos del lead', 'ok', v_count = 0, 'detalle', v_count);

    SELECT summary INTO v_text FROM public.lead_activities WHERE lead_id = lead_1 LIMIT 1;
    res := res || jsonb_build_object('prueba', 'Aprobar borra lo conversado en la bitácora', 'ok', v_text NOT ILIKE '%Aromos%', 'detalle', v_text);

    EXECUTE 'RESET ROLE';
    SELECT count(*) INTO v_count FROM public.geocoding_cache WHERE address_hash = 'hash-prueba-1';
    res := res || jsonb_build_object('prueba', 'Aprobar borra la dirección de la caché de geocodificación', 'ok', v_count = 0, 'detalle', v_count);
    EXECUTE 'SET LOCAL ROLE authenticated';

    BEGIN
        UPDATE public.leads SET email = 'volvio@prueba.invalid' WHERE id = lead_1;
        res := res || jsonb_build_object('prueba', 'Un titular anonimizado no se vuelve a cargar', 'ok', FALSE, 'detalle', 'se re-identificó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Un titular anonimizado no se vuelve a cargar', 'ok', SQLERRM ILIKE '%eliminados%', 'detalle', SQLERRM);
    END;

    BEGIN
        UPDATE public.leads SET anonymized_at = NULL, anonymized_reason = NULL WHERE id = lead_1;
        res := res || jsonb_build_object('prueba', 'La anonimización no se deshace editando', 'ok', FALSE, 'detalle', 'se deshizo');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'La anonimización no se deshace editando', 'ok', SQLSTATE = '42501', 'detalle', SQLERRM);
    END;

    INSERT INTO public.audit_log (company_id, actor_id, actor_name, actor_role, action, entity, entity_id, entity_label, summary, changes, revert_snapshot)
    VALUES (co_a, u_mgr_a, 'Gerente A', 'manager', 'update', 'lead', lead_3::text, 'Persona natural', 'Email, Valor',
            '[{"field":"email","label":"Email","before":"a@prueba.invalid","after":"b@prueba.invalid"},
              {"field":"estimatedDealValue","label":"Valor","before":1,"after":2}]',
            '{"email":"a@prueba.invalid","fullName":"Rosa Reciente","estimatedDealValue":1}')
    RETURNING jsonb_build_object('changes', changes, 'snapshot', revert_snapshot) INTO v_json;
    res := res || jsonb_build_object('prueba', 'La auditoría no guarda valores personales aunque la app los envíe',
        'ok', v_json::text NOT ILIKE '%prueba.invalid%' AND v_json::text NOT ILIKE '%Rosa%'
              AND (v_json -> 'changes' -> 0 ->> 'redacted') = 'true' AND (v_json -> 'snapshot' ->> 'estimatedDealValue') = '1',
        'detalle', v_json);

    -- ------------------------------------------------------------ visitante SIN sesión (anon)
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, TRUE);
    EXECUTE 'SET LOCAL ROLE anon';
    BEGIN
        SELECT count(*) INTO v_count FROM public.leads;
        res := res || jsonb_build_object('prueba', 'Sin sesión no se leen tablas', 'ok', FALSE, 'detalle', v_count);
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Sin sesión no se leen tablas', 'ok', SQLSTATE = '42501', 'detalle', SQLERRM);
    END;
    BEGIN
        PERFORM public.get_current_user_company_id();
        res := res || jsonb_build_object('prueba', 'Sin sesión no se ejecutan funciones (0014)', 'ok', FALSE, 'detalle', 'se ejecutó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Sin sesión no se ejecutan funciones (0014)', 'ok', SQLSTATE = '42501', 'detalle', SQLERRM);
    END;

    -- ------------------------------------------------------------ tareas del sistema (rol privilegiado)
    EXECUTE 'RESET ROLE';
    v_count := public.anonymize_expired_prospects(30);
    SELECT anonymized_reason INTO v_text FROM public.leads WHERE id = lead_2;
    res := res || jsonb_build_object('prueba', 'El prospecto con 40 días sin contacto se anonimiza solo', 'ok', v_text = 'retention', 'detalle', v_text);
    res := res || jsonb_build_object('prueba', 'El prospecto de 5 días se mantiene', 'ok', (SELECT anonymized_at IS NULL FROM public.leads WHERE id = lead_3), 'detalle', NULL);
    SELECT entity_label INTO v_text FROM public.audit_log WHERE entity_id = lead_2::text ORDER BY created_at DESC LIMIT 1;
    res := res || jsonb_build_object('prueba', 'El borrado automático queda en la auditoría por empresa, no por persona', 'ok', v_text = 'Minera Prueba', 'detalle', v_text);

    SELECT count(*) INTO v_count FROM cron.job WHERE jobname = 'revela-anonimizar-prospectos' AND schedule = '15 3 * * *';
    res := res || jsonb_build_object('prueba', 'La tarea diaria de borrado está programada', 'ok', v_count = 1, 'detalle', v_count);

    -- ------------------------------------------------------------ exportación del CRM (0013)
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, TRUE);
    EXECUTE 'SET LOCAL ROLE service_role';
    BEGIN
        v_json := public.export_tenant_snapshot(co_a);
        res := res || jsonb_build_object('prueba', 'La exportación funciona e incluye contactos y solicitudes (0013)',
            'ok', v_json ? 'lead_contacts' AND v_json ? 'lead_privacy_requests' AND (v_json -> 'users' -> 0) ? 'full_name',
            'detalle', v_json ->> 'format_version');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'La exportación funciona e incluye contactos y solicitudes (0013)', 'ok', FALSE, 'detalle', SQLERRM);
    END;
    EXECUTE 'RESET ROLE';

    -- Deshace todo: nada de esta prueba queda en la base
    RAISE EXCEPTION 'RESULTADOS:%', res;
END;
$prueba$;
