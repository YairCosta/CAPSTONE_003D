-- Prueba funcional de la administración de la plataforma contra la base de Supabase (npm run test:db).
--
-- Ejecuta las mismas operaciones que la app con VITE_DATA_SOURCE=supabase (src/lib/db/platform.ts):
-- crear un CRM y sus países, cambiar el plan, editar perfiles, y comprueba que un gerente o un
-- visitante sin sesión no pueden hacerlas. Igual que la prueba de privacidad, termina con un error
-- forzado: todo se deshace y la base queda como estaba. Todos los datos son ficticios.
DO $prueba$
DECLARE
    res JSONB := '[]'::jsonb;
    co_a UUID := gen_random_uuid();
    co_nuevo UUID;
    u_admin UUID := gen_random_uuid();
    u_mgr_a UUID := gen_random_uuid();
    u_agent_a UUID := gen_random_uuid();
    v_count INTEGER;
    v_text TEXT;
    v_bool BOOLEAN;
BEGIN
    -- ------------------------------------------------------------ datos de prueba (rol privilegiado)
    INSERT INTO auth.users (id, email, aud, role)
    VALUES (u_admin, 'admin.plataforma@prueba.invalid', 'authenticated', 'authenticated'),
           (u_mgr_a, 'gerente.plataforma@prueba.invalid', 'authenticated', 'authenticated'),
           (u_agent_a, 'vendedor.plataforma@prueba.invalid', 'authenticated', 'authenticated');

    INSERT INTO public.companies (id, name, slug) VALUES (co_a, 'CRM Plataforma A', 'plataforma-a-' || left(co_a::text, 8));
    INSERT INTO public.company_countries (company_id, country_code) VALUES (co_a, 'CL') ON CONFLICT DO NOTHING;

    INSERT INTO public.profiles (id, company_id, full_name, email, role) VALUES
        (u_admin, NULL, 'Admin Prueba', 'admin.plataforma@prueba.invalid', 'superadmin'),
        (u_mgr_a, co_a, 'Gerente Prueba', 'gerente.plataforma@prueba.invalid', 'manager'),
        (u_agent_a, co_a, 'Vendedor Prueba', 'vendedor.plataforma@prueba.invalid', 'agent');

    -- ------------------------------------------------------------ como ADMINISTRADOR de plataforma
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, TRUE);
    EXECUTE 'SET LOCAL ROLE authenticated';

    -- insertCompany(): el CRM y después sus países
    INSERT INTO public.companies (name, slug, tax_id, is_active, plan, home_country, default_lat, default_lng, default_zoom)
    VALUES ('CRM Nuevo Prueba', 'nuevo-prueba-' || left(u_admin::text, 8), NULL, TRUE, 'international', 'CL', -33.43, -70.6, 12)
    RETURNING id INTO co_nuevo;
    INSERT INTO public.company_countries (company_id, country_code) VALUES (co_nuevo, 'CL'), (co_nuevo, 'PE')
    ON CONFLICT DO NOTHING;
    SELECT count(*) INTO v_count FROM public.company_countries WHERE company_id = co_nuevo;
    res := res || jsonb_build_object('prueba', 'El administrador crea un CRM con sus países (Chile y Perú)', 'ok', v_count = 2, 'detalle', v_count);

    BEGIN
        INSERT INTO public.companies (name, slug) VALUES ('Duplicado', 'nuevo-prueba-' || left(u_admin::text, 8));
        res := res || jsonb_build_object('prueba', 'Dos CRMs no pueden tener el mismo identificador', 'ok', FALSE, 'detalle', 'se creó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Dos CRMs no pueden tener el mismo identificador', 'ok', SQLSTATE = '23505', 'detalle', SQLSTATE);
    END;

    -- updateCompany() con plan Nacional: la fila de Perú se conserva, pero la base deja de habilitarlo
    UPDATE public.companies SET plan = 'national' WHERE id = co_nuevo;
    v_bool := public.is_country_enabled(co_nuevo, 'PE');
    SELECT count(*) INTO v_count FROM public.company_countries WHERE company_id = co_nuevo;
    res := res || jsonb_build_object('prueba', 'Plan Nacional: Perú deja de estar habilitado sin borrar su configuración',
        'ok', NOT v_bool AND v_count = 2, 'detalle', jsonb_build_object('peru_habilitado', v_bool, 'filas', v_count));

    -- updateCompany() con plan Internacional y solo Chile: se borra la fila sobrante
    UPDATE public.companies SET plan = 'international' WHERE id = co_nuevo;
    DELETE FROM public.company_countries WHERE company_id = co_nuevo AND country_code NOT IN ('CL');
    SELECT count(*) INTO v_count FROM public.company_countries WHERE company_id = co_nuevo;
    res := res || jsonb_build_object('prueba', 'El administrador ajusta los países habilitados de un CRM', 'ok', v_count = 1, 'detalle', v_count);

    -- updateProfile(): perfil y activación
    UPDATE public.profiles SET role = 'manager', is_active = FALSE WHERE id = u_agent_a;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    res := res || jsonb_build_object('prueba', 'El administrador cambia el perfil y desactiva a un usuario', 'ok', v_count = 1, 'detalle', v_count);
    UPDATE public.profiles SET role = 'agent', is_active = TRUE WHERE id = u_agent_a;

    BEGIN
        UPDATE public.profiles SET company_id = NULL WHERE id = u_agent_a;
        res := res || jsonb_build_object('prueba', 'Un usuario de CRM no puede quedar sin CRM', 'ok', FALSE, 'detalle', 'se guardó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Un usuario de CRM no puede quedar sin CRM', 'ok', SQLSTATE = '23514', 'detalle', SQLSTATE);
    END;

    SELECT count(*) INTO v_count FROM public.companies WHERE id IN (co_a, co_nuevo);
    res := res || jsonb_build_object('prueba', 'El administrador ve todos los CRMs', 'ok', v_count = 2, 'detalle', v_count);

    -- ------------------------------------------------------------ como GERENTE del CRM A
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_mgr_a, 'role', 'authenticated')::text, TRUE);

    SELECT count(*) INTO v_count FROM public.companies;
    res := res || jsonb_build_object('prueba', 'El gerente solo ve su propio CRM', 'ok', v_count = 1, 'detalle', v_count);

    SELECT count(*) INTO v_count FROM public.profiles;
    SELECT count(*) INTO v_text FROM public.profiles WHERE role = 'superadmin';
    res := res || jsonb_build_object('prueba', 'El gerente ve a su equipo y no a los administradores de plataforma',
        'ok', v_count = 2 AND v_text = '0', 'detalle', jsonb_build_object('visibles', v_count, 'admins', v_text));

    BEGIN
        INSERT INTO public.companies (name, slug) VALUES ('CRM Intruso', 'intruso-' || left(u_mgr_a::text, 8));
        res := res || jsonb_build_object('prueba', 'El gerente no puede crear CRMs', 'ok', FALSE, 'detalle', 'se creó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'El gerente no puede crear CRMs', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;

    UPDATE public.companies SET plan = 'international' WHERE id = co_a;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    res := res || jsonb_build_object('prueba', 'El gerente no puede cambiar el plan de su CRM', 'ok', v_count = 0, 'detalle', v_count);

    BEGIN
        INSERT INTO public.company_countries (company_id, country_code) VALUES (co_a, 'PE');
        res := res || jsonb_build_object('prueba', 'El gerente no puede habilitar países', 'ok', FALSE, 'detalle', 'se habilitó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'El gerente no puede habilitar países', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;

    -- Hueco conocido (docs/USUARIOS.md): hoy el gerente tampoco puede editar a su equipo en la base
    UPDATE public.profiles SET is_active = FALSE WHERE id = u_agent_a;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    res := res || jsonb_build_object('prueba', 'El gerente no puede escribir perfiles (se conecta en la etapa de Gerencia)', 'ok', v_count = 0, 'detalle', v_count);

    UPDATE public.profiles SET role = 'superadmin', company_id = NULL WHERE id = u_mgr_a;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    res := res || jsonb_build_object('prueba', 'Nadie se asciende a administrador desde su sesión', 'ok', v_count = 0, 'detalle', v_count);

    -- ------------------------------------------------------------ como USUARIO BASE del CRM A
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_agent_a, 'role', 'authenticated')::text, TRUE);
    SELECT full_name INTO v_text FROM public.profiles WHERE id = u_agent_a;
    res := res || jsonb_build_object('prueba', 'El usuario base lee su propio perfil al iniciar sesión', 'ok', v_text = 'Vendedor Prueba', 'detalle', v_text);

    -- ------------------------------------------------------------ visitante SIN sesión (anon)
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, TRUE);
    EXECUTE 'SET LOCAL ROLE anon';
    BEGIN
        SELECT count(*) INTO v_count FROM public.profiles;
        res := res || jsonb_build_object('prueba', 'Sin sesión no se puede leer la lista de usuarios', 'ok', FALSE, 'detalle', v_count);
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Sin sesión no se puede leer la lista de usuarios', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;
    BEGIN
        SELECT count(*) INTO v_count FROM public.companies;
        res := res || jsonb_build_object('prueba', 'Sin sesión no se puede leer la lista de CRMs', 'ok', FALSE, 'detalle', v_count);
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Sin sesión no se puede leer la lista de CRMs', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;
    EXECUTE 'RESET ROLE';

    RAISE EXCEPTION 'RESULTADOS:%', res::text;
END
$prueba$;
