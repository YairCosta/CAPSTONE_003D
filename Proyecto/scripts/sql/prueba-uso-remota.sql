-- Uso de la plataforma, encuestas de satisfacción y reportes de errores (0030), contra la base real
-- (npm run test:db).
--
-- Se prueba lo que ve y hace el administrador (conteos por CRM y por persona, marcar reportes), lo que
-- puede hacer cada persona por sí misma (ingresar, responder la encuesta, reportar un error) y lo que NO
-- puede hacer (ver lo de otros, leer los ingresos, marcar reportes, enviar en masa). CRMs, usuarios y leads
-- ficticios; termina con un error forzado que lo deshace todo.
DO $prueba$
DECLARE
    res JSONB := '[]'::jsonb;
    co_a UUID := gen_random_uuid();
    co_b UUID := gen_random_uuid();
    u_admin UUID := gen_random_uuid();
    u_mgr_a UUID := gen_random_uuid();
    u_agent_a UUID := gen_random_uuid();
    u_never_a UUID := gen_random_uuid();
    u_agent_b UUID := gen_random_uuid();
    l1 UUID := gen_random_uuid();
    l2 UUID := gen_random_uuid();
    l3 UUID := gen_random_uuid();
    l4 UUID := gen_random_uuid();
    l5 UUID := gen_random_uuid();
    l6 UUID := gen_random_uuid();
    bug_a UUID;
    v_count INTEGER;
    v_num INTEGER;
    v_text TEXT;
    v_fila RECORD;
    v_ts TIMESTAMPTZ;
BEGIN
    -- ------------------------------------------------------------ datos de prueba (rol privilegiado)
    INSERT INTO auth.users (id, email, aud, role)
    VALUES (u_admin, 'admin.uso@prueba.invalid', 'authenticated', 'authenticated'),
           (u_mgr_a, 'gerente.uso@prueba.invalid', 'authenticated', 'authenticated'),
           (u_agent_a, 'vendedor.uso@prueba.invalid', 'authenticated', 'authenticated'),
           (u_never_a, 'nunca.uso@prueba.invalid', 'authenticated', 'authenticated'),
           (u_agent_b, 'vendedor.otro.uso@prueba.invalid', 'authenticated', 'authenticated');
    INSERT INTO public.companies (id, name, slug) VALUES
        (co_a, 'CRM Uso A', 'uso-a-' || left(co_a::text, 8)),
        (co_b, 'CRM Uso B', 'uso-b-' || left(co_b::text, 8));
    INSERT INTO public.company_countries (company_id, country_code) VALUES (co_a, 'CL'), (co_b, 'CL') ON CONFLICT DO NOTHING;
    INSERT INTO public.profiles (id, company_id, full_name, email, role) VALUES
        (u_admin, NULL, 'Admin Uso', 'admin.uso@prueba.invalid', 'superadmin'),
        (u_mgr_a, co_a, 'Gerente Uso', 'gerente.uso@prueba.invalid', 'manager'),
        (u_agent_a, co_a, 'Vendedor Uso', 'vendedor.uso@prueba.invalid', 'agent'),
        (u_never_a, co_a, 'Nunca Ingresó', 'nunca.uso@prueba.invalid', 'agent'),
        (u_agent_b, co_b, 'Vendedor Otro CRM', 'vendedor.otro.uso@prueba.invalid', 'agent');

    -- CRM A: 5 leads. l1 nuevo de hoy · l2 en propuesta sin movimiento desde hace 30 días (estancado) ·
    -- l3 contactado, antiguo pero con una actividad de hace 2 días · l4 ganado · l5 perdido de hace 5 días.
    -- CRM B: l6 nuevo de hace 20 días, sin movimiento (estancado).
    INSERT INTO public.leads (id, company_id, full_name, commercial_status, currency_code, raw_address, country_code,
                              value_source, data_origin, consent_status, consent_at, created_at, updated_at, last_contacted_at)
    VALUES
        (l1, co_a, 'Lead Uso 1', 'new', 'CLP', 'Av. Uno 100', 'CL', 'manual', 'form', 'inquiry', NOW(), NOW(), NOW(), NULL),
        (l2, co_a, 'Lead Uso 2', 'proposal', 'CLP', 'Av. Dos 200', 'CL', 'manual', 'form', 'inquiry', NOW(),
            NOW() - INTERVAL '40 days', NOW() - INTERVAL '40 days', NOW() - INTERVAL '30 days'),
        (l3, co_a, 'Lead Uso 3', 'contacted', 'CLP', 'Av. Tres 300', 'CL', 'manual', 'form', 'inquiry', NOW(),
            NOW() - INTERVAL '40 days', NOW() - INTERVAL '40 days', NULL),
        (l4, co_a, 'Lead Uso 4', 'won', 'CLP', 'Av. Cuatro 400', 'CL', 'manual', 'form', 'inquiry', NOW(),
            NOW() - INTERVAL '60 days', NOW() - INTERVAL '60 days', NULL),
        (l5, co_a, 'Lead Uso 5', 'lost', 'CLP', 'Av. Cinco 500', 'CL', 'manual', 'form', 'inquiry', NOW(),
            NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days', NULL),
        (l6, co_b, 'Lead Uso 6', 'new', 'CLP', 'Av. Seis 600', 'CL', 'manual', 'form', 'inquiry', NOW(),
            NOW() - INTERVAL '20 days', NOW() - INTERVAL '20 days', NULL);
    INSERT INTO public.lead_activities (lead_id, company_id, agent_name, channel, outcome, summary, created_at)
    VALUES (l3, co_a, 'Vendedor Uso', 'call', 'interested', 'Llamada de prueba', NOW() - INTERVAL '2 days');

    EXECUTE 'SET LOCAL ROLE authenticated';

    -- ------------------------------------------------------------ ingresos (record_login)
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_agent_a, 'role', 'authenticated')::text, TRUE);
    PERFORM public.record_login();
    PERFORM public.record_login();
    EXECUTE 'RESET ROLE';
    SELECT count(*) INTO v_count FROM public.login_events WHERE user_id = u_agent_a;
    EXECUTE 'SET LOCAL ROLE authenticated';
    res := res || jsonb_build_object('prueba', 'Un ingreso queda anotado una sola vez por visita (no cada 30 minutos)', 'ok', v_count = 1, 'detalle', v_count);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, TRUE);
    PERFORM public.record_login();
    EXECUTE 'RESET ROLE';
    SELECT count(*) INTO v_count FROM public.login_events WHERE user_id = u_admin;
    EXECUTE 'SET LOCAL ROLE authenticated';
    res := res || jsonb_build_object('prueba', 'El ingreso del administrador de la plataforma no se cuenta (no tiene CRM)', 'ok', v_count = 0, 'detalle', v_count);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_agent_a, 'role', 'authenticated')::text, TRUE);
    SELECT count(*) INTO v_count FROM public.login_events;
    res := res || jsonb_build_object('prueba', 'Un usuario base no puede leer los ingresos de nadie', 'ok', v_count = 0, 'detalle', v_count);
    BEGIN
        INSERT INTO public.login_events (company_id, user_id) VALUES (co_a, u_agent_a);
        res := res || jsonb_build_object('prueba', 'Nadie escribe un ingreso a mano: solo record_login()', 'ok', FALSE, 'detalle', 'lo escribió');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Nadie escribe un ingreso a mano: solo record_login()', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;

    -- ------------------------------------------------------------ conteos del administrador
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, TRUE);

    SELECT * INTO v_fila FROM public.admin_usage_by_company(30, 14) WHERE crm_id = co_a;
    res := res || jsonb_build_object('prueba', 'CRM A: 5 leads en total, 2 creados en los últimos 30 días, 3 abiertos, 1 ganado y 1 perdido',
        'ok', v_fila.leads_total = 5 AND v_fila.leads_created = 2 AND v_fila.leads_active = 3 AND v_fila.leads_won = 1 AND v_fila.leads_lost = 1,
        'detalle', to_jsonb(v_fila));
    res := res || jsonb_build_object('prueba', 'CRM A: solo el lead sin movimiento desde hace 30 días está estancado (uno con actividad reciente no)',
        'ok', v_fila.leads_stagnant = 1, 'detalle', v_fila.leads_stagnant);

    SELECT * INTO v_fila FROM public.admin_usage_by_company(30, 45) WHERE crm_id = co_a;
    res := res || jsonb_build_object('prueba', 'Con un plazo de 45 días ninguno del CRM A está estancado', 'ok', v_fila.leads_stagnant = 0, 'detalle', v_fila.leads_stagnant);

    SELECT * INTO v_fila FROM public.admin_usage_by_company(30, 14) WHERE crm_id = co_b;
    res := res || jsonb_build_object('prueba', 'CRM B: los conteos son solo de su CRM (1 lead, estancado)',
        'ok', v_fila.leads_total = 1 AND v_fila.leads_active = 1 AND v_fila.leads_stagnant = 1 AND v_fila.leads_won = 0,
        'detalle', to_jsonb(v_fila));

    SELECT count(*) INTO v_count FROM public.admin_usage_by_company(30, 14) WHERE crm_id IN (co_a, co_b);
    res := res || jsonb_build_object('prueba', 'La lista trae a cada CRM, también a los que no tienen leads', 'ok', v_count = 2, 'detalle', v_count);

    SELECT logins_total, last_login_at IS NOT NULL INTO v_num, v_text FROM public.admin_user_activity(30) WHERE person_id = u_agent_a;
    res := res || jsonb_build_object('prueba', 'El vendedor que ingresó aparece con 1 ingreso y su última fecha', 'ok', v_num = 1 AND v_text = 'true', 'detalle', jsonb_build_object('ingresos', v_num, 'con_fecha', v_text));

    SELECT logins_total, last_login_at INTO v_num, v_ts FROM public.admin_user_activity(30) WHERE person_id = u_never_a;
    res := res || jsonb_build_object('prueba', 'Quien nunca ingresó aparece con 0 ingresos y sin fecha (para marcarlo en rojo)', 'ok', v_num = 0 AND v_ts IS NULL, 'detalle', v_num);

    SELECT count(*) INTO v_count FROM public.admin_user_activity(30) WHERE person_id = u_admin;
    res := res || jsonb_build_object('prueba', 'El administrador de la plataforma no aparece entre los usuarios que ingresan', 'ok', v_count = 0, 'detalle', v_count);

    -- quién NO ve los conteos
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_mgr_a, 'role', 'authenticated')::text, TRUE);
    BEGIN
        PERFORM * FROM public.admin_usage_by_company(30, 14);
        res := res || jsonb_build_object('prueba', 'Un gerente no ve el uso de los CRMs', 'ok', FALSE, 'detalle', 'lo vio');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Un gerente no ve el uso de los CRMs', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;
    BEGIN
        PERFORM * FROM public.admin_user_activity(30);
        res := res || jsonb_build_object('prueba', 'Un gerente no ve los ingresos de los usuarios', 'ok', FALSE, 'detalle', 'los vio');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Un gerente no ve los ingresos de los usuarios', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;
    EXECUTE 'SET LOCAL ROLE anon';
    BEGIN
        PERFORM * FROM public.admin_usage_by_company(30, 14);
        res := res || jsonb_build_object('prueba', 'Sin sesión no se ve ningún conteo', 'ok', FALSE, 'detalle', 'lo vio');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Sin sesión no se ve ningún conteo', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;
    EXECUTE 'SET LOCAL ROLE authenticated';

    -- ------------------------------------------------------------ encuestas de satisfacción
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_agent_a, 'role', 'authenticated')::text, TRUE);
    INSERT INTO public.satisfaction_surveys (company_id, user_id, score, comment) VALUES (co_a, u_agent_a, 9, 'Muy útil el mapa');
    res := res || jsonb_build_object('prueba', 'Una persona responde la encuesta por sí misma', 'ok', TRUE, 'detalle', 9);

    BEGIN
        INSERT INTO public.satisfaction_surveys (company_id, user_id, score) VALUES (co_a, u_agent_a, 7);
        res := res || jsonb_build_object('prueba', 'No se responde dos veces el mismo día', 'ok', FALSE, 'detalle', 'la aceptó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'No se responde dos veces el mismo día', 'ok', SQLERRM LIKE 'Ya respondiste la encuesta hoy%', 'detalle', SQLERRM);
    END;

    BEGIN
        INSERT INTO public.satisfaction_surveys (company_id, user_id, score) VALUES (co_a, u_never_a, 10);
        res := res || jsonb_build_object('prueba', 'Nadie responde la encuesta en nombre de otra persona', 'ok', FALSE, 'detalle', 'lo aceptó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Nadie responde la encuesta en nombre de otra persona', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_never_a, 'role', 'authenticated')::text, TRUE);
    BEGIN
        INSERT INTO public.satisfaction_surveys (company_id, user_id, score) VALUES (co_a, u_never_a, 11);
        res := res || jsonb_build_object('prueba', 'La nota va de 0 a 10', 'ok', FALSE, 'detalle', 'aceptó 11');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'La nota va de 0 a 10', 'ok', SQLSTATE = '23514', 'detalle', SQLSTATE);
    END;
    BEGIN
        INSERT INTO public.satisfaction_surveys (company_id, user_id, score) VALUES (co_b, u_never_a, 5);
        res := res || jsonb_build_object('prueba', 'No se responde a nombre de otro CRM', 'ok', FALSE, 'detalle', 'lo aceptó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'No se responde a nombre de otro CRM', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_mgr_a, 'role', 'authenticated')::text, TRUE);
    SELECT count(*) INTO v_count FROM public.satisfaction_surveys;
    res := res || jsonb_build_object('prueba', 'La gerencia no ve lo que respondió su equipo', 'ok', v_count = 0, 'detalle', v_count);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_agent_a, 'role', 'authenticated')::text, TRUE);
    SELECT count(*) INTO v_count FROM public.satisfaction_surveys;
    res := res || jsonb_build_object('prueba', 'Cada persona ve solo sus propias respuestas', 'ok', v_count = 1, 'detalle', v_count);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, TRUE);
    SELECT count(*), max(score) INTO v_count, v_num FROM public.satisfaction_surveys WHERE company_id = co_a;
    res := res || jsonb_build_object('prueba', 'El administrador ve las respuestas de todos los CRMs', 'ok', v_count = 1 AND v_num = 9, 'detalle', v_count);

    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, TRUE);
    BEGIN
        INSERT INTO public.satisfaction_surveys (company_id, user_id, score) VALUES (co_a, u_never_a, 3);
        res := res || jsonb_build_object('prueba', 'El administrador tampoco responde por otros', 'ok', FALSE, 'detalle', 'lo aceptó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'El administrador tampoco responde por otros', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;

    -- ------------------------------------------------------------ reportes de errores
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_agent_a, 'role', 'authenticated')::text, TRUE);
    INSERT INTO public.bug_reports (company_id, user_id, description, page, user_agent)
    VALUES (co_a, u_agent_a, 'Al guardar un lead se queda cargando', 'kanban', 'Chrome prueba')
    RETURNING id INTO bug_a;
    SELECT status INTO v_text FROM public.bug_reports WHERE id = bug_a;
    res := res || jsonb_build_object('prueba', 'Una persona reporta un error y queda como "nuevo"', 'ok', v_text = 'new', 'detalle', v_text);

    BEGIN
        INSERT INTO public.bug_reports (company_id, user_id, description) VALUES (co_a, u_agent_a, 'corto');
        res := res || jsonb_build_object('prueba', 'Un reporte necesita al menos 10 caracteres', 'ok', FALSE, 'detalle', 'aceptó uno corto');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Un reporte necesita al menos 10 caracteres', 'ok', SQLSTATE = '23514', 'detalle', SQLSTATE);
    END;
    BEGIN
        INSERT INTO public.bug_reports (company_id, user_id, description, status) VALUES (co_a, u_agent_a, 'Un reporte que ya viene resuelto', 'resolved');
        res := res || jsonb_build_object('prueba', 'Nadie envía un reporte ya resuelto', 'ok', FALSE, 'detalle', 'lo aceptó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Nadie envía un reporte ya resuelto', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;
    BEGIN
        UPDATE public.bug_reports SET status = 'resolved' WHERE id = bug_a;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        res := res || jsonb_build_object('prueba', 'Quien reporta no marca su propio reporte como resuelto', 'ok', v_count = 0, 'detalle', v_count);
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Quien reporta no marca su propio reporte como resuelto', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_agent_b, 'role', 'authenticated')::text, TRUE);
    SELECT count(*) INTO v_count FROM public.bug_reports;
    res := res || jsonb_build_object('prueba', 'Un usuario de otro CRM no ve los reportes ajenos', 'ok', v_count = 0, 'detalle', v_count);

    -- envío en masa: 10 por hora, el 11.º se rechaza con un mensaje para la persona
    FOR v_num IN 1..10 LOOP
        INSERT INTO public.bug_reports (company_id, user_id, description) VALUES (co_b, u_agent_b, 'Reporte de prueba número ' || v_num);
    END LOOP;
    BEGIN
        INSERT INTO public.bug_reports (company_id, user_id, description) VALUES (co_b, u_agent_b, 'Reporte de prueba número 11');
        res := res || jsonb_build_object('prueba', 'Después de 10 reportes en una hora se pide esperar', 'ok', FALSE, 'detalle', 'aceptó el 11');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Después de 10 reportes en una hora se pide esperar', 'ok', SQLERRM LIKE 'Enviaste varios reportes seguidos%', 'detalle', SQLERRM);
    END;

    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, TRUE);
    SELECT count(*) INTO v_count FROM public.bug_reports WHERE company_id IN (co_a, co_b);
    res := res || jsonb_build_object('prueba', 'El administrador ve los reportes de todos los CRMs', 'ok', v_count = 11, 'detalle', v_count);

    UPDATE public.bug_reports SET status = 'seen' WHERE id = bug_a;
    UPDATE public.bug_reports SET status = 'resolved' WHERE id = bug_a;
    SELECT status, resolved_at INTO v_text, v_ts FROM public.bug_reports WHERE id = bug_a;
    res := res || jsonb_build_object('prueba', 'El administrador lo marca como resuelto y la base anota cuándo', 'ok', v_text = 'resolved' AND v_ts IS NOT NULL, 'detalle', v_text);

    UPDATE public.bug_reports SET status = 'new' WHERE id = bug_a;
    SELECT resolved_at INTO v_ts FROM public.bug_reports WHERE id = bug_a;
    res := res || jsonb_build_object('prueba', 'Si se reabre, se borra la fecha de resolución', 'ok', v_ts IS NULL, 'detalle', v_ts);

    BEGIN
        UPDATE public.bug_reports SET description = 'Cambiar lo que dijo la persona' WHERE id = bug_a;
        GET DIAGNOSTICS v_count = ROW_COUNT;
        res := res || jsonb_build_object('prueba', 'El administrador solo cambia el estado: no reescribe lo que dijo la persona', 'ok', FALSE, 'detalle', 'lo reescribió');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'El administrador solo cambia el estado: no reescribe lo que dijo la persona', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;

    SELECT count(*) INTO v_count FROM public.change_log WHERE table_name = 'bug_reports' AND row_id = bug_a::text AND operation = 'UPDATE' AND actor_id = u_admin;
    res := res || jsonb_build_object('prueba', 'Cada cambio de estado de un reporte queda anotado con quién lo hizo', 'ok', v_count >= 2, 'detalle', v_count);

    -- ------------------------------------------------------------ mantenimiento y coherencia
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_mgr_a, 'role', 'authenticated')::text, TRUE);
    BEGIN
        PERFORM public.purge_old_login_events(400);
        res := res || jsonb_build_object('prueba', 'Nadie con sesión ejecuta el borrado de ingresos antiguos', 'ok', FALSE, 'detalle', 'lo ejecutó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Nadie con sesión ejecuta el borrado de ingresos antiguos', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;

    EXECUTE 'RESET ROLE';
    INSERT INTO public.login_events (company_id, user_id, created_at) VALUES (co_a, u_agent_a, NOW() - INTERVAL '500 days');
    v_num := public.purge_old_login_events(400);
    SELECT count(*) INTO v_count FROM public.login_events WHERE user_id = u_agent_a;
    res := res || jsonb_build_object('prueba', 'Los ingresos de más de 13 meses se borran solos y los recientes se conservan',
        'ok', v_num = 1 AND v_count = 1, 'detalle', jsonb_build_object('borrados', v_num, 'quedan', v_count));

    BEGIN
        INSERT INTO public.login_events (company_id, user_id) VALUES (co_b, u_agent_a);
        res := res || jsonb_build_object('prueba', 'Un ingreso no puede quedar en un CRM que no es el de la persona', 'ok', FALSE, 'detalle', 'lo aceptó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Un ingreso no puede quedar en un CRM que no es el de la persona', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;

    RAISE EXCEPTION 'RESULTADOS:%', res::text;
END
$prueba$;
