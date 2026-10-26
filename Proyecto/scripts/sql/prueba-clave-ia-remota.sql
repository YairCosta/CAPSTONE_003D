-- Clave de OpenAI de cada CRM (0032), contra la base real (npm run test:db).
--
-- La clave es de cada CRM y vive cifrada en Supabase Vault. Se prueba lo que hace el servidor (guardarla a nombre
-- de la gerencia, leerla para llamar a OpenAI, quitarla) y lo que NO puede hacer nadie más: leerla, cambiarla, verla
-- en claro en las tablas ni usar la de otro CRM. Las claves son ficticias. CRMs y usuarios ficticios; termina con un
-- error forzado que lo deshace todo (incluidos los secretos de Vault).
DO $prueba$
DECLARE
    res JSONB := '[]'::jsonb;
    co_a UUID := gen_random_uuid();
    co_b UUID := gen_random_uuid();
    co_c UUID := gen_random_uuid();
    u_admin UUID := gen_random_uuid();
    u_mgr_a UUID := gen_random_uuid();
    u_agent_a UUID := gen_random_uuid();
    u_off_a UUID := gen_random_uuid();
    u_mgr_b UUID := gen_random_uuid();
    k1 TEXT := 'sk-test-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1111';
    k2 TEXT := 'sk-test-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB2222';
    v_mala TEXT;
    v_rechazadas INTEGER := 0;
    v_aceptadas INTEGER := 0;
    v_count INTEGER;
    v_num INTEGER;
    v_text TEXT;
    v_fila RECORD;
    v_bool BOOLEAN;
    v_msg TEXT;
BEGIN
    -- ------------------------------------------------------------ datos de prueba (rol privilegiado)
    INSERT INTO auth.users (id, email, aud, role)
    VALUES (u_admin, 'admin.clave@prueba.invalid', 'authenticated', 'authenticated'),
           (u_mgr_a, 'gerente.clave@prueba.invalid', 'authenticated', 'authenticated'),
           (u_agent_a, 'vendedor.clave@prueba.invalid', 'authenticated', 'authenticated'),
           (u_off_a, 'inactivo.clave@prueba.invalid', 'authenticated', 'authenticated'),
           (u_mgr_b, 'gerente.otro.clave@prueba.invalid', 'authenticated', 'authenticated');
    INSERT INTO public.companies (id, name, slug) VALUES
        (co_a, 'CRM Clave A', 'clave-a-' || left(co_a::text, 8)),
        (co_b, 'CRM Clave B', 'clave-b-' || left(co_b::text, 8)),
        (co_c, 'CRM Clave C', 'clave-c-' || left(co_c::text, 8));
    INSERT INTO public.company_countries (company_id, country_code) VALUES (co_a, 'CL'), (co_b, 'CL'), (co_c, 'CL') ON CONFLICT DO NOTHING;
    INSERT INTO public.profiles (id, company_id, full_name, email, role, is_active) VALUES
        (u_admin, NULL, 'Admin Clave', 'admin.clave@prueba.invalid', 'superadmin', TRUE),
        (u_mgr_a, co_a, 'Gerente Clave', 'gerente.clave@prueba.invalid', 'manager', TRUE),
        (u_agent_a, co_a, 'Vendedor Clave', 'vendedor.clave@prueba.invalid', 'agent', TRUE),
        (u_off_a, co_a, 'Gerente Inactivo Clave', 'inactivo.clave@prueba.invalid', 'manager', FALSE),
        (u_mgr_b, co_b, 'Gerente Otro Clave', 'gerente.otro.clave@prueba.invalid', 'manager', TRUE);

    -- ------------------------------------------------------------ el servidor guarda y lee la clave (service_role)
    EXECUTE 'SET LOCAL ROLE service_role';
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, TRUE);

    v_text := public.set_company_ai_key(co_a, u_mgr_a, k1);
    SELECT * INTO v_fila FROM public.company_ai_keys WHERE company_id = co_a;
    res := res || jsonb_build_object('prueba', 'La gerencia guarda la clave de su CRM: queda solo el puntero y los últimos 4 caracteres, con su autor',
        'ok', v_text = '1111' AND v_fila.key_last4 = '1111' AND v_fila.updated_by = u_mgr_a AND v_fila.secret_id IS NOT NULL,
        'detalle', jsonb_build_object('devuelve', v_text, 'ultimos4', v_fila.key_last4));

    v_text := public.get_company_ai_key(co_a);
    res := res || jsonb_build_object('prueba', 'El servidor recupera la clave completa para llamar a OpenAI', 'ok', v_text = k1, 'detalle', left(coalesce(v_text, 'NULL'), 8));

    v_text := public.get_company_ai_key(co_b);
    res := res || jsonb_build_object('prueba', 'Un CRM sin clave no recibe la de otro: devuelve nada', 'ok', v_text IS NULL, 'detalle', coalesce(v_text, 'NULL'));

    v_text := public.set_company_ai_key(co_a, u_mgr_a, k2);
    SELECT count(*) INTO v_count FROM public.company_ai_keys WHERE company_id = co_a;
    res := res || jsonb_build_object('prueba', 'Cambiar la clave reemplaza la anterior (una por CRM) y deja la nueva',
        'ok', v_count = 1 AND v_text = '2222' AND public.get_company_ai_key(co_a) = k2, 'detalle', jsonb_build_object('filas', v_count, 'ultimos4', v_text));

    EXECUTE 'RESET ROLE';
    SELECT count(*) INTO v_count FROM vault.secrets WHERE name = 'openai_key:' || co_a::text;
    res := res || jsonb_build_object('prueba', 'Hay un solo secreto en Vault por CRM, aunque se cambie la clave', 'ok', v_count = 1, 'detalle', v_count);

    SELECT count(*) INTO v_count FROM vault.secrets WHERE secret LIKE '%' || k2 || '%' OR secret LIKE '%' || k1 || '%';
    res := res || jsonb_build_object('prueba', 'La clave no está en claro en la tabla de secretos: se guarda cifrada', 'ok', v_count = 0, 'detalle', v_count);

    SELECT count(*) INTO v_count FROM public.change_log WHERE table_name = 'company_ai_keys' AND company_id = co_a AND actor_id = u_mgr_a AND actor_role = 'manager';
    SELECT changed_columns INTO v_msg FROM public.change_log WHERE table_name = 'company_ai_keys' AND company_id = co_a AND operation = 'UPDATE' LIMIT 1;
    res := res || jsonb_build_object('prueba', 'Cargar y cambiar la clave queda en change_log con su autor, y solo dice qué columna cambió, nunca el valor',
        'ok', v_count = 2 AND v_msg = '{api_key}', 'detalle', jsonb_build_object('entradas', v_count, 'columnas', v_msg));
    EXECUTE 'SET LOCAL ROLE service_role';
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, TRUE);

    -- ------------------------------------------------------------ quién NO puede cambiarla
    BEGIN
        PERFORM public.set_company_ai_key(co_a, u_agent_a, k1);
        res := res || jsonb_build_object('prueba', 'Un usuario base no cambia la clave del CRM', 'ok', FALSE, 'detalle', 'la cambió');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Un usuario base no cambia la clave del CRM', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;
    BEGIN
        PERFORM public.set_company_ai_key(co_a, u_mgr_b, k1);
        res := res || jsonb_build_object('prueba', 'La gerencia de otro CRM no cambia la clave de este', 'ok', FALSE, 'detalle', 'la cambió');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'La gerencia de otro CRM no cambia la clave de este', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;
    BEGIN
        PERFORM public.set_company_ai_key(co_a, u_off_a, k1);
        res := res || jsonb_build_object('prueba', 'Un gerente desactivado no cambia la clave', 'ok', FALSE, 'detalle', 'la cambió');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Un gerente desactivado no cambia la clave', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;
    BEGIN
        PERFORM public.set_company_ai_key(co_a, u_admin, k1);
        res := res || jsonb_build_object('prueba', 'El administrador de la plataforma tampoco: la clave es de cada cliente', 'ok', FALSE, 'detalle', 'la cambió');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'El administrador de la plataforma tampoco: la clave es de cada cliente', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;
    BEGIN
        PERFORM public.set_company_ai_key(co_a, gen_random_uuid(), k1);
        res := res || jsonb_build_object('prueba', 'Una persona que no existe no cambia la clave', 'ok', FALSE, 'detalle', 'la cambió');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Una persona que no existe no cambia la clave', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;

    -- ------------------------------------------------------------ formato de la clave
    FOREACH v_mala IN ARRAY ARRAY['abc', 'sk-corta', 'pk-' || repeat('a', 40), k1 || ' ', ' ' || k1, k1 || E'\n', 'sk-' || repeat('a', 300),
                                  'sk-' || repeat('é', 30), 'sk-aaaaaaaaaaaaaaaaaaaaaaaa; DROP TABLE public.leads', ''] LOOP
        BEGIN
            PERFORM public.set_company_ai_key(co_a, u_mgr_a, v_mala);
            v_aceptadas := v_aceptadas + 1;
        EXCEPTION WHEN OTHERS THEN
            IF SQLSTATE = '22023' THEN v_rechazadas := v_rechazadas + 1; END IF;
        END;
    END LOOP;
    BEGIN
        PERFORM public.set_company_ai_key(co_a, u_mgr_a, NULL);
        v_aceptadas := v_aceptadas + 1;
    EXCEPTION WHEN OTHERS THEN
        IF SQLSTATE = '22023' THEN v_rechazadas := v_rechazadas + 1; END IF;
    END;
    res := res || jsonb_build_object('prueba', 'Se rechazan las claves mal formadas (sin sk-, cortas, con espacios o saltos, larguísimas, con otros caracteres, vacías o nulas)',
        'ok', v_aceptadas = 0 AND v_rechazadas = 11, 'detalle', jsonb_build_object('aceptadas', v_aceptadas, 'rechazadas', v_rechazadas));

    BEGIN
        PERFORM public.set_company_ai_key(co_a, u_mgr_a, 'sk-corta-SECRETO');
    EXCEPTION WHEN OTHERS THEN
        v_msg := SQLERRM;
    END;
    res := res || jsonb_build_object('prueba', 'El mensaje de error nunca repite la clave que se mandó', 'ok', v_msg IS NOT NULL AND v_msg NOT LIKE '%SECRETO%', 'detalle', v_msg);

    res := res || jsonb_build_object('prueba', 'Ningún intento rechazado cambió la clave guardada', 'ok', public.get_company_ai_key(co_a) = k2, 'detalle', 'sigue la 2222');

    -- ------------------------------------------------------------ quitar la clave
    BEGIN
        PERFORM public.clear_company_ai_key(co_a, u_agent_a);
        res := res || jsonb_build_object('prueba', 'Un usuario base no quita la clave', 'ok', FALSE, 'detalle', 'la quitó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Un usuario base no quita la clave', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;
    BEGIN
        PERFORM public.clear_company_ai_key(co_a, u_mgr_b);
        res := res || jsonb_build_object('prueba', 'La gerencia de otro CRM no quita la clave de este', 'ok', FALSE, 'detalle', 'la quitó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'La gerencia de otro CRM no quita la clave de este', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;

    v_bool := public.clear_company_ai_key(co_a, u_mgr_a);
    res := res || jsonb_build_object('prueba', 'La gerencia quita la clave y el CRM queda sin asistente', 'ok', v_bool AND public.get_company_ai_key(co_a) IS NULL, 'detalle', v_bool);
    v_bool := public.clear_company_ai_key(co_a, u_mgr_a);
    res := res || jsonb_build_object('prueba', 'Quitarla de nuevo no falla y avisa que no había', 'ok', v_bool = FALSE, 'detalle', v_bool);

    EXECUTE 'RESET ROLE';
    SELECT count(*) INTO v_count FROM vault.secrets WHERE name = 'openai_key:' || co_a::text;
    SELECT count(*) INTO v_num FROM public.company_ai_keys WHERE company_id = co_a;
    res := res || jsonb_build_object('prueba', 'Al quitarla se borra también el secreto de Vault: no quedan claves huérfanas', 'ok', v_count = 0 AND v_num = 0, 'detalle', jsonb_build_object('secretos', v_count, 'filas', v_num));
    SELECT count(*) INTO v_count FROM public.change_log WHERE table_name = 'company_ai_keys' AND company_id = co_a AND operation = 'DELETE' AND actor_id = u_mgr_a;
    res := res || jsonb_build_object('prueba', 'Quitar la clave queda en change_log con su autor', 'ok', v_count = 1, 'detalle', v_count);

    EXECUTE 'SET LOCAL ROLE service_role';
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, TRUE);
    PERFORM public.set_company_ai_key(co_a, u_mgr_a, k1);
    res := res || jsonb_build_object('prueba', 'Después de quitarla se puede cargar otra (el nombre del secreto se libera)', 'ok', public.get_company_ai_key(co_a) = k1, 'detalle', 'la 1111');

    -- ------------------------------------------------------------ lo que nadie con sesión puede hacer
    EXECUTE 'RESET ROLE';
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_mgr_a, 'role', 'authenticated')::text, TRUE);
    BEGIN
        PERFORM count(*) FROM public.company_ai_keys;
        res := res || jsonb_build_object('prueba', 'Ni la gerencia lee la tabla de claves: el estado se consulta por el servidor', 'ok', FALSE, 'detalle', 'la leyó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Ni la gerencia lee la tabla de claves: el estado se consulta por el servidor', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;
    BEGIN
        PERFORM public.get_company_ai_key(co_a);
        res := res || jsonb_build_object('prueba', 'Nadie con sesión se hace devolver la clave descifrada', 'ok', FALSE, 'detalle', 'la obtuvo');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Nadie con sesión se hace devolver la clave descifrada', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;
    BEGIN
        PERFORM public.set_company_ai_key(co_a, u_mgr_a, k2);
        res := res || jsonb_build_object('prueba', 'Ni la gerencia ejecuta set_company_ai_key por su cuenta: solo el servidor', 'ok', FALSE, 'detalle', 'la ejecutó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Ni la gerencia ejecuta set_company_ai_key por su cuenta: solo el servidor', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;
    BEGIN
        PERFORM public.clear_company_ai_key(co_a, u_mgr_a);
        res := res || jsonb_build_object('prueba', 'Ni la gerencia ejecuta clear_company_ai_key por su cuenta: solo el servidor', 'ok', FALSE, 'detalle', 'la ejecutó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Ni la gerencia ejecuta clear_company_ai_key por su cuenta: solo el servidor', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;
    BEGIN
        PERFORM decrypted_secret FROM vault.decrypted_secrets;
        res := res || jsonb_build_object('prueba', 'Nadie con sesión lee los secretos descifrados de Vault', 'ok', FALSE, 'detalle', 'los leyó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Nadie con sesión lee los secretos descifrados de Vault', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;
    BEGIN
        PERFORM secret FROM vault.secrets;
        res := res || jsonb_build_object('prueba', 'Nadie con sesión lee la tabla de secretos de Vault', 'ok', FALSE, 'detalle', 'la leyó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Nadie con sesión lee la tabla de secretos de Vault', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, TRUE);
    BEGIN
        PERFORM count(*) FROM public.company_ai_keys;
        res := res || jsonb_build_object('prueba', 'Ni el administrador de la plataforma lee las claves de los clientes', 'ok', FALSE, 'detalle', 'las leyó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Ni el administrador de la plataforma lee las claves de los clientes', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;

    -- ------------------------------------------------------------ sin sesión
    EXECUTE 'RESET ROLE';
    EXECUTE 'SET LOCAL ROLE anon';
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, TRUE);
    BEGIN
        PERFORM public.get_company_ai_key(co_a);
        res := res || jsonb_build_object('prueba', 'Sin sesión no se obtiene ninguna clave', 'ok', FALSE, 'detalle', 'la obtuvo');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Sin sesión no se obtiene ninguna clave', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;
    BEGIN
        PERFORM count(*) FROM public.company_ai_keys;
        res := res || jsonb_build_object('prueba', 'Sin sesión no se lee la tabla de claves', 'ok', FALSE, 'detalle', 'la leyó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Sin sesión no se lee la tabla de claves', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;
    EXECUTE 'RESET ROLE';

    -- ------------------------------------------------------------ reglas de la tabla y limpieza (rol privilegiado)
    BEGIN
        UPDATE public.company_ai_keys SET updated_by = u_mgr_b WHERE company_id = co_a;
        res := res || jsonb_build_object('prueba', 'Quien carga la clave debe ser del mismo CRM', 'ok', FALSE, 'detalle', 'lo aceptó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Quien carga la clave debe ser del mismo CRM', 'ok', SQLSTATE = '42501', 'detalle', SQLSTATE);
    END;
    BEGIN
        UPDATE public.company_ai_keys SET key_last4 = 'abc' WHERE company_id = co_a;
        res := res || jsonb_build_object('prueba', 'Los últimos caracteres son exactamente 4', 'ok', FALSE, 'detalle', 'lo aceptó');
    EXCEPTION WHEN OTHERS THEN
        res := res || jsonb_build_object('prueba', 'Los últimos caracteres son exactamente 4', 'ok', SQLSTATE = '23514', 'detalle', SQLSTATE);
    END;

    PERFORM vault.create_secret('sk-test-CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC3333', 'openai_key:' || co_c::text, 'Clave de prueba');
    INSERT INTO public.company_ai_keys (company_id, secret_id, key_last4)
    SELECT co_c, s.id, '3333' FROM vault.secrets s WHERE s.name = 'openai_key:' || co_c::text;
    DELETE FROM public.companies WHERE id = co_c;
    SELECT count(*) INTO v_count FROM vault.secrets WHERE name = 'openai_key:' || co_c::text;
    SELECT count(*) INTO v_num FROM public.company_ai_keys WHERE company_id = co_c;
    res := res || jsonb_build_object('prueba', 'Al borrar un CRM se borra su clave y su secreto de Vault', 'ok', v_count = 0 AND v_num = 0, 'detalle', jsonb_build_object('secretos', v_count, 'filas', v_num));

    RAISE EXCEPTION 'RESULTADOS:%', res::text;
END
$prueba$;
